// Subtitle lines drawn into a 2D canvas that the player shows as one texture. Canvas shadows blur
// the way CSS text-shadow does, so the outline is five shadows plus the drop shadow. The subtitle
// font setting works because the canvas sees the faces services/subtitleFonts.js adds to the page.
import { getSubtitleFontPx, sanitizeSubtitleHtml } from '../../utils/subtitleConstants.js'
import { subtitleFontFamily, subtitleFontFailed } from '../../services/subtitleFonts.js'
import { DEFAULT_SECONDARY_OFFSET } from './secondarySubtitle.js'
import { assetUrl } from '../../utils/assetUrl.js'

const POSITION = { bottom: 10, lower: 20, middle: 30, higher: 40 }
// The overlay pads 5% each side of 1920, and the text is at most 90% of what's left.
const MAX_W = 0.9 * (1920 - 2 * 96)
const PAD_X = 16
const PAD_Y = 8
const RADIUS = 4
const SECONDARY_GAP = 8
// Shadow passes draw the glyphs this far off the canvas so only their shadow lands on it.
const FAR = 10000
const APP_FACE = 'Moonfin Subtitle Roboto'
// Japanese lines use this face, since the TV's own fallback draws kanji in their Chinese forms. Its
// range keeps it to kana and kanji.
const JP_FACE = 'NotoSansJP'

// A palette value with an opacity percent on top, always as rgba() since Chrome 38's canvas can't
// read 8 digit hex.
export const cssColor = (value, percent) => {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value || '')
  if (!m) return value
  const a = (m[2] ? parseInt(m[2], 16) / 255 : 1) * (percent / 100)
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  return `rgba(${rgb.join(', ')}, ${Math.min(1, Math.round(a * 1000) / 1000)})`
}

export const subtitleLook = (s, secondary, lang) => {
  const size = secondary && s.secondarySubtitleSize > 0 ? s.secondarySubtitleSize : getSubtitleFontPx(s)
  const em = (steps) => ((steps || 0) * 2 * size) / 100
  return {
    size,
    bold: !!s.subtitleBold,
    family: s.subtitleFont || '',
    jp: lang === 'ja',
    color: secondary && s.secondarySubtitleColor ? cssColor(s.secondarySubtitleColor, 100) : cssColor(s.subtitleColor || '#ffffff', 100),
    bg: cssColor(s.subtitleBackgroundColor || '#000000', s.subtitleBackground !== undefined ? s.subtitleBackground : 0),
    stroke: (2 * (s.subtitleStrokeWidth || 100)) / 100,
    blur: (s.subtitleShadowBlur || 0.1) * size,
    shadow: cssColor(s.subtitleShadowColor || '#000000', s.subtitleShadowOpacity !== undefined ? s.subtitleShadowOpacity : 100),
    drop: s.subtitleDropShadow
      ? { offset: em(s.subtitleDropShadowOffset), blur: em(s.subtitleDropShadowBlur), color: cssColor('#000000', s.subtitleDropShadowIntensity || 80) }
      : null,
  }
}

// Where the column's bottom edge sits, from the top, and the whole overlay's opacity. A loaded
// second track moves both by its vertical offset.
export const overlayPlace = (s, secondaryLoaded) => {
  const shift = secondaryLoaded ? s.secondarySubtitleOffset - DEFAULT_SECONDARY_OFFSET : 0
  const bottom = s.subtitlePosition === 'absolute' ? 100 - s.subtitlePositionAbsolute : POSITION[s.subtitlePosition] || 10
  return { bottom: 1080 * (1 - Math.max(0, bottom + (shift || 0)) / 100), alpha: (s.subtitleOpacity || 100) / 100 }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

// A cue's text as lines of styled runs. <i> and <b> style it and the other tags drop out.
// shortcut: <font color> and <u> draw plain, add them if a track that uses them turns up.
export const parseCue = (text) => {
  const lines = [[]]
  let italic = 0
  let bold = 0
  sanitizeSubtitleHtml(String(text || ''))
    .split(/(<[^>]*>)/)
    .forEach((part) => {
      if (!part) return
      const tag = /^<\s*(\/?)\s*([a-z]+)/i.exec(part)
      if (tag) {
        const name = tag[2].toLowerCase()
        const d = tag[1] ? -1 : 1
        if (name === 'br') lines.push([])
        else if (name === 'i' || name === 'em') italic = Math.max(0, italic + d)
        else if (name === 'b' || name === 'strong') bold = Math.max(0, bold + d)
        return
      }
      const str = part.replace(/&(#39|[a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] || m)
      lines[lines.length - 1].push({ text: str, italic: italic > 0, bold: bold > 0 })
    })
  return lines
}

// Breaks one line of runs between words the way pre-wrap does at maxW. A space at a break hangs
// off the line's end, so it neither wraps nor counts toward centering. Each line comes back as
// runs of one style with their widths.
export const wrapRuns = (runs, measure, maxW) => {
  const lines = [[]]
  let w = 0
  runs.forEach((run) =>
    run.text.split(/( )/).forEach((tok) => {
      if (!tok) return
      const tw = measure(tok, run)
      if (tok !== ' ' && w > 0 && w + tw > maxW) {
        lines.push([])
        w = 0
      }
      if (tok === ' ' && w === 0 && lines.length > 1) return
      lines[lines.length - 1].push({ text: tok, italic: run.italic, bold: run.bold })
      w += tw
    })
  )
  return lines.map((toks) => {
    while (toks.length && toks[toks.length - 1].text === ' ') toks.pop()
    const segs = []
    toks.forEach((t) => {
      const last = segs[segs.length - 1]
      if (last && last.italic === t.italic && last.bold === t.bold) last.text += t.text
      else segs.push({ ...t })
    })
    let x = 0
    segs.forEach((seg) => {
      seg.x = x
      x += measure(seg.text, seg)
    })
    return { segs, w: x }
  })
}

let appFaces = null
let appReady = false
// The app's own faces by weight, kept to tell when one has loaded or failed.
const appFace = {}
const waited = {}

// A subtitle font's face only joins the page once its download lands, and a canvas won't redraw by
// itself then. So this waits for the face, half a second at a time up to tries, before the caller
// draws again.
const waitFace = (font, family, tries) =>
  document.fonts.load(font).then(
    (faces) => {
      if ((faces && faces.length) || tries <= 0 || subtitleFontFailed(family)) return
      return new Promise((done) => setTimeout(done, 500)).then(() => waitFace(font, family, tries - 1))
    },
    () => null
  )
const loadAppFaces = () => {
  if (appFaces) return appFaces
  if (typeof FontFace !== 'function' || typeof document === 'undefined' || !document.fonts) return (appFaces = Promise.resolve())
  appFaces = Promise.all(
    [
      ['500', 'Roboto-Medium'],
      ['700', 'Roboto-Bold'],
    ].map(([weight, file]) => {
      const face = new FontFace(APP_FACE, `url(${assetUrl(`fonts/${file}.ttf`)})`, { weight })
      appFace[weight] = face
      document.fonts.add(face)
      return face.load()
    })
  ).then(
    () => true,
    () => true
  )
  return appFaces
}

let jpFace = null
const loadJpFace = () => {
  if (jpFace) return jpFace
  if (typeof FontFace !== 'function' || !document.fonts) return (jpFace = Promise.resolve())
  const face = new FontFace(JP_FACE, `url(${assetUrl('fonts/NotoSansJP-Regular.woff2')})`, { weight: '400', unicodeRange: 'U+3000-30FF, U+4E00-9FFF, U+FF00-FFEF' })
  document.fonts.add(face)
  jpFace = face.load().catch(() => null)
  return jpFace
}

const fontOf = (look, run) => {
  const family = look.family ? subtitleFontFamily(look.family, look.bold || run.bold) : ''
  const app = family ? family.replace(/'Roboto', sans-serif$/, `'${APP_FACE}', sans-serif`) : `'${APP_FACE}', sans-serif`
  const faces = look.jp ? `'${JP_FACE}', ${app}` : app
  return `${run.italic ? 'italic ' : ''}${look.bold || run.bold ? 700 : 500} ${look.size}px ${faces}`
}

const layoutBlock = (ctx, text, look) => {
  const measure = (str, run) => {
    ctx.font = fontOf(look, run)
    return ctx.measureText(str).width
  }
  const explicit = parseCue(text)
  // A box that wraps takes the whole width it may have, as CSS shrink-to-fit does.
  const widest = Math.max(...explicit.map((runs) => runs.reduce((w, run) => w + measure(run.text, run), 0)))
  const lines = []
  explicit.forEach((runs) => wrapRuns(runs, measure, MAX_W).forEach((line) => lines.push(line)))
  const lh = look.size * 1.4
  const textW = Math.min(widest, MAX_W)
  const custom = !!(look.family && subtitleFontFamily(look.family, look.bold))
  return { look, custom, lines, lh, textW, w: textW + 2 * PAD_X, h: lines.length * lh + 2 * PAD_Y }
}

// Where CSS puts the baseline in a line box lh tall for a font, read off a probe in the page,
// since each face has its own metrics and old engines' canvases can't report them.
const baselineIn = (font, lh) => {
  const probe = document.createElement('div')
  const mark = document.createElement('span')
  probe.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font:${font};line-height:${lh}px`
  mark.style.cssText = 'display:inline-block;width:1px;height:0'
  probe.appendChild(document.createTextNode('H'))
  probe.appendChild(mark)
  document.body.appendChild(probe)
  const y = mark.getBoundingClientRect().top - probe.getBoundingClientRect().top
  document.body.removeChild(probe)
  return y
}

// The probe forces a layout, so a baseline in the app's own face is kept once that face has loaded
// or failed, since nothing changes it after that. A subtitle font or a Japanese line can still be
// waiting on a face, so those are measured every time.
const baselines = {}
const blockBaseline = (b) => {
  const font = fontOf(b.look, {})
  const face = !b.custom && !b.look.jp && appFace[b.look.bold ? '700' : '500']
  const settled = !!face && (face.status === 'loaded' || face.status === 'error')
  const key = `${font}|${b.lh}`
  if (settled && key in baselines) return baselines[key]
  const y = baselineIn(font, b.lh)
  if (settled) baselines[key] = y
  return y
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const drawBlock = (ctx, b, bx, by) => {
  const { look } = b
  if (!/, 0\)$/.test(look.bg)) {
    ctx.fillStyle = look.bg
    roundRect(ctx, bx, by, b.w, b.h, RADIUS)
    ctx.fill()
  }
  const base = blockBaseline(b)
  ctx.textBaseline = 'alphabetic'
  const glyphs = (dx, dy, fill) => {
    b.lines.forEach((line, i) => {
      const top = by + PAD_Y + i * b.lh
      const y = top + base
      const x = bx + PAD_X + (b.textW - line.w) / 2
      line.segs.forEach((seg) => {
        ctx.font = fontOf(look, seg)
        ctx.fillStyle = fill
        ctx.fillText(seg.text, x + seg.x + dx, y + dy)
      })
    })
  }
  // CSS paints the last shadow lowest: the drop shadow, then the glow, then the four corners.
  const w = look.stroke
  const shadows = [[0, 0, look.blur, look.shadow], [w, w], [-w, w], [w, -w], [-w, -w]].map((s) => [s[0], s[1], look.blur, look.shadow])
  if (look.drop) shadows.unshift([look.drop.offset, look.drop.offset, look.drop.blur, look.drop.color])
  shadows.forEach(([ox, oy, blur, color]) => {
    ctx.shadowColor = color
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = ox + FAR
    ctx.shadowOffsetY = oy
    glyphs(-FAR, 0, '#000000')
  })
  ctx.shadowColor = 'rgba(0, 0, 0, 0)'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  glyphs(0, 0, look.color)
}

// Both tracks' lines as one picture: { src, x, y, w, h, alpha }, or null with nothing to show.
// The second track stacks right above the first. langs holds each track's two letter language.
// onLate runs once if a face was still loading, so the caller can draw again.
export const drawSubtitles = (primary, secondary, style, secondaryLoaded, onLate, langs = {}) => {
  if (!primary && !secondary) return null
  const fonts = loadAppFaces()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const blocks = []
  if (secondary) blocks.push(layoutBlock(ctx, secondary, subtitleLook(style, true, langs.secondary)))
  if (primary) blocks.push(layoutBlock(ctx, primary, subtitleLook(style, false, langs.primary)))
  const gap = blocks.length > 1 ? SECONDARY_GAP : 0
  const stackH = blocks.reduce((h, b) => h + b.h, gap)
  const widest = Math.max(...blocks.map((b) => b.w))
  // Room for the farthest any shadow reaches past the boxes, three blur deviations out.
  const reach = Math.max(
    ...blocks.map((b) => Math.max(b.look.stroke + 1.5 * b.look.blur, b.look.drop ? b.look.drop.offset + 1.5 * b.look.drop.blur : 0))
  )
  const m = Math.ceil(reach) + 2
  const place = overlayPlace(style, secondaryLoaded)
  const left = Math.floor(960 - widest / 2) - m
  const top = Math.floor(place.bottom - stackH) - m
  canvas.width = Math.ceil(widest) + 2 * m + 2
  canvas.height = Math.ceil(place.bottom - top + m)
  let y = place.bottom - stackH - top
  blocks.forEach((b, i) => {
    drawBlock(ctx, b, 960 - b.w / 2 - left, y)
    y += b.h + (i === 0 ? gap : 0)
  })
  const late = []
  if (!appReady) late.push(fonts.then(() => (appReady = true)))
  if (blocks.some((b) => b.look.jp) && !waited.jp) {
    waited.jp = true
    late.push(loadJpFace())
  }
  blocks.forEach((b) => {
    if (!b.custom || !document.fonts) return
    const f = `${b.look.bold ? 700 : 500} ${b.look.size}px 'Moonfin Subtitles ${b.look.family}'`
    if (waited[f]) return
    waited[f] = true
    late.push(waitFace(f, b.look.family, 40))
  })
  if (late.length && onLate) Promise.all(late).then(() => onLate())
  // The texture asks for the canvas once to upload it, and dropping it then lets the old pictures go
  // as the lines change instead of piling up until the renderer's next cleanup.
  // shortcut: a picture the renderer evicts and reloads comes back blank until the next line, which
  // only happens after the player was hidden. Keep the canvas if that ever shows.
  let once = canvas
  const src = () => {
    const out = once
    once = null
    return out
  }
  return { src, x: left, y: top, w: canvas.width, h: canvas.height, alpha: place.alpha }
}

// The picture as pixels, the form this renderer uploads (its textures take no canvas).
export const pictureData = (pic) => {
  const c = pic && pic.src()
  return c && c.width && c.height ? c.getContext('2d').getImageData(0, 0, c.width, c.height) : null
}
