import {renderHook, act} from '@testing-library/react';

import useImageReveal, {isDecoded, markDecoded} from './useImageReveal';

// The img the hook is bound to, as the load event hands it over.
const loadedImg = (decode) => ({src: 'x', currentSrc: 'x', decode});

describe('useImageReveal', () => {
	test('keeps art out of sight until it has decoded, then shows it', async () => {
		let finish;
		const decode = jest.fn(() => new Promise((resolve) => {
			finish = resolve;
		}));
		const {result} = renderHook(() => useImageReveal('http://server/a.jpg'));
		expect(result.current.shown).toBe(false);

		act(() => result.current.bind.onLoad({currentTarget: loadedImg(decode)}));
		expect(decode).toHaveBeenCalled();
		expect(result.current.shown).toBe(false);

		await act(async () => finish());
		expect(result.current.shown).toBe(true);
		expect(isDecoded('http://server/a.jpg')).toBe(true);
	});

	test('shows art at once on an engine that cannot decode ahead', () => {
		const {result} = renderHook(() => useImageReveal('http://server/b.jpg'));
		act(() => result.current.bind.onLoad({currentTarget: loadedImg(undefined)}));
		expect(result.current.shown).toBe(true);
	});

	test('shows art decoded before straight away, so a remounted card does not blink', () => {
		markDecoded('http://server/c.jpg');
		const {result} = renderHook(() => useImageReveal('http://server/c.jpg'));
		expect(result.current.shown).toBe(true);
	});

	test('still shows the art when decoding fails', async () => {
		const {result} = renderHook(() => useImageReveal('http://server/d.jpg'));
		await act(async () => result.current.bind.onLoad({currentTarget: loadedImg(() => Promise.reject(new Error('bad')))}));
		expect(result.current.shown).toBe(true);
	});

	test('ignores a decode that settles after the image moved on to other art', async () => {
		let fail;
		const img = {src: 'old', currentSrc: 'old', decode: () => new Promise((resolve, reject) => {
			fail = reject;
		})};
		const {result} = renderHook(() => useImageReveal('http://server/e.jpg'));
		act(() => result.current.bind.onLoad({currentTarget: img}));
		img.src = 'new';
		img.currentSrc = 'new';
		await act(async () => fail(new Error('aborted')));
		expect(isDecoded('http://server/e.jpg')).toBe(false);
		expect(result.current.shown).toBe(false);
	});

	test('counts a card with no art as shown', () => {
		const {result} = renderHook(() => useImageReveal(null));
		expect(result.current.shown).toBe(true);
	});
});
