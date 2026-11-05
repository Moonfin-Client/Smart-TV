import {act, fireEvent, render} from '@testing-library/react';

import SeasonalTheme, {RESUME_AFTER_MS} from './SeasonalTheme';
import {SETTLE_MS} from './SeasonalFollower';
import {BURST_COUNTS, COUNT_SHARE, FALL_COUNTS, FLYER_COUNTS, SPARKS_PER_BURST} from './seasonalParticles';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

let mockTier = 'high';
jest.mock('../../utils/perfTier', () => ({getPerfTier: () => mockTier}));

const count = (selector) => document.querySelectorAll(selector).length;

beforeEach(() => {
	mockTier = 'high';
});

describe('SeasonalTheme', () => {
	test('draws nothing for none, a missing value or one it does not know', () => {
		for (const theme of ['none', undefined, 'aurora', 'harvest']) {
			const {container, unmount} = render(<SeasonalTheme theme={theme} density="normal" />);
			expect(container.firstChild).toBeNull();
			unmount();
		}
	});

	test('draws the falling effects at each density, one element per particle', () => {
		for (const theme of ['snow', 'leaves', 'confetti']) {
			for (const density of ['light', 'normal', 'heavy']) {
				const {unmount} = render(<SeasonalTheme theme={theme} density={density} />);
				expect(count('.overlay')).toBe(1);
				expect(count('.particle')).toBe(FALL_COUNTS.high[density]);
				expect(count('.overlay > *')).toBe(FALL_COUNTS.high[density]);
				unmount();
			}
		}
	});

	test('draws the newer effects with their own shapes', () => {
		for (const [theme, shape] of [['christmas', '.bauble'], ['petals', '.petal, .blossom'], ['fireflies', '.firefly'], ['halloween', '.candy, .leaf, .leafMirror']]) {
			const {unmount} = render(<SeasonalTheme theme={theme} density="heavy" />);
			const share = COUNT_SHARE[theme] || 1;
			expect(count('.particle')).toBe(Math.round(FALL_COUNTS.high.heavy * share));
			expect(count(shape)).toBeGreaterThan(0);
			unmount();
		}
	});

	test('draws each flyer as a flight with its sprite inside', () => {
		const {unmount} = render(<SeasonalTheme theme="halloween" density="heavy" />);
		expect(count('.flyer')).toBe(FLYER_COUNTS.halloween.heavy);
		expect(count('.flyer > .bat') + count('.flyer > .ghost')).toBe(FLYER_COUNTS.halloween.heavy);
		expect(count('.flyer > .ghost')).toBeGreaterThan(0);
		unmount();

		render(<SeasonalTheme theme="petals" density="heavy" />);
		expect(count('.flyer > .beeLeft') + count('.flyer > .beeRight')).toBe(FLYER_COUNTS.petals.heavy);
	});

	test('draws fewer on the low tier', () => {
		mockTier = 'low';
		render(<SeasonalTheme theme="snow" density="heavy" />);
		expect(count('.particle')).toBe(FALL_COUNTS.low.heavy);
	});

	test('draws fireworks as bursts with every spark inside one ring', () => {
		render(<SeasonalTheme theme="fireworks" density="heavy" />);
		expect(count('.mover')).toBe(BURST_COUNTS.heavy);
		expect(count('.rocket')).toBe(BURST_COUNTS.heavy);
		expect(count('.ring')).toBe(BURST_COUNTS.heavy);
		expect(count('.ring > .spark')).toBe(BURST_COUNTS.heavy * SPARKS_PER_BURST);
		expect(count('.particle')).toBe(0);
	});

	describe('while the remote is in use', () => {
		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		test('holds the particles still on the low tier, then lets them carry on', () => {
			mockTier = 'low';
			render(<SeasonalTheme theme="snow" density="normal" />);
			expect(count('.overlay.paused')).toBe(0);

			fireEvent.keyDown(window, {keyCode: 39});
			expect(count('.overlay.paused')).toBe(1);

			act(() => { jest.advanceTimersByTime(RESUME_AFTER_MS - 100); });
			fireEvent.keyDown(window, {keyCode: 39});
			act(() => { jest.advanceTimersByTime(RESUME_AFTER_MS - 100); });
			expect(count('.overlay.paused')).toBe(1);

			act(() => { jest.advanceTimersByTime(200); });
			expect(count('.overlay.paused')).toBe(0);
		});

		test('leaves the particles running on the high tier', () => {
			render(<SeasonalTheme theme="snow" density="normal" />);
			fireEvent.keyDown(window, {keyCode: 39});
			expect(count('.overlay.paused')).toBe(0);
		});

		test('stops listening once it is gone', () => {
			mockTier = 'low';
			const spy = jest.spyOn(window, 'removeEventListener');
			const {unmount} = render(<SeasonalTheme theme="leaves" density="light" />);
			unmount();
			expect(spy.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(1);
			spy.mockRestore();
		});
	});

	test('draws the holiday effects with their own shapes', () => {
		for (const [theme, shape] of [['valentines', '.heart'], ['easter', '.egg'], ['pride', '.strip, .disc'], ['lunar', '.particle.lantern'], ['diwali', '.ember']]) {
			const {unmount} = render(<SeasonalTheme theme={theme} density="normal" />);
			expect(count(shape)).toBeGreaterThan(0);
			unmount();
		}
	});

	test('brings the follower for an effect that has one, and none for the rest', () => {
		for (const [theme, parts] of [
			['halloween', ['.planchette']],
			['valentines', ['.cupidArrow']],
			['fireworks', ['.sparkler', '.sparks']],
			['christmas', ['.sleigh']],
			['easter', ['.bunnyEars', '.easterEgg']],
			['lunar', ['.lanternGlow', '.drawing.lantern']],
			['diwali', ['.diya', '.flame']],
			['pride', ['.rainbowBar', '.rainbowStart', '.rainbowEnd']]
		]) {
			const {unmount} = render(<SeasonalTheme theme={theme} density="light" />);
			expect(count('.layer > .follower')).toBe(theme === 'easter' ? 2 : 1);
			for (const part of parts) expect(count(part)).toBe(1);
			unmount();
		}
		for (const theme of ['snow', 'confetti', 'leaves', 'petals', 'fireflies']) {
			const {unmount} = render(<SeasonalTheme theme={theme} density="light" />);
			expect(count('.follower')).toBe(0);
			unmount();
		}
	});

	test('leaves the follower out when Focus Follower is off, but keeps the particles', () => {
		render(<SeasonalTheme theme="halloween" density="light" follower={false} />);
		expect(count('.follower')).toBe(0);
		expect(count('.particle')).toBeGreaterThan(0);
	});

	describe('following focus', () => {
		let page;
		let art;
		const box = (left, top, width, height) => () => ({left, top, width, height, right: left + width, bottom: top + height});
		const glider = () => document.querySelector('.glider');
		const shown = () => document.querySelector('.follower').style.opacity === '1';

		beforeEach(() => {
			jest.useFakeTimers();
			page = document.createElement('div');
			page.innerHTML = '<div data-pointer-rows><div id="card" tabindex="0"><div data-card-art></div></div><div id="other" tabindex="0"></div></div>' +
				'<div data-spotlight-id="navbar"><button id="search">Search</button></div><button id="dialog">OK</button>';
			document.body.appendChild(page);
			art = page.querySelector('[data-card-art]');
			art.getBoundingClientRect = jest.fn(box(120, 300, 240, 360));
		});

		afterEach(() => {
			page.remove();
			jest.useRealTimers();
		});

		const focus = (id) => act(() => {
			document.getElementById(id).focus();
		});

		test('moves once focus rests, not while a held key moves it', () => {
			render(<SeasonalTheme theme="halloween" density="light" />);
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect(shown()).toBe(false);

			focus('card');
			focus('other');
			focus('card');
			act(() => { jest.advanceTimersByTime(SETTLE_MS - 10); });
			expect(art.getBoundingClientRect).not.toHaveBeenCalled();
			act(() => { jest.advanceTimersByTime(10); });
			expect(art.getBoundingClientRect).toHaveBeenCalledTimes(1);
			expect(shown()).toBe(true);
			// It appears where it lands, pointing right at the card.
			expect(glider().style.transform).toMatch(/^translate3d\(86\.\d+px, 480px, 0\) rotate\(90deg\)$/);
			expect(glider().style.transition).toBe('none');
		});

		test('glides under a top bar button, then fades out for a dialog', () => {
			const search = document.getElementById('search');
			search.getBoundingClientRect = box(300, 40, 70, 70);
			page.querySelector('[data-spotlight-id="navbar"]').getBoundingClientRect = box(0, 30, 480, 100);
			render(<SeasonalTheme theme="halloween" density="light" />);
			focus('card');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });

			focus('search');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect(glider().style.transform).toMatch(/^translate3d\(335px, 1\d\d\.\d+px, 0\) rotate\(0deg\)$/);
			expect(glider().style.transition).toBe('');

			focus('dialog');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect(shown()).toBe(false);
		});

		test('hands over from the bunny ears to the egg on the nav', () => {
			document.getElementById('search').getBoundingClientRect = box(300, 40, 70, 70);
			page.querySelector('[data-spotlight-id="navbar"]').getBoundingClientRect = box(0, 30, 480, 100);
			render(<SeasonalTheme theme="easter" density="light" />);
			const [ears, egg] = document.querySelectorAll('.follower');
			focus('card');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect([ears.style.opacity, egg.style.opacity]).toEqual(['1', '0']);
			focus('search');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect([ears.style.opacity, egg.style.opacity]).toEqual(['0', '1']);
		});

		test('stops listening once it is gone', () => {
			const {unmount} = render(<SeasonalTheme theme="halloween" density="light" />);
			unmount();
			focus('card');
			act(() => { jest.advanceTimersByTime(SETTLE_MS); });
			expect(art.getBoundingClientRect).not.toHaveBeenCalled();
		});
	});

	test("draws this app's old winter as snow", () => {
		render(<SeasonalTheme theme="winter" />);
		expect(count('.particle')).toBe(FALL_COUNTS.high.normal);
		expect(count('.dot') + count('.flake')).toBe(FALL_COUNTS.high.normal);
	});
});
