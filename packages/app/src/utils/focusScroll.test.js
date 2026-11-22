import {cubicBezier, glideScroll, glideToCard, setSmoothScrolling, whenStill} from './focusScroll';
import {applyPerfTier} from './perfTier';

jest.mock('@enact/spotlight', () => ({getPointerMode: () => false}));

// A scroller 1000 wide over 3000 of content, its view starting at 0 on screen.
const lane = (scrollLeft = 0) => {
	const node = document.createElement('div');
	Object.defineProperty(node, 'clientWidth', {value: 1000});
	Object.defineProperty(node, 'scrollWidth', {value: 3000});
	node.scrollLeft = scrollLeft;
	return node;
};

// Cards side by side in one row, each at its own offset.
const cardsAt = (...lefts) => {
	const items = document.createElement('div');
	return lefts.map((left) => {
		const card = document.createElement('div');
		Object.defineProperty(card, 'offsetLeft', {value: left});
		items.appendChild(card);
		return card;
	});
};

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

	const runFor = (ms) => {
		now += ms;
		const due = frames;
		frames = [];
		due.forEach((fn) => fn());
	};

	afterEach(() => {
		// Glides are tracked across the module, so each test lets its own run out.
		for (let i = 0; i < 10 && frames.length; i++) runFor(1000);
		jest.restoreAllMocks();
		setSmoothScrolling(true);
	});

	it('jumps with Smooth Scrolling off, unless the glide keeps step with something else moving', () => {
		setSmoothScrolling(false);
		const node = lane();
		expect(glideScroll(node, 'x', 400)).toBe(400);
		expect(node.scrollLeft).toBe(400);
		expect(frames).toHaveLength(0);

		const timed = lane();
		glideScroll(timed, 'x', 400, 0, {duration: 180, ease: (t) => t});
		expect(timed.scrollLeft).toBe(0);
		expect(frames).toHaveLength(1);
	});

	it('glides from where the lane was before the focus scroll, and lands on the target', () => {
		const node = lane(0);
		// The browser's own focus scroll has already moved the lane.
		node.scrollLeft = 300;
		glideScroll(node, 'x', 500, 0);
		expect(node.scrollLeft).toBe(0);
		runFor(110);
		expect(node.scrollLeft).toBeGreaterThan(0);
		expect(node.scrollLeft).toBeLessThan(500);
		runFor(300);
		expect(node.scrollLeft).toBe(500);
	});

	it("starts the clock on the first frame, so a slow one doesn't use up the glide", () => {
		const node = lane(0);
		glideScroll(node, 'x', 500, 0);
		expect(node.scrollLeft).toBe(0);
		// The frame that paints the focus change takes 150 ms.
		runFor(150);
		expect(node.scrollLeft).toBeGreaterThan(0);
		expect(node.scrollLeft).toBeLessThan(200);
	});

	it('keeps the target inside the lane', () => {
		expect(glideScroll(lane(), 'x', 5000)).toBe(2000);
		expect(glideScroll(lane(), 'x', -50)).toBe(0);
	});

	it('parks the focused card where the first one sits, until the row runs out', () => {
		const cards = cardsAt(60, 280, 500, 2900);
		expect(glideToCard(lane(0), cards[0], 0)).toBe(0);
		expect(glideToCard(lane(0), cards[2], 0)).toBe(440);
		expect(glideToCard(lane(0), cards[3], 0)).toBe(2000);
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

	it('holds work back until every glide has finished', () => {
		const idle = jest.fn();
		whenStill(idle);
		expect(idle).toHaveBeenCalled();

		glideScroll(lane(0), 'x', 500, 0);
		const held = jest.fn();
		whenStill(held);
		runFor(100);
		expect(held).not.toHaveBeenCalled();
		runFor(300);
		runFor(16);
		expect(held).toHaveBeenCalled();
	});
});

describe('compositor slides', () => {
	let players;
	let animate;

	// A lane holding the one track that slides.
	const laneWithTrack = (scrollLeft = 0) => {
		const node = lane(scrollLeft);
		node.appendChild(document.createElement('div'));
		return node;
	};

	beforeEach(() => {
		players = [];
		animate = window.Element.prototype.animate;
		window.Element.prototype.animate = function (keyframes, options) {
			const player = {keyframes, options, track: this, cancel: jest.fn()};
			players.push(player);
			return player;
		};
	});

	afterEach(() => {
		players.forEach((player) => player.onfinish && player.onfinish());
		window.Element.prototype.animate = animate;
		jest.restoreAllMocks();
		applyPerfTier(null);
	});

	it('jumps the lane to the end and slides its track in from what was on screen', () => {
		const node = laneWithTrack(0);
		node.scrollLeft = 300;
		expect(glideScroll(node, 'x', 500, 0)).toBe(500);
		expect(node.scrollLeft).toBe(500);
		expect(players).toHaveLength(1);
		expect(players[0].track).toBe(node.firstChild);
		expect(players[0].keyframes).toEqual([{transform: 'translate3d(500px, 0, 0)'}, {transform: 'translate3d(0px, 0, 0)'}]);
	});

	it('carries a second move on from where the first one shows', () => {
		const node = laneWithTrack(0);
		glideScroll(node, 'x', 500, 0);
		// Part way along, the track still sits 200 px short of the end.
		jest.spyOn(window, 'getComputedStyle').mockReturnValue({transform: 'matrix(1, 0, 0, 1, 200, 0)'});
		glideScroll(node, 'x', 900, 500);
		expect(players[0].cancel).toHaveBeenCalled();
		expect(node.scrollLeft).toBe(900);
		expect(players[1].keyframes[0]).toEqual({transform: 'translate3d(600px, 0, 0)'});
	});

	it('holds work back until the slide reports it has finished', () => {
		glideScroll(laneWithTrack(0), 'x', 500, 0);
		const held = jest.fn();
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
		whenStill(held);
		expect(held).not.toHaveBeenCalled();
		players[0].onfinish();
		whenStill(held);
		expect(held).toHaveBeenCalled();
	});

	it("keeps a sliding lane where it is through the browser's own scroll to a focused card", () => {
		const node = laneWithTrack(0);
		const card = document.createElement('button');
		node.firstChild.appendChild(card);
		document.body.appendChild(node);
		glideScroll(node, 'x', 500, 0);
		// The engine's focus scroll, which aims at where the slide draws the card.
		card.addEventListener('focus', () => {
			node.scrollLeft = 1200;
		});
		card.focus();
		expect(document.activeElement).toBe(card);
		expect(node.scrollLeft).toBe(500);
		node.remove();
	});

	it('keeps the High tier on the script glide', () => {
		applyPerfTier('high');
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
		const node = laneWithTrack(0);
		glideScroll(node, 'x', 500, 0);
		expect(players).toHaveLength(0);
		expect(node.scrollLeft).toBe(0);
	});
});
