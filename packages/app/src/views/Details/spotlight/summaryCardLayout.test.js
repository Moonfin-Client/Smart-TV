import {summaryCardHeight, summaryCardWidth, heroWidth} from './summaryCardLayout';

describe('summaryCardHeight', () => {
	it('takes its share of a short screen', () => {
		expect(summaryCardHeight(600)).toBeCloseTo(168);
	});

	it('stops growing at the ceiling on a tall screen', () => {
		expect(summaryCardHeight(1080)).toBe(200);
	});

	it('holds a floor so the cards stay legible on a very short one', () => {
		expect(summaryCardHeight(300)).toBe(120);
	});
});

describe('summaryCardWidth', () => {
	it('divides the band evenly once the gaps are taken out', () => {
		expect(summaryCardWidth(1100, 5, 200)).toBe((1100 - 64) / 5);
	});

	it('never grows a card wider than its artwork needs', () => {
		expect(summaryCardWidth(1100, 2, 200)).toBe(200 * (16 / 9));
	});

	it('has no width to give without cards', () => {
		expect(summaryCardWidth(1100, 0, 200)).toBe(0);
	});

	it('never goes negative when the gaps outrun the band', () => {
		expect(summaryCardWidth(20, 5, 200)).toBe(0);
	});
});

describe('heroWidth', () => {
	it('takes most of the screen, inside a floor and a ceiling', () => {
		expect(heroWidth(1366)).toBe(1100);
		expect(heroWidth(1000)).toBe(850);
		expect(heroWidth(400)).toBe(450);
	});
});
