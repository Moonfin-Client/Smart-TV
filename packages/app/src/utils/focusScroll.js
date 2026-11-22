import Spotlight from '@enact/spotlight';
import {canSlide, getPerfTier} from './perfTier';

// Spotlight focuses without scrolling, so anything taller than its box has to
// bring the focused row into view itself. scrollIntoView options are ignored on
// older Tizen and webOS WebKit, which would leave the row parked off screen, so
// the scroller is nudged by hand instead.
const SCROLL_PADDING = 24;

// True while a pointer is driving focus. A hovered element already sits under
// the cursor, so scrolling it into place would slide it away from the pointer
// and land the hover on whatever came in behind it. Anything that scrolls or
// acts on focus alone should answer key driven focus only.
export const pointerHover = () => Spotlight.getPointerMode();

const AXES = {
	x: {offset: 'scrollLeft', size: 'clientWidth', total: 'scrollWidth'},
	y: {offset: 'scrollTop', size: 'clientHeight', total: 'scrollHeight'}
};

// How long a row takes to glide to a newly focused card, and the ease-out it glides with.
const GLIDE_MS = 220;
const FRAME_MS = 16;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

let smooth = true;
export const setSmoothScrolling = (on) => {
	smooth = on !== false;
};
export const smoothScrollingOn = () => smooth;

/**
 * The CSS cubic-bezier timing function, so a scroll can keep step with a transition on the same curve.
 */
export const cubicBezier = (x1, y1, x2, y2) => {
	const at = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
	const slope = (a, b, t) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
	return (x) => {
		if (x <= 0 || x >= 1) return Math.max(0, Math.min(1, x));
		// Newton's method finds the curve's t for this x, falling back to halving where the slope flattens.
		let t = x;
		for (let i = 0; i < 8; i++) {
			const d = slope(x1, x2, t);
			if (Math.abs(d) < 1e-6) break;
			t -= (at(x1, x2, t) - x) / d;
		}
		if (t < 0 || t > 1 || Math.abs(at(x1, x2, t) - x) > 1e-4) {
			let lo = 0;
			let hi = 1;
			t = x;
			for (let i = 0; i < 20; i++) {
				if (at(x1, x2, t) < x) lo = t;
				else hi = t;
				t = (lo + hi) / 2;
			}
		}
		return at(y1, y2, t);
	};
};

// One animation per scroller and axis, since a held key would otherwise stack loops that fight over the offset.
// Each keeps where it's headed and the last offset it wrote.
const glides = {x: new WeakMap(), y: new WeakMap()};
// Every glide under way anywhere, so heavier work can hold off until the screen is still.
const moving = new Set();

/**
 * Runs `fn` once no glide is under way, so work that costs frames, like swapping the backdrop,
 * doesn't land in the middle of one.
 */
export const whenStill = (fn) => {
	if (moving.size === 0) {
		fn();
		return;
	}
	window.requestAnimationFrame(() => whenStill(fn));
};

// A sliding track is drawn away from where it lays out, so the browser's own scroll to a newly focused element
// would aim at the drawn spot and throw the scroller off. A scroller being slid keeps its offset through a focus.
if (typeof window !== 'undefined' && window.HTMLElement) {
	const nativeFocus = window.HTMLElement.prototype.focus;
	window.HTMLElement.prototype.focus = function (...args) {
		if (!moving.size) return nativeFocus.apply(this, args);
		const kept = [];
		moving.forEach((glide) => {
			if (glide.player) kept.push([glide.node, glide.node.scrollTop, glide.node.scrollLeft]);
		});
		const result = nativeFocus.apply(this, args);
		kept.forEach(([node, top, left]) => {
			if (node.scrollTop !== top) node.scrollTop = top;
			if (node.scrollLeft !== left) node.scrollLeft = left;
		});
		return result;
	};
}

const endGlide = (axis, node, glide) => {
	window.cancelAnimationFrame(glide.frame);
	if (glide.player) {
		clearTimeout(glide.timer);
		glide.player.onfinish = null;
		glide.player.cancel();
	}
	moving.delete(glide);
	glides[axis].delete(node);
};

// Below the High tier the scroller jumps straight to the end and its track is drawn sliding in from where it
// was. The compositor runs that at the screen's own rate, while a glide drawn by script on those TVs only gets
// two or three frames, since painting the focus change takes most of the main thread.
const SLIDE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

const slideTrackOf = (node) => (
	getPerfTier() !== 'high' && canSlide() && node.children && node.children.length === 1 ? node.children[0] : null
);

const shiftOf = (track, axis) => {
	const style = window.getComputedStyle(track);
	const matrix = (style.transform || style.webkitTransform || '').match(/^matrix(3d)?\(([^)]*)\)/);
	if (!matrix) return 0;
	const values = matrix[2].split(',').map(parseFloat);
	const index = matrix[1] ? (axis === 'x' ? 12 : 13) : (axis === 'x' ? 4 : 5);
	return values[index] || 0;
};

// The offset a move under way shows right now, which is where the next one carries on from whatever the
// browser's own focus scroll has done to the node since.
const shownAt = (glide, axis) => (glide.player ? glide.target - shiftOf(glide.track, axis) : glide.at);

const slide = (node, track, axis, target, duration, start, running) => {
	const {offset} = AXES[axis];
	const from = running ? shownAt(running, axis) : (typeof start === 'number' ? start : node[offset]);
	if (running) endGlide(axis, node, running);
	node[offset] = target;
	const shift = target - from;
	if (Math.abs(shift) < 1) return;
	const at = (px) => (axis === 'x' ? `translate3d(${px}px, 0, 0)` : `translate3d(0, ${px}px, 0)`);
	const player = track.animate([{transform: at(shift)}, {transform: at(0)}], {duration, easing: SLIDE_EASE});
	const glide = {target, track, node, player};
	const done = () => endGlide(axis, node, glide);
	player.onfinish = done;
	// The compositor only starts the clock once the frame with the focus change is up, which a slow TV can take a
	// while over, so this is only a backstop for a slide that never reports back.
	glide.timer = setTimeout(done, duration * 4 + 1000);
	glides[axis].set(node, glide);
	moving.add(glide);
};

export const stopScrollAnimation = (node) => {
	['x', 'y'].forEach((axis) => {
		const glide = glides[axis].get(node);
		if (glide) endGlide(axis, node, glide);
	});
};

// A glide given its own `ease` keeps step with something else moving, so it stays on the script's clock.
const animate = (node, axis, target, duration, start, ease) => {
	const {offset} = AXES[axis];
	const running = glides[axis].get(node);
	const track = ease ? null : slideTrackOf(node);
	if (track) {
		slide(node, track, axis, target, duration, start, running);
		return;
	}
	const curve = ease || easeOutCubic;
	const from = running ? shownAt(running, axis) : (typeof start === 'number' ? start : node[offset]);
	if (running) endGlide(axis, node, running);
	const distance = target - from;
	if (!distance) {
		node[offset] = target;
		return;
	}
	const glide = {target, at: from, frame: 0};
	// The clock starts on the next frame, already a frame in, since the frame that paints the focus change can
	// take 100 ms on a slow TV and would otherwise use up most of the glide.
	let started = 0;
	const step = () => {
		if (!started) started = Date.now() - FRAME_MS;
		const t = Math.min(1, (Date.now() - started) / duration);
		glide.at = from + distance * curve(t);
		node[offset] = glide.at;
		if (t < 1) glide.frame = window.requestAnimationFrame(step);
		else endGlide(axis, node, glide);
	};
	glides[axis].set(node, glide);
	moving.add(glide);
	// The start goes straight in, so a node the browser scrolled on focus is back where it was before
	// anything paints.
	node[offset] = from;
	glide.frame = window.requestAnimationFrame(step);
};

export const animateScrollTop = (node, target, duration) => animate(node, 'y', target, duration);

export const isGliding = (node, axis) => glides[axis].has(node);

/**
 * Moves a scroller to `target` on an axis, gliding there unless Smooth Scrolling is off.
 * `start` is the offset the scroller showed before the browser's own focus scroll moved it, read in a focus
 * handler, so the move starts from what was on screen. `duration` and `ease` time the glide to match something
 * else moving with it, so a glide given an `ease` runs even with Smooth Scrolling off. Gives back the target,
 * kept within the scroller's range.
 */
export const glideScroll = (node, axis, target, start, {duration = GLIDE_MS, ease} = {}) => {
	const {offset, size, total} = AXES[axis];
	const clamped = Math.max(0, Math.min(target, node[total] - node[size]));
	const running = glides[axis].get(node);
	if (running && Math.abs(running.target - clamped) < 1) return clamped;
	if (!smooth && !ease) {
		stopScrollAnimation(node);
		node[offset] = clamped;
		return clamped;
	}
	animate(node, axis, clamped, duration, start, ease);
	return clamped;
};

/**
 * Glides a row so the focused card sits where the row's first item sits at rest, which keeps focus at the leading
 * edge while the row moves under it. The last few cards can't scroll that far and keep what's left. `start` is as
 * for glideScroll.
 */
export const glideToCard = (scroller, card, start) =>
	glideScroll(scroller, 'x', card.offsetLeft - card.parentNode.firstElementChild.offsetLeft, start);

/**
 * Scrolls the focused element into view inside its container, on whichever axis
 * it has run past the edge. Goes straight on the scrolling element as its
 * onFocus handler. A container that only scrolls one way ignores the other,
 * since setting the offset it has no room for does nothing.
 *
 * @param {Object} e - the focus event, whose currentTarget is the scroller
 */
export const keepFocusInView = (e) => {
	if (pointerHover()) return;
	const container = e.currentTarget;
	const el = e.target;
	if (!container || !el || !el.getBoundingClientRect) return;
	const view = container.getBoundingClientRect();
	const row = el.getBoundingClientRect();
	if (row.top < view.top) {
		container.scrollTop -= (view.top - row.top) + SCROLL_PADDING;
	} else if (row.bottom > view.bottom) {
		container.scrollTop += (row.bottom - view.bottom) + SCROLL_PADDING;
	}
	if (row.left < view.left) {
		container.scrollLeft -= (view.left - row.left) + SCROLL_PADDING;
	} else if (row.right > view.right) {
		container.scrollLeft += (row.right - view.right) + SCROLL_PADDING;
	}
};
