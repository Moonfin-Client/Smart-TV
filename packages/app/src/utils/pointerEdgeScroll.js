// A pointer with no wheel, like the LG remote app's, only reaches what's on screen, so resting it near an
// edge of whatever scrolls under it moves that row or page along. It goes faster the nearer the edge and
// waits a moment first, so a pointer passing through leaves it alone. A list of rows marked
// data-pointer-rows moves a row at a time, which an older set draws far more cleanly than a page sliding
// under the pointer, and a grid marked data-pointer-steps moves itself when sent wheel events.
const EDGE = 110;
const REST_MS = 250;
const MIN_SPEED = 300;
const MAX_SPEED = 1400;
const STEP_MS = 400;
// A frame that took long doesn't turn into one big jump.
const MAX_FRAME_S = 0.1;
const ROWS = 'data-pointer-rows';
const STEPS = 'data-pointer-steps';

const scrollsAlong = (el, axis) => {
	if (axis === 'y' && el.hasAttribute(STEPS)) return true;
	const overflows = axis === 'x' ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1;
	if (!overflows) return false;
	const style = window.getComputedStyle(el);
	return /auto|scroll/.test(axis === 'x' ? style.overflowX : style.overflowY);
};

const scrollerAt = (node, axis) => {
	for (let el = node; el && el !== document.body; el = el.parentElement) {
		if (scrollsAlong(el, axis)) return el;
	}
	return null;
};

// Near the edge of the screen a pointer can overshoot what it was steering, onto a status bar, the
// margin beside a row or the header above a list, so the nearest scroller further in takes the edge.
const scrollerInward = (px, py, axis, dx, dy) => {
	const reach = (axis === 'x' ? window.innerWidth : window.innerHeight) / 2;
	for (let step = 40; step < reach; step += 40) {
		const found = scrollerAt(document.elementFromPoint(px + dx * step, py + dy * step), axis);
		if (found) return found;
	}
	return null;
};

// Where each row starts within the list, and the furthest it can go with the last row's bottom on screen.
// The list can run on past its last row, room kept for the remote, which a pointer has no use for.
const rowStops = (el) => {
	const origin = el.getBoundingClientRect().top - el.scrollTop;
	// The rows can sit in one track inside the list, which is what slides when the remote moves them.
	const rows = el.children.length === 1 ? el.children[0].children : el.children;
	const tops = [];
	let end = 0;
	for (let i = 0; i < rows.length; i++) {
		const box = rows[i].getBoundingClientRect();
		if (!box.height) continue;
		tops.push(box.top - origin);
		end = Math.max(end, box.bottom - origin);
	}
	return {tops, last: Math.max(0, end - el.clientHeight)};
};

const stepRows = (el, direction) => {
	const {tops, last} = rowStops(el);
	const now = el.scrollTop;
	let next = direction > 0 ? last : 0;
	for (let i = 0; i < tops.length; i++) {
		if (direction > 0 && tops[i] > now + 1) {
			next = tops[i];
			break;
		}
		if (direction < 0 && tops[i] < now - 1) next = tops[i];
	}
	el.scrollTop = Math.max(0, Math.min(next, last));
};

// How fast to move for a pointer at pos along a box running from start to end, negative toward start.
export const edgeSpeed = (pos, start, end) => {
	const band = Math.min(EDGE, (end - start) / 4);
	let depth = 0;
	if (pos < start + band) depth = (pos - start - band) / band;
	else if (pos > end - band) depth = (pos - end + band) / band;
	if (!depth) return 0;
	return Math.sign(depth) * (MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.abs(depth)));
};

export const scrollAtPointerEdges = () => {
	let x = -1;
	let y = -1;
	let under = null;
	let zone = '';
	let sideways = null;
	let upright = null;
	let frame = 0;
	let restingSince = 0;
	let lastTime = 0;
	let lastStep = 0;

	const tick = (now) => {
		frame = 0;
		if (x < 0) return;
		const at = document.elementFromPoint(x, y);
		const inwardX = x > window.innerWidth - EDGE ? -1 : (x < EDGE ? 1 : 0);
		const inwardY = y > window.innerHeight - EDGE ? -1 : (y < EDGE ? 1 : 0);
		if (at !== under || zone !== `${inwardX}${inwardY}`) {
			under = at;
			zone = `${inwardX}${inwardY}`;
			// Something that takes focus never hands its edge on, so pointing at the navigation doesnt scroll the page.
			const loose = at && !at.closest('.spottable');
			sideways = at && (scrollerAt(at, 'x') || (loose && inwardX ? scrollerInward(x, y, 'x', inwardX, 0) : null));
			upright = at && (scrollerAt(at, 'y') || (loose && inwardY ? scrollerInward(x, y, 'y', 0, inwardY) : null));
		}
		let vx = 0;
		let vy = 0;
		if (sideways) {
			const box = sideways.getBoundingClientRect();
			const left = x < box.left ? 0 : Math.max(box.left, 0);
			const right = x > box.right ? window.innerWidth : Math.min(box.right, window.innerWidth);
			const v = edgeSpeed(x, left, right);
			const max = sideways.scrollWidth - sideways.clientWidth;
			if ((v < 0 && sideways.scrollLeft > 0) || (v > 0 && sideways.scrollLeft < max - 1)) vx = v;
		}
		if (upright) {
			const box = upright.getBoundingClientRect();
			const top = y < box.top ? 0 : Math.max(box.top, 0);
			const bottom = y > box.bottom ? window.innerHeight : Math.min(box.bottom, window.innerHeight);
			const v = edgeSpeed(y, top, bottom);
			if (v) {
				const max = upright.hasAttribute(ROWS) ? rowStops(upright).last : upright.scrollHeight - upright.clientHeight;
				if (upright.hasAttribute(STEPS) || (v < 0 && upright.scrollTop > 0) || (v > 0 && upright.scrollTop < max - 1)) vy = v;
			}
		}
		if (!vx && !vy) {
			restingSince = 0;
			return;
		}
		if (!restingSince) restingSince = now;
		if (now - restingSince >= REST_MS) {
			const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_S);
			if (vx) sideways.scrollLeft += vx * dt;
			const stepped = upright && (upright.hasAttribute(ROWS) || upright.hasAttribute(STEPS));
			if (vy && !stepped) upright.scrollTop += vy * dt;
			else if (vy && now - lastStep >= STEP_MS) {
				lastStep = now;
				if (upright.hasAttribute(ROWS)) stepRows(upright, vy);
				else upright.dispatchEvent(new window.WheelEvent('wheel', {deltaY: vy, bubbles: true}));
			}
		}
		lastTime = now;
		frame = window.requestAnimationFrame(tick);
	};

	const stop = () => {
		x = -1;
		under = null;
		restingSince = 0;
		window.cancelAnimationFrame(frame);
		frame = 0;
	};

	// A card the pointer lands on takes focus, and the browser scrolls a half hidden one fully into view,
	// which pulls the row or page out from under the pointer. Focus that comes from a hover leaves every
	// scroll position where it was.
	let hovering = false;
	const nativeFocus = window.HTMLElement.prototype.focus;
	window.HTMLElement.prototype.focus = function (options) {
		if (!hovering) return nativeFocus.call(this, options);
		const kept = [];
		for (let el = this.parentElement; el; el = el.parentElement) kept.push([el, el.scrollTop, el.scrollLeft]);
		nativeFocus.call(this, options);
		kept.forEach(([el, top, left]) => {
			if (el.scrollTop !== top) el.scrollTop = top;
			if (el.scrollLeft !== left) el.scrollLeft = left;
		});
	};
	document.addEventListener('mouseover', () => {
		hovering = true;
		setTimeout(() => {
			hovering = false;
		}, 0);
	}, true);

	document.addEventListener('mousemove', (ev) => {
		x = ev.clientX;
		y = ev.clientY;
		if (!frame) frame = window.requestAnimationFrame(tick);
	}, true);
	document.addEventListener('keydown', stop, true);
	document.addEventListener('mouseout', (ev) => {
		if (!ev.relatedTarget) stop();
	}, true);
};
