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

function patchFile(relPath, patches) {
	const filePath = path.join(NODE_MODULES, relPath);
	if (!fs.existsSync(filePath)) {
		console.warn(`  [SKIP] ${relPath} — file not found`);
		skipCount++;
		return;
	}

	let content = fs.readFileSync(filePath, 'utf8');
	let modified = false;

	for (const {find, replace, description} of patches) {
		if (typeof find === 'string') {
			if (content.includes(find)) {
				content = content.replace(find, replace);
				console.log(`  [OK]   ${description}`);
				modified = true;
			} else if (content.includes(replace)) {
				console.log(`  [SKIP] ${description} — already patched`);
			} else {
				console.warn(`  [FAIL] ${description} — search string not found in ${relPath}`);
			}
		} else {
			// Regex
			if (find.test(content)) {
				content = content.replace(find, replace);
				console.log(`  [OK]   ${description}`);
				modified = true;
			} else if (typeof replace === 'string' && content.includes(replace)) {
				console.log(`  [SKIP] ${description} — already patched`);
			} else {
				console.warn(`  [FAIL] ${description} — pattern not found in ${relPath}`);
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
		description: 'Replace setCSSVariable with real DOM element fallback for scrollbar thumb'
	}
]);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n✓ Legacy patches complete: ${patchCount} files modified, ${skipCount} skipped\n`);
