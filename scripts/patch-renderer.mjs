// Patches @solidtv/renderer 1.10.2, run on postinstall. Each patch is skipped when its marker is
// already there, and fails loudly if upstream code moved or its anchor isn't unique. PATCH_ROOT
// patches another copy of node_modules (scratch builds), and PATCH_CHECK=1 only reports a missing
// marker (scripts/patch-renderer.check.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = process.env.PATCH_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = false

const count = (src, s) => src.split(s).length - 1

const patch = (rel, marker, before, after) => {
  const file = join(root, rel)
  let src = readFileSync(file, 'utf8')
  if (process.env.PATCH_CHECK) {
    if (!src.includes(marker)) {
      console.error(`[patch] ${rel} lacks ${marker}`)
      failed = true
    }
    return
  }
  if (src.includes(marker)) {
    console.log(`[patch] ${rel} already patched (${marker})`)
    return
  }
  if (count(src, before) !== 1) {
    console.error(`[patch] ${rel} changed upstream, patch not applied (${marker})`)
    failed = true
    return
  }
  src = src.replace(before, () => after)
  writeFileSync(file, src)
  console.log(`[patch] patched ${rel} (${marker})`)
}

const core = 'node_modules/@solidtv/renderer/dist/src/core/'
const text = core + 'CoreTextNode.js'
const sdfHandler = core + 'text-rendering/SdfFontHandler.js'
const sdfRenderer = core + 'text-rendering/SdfTextRenderer.js'
const layoutEngine = core + 'text-rendering/TextLayoutEngine.js'
const glRenderer = core + 'renderers/webgl/WebGlRenderer.js'

// A text node picks its text engine (SDF or canvas) once, from the font it's created with.
// Switching it to a font of the other engine left it waiting forever for a font that engine never
// loads, still flagged as waiting, so it never asked again. ui/text.js switches a node between the
// SDF and canvas families whenever its text changes script (a MakD title in Japanese after one in
// English), so the setter picks the engine again.
patch(
  text,
  '/* moonfin: re-pick text engine */',
  `            if (this._waitingForFont === true) {
                this.fontHandler.stopWaitingForFont(this.textProps.fontFamily, this);
            }
            this.textProps.fontFamily = value;
            this.invalidateLayout();`,
  `            if (this._waitingForFont === true) {
                this.fontHandler.stopWaitingForFont(this.textProps.fontFamily, this);
                this._waitingForFont = false;
            }
            this.textProps.fontFamily = value;
            /* moonfin: re-pick text engine */
            const next = this.stage.resolveTextRenderer(this.textProps, this.textProps.textRendererOverride);
            if (next !== null && next !== this.textRenderer) {
                this._cachedLayout = null;
                this._sdfCache.vertices = null;
                this._sdfCache.layoutRef = null;
                if (this._type === 'canvas') {
                    this.texture = null;
                }
                this.textRenderer = next;
                this.fontHandler = next.font;
                this._type = next.type;
                this.setRenderable(false);
            }
            this.invalidateLayout();`
)

// CSS's text-overflow: ellipsis, and line clamp on the last line, cut at the last character that
// fits, spaces included. The renderer cut the last line back to the last word that fit, so "Batman
// and Harley Quinn" came out "Batman and Harley…" where Chrome shows "Batman and Harley Qu…".
// Lines above the last still wrap at words. The suffix is U+2026, from Config.fontSettings in
// index.jsx.
patch(
  layoutEngine,
  '/* moonfin: last line cuts at a character */',
  `    remainingWord = word;
    if (remainingLines === 0) {
        [currentLine, currentLineWidth, remainingWord] = truncateLineEnd(measureText, fontFamily, letterSpacing, currentLine, currentLineWidth, remainingWord, maxWidth, overflowSuffix, overflowWidth);`,
  `    remainingWord = word;
    if (remainingLines === 0) {
        /* moonfin: last line cuts at a character */
        [currentLine, currentLineWidth, remainingWord] = truncateLineEnd(measureText, fontFamily, letterSpacing, currentLine + space + word, currentLineWidth + (space === ' ' ? spaceWidth : measureText(space, fontFamily, letterSpacing)) + wordWidth, '', maxWidth, overflowSuffix, overflowWidth);`
)
// A single line keeps a space it cut after ("Harley …"), as text-overflow does, but line clamp
// drops it ("Harley…"), since a line's trailing space hangs past its end.
patch(
  layoutEngine,
  '/* moonfin: clamp drops the space before the suffix */',
  `            break;
        }
    }
    return [wrappedLines, remainingLines, hasRemainingText];
};
export const wrapLine`,
  `            break;
        }
    }
    /* moonfin: clamp drops the space before the suffix */
    const clamped = maxLines > 1 ? wrappedLines[wrappedLines.length - 1] : undefined;
    if (clamped !== undefined && clamped[2] === true && overflowSuffix.length > 0) {
        let body = clamped[0].slice(0, clamped[0].length - overflowSuffix.length);
        while (body.length > 0 && body.charAt(body.length - 1) === ' ') {
            body = body.slice(0, -1);
            clamped[1] -= spaceWidth;
        }
        clamped[0] = body + overflowSuffix;
    }
    return [wrappedLines, remainingLines, hasRemainingText];
};
export const wrapLine`
)
// The last line's cut took off each character's own advance but left its kerning with the one
// before it, so "power," cut back to "power" kept the r-comma kerning and measured a pixel short,
// and the line kept one character more than Chrome's clamp. A character now goes with its pair.
patch(
  layoutEngine,
  '/* moonfin: cut takes its kerning */',
  `    let truncated = false;
    for (let i = currentLine.length - 1; i > 0; i--) {
        const char = currentLine.charAt(i);
        const charWidth = measureText(char, fontFamily, letterSpacing);`,
  `    let truncated = false;
    for (let i = currentLine.length - 1; i > 0; i--) {
        /* moonfin: cut takes its kerning */
        const charWidth = measureText(currentLine.substring(i - 1, i + 1), fontFamily, letterSpacing) -
            measureText(currentLine.charAt(i - 1), fontFamily, letterSpacing);`
)

// Chrome on the TVs (and Linux) draws text at FreeType's hinted whole-pixel advances, a few percent
// off the exact advances in the MSDF atlas, so lines broke one word apart from Chrome's. The SDF
// layout asks the app's hook (window.__moonfinAdvance, hintedAdvance in ui/text.js) what Chrome gives a character, or a kerned pair, at the size being laid out, and
// keeps the atlas's own advance while the hook answers -1 (its face still loading). A layout that
// used any atlas advance isn't cached, so the next one measures again. Glyph ids are char codes.
patch(
  sdfHandler,
  '/* moonfin: hinted advances */',
  `export const measureText = (text, fontFamily, letterSpacing) => {`,
  `/* moonfin: hinted advances */
let layoutSize = 0;
let layoutScale = 1;
let layoutExact = false;
export const setLayoutSize = (fontFamily, fontSize) => {
    const cache = fontCache.get(fontFamily);
    layoutSize = fontSize;
    layoutScale = cache !== undefined ? fontSize / cache.data.info.size : 1;
    layoutExact = false;
};
export const layoutUsedExact = () => layoutExact;
const hinted = (fontFamily, text) => {
    const hook = typeof window !== 'undefined' ? window.__moonfinAdvance : undefined;
    if (hook === undefined || layoutSize <= 0)
        return -1;
    const w = hook(fontFamily, layoutSize, text);
    if (w < 0)
        layoutExact = true;
    return w;
};
export const advanceOf = (fontFamily, glyph) => {
    const w = hinted(fontFamily, String.fromCharCode(glyph.id));
    return w >= 0 ? w / layoutScale : glyph.xadvance;
};
export const kernOf = (fontFamily, first, second) => {
    const cache = fontCache.get(fontFamily);
    const seconds = cache !== undefined ? cache.kernings[second] : undefined;
    const kern = seconds !== undefined && seconds[first] !== undefined ? seconds[first] : 0;
    // Chrome's fi and fl ligatures narrow a pair that has no kerning.
    if (kern === 0 && first !== 102)
        return 0;
    const a = String.fromCharCode(first);
    const b = String.fromCharCode(second);
    const pair = hinted(fontFamily, a + b);
    return pair < 0 ? kern : (pair - hinted(fontFamily, a) - hinted(fontFamily, b)) / layoutScale;
};
export const measureText = (text, fontFamily, letterSpacing) => {`
)
patch(
  sdfHandler,
  '/* moonfin: measure one with hinted advances */',
  `        return glyph.xadvance + letterSpacing;`,
  `        /* moonfin: measure one with hinted advances */ return advanceOf(fontFamily, glyph) + letterSpacing;`
)
patch(
  sdfHandler,
  '/* moonfin: measure with hinted advances */',
  `        let advance = glyph.xadvance;
        // Add kerning if there's a previous character
        if (prevGlyphId !== 0) {
            const seconds = kernings[glyph.id];
            if (seconds !== undefined) {
                const amount = seconds[prevGlyphId];
                if (amount !== undefined) {
                    advance += amount;
                }
            }
        }`,
  `        /* moonfin: measure with hinted advances */ let advance = advanceOf(fontFamily, glyph);
        if (prevGlyphId !== 0) {
            advance += kernOf(fontFamily, prevGlyphId, glyph.id);
        }`
)
patch(
  sdfRenderer,
  '/* moonfin: layout size for hinted advances */',
  `    const fontScale = fontSize / designFontSize;
`,
  `    const fontScale = fontSize / designFontSize;
    /* moonfin: layout size for hinted advances */ SdfFontHandler.setLayoutSize(fontFamily, fontSize);
`
)
patch(
  sdfRenderer,
  '/* moonfin: layout with hinted kerning */',
  `            let kerning = 0;
            // Add kerning if there's a previous character
            if (prevGlyphId !== 0) {
                const seconds = kernings[glyph.id];
                if (seconds !== undefined) {
                    const amount = seconds[prevGlyphId];
                    if (amount !== undefined) {
                        kerning = amount;
                    }
                }
            }`,
  `            /* moonfin: layout with hinted kerning */
            const kerning = prevGlyphId !== 0 ? SdfFontHandler.kernOf(fontFamily, prevGlyphId, glyph.id) : 0;`
)
patch(
  sdfRenderer,
  '/* moonfin: layout with hinted advances */',
  `            currentX += glyph.xadvance + letterSpacing;`,
  `            /* moonfin: layout with hinted advances */ currentX += SdfFontHandler.advanceOf(fontFamily, glyph) + letterSpacing;`
)
patch(
  sdfRenderer,
  '/* moonfin: provisional layouts stay out of the cache */',
  `    layout = generateTextLayout(props, fontData);
    layoutCache.set(cacheKey, layout);`,
  `    layout = generateTextLayout(props, fontData);
    /* moonfin: provisional layouts stay out of the cache */
    if (SdfFontHandler.layoutUsedExact() === false)
        layoutCache.set(cacheKey, layout);`
)

// The border and shadow shaders multiplied their output by the node's alpha, but the fill color
// they read (the vertex color) already carries it, so a node at alpha 0.85 filled at 0.72 and
// fades ran steeper than CSS. The fill now divides it back out, so fill, border and shadow take it
// once, together, as CSS opacity does. (The plain rounded shader already did.)
for (const name of ['Border', 'RoundedWithBorder', 'RoundedWithBorderAndShadow', 'Shadow', 'RoundedWithShadow']) {
  patch(
    core + `shaders/webgl/${name}.js`,
    '/* moonfin: alpha applies once */',
    `      vec4 color = texture2D(u_texture, v_textureCoords) * v_color;`,
    `      /* moonfin: alpha applies once */ vec4 color = texture2D(u_texture, v_textureCoords) * v_color / u_alpha;`
  )
}
// A node with a shadow mixed its fill over the shadow by the fill's alpha, but the fill is already
// premultiplied, so a see-through fill took its alpha twice and the shadow showed through it.
// CSS draws no box-shadow under its box, so the fill covers the shadow by the box's edge alone, as
// the border variants already do. A clear glow node then draws its glow outside its box only.
patch(
  core + 'shaders/webgl/RoundedWithShadow.js',
  '/* moonfin: fill covers its shadow */',
  `      resColor = mix(resColor, color, min(color.a, roundedAlpha));`,
  `      /* moonfin: fill covers its shadow */ resColor = mix(resColor, color, roundedAlpha);`
)
patch(
  core + 'shaders/webgl/Shadow.js',
  '/* moonfin: fill covers its shadow */',
  `      resColor = mix(resColor, color, min(color.a, boxAlpha));`,
  `      /* moonfin: fill covers its shadow */ resColor = mix(resColor, color, boxAlpha);`
)

// CSS paints a gradient over the element's background color and blends its stops premultiplied,
// so a scrim from #000000cc to transparent darkens what's under it by 0.8 at its dark end. The
// gradient shaders mixed straight colors and took the stop's alpha twice (0.8 drew as 0.64, and
// a see-through blue end lightened toward cyan), and took the node's alpha twice too. The stops
// now go up premultiplied and lie over the fill, and alpha applies once.
for (const [name, pad] of [['LinearGradient', '      '], ['RadialGradient', '        ']]) {
  const file = core + `shaders/webgl/${name}.js`
  patch(
    file,
    '/* moonfin: gradient stops premultiplied */',
    `            colors.push(norm[0], norm[1], norm[2], norm[3]);`,
    `            /* moonfin: gradient stops premultiplied */ colors.push(norm[0] * norm[3], norm[1] * norm[3], norm[2] * norm[3], norm[3]);`
  )
  patch(
    file,
    '/* moonfin: gradient over its fill */',
    `${pad}vec4 color = texture2D(u_texture, v_textureCoords) * v_color;`,
    `${pad}/* moonfin: gradient over its fill */ vec4 color = texture2D(u_texture, v_textureCoords) * v_color / u_alpha;`
  )
  patch(
    file,
    '/* moonfin: gradient blends premultiplied */',
    `${pad}color = mix(color, colorOut, clamp(colorOut.a, 0.0, 1.0));`,
    `${pad}/* moonfin: gradient blends premultiplied */ color = color * (1.0 - clamp(colorOut.a, 0.0, 1.0)) + colorOut;`
  )
}

// CSS blends straight between two stops, and this renderer eased each segment (smoothstep), which
// banded a scrim at every stop, even with cssStops' 17. Segments are straight now.
patch(
  core + 'renderers/webgl/internal/ShaderUtils.js',
  '/* moonfin: gradient segments straight */',
  'colorOut = mix(colorOut, u_colors[${i}], t${i} * t${i} * (3.0 - 2.0 * t${i}));`;',
  'colorOut = mix(colorOut, u_colors[${i}], t${i}); /* moonfin: gradient segments straight */`;'
)

// Borders draw inside the node's box, as CSS draws them with box-sizing: border-box, and every
// border width in the app counts on that. This renderer drew them outside by default, so a 3px
// focus ring came out 6px wider. align: 'outside' (or 'center') still asks for the other placements.
patch(
  core + 'shaders/templates/BorderTemplate.js',
  '/* moonfin: borders inside */',
  `            default: 1, //outside,`,
  `            default: 0, /* moonfin: borders inside */`
)

// A plain rounded node with a clear color (an unselected tab's pill) drew a clear quad, blended,
// as default-shader nodes no longer do. One with a border, a shadow or a texture still draws.
patch(
  core + 'CoreNode.js',
  '/* moonfin: clear rounded draws nothing */',
  `        (this.props.shader !== this.stage.defShaderNode ||
            this.hasColorProps === true) &&`,
  `        /* moonfin: clear rounded draws nothing */
        (this.hasColorProps === true ||
            (this.props.shader !== this.stage.defShaderNode && this.props.shader.shaderKey !== 'rounded')) &&`
)

// CSS text-shadow, as a text prop: textShadow={{ color: '#00000080', x: 0, y: 2, blur: 4 }}, or a
// list of them as CSS takes (color a '#rrggbbaa' string or a 0xRRGGBBAA number). The atlases'
// distance fields reach only a couple of pixels past a glyph, too little to blur, and a wide blur
// sampled on the GPU every frame costs a TV far more than Chrome, which rasterizes a text-shadow
// once. So the shadow is drawn the way Chrome draws it, once, with canvas shadowBlur (the same
// Gaussian, sigma = blur / 2) from the text's own glyph positions in the face's -web copy, and the
// node draws that picture under its glyphs every frame as one textured quad. Canvas text (the -web
// faces) takes the same path. index.jsx passes the prop through @solidtv/solid.
patch(
  core + 'Stage.js',
  '/* moonfin: textShadow prop */',
  `        resolvedProps.forceLoad = props.forceLoad || false;
        return resolvedProps;`,
  `        resolvedProps.forceLoad = props.forceLoad || false;
        /* moonfin: textShadow prop */ resolvedProps.textShadow = props.textShadow || null;
        return resolvedProps;`
)
patch(
  sdfRenderer,
  '/* moonfin: layout keeps its lines */',
  `        fontScale: fontScale,
        lineHeight: lineHeightPx,`,
  `        fontScale: fontScale,
        /* moonfin: layout keeps its lines */ lines,
        lineHeight: lineHeightPx,`
)
patch(
  core + 'text-rendering/CanvasTextRenderer.js',
  '/* moonfin: canvas text keeps its lines */',
  `        remainingLines,
        hasRemainingText,
    };
};`,
  `        remainingLines,
        hasRemainingText,
        /* moonfin: canvas text keeps its lines */ lines,
        font,
    };
};`
)
patch(
  core + 'text-rendering/CanvasFontHandler.js',
  '/* moonfin: font registered */',
  `export const isFontLoaded = (fontFamily) => {`,
  `/* moonfin: font registered */
export const isFontRegistered = (fontFamily) => fontCache.has(fontFamily) || fontLoadPromises.has(fontFamily);
export const isFontLoaded = (fontFamily) => {`
)
patch(
  text,
  '/* moonfin: text shadow helpers */',
  `import { Matrix3d } from './lib/Matrix3d.js';`,
  `import { Matrix3d } from './lib/Matrix3d.js';
/* moonfin: text shadow helpers */ import { hasZeroWidthSpace } from './text-rendering/Utils.js';
// Shadow pictures by what they show, shared by every node that casts the same one, so a label that
// comes back (the next card's "IMDb", a row scrolled back into view) costs no new raster. Unused
// ones wait in a short queue before they're destroyed.
const shadowCache = new Map();
const shadowIdle = [];
let shadowCanvas = null;
const releaseShadow = (key) => {
    const entry = shadowCache.get(key);
    if (entry === undefined || --entry.refs > 0)
        return;
    shadowIdle.push(key);
    while (shadowIdle.length > 64) {
        const old = shadowCache.get(shadowIdle.shift());
        if (old === undefined || old.refs > 0)
            continue;
        shadowCache.delete(old.key);
        old.stage.txMemManager.destroyTexture(old.texture);
    }
};
const shadowColor = (c) => {
    if (typeof c === 'number')
        return c >>> 0;
    const v = String(c).replace('#', '');
    return parseInt(v.length === 6 ? v + 'ff' : v, 16) >>> 0;
};`
)
patch(
  text,
  '/* moonfin: text shadow init */',
  `        this.textProps = props;`,
  `        this.textProps = props;
        /* moonfin: text shadow init */
        const shadow = props.textShadow;
        props.textShadow = null;
        if (shadow)
            this.textShadow = shadow;`
)
patch(
  text,
  '/* moonfin: canvas text shadow draws first */',
  `            const white = premultiplyColorABGR(0xffffffff, this.worldAlpha);`,
  `            /* moonfin: canvas text shadow draws first */
            if (this.textProps.textShadow !== null && this.renderTexture.state === 'loaded')
                this.renderShadow(renderer);
            const white = premultiplyColorABGR(0xffffffff, this.worldAlpha);`
)
patch(
  text,
  '/* moonfin: sdf text shadow draws first */',
  `        const props = this.textProps;
        // Delegate to the text renderer which writes pre-transformed`,
  `        const props = this.textProps;
        /* moonfin: sdf text shadow draws first */
        if (props.textShadow !== null)
            this.renderShadow(renderer);
        /* moonfin: text waits for what covers it */
        if (renderer.textDefer === true)
            renderer.noteText(this);
        // Delegate to the text renderer which writes pre-transformed`
)
patch(
  text,
  '/* moonfin: text shadow destroy */',
  `        this.fontHandler = null; // Clear reference to avoid memory leaks`,
  `        /* moonfin: text shadow destroy */ this.dropShadow();
        this.fontHandler = null; // Clear reference to avoid memory leaks`
)
patch(
  text,
  '/* moonfin: text shadow methods */',
  `    set w(value) {
        this.maxWidth = value;
    }`,
  `    /* moonfin: text shadow methods */
    set textShadow(value) {
        const list = value ? (Array.isArray(value) ? value : [value]) : [];
        const shadows = [];
        let key = '';
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (!s || s.color === undefined || s.color === null)
                continue;
            const color = shadowColor(s.color);
            if ((color & 0xff) === 0)
                continue;
            const one = { color, x: Number(s.x) || 0, y: Number(s.y) || 0, blur: Math.max(0, Number(s.blur) || 0) };
            shadows.push(one);
            key += color + ',' + one.x + ',' + one.y + ',' + one.blur + ';';
        }
        if (key === (this._shadowKey || ''))
            return;
        this._shadowKey = key;
        this.textProps.textShadow = shadows.length > 0 ? shadows : null;
        this.dropShadow();
        this.stage.requestRender();
    }
    get textShadow() {
        return this.textProps.textShadow;
    }
    // The text's glyphs as fillText runs [text, x, y, letterSpacing] in node space, with the font to
    // draw them in, null for nothing to draw, or undefined while the face's web copy loads (the node
    // is woken when it has).
    shadowPlan(info) {
        const props = this.textProps;
        if (this._type === 'canvas') {
            if (info.lines === undefined)
                return null;
            const runs = [];
            for (let i = 0; i < info.lines.length; i++) {
                const line = info.lines[i];
                runs.push([line[0], Math.ceil(line[3]), Math.ceil(line[4]), props.letterSpacing]);
            }
            return { font: info.font, runs };
        }
        const layout = info.layout;
        if (layout === undefined || layout.lines === undefined)
            return null;
        // shortcut: a face with no -web copy (Neon Pulse's, 8-bit Hero's) casts its shadow in the
        // browser's sans-serif at the same glyph positions. Register a web copy if one needs to match.
        let family = 'sans-serif';
        const fonts = this.stage.fontHandlers.canvas;
        const web = props.fontFamily + '-web';
        if (fonts !== undefined && fonts.isFontRegistered(web) === true) {
            if (fonts.isFontLoaded(web) === false) {
                fonts.waitingForFont(web, this);
                return undefined;
            }
            family = web;
        }
        const fh = this.fontHandler;
        const fam = props.fontFamily;
        const data = fh.getFontData(fam);
        if (data === undefined)
            return null;
        const scale = layout.fontScale;
        const ls = props.letterSpacing / scale;
        fh.setLayoutSize(fam, props.fontSize);
        const runs = [];
        for (let i = 0; i < layout.lines.length; i++) {
            const line = layout.lines[i];
            const str = line[0];
            let x = line[3];
            let prev = 0;
            for (let j = 0; j < str.length; j++) {
                const cp = str.codePointAt(j);
                const ch = cp > 0xffff ? str.substr(j, 2) : str.charAt(j);
                if (cp > 0xffff)
                    j++;
                if (cp === 0x200b || hasZeroWidthSpace(ch) === true)
                    continue;
                let glyph = data.glyphMap.get(cp);
                if (glyph === undefined)
                    glyph = data.glyphMap.get(32);
                if (glyph === undefined)
                    continue;
                if (prev !== 0)
                    x += fh.kernOf(fam, prev, glyph.id);
                runs.push([ch, x * scale, line[4], 0]);
                x += fh.advanceOf(fam, glyph) + ls;
                prev = glyph.id;
            }
        }
        return { font: props.fontStyle + ' ' + props.fontSize + 'px ' + family, runs };
    }
    buildShadow(info) {
        const plan = this.shadowPlan(info);
        if (plan === undefined)
            this._shadowFor = null;
        if (!plan || plan.runs.length === 0)
            return null;
        const shadows = this.textProps.textShadow;
        const size = this.textProps.fontSize;
        // The ink can reach past the layout box (descenders under a tight line height, overhangs),
        // and a blur reaches about 3 sigma past the ink.
        let minX = 0;
        let minY = 0;
        let maxX = 0;
        let maxY = 0;
        for (let i = 0; i < shadows.length; i++) {
            const s = shadows[i];
            const reach = Math.ceil(s.blur * 1.5) + 1;
            minX = Math.min(minX, s.x - reach);
            minY = Math.min(minY, s.y - reach);
            maxX = Math.max(maxX, s.x + reach);
            maxY = Math.max(maxY, s.y + reach);
        }
        const x1 = Math.floor(-size * 0.3 + minX);
        const y1 = Math.floor(-size * 0.5 + minY);
        const w = Math.ceil(info.width + size * 0.3 + maxX) - x1;
        const h = Math.ceil(info.height + size * 0.5 + maxY) - y1;
        if (w <= 0 || h <= 0 || w * h > 4194304)
            return null;
        const stage = this.stage;
        let key = plan.font + '|' + this._shadowKey + '|' + x1 + ',' + y1 + ',' + w + ',' + h;
        for (let j = 0; j < plan.runs.length; j++) {
            const run = plan.runs[j];
            key += '|' + run[0] + ',' + Math.round(run[1] * 100) + ',' + Math.round(run[2] * 100) + ',' + run[3];
        }
        let entry = shadowCache.get(key);
        if (entry === undefined) {
            const canvas = shadowCanvas || (shadowCanvas = stage.platform.createCanvas());
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.font = plan.font;
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#000';
            // The glyphs themselves go far off to the left, so only their shadows land on the canvas.
            const away = w + size * 4;
            // CSS paints the first shadow on top.
            for (let i = shadows.length - 1; i >= 0; i--) {
                const s = shadows[i];
                const c = s.color;
                ctx.shadowColor = 'rgba(' + (c >>> 24) + ',' + ((c >>> 16) & 0xff) + ',' + ((c >>> 8) & 0xff) + ',' + (c & 0xff) / 255 + ')';
                ctx.shadowBlur = s.blur;
                ctx.shadowOffsetX = s.x + away;
                ctx.shadowOffsetY = s.y;
                for (let j = 0; j < plan.runs.length; j++) {
                    const run = plan.runs[j];
                    let x = run[1] - x1 - away;
                    if (run[3] === 0) {
                        ctx.fillText(run[0], x, run[2] - y1);
                        continue;
                    }
                    for (let k = 0; k < run[0].length; k++) {
                        const ch = run[0].charAt(k);
                        if (hasZeroWidthSpace(ch) === true)
                            continue;
                        ctx.fillText(ch, x, run[2] - y1);
                        x += ctx.measureText(ch).width + run[3];
                    }
                }
            }
            const texture = stage.txManager.createTexture('ImageTexture', {
                premultiplyAlpha: true,
                src: ctx.getImageData(0, 0, w, h),
            });
            // The upload lands at the end of a frame, which then clears any render asked for
            // during it, so the next frame is asked for once this one is over.
            texture.on('loaded', () => queueMicrotask(() => stage.requestRender()));
            entry = { key, texture, stage, refs: 0 };
            shadowCache.set(key, entry);
        }
        else if (entry.refs === 0) {
            const at = shadowIdle.indexOf(key);
            if (at >= 0)
                shadowIdle.splice(at, 1);
        }
        entry.refs++;
        const node = stage.createNode({ w, h, color: 0xffffffff });
        node.shadowX = x1;
        node.shadowY = y1;
        node.shadowKey = key;
        node.shadowAlpha = -1;
        node.props.texture = entry.texture;
        return node;
    }
    renderShadow(renderer) {
        const info = this._renderInfo;
        if (this._shadowFor !== info) {
            this.dropShadow();
            this._shadowFor = info;
            this._shadowNode = this.buildShadow(info);
        }
        const node = this._shadowNode;
        if (!node)
            return;
        const texture = node.props.texture;
        texture.setRenderableOwner(node.id, true);
        if (texture.state !== 'loaded')
            return;
        Matrix3d.copy(this.globalTransform, node.globalTransform).translate(node.shadowX, node.shadowY);
        node.updateGlobalGeometry();
        if (node.shadowAlpha !== this.worldAlpha) {
            node.shadowAlpha = this.worldAlpha;
            const c = premultiplyColorABGR(0xffffffff, this.worldAlpha);
            node.premultipliedColorTl = c;
            node.premultipliedColorTr = c;
            node.premultipliedColorBl = c;
            node.premultipliedColorBr = c;
        }
        node.clippingRect = this.clippingRect;
        renderer.addQuad(node, texture);
    }
    dropShadow() {
        this._shadowFor = null;
        const node = this._shadowNode;
        if (!node)
            return;
        this._shadowNode = null;
        node.props.texture.setRenderableOwner(node.id, false);
        node.props.texture = null;
        releaseShadow(node.shadowKey);
        node.destroy();
    }
    updateRenderState(renderState) {
        super.updateRenderState(renderState);
        const node = this._shadowNode;
        if (node && renderState === CoreNodeRenderState.OutOfBounds)
            node.props.texture.setRenderableOwner(node.id, false);
    }
    set w(value) {
        this.maxWidth = value;
    }`
)

// Text batching that keeps the z-order. With batching off, every SDF text breaks the draw where it
// sits, so a row of cards draws image, title, image, title. The build-time batching
// (__renderTextBatching__) instead draws all text after everything else, which put page text over
// the open sidebar. With textDefer on (index.jsx), text waits in the deferred queue only until a
// later quad might cover it: a quad whose bounds (grown for a shadow or border) meet a waiting
// text's flushes the queue first, so every overlap draws in tree order and the picture can't
// change, while text nothing covers joins one draw with the text after it.
patch(
  glRenderer,
  '/* moonfin: text defer state */',
  `    sdfOpPoolIdx = 0;
    //// Render Op / Buffer Filling State`,
  `    sdfOpPoolIdx = 0;
    /* moonfin: text defer state */
    textDefer = false;
    pendingText = [];
    pendingTextLen = 0;
    pendingX1 = 0;
    pendingY1 = 0;
    pendingX2 = 0;
    pendingY2 = 0;
    //// Render Op / Buffer Filling State`
)
patch(
  glRenderer,
  '/* moonfin: text defer resets */',
  `        this.coreTextRenderOps.length = 0;
        // Rewinding the SDF op pool cursor`,
  `        this.coreTextRenderOps.length = 0;
        /* moonfin: text defer resets */ this.pendingTextLen = 0;
        // Rewinding the SDF op pool cursor`
)
patch(
  glRenderer,
  '/* moonfin: text waits until something covers it */',
  `        if (RENDER_TEXT_BATCHING === false) {
            this.curSdfRenderOp = null;
        }`,
  `        if (RENDER_TEXT_BATCHING === false) {
            /* moonfin: text waits until something covers it */
            if (this.textDefer !== true) {
                this.curSdfRenderOp = null;
            }
            else if (this.pendingTextLen > 0 && this.coversText(node) === true) {
                this.flushTextRenderOps();
                this.pendingTextLen = 0;
            }
        }`
)
patch(
  glRenderer,
  '/* moonfin: deferred text queues */',
  `        const opList = RENDER_TEXT_BATCHING === true ? this.coreTextRenderOps : this.renderOps;`,
  `        /* moonfin: deferred text queues */ const opList = RENDER_TEXT_BATCHING === true || this.textDefer === true ? this.coreTextRenderOps : this.renderOps;`
)
patch(
  glRenderer,
  '/* moonfin: deferred text keeps the quad chain */',
  `        // nodes don't try to extend an SDF op.
        this.curRenderOp = null;`,
  `        // nodes don't try to extend an SDF op.
        /* moonfin: deferred text keeps the quad chain */
        if (this.textDefer !== true) {
            this.curRenderOp = null;
        }`
)
patch(
  glRenderer,
  '/* moonfin: deferred text flushes at the end */',
  `    render(surface = 'screen') {
        if (RENDER_TEXT_BATCHING === true) {
            this.flushTextRenderOps();
        }`,
  `    render(surface = 'screen') {
        /* moonfin: deferred text flushes at the end */
        if (RENDER_TEXT_BATCHING === true || this.textDefer === true) {
            this.flushTextRenderOps();
            this.pendingTextLen = 0;
        }`
)
patch(
  glRenderer,
  '/* moonfin: text defer bounds */',
  `    flushTextRenderOps() {`,
  `    /* moonfin: text defer bounds */
    // A waiting text's box, grown for ink past it (descenders under a tight line height, accents).
    noteText(node) {
        const b = node.renderBound;
        if (b === undefined) {
            return;
        }
        const pad = node.textProps.fontSize * 0.35 + 2;
        const x1 = b.x1 - pad;
        const y1 = b.y1 - pad;
        const x2 = b.x2 + pad;
        const y2 = b.y2 + pad;
        const a = this.pendingText;
        const i = this.pendingTextLen;
        a[i] = x1;
        a[i + 1] = y1;
        a[i + 2] = x2;
        a[i + 3] = y2;
        this.pendingTextLen = i + 4;
        // The box around every waiting text.
        if (i === 0) {
            this.pendingX1 = x1;
            this.pendingY1 = y1;
            this.pendingX2 = x2;
            this.pendingY2 = y2;
            return;
        }
        if (x1 < this.pendingX1)
            this.pendingX1 = x1;
        if (y1 < this.pendingY1)
            this.pendingY1 = y1;
        if (x2 > this.pendingX2)
            this.pendingX2 = x2;
        if (y2 > this.pendingY2)
            this.pendingY2 = y2;
    }
    // Whether a quad may cover a waiting text. Shaders other than the plain and rounded ones can
    // draw past the node's box (shadows, outside borders), so they count 128px wider.
    coversText(node) {
        const b = node.renderBound;
        if (b === undefined) {
            return true;
        }
        const shader = node.props.shader;
        const g = shader === this.stage.defShaderNode || shader.shaderKey === 'rounded' ? 0 : 128;
        const x1 = b.x1 - g;
        const y1 = b.y1 - g;
        const x2 = b.x2 + g;
        const y2 = b.y2 + g;
        // A quad clear of the box around them all covers none, which saves checking each one.
        if (x1 >= this.pendingX2 || x2 <= this.pendingX1 || y1 >= this.pendingY2 || y2 <= this.pendingY1) {
            return false;
        }
        const a = this.pendingText;
        for (let i = 0, n = this.pendingTextLen; i < n; i += 4) {
            if (x1 < a[i + 2] && x2 > a[i] && y1 < a[i + 3] && y2 > a[i + 1]) {
                return true;
            }
        }
        return false;
    }
    flushTextRenderOps() {`
)

// A shader program compiled when the first node using it was made, drawn or not, and each compile
// waits on the GPU. At launch App's hidden overlays compiled shadow programs nothing drew yet.
// Programs now build their sources as before and compile on their first draw. One that fails draws
// nothing and isn't tried again.
{
  const program = core + 'renderers/webgl/WebGlShaderProgram.js'
  patch(
    program,
    '/* moonfin: lazy shader programs */',
    `        const vertexShader = createShader(glw, glw.VERTEX_SHADER, vertexSource);
        if (!vertexShader) {
            throw new Error('Vertex shader creation failed');
        }
        const fragmentShader = createShader(glw, glw.FRAGMENT_SHADER, fragmentSource);
        if (!fragmentShader) {
            throw new Error('fragment shader creation failed');
        }
        const program = createProgram(glw, vertexShader, fragmentShader);
        this.program = program;`,
    `        /* moonfin: lazy shader programs */
        this.program = null;
        this.attributeLocations = [];
        this.lifecycle = {
            update: config.update,
            canBatch: config.canBatch,
        };
        this.pending = { vertexSource, fragmentSource, time: config.time };
    }
    compileNow() {
        const pending = this.pending;
        if (pending === null)
            return;
        this.pending = null;
        const glw = this.glw;
        try {
            this.compile(glw, pending.vertexSource, pending.fragmentSource, pending);
        }
        catch (err) {
            this.program = null;
            this.attributeLocations = [];
            if (glw.isContextLost() === true)
                this.renderer.stage.setContextLost();
            console.warn('Shader failed to compile', err);
        }
    }
    compile(glw, vertexSource, fragmentSource, config) {
        const vertexShader = createShader(glw, glw.VERTEX_SHADER, vertexSource);
        if (!vertexShader) {
            throw new Error('Vertex shader creation failed');
        }
        const fragmentShader = createShader(glw, glw.FRAGMENT_SHADER, fragmentSource);
        if (!fragmentShader) {
            throw new Error('fragment shader creation failed');
        }
        const program = createProgram(glw, vertexShader, fragmentShader);
        this.program = program;`
  )
  patch(
    program,
    '/* moonfin: lazy program lifecycle */',
    `        this.useTimeValue =
            uniLocs['u_time'] !== undefined && config.time !== undefined;
        this.lifecycle = {
            update: config.update,
            canBatch: config.canBatch,
        };
    }`,
    `        this.useTimeValue =
            uniLocs['u_time'] !== undefined && config.time !== undefined;
        /* moonfin: lazy program lifecycle */
    }`
  )
  patch(
    program,
    '/* moonfin: compile before batching */',
    `    reuseRenderOp(node, currentRenderOp) {
        if (this.lifecycle.canBatch !== undefined) {`,
    `    reuseRenderOp(node, currentRenderOp) {
        /* moonfin: compile before batching */
        if (this.pending !== null)
            this.compileNow();
        if (this.lifecycle.canBatch !== undefined) {`
  )
  patch(
    program,
    '/* moonfin: compile before attach */',
    `    attach() {
        this.glw.useProgram(this.program, this.uniformLocations);`,
    `    attach() {
        /* moonfin: compile before attach */
        if (this.pending !== null)
            this.compileNow();
        this.glw.useProgram(this.program, this.uniformLocations);`
  )
  patch(
    program,
    '/* moonfin: no program, no bind */',
    `    bindRenderOp(renderOp, buffer) {
        this.bindTexture(renderOp.renderOpTexture);`,
    `    bindRenderOp(renderOp, buffer) {
        /* moonfin: no program, no bind */
        if (this.program === null)
            return;
        this.bindTexture(renderOp.renderOpTexture);`
  )
}

// The memory manager's cleanup freed any texture no visible node showed, so the poster of an open
// card (alpha 0 under its wide art) drew blank while it loaded again. Below the critical line it
// now frees only textures no node holds any more: a backdrop that gave way to the next title, a
// closed card's wide art, a page that's gone. Each texture counts the nodes holding it. A canvas
// text's raster belongs to its node alone, and goes as soon as the node lets it go, rather than
// waiting for memory to run short.
{
  const node = core + 'CoreNode.js'
  // Declared, so every node and texture keeps one shape for the hot paths.
  patch(node, '/* moonfin: held texture field */', `    textureOwnership = false;`, `    textureOwnership = false;
    /* moonfin: held texture field */ attachedTexture = null;`)
  patch(core + 'textures/Texture.js', '/* moonfin: holder count field */', `    textureData = null;`, `    textureData = null;
    /* moonfin: holder count field */ attached = 0;
    textRaster = false;
    shownBy = null;`)
  patch(
    node,
    '/* moonfin: textures count their nodes */',
    `        if (value !== null) {
            value.setRenderableOwner(this._id, this.isRenderable);`,
    `        if (value !== null) {
            /* moonfin: textures count their nodes */
            value.attached++;
            this.attachedTexture = value;
            value.shownBy = this;
            value.setRenderableOwner(this._id, this.isRenderable);`
  )
  patch(
    node,
    '/* moonfin: node lets its texture go */',
    `        texture.setRenderableOwner(this._id, false);
        this.textureOwnership = false;
    }`,
    `        texture.setRenderableOwner(this._id, false);
        this.textureOwnership = false;
        /* moonfin: node lets its texture go */
        if (texture.shownBy === this)
            texture.shownBy = null;
        if (this.attachedTexture === texture) {
            texture.attached--;
            this.attachedTexture = null;
            if (texture.attached === 0 && texture.textRaster === true)
                this.stage.txMemManager.destroyTexture(texture);
        }
    }`
  )
  patch(
    node,
    '/* moonfin: texture knows where it shows */',
    `        this.textureOwnership = isRenderable;
        this.texture?.setRenderableOwner(this._id, isRenderable);`,
    `        this.textureOwnership = isRenderable;
        this.texture?.setRenderableOwner(this._id, isRenderable);
        /* moonfin: texture knows where it shows */
        if (isRenderable === true && this.props.texture !== null)
            this.props.texture.shownBy = this;`
  )
  patch(
    core + 'TextureMemoryManager.js',
    '/* moonfin: keep held textures */',
    `            if (isCleanableType && texture.canBeCleanedUp() === true) {`,
    `            if (isCleanableType && texture.canBeCleanedUp() === true && /* moonfin: keep held textures */ (critical === true || full === true || texture.attached === 0)) {`
  )
  // Short of memory, the textures no node holds go before the held ones (a page kept under another,
  // Home under Details). In load order alone, Home's older pictures went first and Back from Details
  // waited for them to load again while what the closed pages left behind stayed.
  patch(
    core + 'TextureMemoryManager.js',
    '/* moonfin: unheld textures go first */',
    `        for (const texture of this.loadedTextures) {
            // Early exit: target memory reached`,
    `        /* moonfin: unheld textures go first */
        for (let pass = 0; pass < (critical === true || full === true ? 2 : 1); pass++)
        for (const texture of this.loadedTextures) {
            // Early exit: target memory reached`
  )
  patch(
    core + 'TextureMemoryManager.js',
    '/* moonfin: held ones on the second pass */',
    `/* moonfin: keep held textures */ (critical === true || full === true || texture.attached === 0)) {`,
    `/* moonfin: keep held textures */ /* moonfin: held ones on the second pass */ (texture.attached === 0 || pass === 1)) {`
  )
  patch(
    text,
    '/* moonfin: canvas text owns its raster */',
    `                this.texture = this.stage.txManager.createTexture('ImageTexture', {
                    premultiplyAlpha: true,
                    src: result.imageData,
                });`,
    `                this.texture = this.stage.txManager.createTexture('ImageTexture', {
                    premultiplyAlpha: true,
                    src: result.imageData,
                });
                /* moonfin: canvas text owns its raster */ this.texture.textRaster = true;`
  )
}

// An SDF face kept its kerning list once it was a table, though nothing reads it after. That's
// most of a face's JSON.
patch(
  sdfHandler,
  '/* moonfin: kerning list let go */',
  `    const kernings = buildKerningTable(fontData.kernings);`,
  `    const kernings = buildKerningTable(fontData.kernings);
    /* moonfin: kerning list let go */ fontData.kernings = null;`
)

// The renderer uploads decoded images oldest first, and only one a frame while anything animates,
// so on Home the row cards waiting in the preload margin went up ahead of the media bar's backdrop
// and logo, decoded a moment after them. Each frame's uploads now take the textures shown on screen
// first (where the node a texture was last made renderable for is in the viewport), then the rest
// in their old order. Same uploads and the same memory, in another order.
{
  const tx = core + 'CoreTextureManager.js'
  patch(
    tx,
    '/* moonfin: on screen uploads first */',
    `    processOne() {
        if (this.initialized === false) {
            return 0;
        }`,
    `    /* moonfin: on screen uploads first */
    onScreenFirst() {
        const queue = this.uploadTextureQueue;
        if (queue.size < 2)
            return;
        const list = queue.list;
        const now = [];
        const later = [];
        for (let i = queue.head; i < list.length; i++) {
            const texture = list[i];
            if (queue.membership.has(texture) === false)
                continue;
            const node = texture.shownBy;
            if (node === null || node.renderState === 8)
                now.push(texture);
            else
                later.push(texture);
        }
        if (now.length === 0 || later.length === 0)
            return;
        queue.list = now.concat(later);
        queue.head = 0;
    }
    processOne() {
        if (this.initialized === false) {
            return 0;
        }
        this.onScreenFirst();`
  )
  patch(
    tx,
    '/* moonfin: on screen first, budgeted */',
    `    processUntil(maxProcessingTime) {
        if (this.initialized === false) {
            return 0;
        }`,
    `    processUntil(maxProcessingTime) {
        if (this.initialized === false) {
            return 0;
        }
        /* moonfin: on screen first, budgeted */ this.onScreenFirst();`
  )
  // A picture covering half the screen or more (a page's backdrop) goes up before the rest on
  // screen. Its decode is the longest, and it finished loading last, so on webOS Details' backdrop
  // waited out a frame for each cast photo and icon (one upload a frame while anything animates,
  // and the 10 ms budget fits about one there anyway).
  patch(
    tx,
    '/* moonfin: backdrops go up first */',
    `        const now = [];
        const later = [];
        for (let i = queue.head; i < list.length; i++) {
            const texture = list[i];
            if (queue.membership.has(texture) === false)
                continue;
            const node = texture.shownBy;
            if (node === null || node.renderState === 8)
                now.push(texture);
            else
                later.push(texture);
        }
        if (now.length === 0 || later.length === 0)
            return;
        queue.list = now.concat(later);`,
    `        /* moonfin: backdrops go up first */
        const big = [];
        const now = [];
        const later = [];
        for (let i = queue.head; i < list.length; i++) {
            const texture = list[i];
            if (queue.membership.has(texture) === false)
                continue;
            const node = texture.shownBy;
            if (node !== null && node.renderState === 8 && node.props.w * node.props.h >= 1036800)
                big.push(texture);
            else if (node === null || node.renderState === 8)
                now.push(texture);
            else
                later.push(texture);
        }
        if (big.length === 0 && (now.length === 0 || later.length === 0))
            return;
        queue.list = big.concat(now, later);`
  )
  // A texture no node shows and nothing holds any more (a card's wide art or a row's preload let go
  // while it loaded) waits behind what's on screen. Only one still held with no node of its own, a
  // font atlas, goes with the on screen ones.
  patch(
    tx,
    '/* moonfin: unheld uploads wait */',
    `            else if (node === null || node.renderState === 8)
                now.push(texture);`,
    `            else if (/* moonfin: unheld uploads wait */ node === null ? texture.renderableOwners.size > 0 : node.renderState === 8)
                now.push(texture);`
  )
}

// Canvas text named only its own face, so a glyph that face lacks (a channel's "ᴴᴰ") fell to the
// browser's default font, a serif. The stack now ends in sans-serif, so Chrome takes such a glyph
// from its sans face.
patch(
  core + 'text-rendering/CanvasTextRenderer.js',
  '/* moonfin: canvas text falls back to sans-serif */',
  'const font = `${fontStyle} ${fontSize}px Unknown, ${fontFamily}`;',
  'const font = `${fontStyle} ${fontSize}px Unknown, ${fontFamily}, sans-serif`; /* moonfin: canvas text falls back to sans-serif */'
)
// webOS 3's sans face has no "ᴴᴰ" either, and Chrome took them from its one face that does, a serif.
// Modifier letters come from the app's cut of Noto Sans first (moonfin-marks in ui/fonts.js, loaded
// on webOS only, so elsewhere the name is skipped).
patch(
  core + 'text-rendering/CanvasTextRenderer.js',
  '/* moonfin: modifier capitals in sans */',
  '${fontFamily}, sans-serif`;',
  '${fontFamily}, moonfin-marks, sans-serif`; /* moonfin: modifier capitals in sans */'
)

// Chrome sets "fi" and "fl" as one ligature glyph where the face has one (Press Start 2P's fills one
// cell), unless letter spacing turns ligatures off. Drawn as two glyphs, the i landed on the f and
// "moonfin" read "moonfn". A face whose atlas holds U+FB01 and U+FB02 (scripts/fonts.mjs, EXTRA)
// lays those pairs out as them.
patch(
  sdfRenderer,
  '/* moonfin: fi and fl ligatures */',
  `mapTextLayout(SdfFontHandler.measureText, metrics, props.text,`,
  `mapTextLayout(SdfFontHandler.measureText, metrics, /* moonfin: fi and fl ligatures */ props.letterSpacing === 0 && glyphMap.has(0xfb01) === true && glyphMap.has(0xfb02) === true
        ? props.text.replace(/f([il])/g, (pair, second) => (second === 'i' ? '\\ufb01' : '\\ufb02'))
        : props.text,`
)

// -webkit-line-clamp, measured the same on Chrome 38 and today's Chrome: the lines wrap as they
// would unclamped, and the last one kept gets the ellipsis after its own text, losing characters
// from its end only when the ellipsis won't fit ("…made, hunte…"). The cut at a character
// that fills the line past its last word (patched above) is text-overflow's, so it now applies only
// to one line (maxLines 1, as white-space: nowrap with text-overflow: ellipsis). Chrome also breaks
// after a hyphen between letters ("out-of-" | "this-world"), which the wrap takes as a zero-width
// space. ui/components/details/measure.js wrapLines and clampText follow the same two rules.
{
  const clampFlag = '/* moonfin: line clamp ends at a break */'
  patch(
    layoutEngine,
    clampFlag,
    `export const wrapText = (measureText, text, fontFamily, maxWidth, letterSpacing, overflowSuffix, wordBreak, maxLines) => {
    const lines = text.split('\\n');`,
    `${clampFlag}
let lineClamp = false;
export const wrapText = (measureText, text, fontFamily, maxWidth, letterSpacing, overflowSuffix, wordBreak, maxLines) => {
    lineClamp = maxLines > 1;
    const lines = text.split('\\n');`
  )
  patch(
    layoutEngine,
    '/* moonfin: line clamp keeps the wrapped line */',
    `        /* moonfin: last line cuts at a character */
        [currentLine, currentLineWidth, remainingWord] = truncateLineEnd(`,
    `        /* moonfin: last line cuts at a character */
        [currentLine, currentLineWidth, remainingWord] = lineClamp === true /* moonfin: line clamp keeps the wrapped line */
            ? truncateLineEnd(measureText, fontFamily, letterSpacing, currentLine, currentLineWidth, word, maxWidth, overflowSuffix, overflowWidth)
            : truncateLineEnd(`
  )
  patch(
    layoutEngine,
    '/* moonfin: break after a hyphen */',
    `export const wrapLine = (measureText, line, fontFamily, maxWidth, letterSpacing, spaceWidth, overflowSuffix, overflowWidth, wordBreak, remainingLines) => {
    const words = line.split(spaceRegex);`,
    `export const wrapLine = (measureText, line, fontFamily, maxWidth, letterSpacing, spaceWidth, overflowSuffix, overflowWidth, wordBreak, remainingLines) => {
    /* moonfin: break after a hyphen */ line = line.replace(/([^\\s-]-)(?=[A-Za-z\\u00c0-\\u024f\\u0370-\\u03ff\\u0400-\\u04ff])/g, '$1\\u200b');
    const words = line.split(spaceRegex);`
  )
}

// One animation per prop. animateProp reuses a prop's running animation only when it's handed the
// same settings object, so a transition rebuilt with new objects (an inline literal re-run by the
// element's effect, or a timing that changed) started a second animation beside the first, and
// when both landed in one frame the older target won: Settings' list stuck scrolled off screen
// and a pushed screen stopped at x=734.6. A new animation now stops the one it replaces, and a
// write with no transition (ui/fx.js gives none for 0ms) stops the prop's running one, which
// would otherwise carry on and overwrite it.
patch(
  core + 'CoreNode.js',
  '/* moonfin: one animation per prop */',
  `        const animationProps = { [name]: value };
        const controller = createAnimation(this.stage.animationManager, this, animationProps, settings);`,
  `        /* moonfin: one animation per prop */
        const replaced = animations[name];
        if (replaced !== undefined && replaced !== null)
            replaced.controller.stop();
        const animationProps = { [name]: value };
        const controller = createAnimation(this.stage.animationManager, this, animationProps, settings);`
)
patch(
  'node_modules/@solidtv/solid/dist/src/core/elementNode.js',
  '/* moonfin: a write ends the prop animation */',
  `        this.lng[name] =
            value;
    }
    _fireAnimationEvents`,
  `        /* moonfin: a write ends the prop animation */
        const running = this.lng._animations ? this.lng._animations[name] : undefined;
        if (running) {
            running.controller.stop();
            this.lng._animations[name] = null;
        }
        this.lng[name] =
            value;
    }
    _fireAnimationEvents`
)

// A see-through border went over the fill with mix(), which took the border color's alpha twice in
// the result's alpha (a squared): over nothing, a #00a4dcb3 ring kept 51% of what's under it where
// CSS keeps 30%. It now goes over premultiplied, as CSS paints a border over its background.
for (const [name, from] of [['Border', 'resGap'], ['RoundedWithBorder', 'resGap'], ['RoundedWithBorderAndShadow', 'resFill']]) {
  const target = from === 'resGap' ? 'resGap = ' : 'vec4 resGap = '
  patch(
    core + `shaders/webgl/${name}.js`,
    '/* moonfin: see-through borders blend once */',
    `      ${target}mix(${from}, U_BORDER_COLOR, borderAlpha * U_BORDER_COLOR.a);`,
    `      /* moonfin: see-through borders blend once */ float borderCover = borderAlpha * U_BORDER_COLOR.a;
      ${target}${from} * (1.0 - borderCover) + vec4(U_BORDER_COLOR.rgb, 1.0) * borderCover;`
  )
}

// Where there's no createImageBitmap (Chrome 38), an image goes up from an <img>, whose decoded
// picture stays in memory until a garbage collection takes the element, and an idle TV app rarely
// collects: on webOS 3 every 16 backdrops held 60 MB more, and browsing rows took the app past what
// webOS allows. Once the picture is on the GPU the element lets go of it.
patch(
  core + 'textures/Texture.js',
  '/* moonfin: an uploaded image lets its picture go */',
  `        data.close();
    }
};`,
  `        data.close();
    }
    /* moonfin: an uploaded image lets its picture go */
    else if (typeof HTMLImageElement !== 'undefined' && data instanceof HTMLImageElement) {
        data.onload = data.onerror = null;
        data.removeAttribute('src');
    }
};`
)

// A removed tree's nodes kept their children and parents, so anything still holding one of them held
// the whole page it was on. Chrome 38's V8 keeps the first closure each JSX props shape had (in its
// map transitions), and through it the scope that made it, so Settings' first instance stayed alive
// with all 580 of its nodes after it closed. Now only the nodes such a scope names stay.
patch(
  'node_modules/@solidtv/solid/dist/src/core/elementNode.js',
  '/* moonfin: a removed tree lets go of itself */',
  `    _destroy() {
        if (isINode(this.lng)) {
            this.lng.destroy();
        }
    }`,
  `    _destroy() {
        if (isINode(this.lng)) {
            this.lng.destroy();
        }
        /* moonfin: a removed tree lets go of itself */
        const stack = [this];
        while (stack.length > 0) {
            const node = stack.pop();
            const kids = node.children;
            for (let i = 0; i < kids.length; i++) {
                if (kids[i] !== null && typeof kids[i] === 'object' && kids[i]._parent === node)
                    stack.push(kids[i]);
            }
            node.children = [];
            node._parent = undefined;
        }
    }`
)

// Without createImageBitmap (Chrome 38) the <img> path ignored srcX, srcY, srcWidth and srcHeight and
// uploaded the whole picture, so a trickplay tile put its 3200x1800 sheet on the GPU, about 25 MB on
// every seek into a new sheet. The crop is now cut on a canvas and only it goes up. The source stays
// decoded for the crops that follow it, since a scrub cuts one sheet many times, and lets go once
// another source is cut or 2 s pass.
patch(
  core + 'textures/ImageTexture.js',
  '/* moonfin: a crop goes up alone */',
  `export class ImageTexture extends Texture {`,
  `/* moonfin: a crop goes up alone */
let cropCanvas = null;
let kept = null;
const dropKept = () => {
    if (kept === null)
        return;
    clearTimeout(kept.timer);
    kept.img.removeAttribute('src');
    kept = null;
};
const keepFor = (url, img) => {
    if (kept !== null && kept.img !== img)
        dropKept();
    if (kept !== null)
        clearTimeout(kept.timer);
    kept = { url, img, timer: setTimeout(dropKept, 2000) };
};
const cutImage = (img, sx, sy, sw, sh, premultiplyAlpha) => {
    if (cropCanvas === null)
        cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return { data: ctx.getImageData(0, 0, sw, sh), premultiplyAlpha };
};
const loadCrop = (src, sx, sy, sw, sh, premultiplyAlpha) => {
    const url = src.split('#')[0];
    if (kept !== null && kept.url === url) {
        keepFor(url, kept.img);
        return Promise.resolve(cutImage(kept.img, sx, sy, sw, sh, premultiplyAlpha));
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            img.onload = img.onerror = null;
            try {
                resolve(cutImage(img, sx, sy, sw, sh, premultiplyAlpha));
                keepFor(url, img);
            }
            catch (e) {
                img.removeAttribute('src');
                reject(e);
            }
        };
        img.onerror = () => {
            img.onload = img.onerror = null;
            reject(new Error(\`Image loading failed for \${url}\`));
        };
        img.src = url;
    });
};
export class ImageTexture extends Texture {`
)
// An image the running in-app update replaced loads from the blob URL the update loader made for it
// (scripts/ota/loader.js, src/utils/assetUrl.js), so a release can change images without a reinstall.
// The cache key stays the package path.
patch(
  core + 'textures/ImageTexture.js',
  '/* moonfin: updated images load from storage */',
  `        const absoluteSrc = convertUrlToAbsolute(src);`,
  `        /* moonfin: updated images load from storage */
        const updated = typeof window !== 'undefined' && window.__moonfinOta && window.__moonfinOta.files;
        const absoluteSrc = convertUrlToAbsolute((updated && updated[src.replace(/^\\.\\//, '')]) || src);`
)
patch(
  core + 'textures/ImageTexture.js',
  '/* moonfin: the img path cuts crops */',
  `    async loadImageFallback(src, hasAlpha) {
        const img = new Image();`,
  `    async loadImageFallback(src, hasAlpha) {
        /* moonfin: the img path cuts crops */
        const { sx, sy, sw, sh } = this.props;
        if (typeof src === 'string' && sw > 0 && sh > 0) {
            return loadCrop(src, sx || 0, sy || 0, sw, sh, hasAlpha);
        }
        const img = new Image();`
)
// createImageBitmap without its options argument (Chrome 50 to 54) decoded the whole picture and
// dropped the crop, which the node then drew squeezed into its box. The crop form predates options.
patch(
  core + 'lib/ImageWorker.js',
  '/* moonfin: crop without options */',
  `        pending = create.call(createThis, blob);
    }`,
  `        /* moonfin: crop without options */
        pending = sw !== null && sh !== null ? create.call(createThis, blob, sx || 0, sy || 0, sw, sh) : create.call(createThis, blob);
    }`
)

if (failed) process.exit(1)
