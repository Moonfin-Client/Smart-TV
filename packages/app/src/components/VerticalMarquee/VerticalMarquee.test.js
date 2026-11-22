import {readingPace} from './VerticalMarquee';

// The component's JSX would load the CLI's second copy of React, and only its timing is tested here.
jest.mock('react/jsx-dev-runtime', () => ({jsxDEV: () => null}));

// 340 characters over six lines, three of them visible.
const description = {chars: 340, textHeight: 180, viewportHeight: 90, lines: 3, pauseMs: 1600};

describe('readingPace', () => {
	test('holds the first lines as long as they take to read', () => {
		expect(readingPace(description).holdMs).toBe(10000);
	});

	test('scrolls the rest in at 17 characters a second', () => {
		const {scrollMs} = readingPace(description);
		expect(170 / (scrollMs / 1000)).toBeCloseTo(17, 1);
	});

	test('holds the last lines for as long as one of them takes to read', () => {
		expect(readingPace(description).endHoldMs).toBe(3333);
	});

	test('never holds for less than the pause', () => {
		const short = readingPace({chars: 40, textHeight: 60, viewportHeight: 30, lines: 1, pauseMs: 1600});
		expect(short.holdMs).toBe(1600);
		expect(short.endHoldMs).toBe(1600);
	});
});
