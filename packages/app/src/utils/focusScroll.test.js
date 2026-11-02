import {applyPerfTier} from './perfTier';
import {cubicBezier, glideIntoView, glideScroll, plannedScroll} from './focusScroll';

jest.mock('@enact/spotlight', () => ({getPointerMode: () => false}));

// A scroller 1000 wide over 3000 of content, its view starting at 0 on screen.
const lane = (scrollLeft = 0) => {
	const node = document.createElement('div');
	Object.defineProperty(node, 'clientWidth', {value: 1000});
	Object.defineProperty(node, 'scrollWidth', {value: 3000});
	node.scrollLeft = scrollLeft;
	node.getBoundingClientRect = () => ({left: 0, right: 1000, top: 0, bottom: 300});
	return node;
};

// A card at `left` within the content, placed on screen by the lane's offset now.
const cardIn = (node, left, width = 200) => ({
	getBoundingClientRect: () => ({left: left - node.scrollLeft, right: left + width - node.scrollLeft})
});

describe('focus glides', () => {
	let frames;
	let now;

	beforeEach(() => {
		frames = [];
		now = 0;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => frames.push(fn));
		jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		applyPerfTier(null);
	});

	const runFor = (ms) => {
		now += ms;
		const due = frames;
		frames = [];
		due.forEach((fn) => fn());
	};

	it('jumps on a TV rated low', () => {
		applyPerfTier('low');
		const node = lane();
		expect(glideScroll(node, 'x', 400)).toBe(400);
		expect(node.scrollLeft).toBe(400);
		expect(frames).toHaveLength(0);
	});

	it('glides from where the lane was before the focus scroll, and lands on the target', () => {
		applyPerfTier('high');
		const node = lane(0);
		// The browser's own focus scroll has already moved the lane.
		node.scrollLeft = 300;
		glideScroll(node, 'x', 500, 0);
		expect(node.scrollLeft).toBe(0);
		runFor(110);
		expect(node.scrollLeft).toBeGreaterThan(0);
		expect(node.scrollLeft).toBeLessThan(500);
		runFor(200);
		expect(node.scrollLeft).toBe(500);
		expect(plannedScroll(node, 'x')).toBe(500);
	});

	it('keeps the target inside the lane', () => {
		applyPerfTier('low');
		expect(glideScroll(lane(), 'x', 5000)).toBe(2000);
		expect(glideScroll(lane(), 'x', -50)).toBe(0);
	});

	it('measures a held key from where the lane is headed, so it does not fall behind', () => {
		applyPerfTier('high');
		const node = lane(0);
		// The card past the right edge brings the lane to 250.
		expect(glideIntoView(node, cardIn(node, 1000), 'x', 50, 0)).toBe(250);
		runFor(50);
		// Mid glide, the next card along is measured against 250, not the offset now.
		expect(glideIntoView(node, cardIn(node, 1200), 'x', 50, node.scrollLeft)).toBe(450);
	});

	it('leaves a card that is already in view where it is', () => {
		applyPerfTier('high');
		const node = lane(100);
		expect(glideIntoView(node, cardIn(node, 400), 'x', 50, 100)).toBe(100);
		expect(node.scrollLeft).toBe(100);
	});

	it('follows a CSS curve, so a glide keeps step with a transition on it', () => {
		const linear = cubicBezier(0, 0, 1, 1);
		[0, 0.25, 0.5, 0.8, 1].forEach((x) => expect(linear(x)).toBeCloseTo(x, 4));

		// The modern cards' ease-in-out: symmetric about the middle, slow at both ends.
		const card = cubicBezier(0.65, 0, 0.35, 1);
		expect(card(0.5)).toBeCloseTo(0.5, 4);
		expect(card(0.2) + card(0.8)).toBeCloseTo(1, 4);
		expect(card(0.1)).toBeLessThan(0.05);
		let previous = 0;
		for (let x = 0.05; x <= 1; x += 0.05) {
			expect(card(x)).toBeGreaterThanOrEqual(previous);
			previous = card(x);
		}
	});
});
