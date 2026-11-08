import {CAST, GAME_IDS, makeGame, simulate, drawDim, drawIcon, drawShade} from './games';

// The runner is painted by ScreensaverRunner, whose JSX would load the CLI's second copy of React.
// The games only use its painter, so the component never renders here.
jest.mock('react/jsx-dev-runtime', () => ({jsxDEV: () => null}));

// jsdom has no canvas, so the games draw into a context that takes every call and remembers nothing.
const fakeContext = () => {
	const target = {
		createLinearGradient: () => ({addColorStop: () => {}}),
		measureText: () => ({width: 10})
	};
	return new Proxy(target, {
		get: (obj, key) => (key in obj ? obj[key] : () => {}),
		set: (obj, key, value) => {
			obj[key] = value;
			return true;
		}
	});
};

const SHELF = [{title: 'ONE', col: 'rgb(1, 2, 3)', dark: false}, {title: 'TWO', col: 'rgb(200, 200, 200)', dark: true}];

describe('After Hours games', () => {
	test.each(GAME_IDS)('%s plays its own demo and draws every frame', (id) => {
		const g = makeGame(id, SHELF);
		const c = fakeContext();
		g.reset();
		for (let i = 0; i < 20 * 60; i++) {
			if (g.over) g.reset();
			g.ai();
			g.update(1 / 60);
			if (i % 30 === 0) g.draw(c, i / 60);
		}
		expect(Number.isInteger(g.score)).toBe(true);
		drawDim(c);
		drawShade(c);
	});

	test('one well timed jump takes all five pieces of a popcorn arc', () => {
		const piecesTaken = (jumpAt) => {
			const g = makeGame('buffer-run', SHELF);
			g.reset();
			g.next = 0;
			// The first two draws pick popcorn and put it on the runner's side.
			const random = jest.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
			g.update(1 / 60);
			random.mockRestore();
			const arc = g.things.filter((o) => o.k === 'popcorn');
			for (let i = 1; i < 5 * 60 && !g.over; i++) {
				if (i === jumpAt) g.jump();
				g.update(1 / 60);
			}
			return arc.filter((o) => o.dead).length;
		};
		expect(Math.max(...Array.from({length: 4 * 60}, (_, i) => piecesTaken(i)))).toBe(5);
	});

	test('every game has a How to play cast and every entry has a sprite to draw', () => {
		expect(Object.keys(CAST)).toEqual(GAME_IDS);
		const c = fakeContext();
		GAME_IDS.forEach((id) => ['enemy', 'obstacle', 'power'].forEach((group) => {
			expect(CAST[id][group].length).toBeGreaterThan(0);
			CAST[id][group].forEach(([sprite, s, dy, dx]) => drawIcon(c, sprite, s, dy, dx));
		}));
	});

	test('a game reports its sounds only once sfx is set', () => {
		const g = makeGame('buffer-run');
		g.reset();
		g.jump();
		const heard = [];
		g.sfx = (name) => heard.push(name);
		g.jump();
		expect(heard).toEqual(['whoosh']);
	});

	test('Buffer Run jumps, then flips gravity, then ignores a third press until it lands', () => {
		const g = makeGame('buffer-run');
		g.reset();
		g.jump();
		expect(g.p.grav).toBe(1);
		g.jump();
		expect(g.p.grav).toBe(-1);
		g.jump();
		expect(g.p.grav).toBe(-1);
		g.things = [];
		g.next = 99;
		for (let i = 0; i < 120; i++) g.update(1 / 60);
		// It lands on the ceiling with its middle 20 px below it, so a flip turns it over in place.
		expect(g.p.ground).toBe(true);
		expect(g.p.jumps).toBe(0);
		expect(g.p.y).toBe(270 - 232 + 20);
	});

	test('Cable Crawl ignores a turn back on itself and keeps two turns at most', () => {
		const g = makeGame('cable-crawl');
		g.reset();
		g.press('left');
		g.press('right');
		expect(g.queue).toEqual([]);
		g.press('up');
		g.press('left');
		g.press('down');
		expect(g.queue).toEqual([[0, -1], [-1, 0]]);
	});

	test('Case Stack grows on a perfect drop, trims an overhang and ends on a miss', () => {
		const g = makeGame('case-stack', SHELF);
		g.reset();
		const base = g.stack[0];
		g.cur.x = base.x;
		g.drop();
		expect(g.stack[1].w).toBe(base.w);
		expect(g.combo).toBe(1);

		g.cur.x = g.stack[1].x + 20;
		g.drop();
		expect(g.stack[2].w).toBe(base.w - 20);
		expect(g.combo).toBe(0);

		g.cur.x = g.stack[2].x + g.stack[2].w + 5;
		g.drop();
		expect(g.over).toBe(true);
	});

	test('Case Stack spines take the shelf they are given', () => {
		const g = makeGame('case-stack', SHELF);
		g.reset();
		expect(SHELF.map((s) => s.title)).toContain(g.cur.title);
	});

	test('simulate hands back a game mid-run', () => {
		const g = simulate(makeGame('pixel-purge'), 2);
		expect(g.over).toBe(false);
		expect(g.t).toBeGreaterThan(0);
	});
});
