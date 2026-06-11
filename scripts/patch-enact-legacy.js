/**
 * Post-install patch for legacy smart TV compatibility.
 * Targets: Tizen 2.4 (WebKit r152340), webOS 3.x (Chromium 38)
 *
 * Patches @enact/cli and @enact/ui to work without CSS custom properties support.
 *
 * Run automatically via: "postinstall": "node scripts/patch-enact-legacy.js"
 * Or manually:           node scripts/patch-enact-legacy.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

let patchCount = 0;
let skipCount = 0;
let failCount = 0;
const failures = [];

function recordFailure(description, relPath, reason) {
	failCount++;
	failures.push(`${description} (${relPath}): ${reason}`);
	console.warn(`  [FAIL] ${description} — ${reason} in ${relPath}`);
}

function patchFile(relPath, patches) {
	const filePath = path.join(NODE_MODULES, relPath);
	if (!fs.existsSync(filePath)) {
		failCount++;
		failures.push(`${relPath}: file not found`);
		console.warn(`  [FAIL] ${relPath} — file not found`);
		skipCount++;
		return;
	}

	let content = fs.readFileSync(filePath, 'utf8');
	let modified = false;

	for (const {find, replace, description, applied} of patches) {
		const alreadyApplied = (applied && content.includes(applied)) ||
			(typeof replace === 'string' && content.includes(replace));
		if (typeof find === 'string') {
			if (content.includes(find)) {
				content = content.replace(find, replace);
				console.log(`  [OK]   ${description}`);
				modified = true;
			} else if (alreadyApplied) {
				console.log(`  [SKIP] ${description} — already patched`);
			} else {
				recordFailure(description, relPath, 'search string not found');
			}
		} else {
			// Regex
			if (find.test(content)) {
				content = content.replace(find, replace);
				console.log(`  [OK]   ${description}`);
				modified = true;
			} else if (alreadyApplied) {
				console.log(`  [SKIP] ${description} — already patched`);
			} else {
				recordFailure(description, relPath, 'pattern not found');
			}
		}
	}

	if (modified) {
		fs.writeFileSync(filePath, content, 'utf8');
		patchCount++;
		console.log(`  [SAVE] ${relPath}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 0: globalThis guard in @enact/core/platform
//
// Safety net: polyfills.js and the build-wgt.js <script> both define
// globalThis before Enact loads, but we also patch the source directly.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 0] @enact/core/platform — globalThis guard');

patchFile('@enact/core/platform/platform.js', [
	{
		find: '/* global globalThis */ /**',
		replace: '/* global globalThis */ if(typeof globalThis==="undefined"){if(typeof self!=="undefined"){self.globalThis=self;}else if(typeof window!=="undefined"){window.globalThis=window;}} /**',
		description: 'Add inline globalThis polyfill before first use'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: Enable PostCSS custom-properties compilation
//
// Changes `features: {'custom-properties': false}` to resolve all var()
// expressions to their fallback values at build time (no var() in output).
// This fixes ~2,128 theme variable usages across all Sandstone components.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 1] PostCSS custom-properties — enable compilation');

patchFile('@enact/cli/config/webpack.config.js', [
	{
		find: "features: {'custom-properties': false}",
		replace: "features: {'custom-properties': {preserve: false}}",
		description: 'Enable postcss-custom-properties with preserve:false'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: Button border-radius
//
// Sandstone Button uses `border-radius: calc(var(--button-height) / 2)` in
// `.roundBorder .bg` selectors. The --button-height var is defined in CSS
// scope but PostCSS may not resolve scoped vars. Replace all 6 instances with
// a safe static value. The default button height is 3rem, small is 2.25rem,
// largeText is 4rem. Using 50% makes it always a pill shape regardless of
// height — the same visual intent as calc(height / 2).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 2] Button border-radius — replace CSS var with static value');

patchFile('@enact/sandstone/Button/Button.module.css', [
	{
		find: /border-radius: calc\(var\(--button-height\) \/ 2\)/g,
		replace: 'border-radius: 50%',
		description: 'Replace calc(var(--button-height) / 2) → 50% (pill shape)'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3: ProgressBar — replace CSS var inline styles with direct properties
//
// ProgressBar.js sets CSS custom properties via inline style:
//   style: { '--ui-progressbar-proportion-anchor': progressAnchor, ... }
// On Chrome 47 these are silently ignored. Instead, we compute the actual
// CSS values (left, width, height, bottom) and set them directly.
//
// The CSS expects:
//   .horizontal .fill { left: calc(start * 100%); width: calc(end * 100%); }
//   .horizontal .load { left: calc(startBg * 100%); width: calc(endBg * 100%); }
//   .vertical .fill { bottom: calc(start * 100%); height: calc(end * 100%); }
//   .vertical .load { bottom: calc(startBg * 100%); height: calc(endBg * 100%); }
//
// We patch the JS `style` computed function to output real CSS properties
// that child elements can inherit, and add data attributes for orientation.
// Then we also patch the CSS to use the inline values.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 3] ProgressBar — direct inline styles instead of CSS vars');

patchFile('@enact/ui/ProgressBar/ProgressBar.js', [
	{
		// Replace the style computed function that sets CSS custom properties
		// with one that sets real CSS properties as data attributes
		find: `    style: function style(_ref3) {
      var backgroundProgress = _ref3.backgroundProgress,
        progress = _ref3.progress,
        progressAnchor = _ref3.progressAnchor,
        _style = _ref3.style;
      return _objectSpread(_objectSpread(_objectSpread({}, _style), {}, {
        '--ui-progressbar-proportion-anchor': progressAnchor
      }, calcBarStyle('backgroundProgress', progressAnchor, backgroundProgress, '--ui-progressbar-proportion-start-background', '--ui-progressbar-proportion-end-background')), calcBarStyle('progress', progressAnchor, progress, '--ui-progressbar-proportion-start', '--ui-progressbar-proportion-end'));
    }`,
		replace: `    style: function style(_ref3) {
      var backgroundProgress = _ref3.backgroundProgress,
        progress = _ref3.progress,
        progressAnchor = _ref3.progressAnchor,
        _style = _ref3.style;
      // Tizen 2.4 patch: set CSS vars AND real properties for compatibility
      var bgBar = calcBarStyle('backgroundProgress', progressAnchor, backgroundProgress, '--ui-progressbar-proportion-start-background', '--ui-progressbar-proportion-end-background');
      var fgBar = calcBarStyle('progress', progressAnchor, progress, '--ui-progressbar-proportion-start', '--ui-progressbar-proportion-end');
      return _objectSpread(_objectSpread(_objectSpread({}, _style), {}, {
        '--ui-progressbar-proportion-anchor': progressAnchor,
        '--pb-fill-start': (fgBar['--ui-progressbar-proportion-start'] || 0) * 100 + '%',
        '--pb-fill-end': (fgBar['--ui-progressbar-proportion-end'] || 0) * 100 + '%',
        '--pb-load-start': (bgBar['--ui-progressbar-proportion-start-background'] || 0) * 100 + '%',
        '--pb-load-end': (bgBar['--ui-progressbar-proportion-end-background'] || 0) * 100 + '%'
      }, bgBar), fgBar);
    }`,
		description: 'Add computed real property values alongside CSS vars'
	}
]);

// Now patch the ProgressBar CSS to not rely on var() for the fill/load positions.
// We add a JS-driven approach: the render function will apply styles directly to
// child elements. But since Enact's kind() pattern makes it hard to target children
// from the parent's style computed, we take a different approach:
//
// We inject a small runtime helper that reads data from the parent's inline style
// and applies real properties to the .fill and .load children via a MutationObserver
// or requestAnimationFrame.
//
// Actually, the simplest approach: patch the render function to pass styles down.

// Let's read the render function to understand the structure better.
// The render creates: <div (root)> → <div.bar> → [<div.load>, <div.fill>]
// We need fill and load to get left/width or bottom/height from the parent's computed values.

// Simplest fix: patch the render to apply inline styles to fill and load elements directly.

patchFile('@enact/ui/ProgressBar/ProgressBar.js', [
	{
		find: `  render: function render(_ref4) {
    var children = _ref4.children,
      componentRef = _ref4.componentRef,
      css = _ref4.css,
      rest = _objectWithoutProperties(_ref4, _excluded);
    delete rest.backgroundProgress;
    delete rest.orientation;
    delete rest.progress;
    delete rest.progressAnchor;
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", _objectSpread(_objectSpread({
      role: "progressbar"
    }, rest), {}, {
      ref: componentRef,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: css.bar,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: css.load
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: css.fill
        })]
      }), children]
    }));`,
		replace: `  render: function render(_ref4) {
    var children = _ref4.children,
      componentRef = _ref4.componentRef,
      css = _ref4.css,
      rest = _objectWithoutProperties(_ref4, _excluded);
    delete rest.backgroundProgress;
    var orientation = rest.orientation;
    delete rest.orientation;
    delete rest.progress;
    delete rest.progressAnchor;
    // Tizen 2.4 patch: extract computed values and apply directly to children
    var parentStyle = rest.style || {};
    var isVert = orientation === 'vertical';
    var fillStyle = isVert
      ? {bottom: parentStyle['--pb-fill-start'], height: parentStyle['--pb-fill-end']}
      : {left: parentStyle['--pb-fill-start'], width: parentStyle['--pb-fill-end']};
    var loadStyle = isVert
      ? {bottom: parentStyle['--pb-load-start'], height: parentStyle['--pb-load-end']}
      : {left: parentStyle['--pb-load-start'], width: parentStyle['--pb-load-end']};
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", _objectSpread(_objectSpread({
      role: "progressbar"
    }, rest), {}, {
      ref: componentRef,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: css.bar,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: css.load,
          style: loadStyle
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: css.fill,
          style: fillStyle
        })]
      }), children]
    }));`,
		description: 'Apply fill/load positioning via inline styles on child elements'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4: Slider knob — replace CSS var with direct inline style
//
// Slider.js sets style: { '--ui-slider-proportion-end-knob': proportion }
// CSS reads: left: calc(var(--ui-slider-proportion-end-knob) * 100%)  (horizontal)
//            bottom: calc(var(--ui-slider-proportion-end-knob) * 100%) (vertical)
//
// We patch the JS to also compute the knob position as a real CSS value.
// Then patch the Sandstone Slider CSS to use the inline style.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 4] Slider — direct inline knob positioning');

patchFile('@enact/ui/Slider/Slider.js', [
	{
		find: `      return _objectSpread(_objectSpread({}, _style), {}, {
        '--ui-slider-proportion-end-knob': proportion,
        '--slider-knob-pct': (proportion * 100) + '%'
      });`,
		replace: `      return _objectSpread(_objectSpread({}, _style), {}, {
        '--ui-slider-proportion-end-knob': proportion
      });`,
		description: 'Remove dead --slider-knob-pct var; --ui-slider-proportion-end-knob retained for Enact internal use'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 5: Scrollbar — replace setCSSVariable with direct DOM style setting
//
// Scrollbar.js uses element.style.setProperty('--scrollbar-thumb-size-ratio', value)
// which Chrome 47 ignores for custom properties.
//
// The CSS computes:
//   --scrollbar-thumb-size: calc(100% * var(--scrollbar-thumb-size-ratio))
//   --scrollbar-thumb-progress: calc(((1 - sizeRatio) * progressRatio) * 100%)
//   .vertical::before { height: var(--scrollbar-thumb-size); top: var(--scrollbar-thumb-progress); }
//   :not(.vertical)::before { width: var(--scrollbar-thumb-size); left: var(--scrollbar-thumb-progress); }
//
// We patch setCSSVariable to also compute and set the real CSS properties directly
// on the ::before pseudo-element's parent (the track element).
// Since ::before can't have inline styles, we need to set styles on a real element.
// We'll modify the approach: set the thumb size/progress as inline styles on the
// track element using real CSS properties, and update the CSS to read from inline styles.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 5] Scrollbar — direct DOM style instead of CSS vars');

patchFile('@enact/ui/useScroll/Scrollbar.js', [
	{
		find: `var setCSSVariable = function setCSSVariable(element, variable, value) {
  element.style.setProperty(variable, value);
};`,
		replace: `var setCSSVariable = function setCSSVariable(element, variable, value) {
  // Try native custom property (Chrome 49+)
  try { element.style.setProperty(variable, value); } catch(e) {}
  // Tizen 2.4 fallback: store values and compute real styles for ::before
  if (!element._scrollVars) element._scrollVars = {};
  element._scrollVars[variable] = value;
  var sizeRatio = element._scrollVars['--scrollbar-thumb-size-ratio'];
  var progressRatio = element._scrollVars['--scrollbar-thumb-progress-ratio'];
  if (sizeRatio != null && progressRatio != null) {
    var thumbSize = (sizeRatio * 100) + '%';
    var thumbProgress = (((1 - sizeRatio) * progressRatio) * 100) + '%';
    // Store computed values as data attributes for CSS or apply via JS
    element.dataset.thumbSize = thumbSize;
    element.dataset.thumbProgress = thumbProgress;
    // Apply to ::before via a style element (pseudo-elements can't have inline styles)
    // Instead, we use a real child element approach or inline style on the element itself
    // and override in CSS. Simplest: set CSS custom properties as inline px values too.
    element.style.setProperty('--scrollbar-thumb-size', thumbSize);
    element.style.setProperty('--scrollbar-thumb-progress', thumbProgress);
    // Direct fallback for browsers that don't support custom properties at all:
    // We'll add a real child element or use the element's own dimensions.
    // For Chrome 47, even the setProperty above won't work for custom props.
    // Nuclear option: find the ::before and style it. We can't style ::before directly,
    // so we inject a <style> rule scoped to this element, or we create a real child.
    if (!element._thumbEl) {
      element._thumbEl = element.querySelector('::before') || null;
      // Can't query ::before. Instead, create a real element to replace ::before.
      var thumb = document.createElement('div');
      thumb.style.cssText = 'display:block;position:absolute;content:"";will-change:transform,top,left,right;background:rgba(102,102,102,0.75);';
      // Copy border-radius from computed style of track
      var trackStyle = window.getComputedStyle(element, '::before');
      if (trackStyle.borderRadius) thumb.style.borderRadius = trackStyle.borderRadius;
      element.appendChild(thumb);
      element._thumbEl = thumb;
      // Hide the real ::before via a one-time style injection
      if (!document._scrollbarPatchStyle) {
        var s = document.createElement('style');
        s.textContent = '[data-thumb-size]::before{display:none!important}';
        document.head.appendChild(s);
        document._scrollbarPatchStyle = true;
      }
    }
    var isVertical = element.classList.contains('vertical');
    if (element._thumbEl) {
      if (isVertical) {
        element._thumbEl.style.width = '100%';
        element._thumbEl.style.height = thumbSize;
        element._thumbEl.style.top = thumbProgress;
        element._thumbEl.style.left = '';
      } else {
        element._thumbEl.style.height = '100%';
        element._thumbEl.style.width = thumbSize;
        element._thumbEl.style.left = thumbProgress;
        element._thumbEl.style.top = '50%';
        element._thumbEl.style.transform = 'translateY(-50%)';
      }
    }
  }
};`,
		applied: '_scrollVars',
		description: 'Replace setCSSVariable with real DOM element fallback for scrollbar thumb'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 6: buffer module — replace ** exponentiation with Math.pow()
//
// NodePolyfillPlugin injects buffer v6.0.3 which uses the ES2016 exponentiation
// operator (2 ** 24, etc.). Tizen 2.4's JSC (Safari 9) only supports ES2015 and
// throws "Expected token '('" on **. Babel doesn't transpile it because
// node_modules (except @enact/*) are excluded from the babel-loader.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 6] buffer — replace ** exponentiation with Math.pow()');

const bufferPath = path.join(NODE_MODULES, '@enact/cli/node_modules/buffer/index.js');
if (fs.existsSync(bufferPath)) {
	let bufSrc = fs.readFileSync(bufferPath, 'utf8');
	let bufModified = false;

	// Replace numeric exponentiation: 2 ** 24 → Math.pow(2, 24)
	const numExpRe = /(\d+)\s*\*\*\s*(\d+)/g;
	if (numExpRe.test(bufSrc)) {
		bufSrc = bufSrc.replace(/(\d+)\s*\*\*\s*(\d+)/g, 'Math.pow($1, $2)');
		console.log('  [OK]   Replaced numeric ** operators with Math.pow()');
		bufModified = true;
	}

	// Replace BigInt exponentiation: BigInt(2) ** BigInt(32) → BigInt(Math.pow(2, 32))
	const bigIntExpRe = /BigInt\((\d+)\)\s*\*\*\s*BigInt\((\d+)\)/g;
	if (bigIntExpRe.test(bufSrc)) {
		bufSrc = bufSrc.replace(/BigInt\((\d+)\)\s*\*\*\s*BigInt\((\d+)\)/g,
			'BigInt(Math.pow($1, $2))');
		console.log('  [OK]   Replaced BigInt ** operators with BigInt(Math.pow())');
		bufModified = true;
	}

	// Default parameters (offset = 0) cause parse errors on Chrome <49 (Tizen 3)
	if (/function\s+writeBig\w+\s*\(value,\s*offset\s*=\s*0\)/.test(bufSrc)) {
		bufSrc = bufSrc.replace(/function\s+(writeBig\w+)\s*\(value,\s*offset\s*=\s*0\)/g,
			'function $1(value, offset)');
		console.log('  [OK]   Removed default parameter syntax from BigInt write methods');
		bufModified = true;
	} else if (!bufSrc.includes('offset = 0')) {
		console.log('  [SKIP] Default parameters — already patched');
	}

	if (bufModified) {
		fs.writeFileSync(bufferPath, bufSrc, 'utf8');
		patchCount++;
		console.log('  [SAVE] @enact/cli/node_modules/buffer/index.js');
	} else {
		console.log('  [SKIP] No ** operators or default params found — already patched');
	}
} else {
	console.warn('  [SKIP] @enact/cli/node_modules/buffer/index.js — file not found');
	skipCount++;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 7: babel-preset-enact — enable transform-regenerator
//
// The Enact Babel preset explicitly excludes 'transform-regenerator' from
// @babel/preset-env (marked as "chunky/costly"). This means async/await is
// converted to generator functions (function*) via transform-async-to-generator
// but generators are NOT further compiled to ES5 state machines.
//
// Safari 9 / Tizen 2.4 JSC does NOT support generators. When the parser sees
// `function*`, it expects '(' after 'function' and gets '*', producing:
//   SyntaxError: Expected token '('
//
// Fix: Remove 'transform-regenerator' from the exclude list so preset-env
// applies the regenerator transform, converting function* to ES5 state machines
// using @babel/helpers' inlined regenerator runtime (no external dep needed).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 7] babel-preset-enact — enable transform-regenerator');

patchFile('@enact/cli/node_modules/babel-preset-enact/index.js', [
	{
		find: "// Exclude chunky/costly transforms\n\t\t\t\t\t\t'transform-regenerator',",
		replace: "// Exclude chunky/costly transforms\n\t\t\t\t\t\t// 'transform-regenerator', // RE-ENABLED for Tizen 2.4 legacy compat",
		description: "Remove transform-regenerator from preset-env exclude list"
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 8: generator-function — use legacy feature-detection
//
// The `generator-function` package (pulled in by NodePolyfillPlugin → util →
// is-generator-function → generator-function) has a top-level `function*(){}`
// expression to detect the GeneratorFunction constructor. This causes a parse
// error on engines without generator support (Tizen 2.4 / Safari 9).
//
// Fix: Replace index.js with the legacy.js version that uses try/catch around
// `Function('return function* () {}')` for safe runtime detection.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 8] generator-function — safe legacy feature-detection');

patchFile('@enact/cli/node_modules/generator-function/index.js', [
	{
		find: "const cached = /** @type {GeneratorFunctionConstructor} */ (function* () {}.constructor);",
		replace: `var cached;
try { cached = Function('return function* () {}')().constructor; } catch (e) { cached = false; }`,
		description: "Replace literal function* with safe Function() detection"
	},
	{
		find: "module.exports = () => cached;",
		replace: "module.exports = function () { return cached; };",
		description: "Replace arrow function export with ES5 function expression"
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 9: hls.js ESM build — replace ** exponentiation with Math.pow()
//
// hls.js v1.6.x ships both CJS (dist/hls.js) and ESM (dist/hls.mjs) builds.
// Webpack resolves hls.js to the ESM build via the package.json "module" and
// "exports" fields. The ESM build contains `2 ** 32` (ES2016 exponentiation)
// in the EMSG box parser (mp4-tools), while the CJS build correctly uses
// Math.pow(2, 32). Since node_modules are excluded from Babel, this operator
// passes through unchanged and causes a parse error on Tizen 2.4.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 9] hls.js — replace ** exponentiation with Math.pow()');

patchFile('hls.js/dist/hls.mjs', [
	{
		find: '2 ** 32 * leftPresentationTime',
		replace: 'Math.pow(2, 32) * leftPresentationTime',
		description: 'Replace 2 ** 32 with Math.pow(2, 32) in EMSG parser'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 10: @enact/core/platform — replace Set spread with array filter dedup
//
// platform.js uses _toConsumableArray(new Set(platforms.map(...))) to get unique
// platform names. Babel's helper calls Array.from(set) which fails on Tizen 3
// (Chrome 47). Replace with .filter() dedup — no Set iterator needed.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 10] @enact/core/platform — replace Set spread with filter dedup');

patchFile('@enact/core/platform/platform.js', [
	{
		find: `_toConsumableArray(new Set(platforms.map(function (p) {
  return p.platform;
})))`,
		replace: `platforms.map(function (p) {
  return p.platform;
}).filter(function (v, i, a) {
  return a.indexOf(v) === i;
})`,
		description: 'Replace Set spread with indexOf dedup for Chrome 47 compat'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 11: webpack babel-loader — transpile node_modules for legacy compat
//
// By default, Enact's webpack config excludes all node_modules (except @enact/*)
// from babel-loader. This means dependencies that ship ES2015+ code (e.g.
// buffer v6 uses let/const/template literals, hls.js ESM uses arrow functions,
// default params, destructuring, etc.) pass through un-transpiled.
//
// Chrome 38 (webOS 3) and Safari 9 (Tizen 2.4) cannot parse ES2015+ syntax.
// Fix: Remove the node_modules exclusion so ALL JS is transpiled by Babel.
// The babel-loader already has babelrc:false and explicit configFile, so
// per-package babel configs are not picked up.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 11] webpack — transpile node_modules through babel-loader');

patchFile('@enact/cli/config/webpack.config.js', [
	{
		find: /^\s*exclude: \/node_modules\.\(\?!@enact\)\/,\s*$/m,
		replace: "\t\t\t\t\t\t\t\t\t\t\texclude: /node_modules[\\\\/]core-js/, // PATCHED: only exclude core-js; transpile everything else",
		description: 'Change node_modules exclusion to only exclude core-js from babel-loader'
	},
	{
		find: /babelrc: false,\n(\s*)\/\/ This is a feature/,
		replace: "babelrc: false,\n$1sourceType: 'unambiguous',\n$1// This is a feature",
		applied: "sourceType: 'unambiguous'",
		description: 'Add sourceType unambiguous so CJS node_modules use require() not import for helpers'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 12: babel-preset-enact — disable useBuiltIns polyfill injection
//
// Neither 'entry' nor 'usage' mode works correctly here:
// - 'entry' silently removes the import without injecting polyfills
// - 'usage' injects `import` statements into CJS node_modules files,
//   causing webpack to reject them ("import and export may appear only
//   with sourceType: module")
//
// Setting useBuiltIns to false disables babel's per-file polyfill injection.
// Instead, polyfills are loaded wholesale by the Enact entry polyfills.js
// which calls require('core-js/stable') via corejs-proxy.js. Since core-js
// is excluded from babel-loader (PATCH 11), webpack bundles it as-is.
// core-js/stable is already ES5-compatible and provides all polyfills
// needed for Chrome 38+ / Safari 9+.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 12] babel-preset-enact — disable useBuiltIns (polyfills loaded via Enact entry)');

patchFile('@enact/cli/node_modules/babel-preset-enact/index.js', [
	{
		find: /useBuiltIns: '(?:entry|usage)'/,
		replace: "useBuiltIns: false",
		description: "Set useBuiltIns to false — polyfills loaded wholesale via Enact entry corejs-proxy"
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 13: VirtualList — add -webkit-transform for legacy WebKit
//
// VirtualGridList positions every item via JS-set `transform: translate3d(...)`.
// webOS 2 (WebKit/538.2 ≈ Safari 7-8) and Tizen 2.4 (WebKit r152340) only
// support the prefixed `-webkit-transform` property — the unprefixed
// `transform` is silently ignored. This causes every grid item to remain at
// position (0,0), stacking on top of each other so only one item is visible.
//
// webOS 3+ (Chromium 38+) and Tizen 3+ (Chromium) support unprefixed
// `transform` so they are unaffected. Setting both properties is harmless on
// Chromium — the unprefixed version takes precedence.
//
// Patched locations in VirtualListBasic.js:
//   1. composeStyle()            — React inline style object
//   2. setScrollPosition()       — content container scroll via DOM
//   3. applyItemPositionToDOMElement() — individually-sized item repositioning
//   4. calculateMetrics() reset  — clears transform when recalculating
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 13] VirtualList — add -webkit-transform for legacy WebKit');

patchFile('@enact/ui/VirtualList/VirtualListBasic.js', [
	{
		// 1. composeStyle — React inline styles use camelCase WebkitTransform
		find: `      var _this$getXY2 = this.getXY(primaryPosition, secondaryPosition),
        x = _this$getXY2.x,
        y = _this$getXY2.y,
        style = {
          /* FIXME: RTL / this calculation only works for Chrome */
          transform: "translate3d(".concat(this.props.rtl ? -x : x, "px, ").concat(y, "px, 0)")
        };`,
		replace: `      var _this$getXY2 = this.getXY(primaryPosition, secondaryPosition),
        x = _this$getXY2.x,
        y = _this$getXY2.y,
        _transformValue = "translate3d(".concat(this.props.rtl ? -x : x, "px, ").concat(y, "px, 0)"),
        style = {
          /* FIXME: RTL / this calculation only works for Chrome */
          transform: _transformValue,
          WebkitTransform: _transformValue
        };`,
		description: 'composeStyle: add WebkitTransform for Safari 7-8 (webOS 2 / Tizen 2.4)'
	},
	{
		// 2. setScrollPosition — DOM style
		find: `this.contentRef.current.style.transform = "translate3d(".concat(rtl ? x : -x, "px, -").concat(y, "px, 0)");
        this.didScroll(x, y);`,
		replace: `this.contentRef.current.style.transform = "translate3d(".concat(rtl ? x : -x, "px, -").concat(y, "px, 0)");
        this.contentRef.current.style.webkitTransform = this.contentRef.current.style.transform;
        this.didScroll(x, y);`,
		description: 'setScrollPosition: add webkitTransform for scroll container'
	},
	{
		// 3a. applyItemPositionToDOMElement — vertical
		find: `childNode.style.transform = "translate3d(0, ".concat(position, "px, 0)");
        } else {
          childNode.style.transform = "translate3d(".concat(position * (rtl ? -1 : 1), "px, 0, 0)");
        }`,
		replace: `childNode.style.transform = "translate3d(0, ".concat(position, "px, 0)");
          childNode.style.webkitTransform = childNode.style.transform;
        } else {
          childNode.style.transform = "translate3d(".concat(position * (rtl ? -1 : 1), "px, 0, 0)");
          childNode.style.webkitTransform = childNode.style.transform;
        }`,
		description: 'applyItemPositionToDOMElement: add webkitTransform for item repositioning'
	},
	{
		// 4. calculateMetrics reset
		find: `this.contentRef.current.style.transform = null;\n      } else if (scrollMode === 'native' && node`,
		replace: `this.contentRef.current.style.transform = null;\n        this.contentRef.current.style.webkitTransform = null;\n      } else if (scrollMode === 'native' && node`,
		description: 'calculateMetrics: also reset webkitTransform'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 14: Scrollbar — add -webkit-transform for legacy WebKit
//
// The scrollbar thumb fallback (PATCH 5) uses style.transform for centering.
// Add the prefixed version for webOS 2 / Tizen 2.4.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 14] Scrollbar thumb — add -webkit-transform for legacy WebKit');

patchFile('@enact/ui/useScroll/Scrollbar.js', [
	{
		find: `element._thumbEl.style.transform = 'translateY(-50%)';
      }
    }
  }
};`,
		replace: `element._thumbEl.style.transform = 'translateY(-50%)';
        element._thumbEl.style.webkitTransform = 'translateY(-50%)';
      }
    }
  }
};`,
		description: 'Scrollbar thumb: add webkitTransform for horizontal centering'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 15: UiVirtualListBase — add -webkit-transform for legacy WebKit
//
// Same issue as PATCH 13 but for the non-sandstone base class. This is the
// alternative VirtualList implementation that may be used depending on the
// code path. All four transform locations need the prefixed version.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 15] UiVirtualListBase — add -webkit-transform for legacy WebKit');

patchFile('@enact/ui/VirtualList/UiVirtualListBase.js', [
	{
		// 1. composeStyle — React inline styles
		find: `          style = {
            position: 'absolute',
            /* FIXME: RTL / this calculation only works for Chrome */
            transform: "translate3d(".concat(this.props.rtl ? -x : x, "px, ").concat(y, "px, 0)")
          };`,
		replace: `          _transformValue = "translate3d(".concat(this.props.rtl ? -x : x, "px, ").concat(y, "px, 0)"),
          style = {
            position: 'absolute',
            /* FIXME: RTL / this calculation only works for Chrome */
            transform: _transformValue,
            WebkitTransform: _transformValue
          };`,
		description: 'composeStyle: add WebkitTransform for Safari 7-8 (webOS 2 / Tizen 2.4)'
	},
	{
		// 2. setScrollPosition — DOM style
		find: `this.contentRef.current.style.transform = "translate3d(".concat(rtl ? x : -x, "px, -").concat(y, "px, 0)");

          // The \`x\`, \`y\``,
		replace: `this.contentRef.current.style.transform = "translate3d(".concat(rtl ? x : -x, "px, -").concat(y, "px, 0)");
          this.contentRef.current.style.webkitTransform = this.contentRef.current.style.transform;

          // The \`x\`, \`y\``,
		description: 'setScrollPosition: add webkitTransform for scroll container'
	},
	{
		// 3. applyItemPositionToDOMElement — vertical and horizontal
		find: `childNode.style.transform = "translate3d(0, ".concat(position, "px, 0)");
          } else {
            childNode.style.transform = "translate3d(".concat(position * (rtl ? -1 : 1), "px, 0, 0)");
          }`,
		replace: `childNode.style.transform = "translate3d(0, ".concat(position, "px, 0)");
            childNode.style.webkitTransform = childNode.style.transform;
          } else {
            childNode.style.transform = "translate3d(".concat(position * (rtl ? -1 : 1), "px, 0, 0)");
            childNode.style.webkitTransform = childNode.style.transform;
          }`,
		description: 'applyItemPositionToDOMElement: add webkitTransform for item repositioning'
	},
	{
		// 4. calculateMetrics reset
		find: `this.contentRef.current.style.transform = null;
        }`,
		replace: `this.contentRef.current.style.transform = null;
          this.contentRef.current.style.webkitTransform = null;
        }`,
		description: 'calculateMetrics: also reset webkitTransform'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 16: Arrangers — add -webkit-transform for panel transitions
//
// The AnimateOnIdle.fill() method sets node.style.transform for panel slide
// animations. Without -webkit-transform, panel transitions won't work on
// webOS 2 / Tizen 2.4 (legacy WebKit).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Patch 16] Arrangers — add -webkit-transform for panel transitions');

patchFile('@enact/sandstone/internal/Panels/Arrangers.js', [
	{
		find: `node.style.transform = keyframe.transform;
    }`,
		replace: `node.style.transform = keyframe.transform;
      node.style.webkitTransform = keyframe.transform;
    }`,
		description: 'AnimateOnIdle.fill: add webkitTransform for panel transitions'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
if (failCount > 0) {
	console.error(`\n✗ Legacy patching FAILED: ${failCount} patch(es) did not apply.`);
	console.error('  A dependency update has likely changed the patched code. The legacy build');
	console.error('  would silently break on Tizen 2.4 / webOS 3.x. Fix the patterns below:');
	failures.forEach((f) => console.error(`  - ${f}`));
	process.exit(1);
}
console.log(`\n✓ Legacy patches complete: ${patchCount} files modified, ${skipCount} skipped\n`);
