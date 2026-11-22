import {act, renderHook} from '@testing-library/react';

import usePhotoSlideshow, {FADE_MS, canStartSlideshow, isSlideshowVideo, stepIndex, viewerItems} from './usePhotoSlideshow';

const photo = (id) => ({Id: id, Type: 'Photo'});
const video = (id) => ({Id: id, Type: 'Video'});

const setup = (props) => renderHook((current) => usePhotoSlideshow(current), {initialProps: props});

const base = {active: true, itemId: 'a', settled: true, intervalMs: 5000};

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe('usePhotoSlideshow', () => {
	test('advances once, the fade and the interval after the photo has loaded', () => {
		const onAdvance = jest.fn();
		setup({...base, onAdvance});

		act(() => jest.advanceTimersByTime(FADE_MS + 4999));
		expect(onAdvance).not.toHaveBeenCalled();

		act(() => jest.advanceTimersByTime(1));
		expect(onAdvance).toHaveBeenCalledTimes(1);

		act(() => jest.advanceTimersByTime(20000));
		expect(onAdvance).toHaveBeenCalledTimes(1);
	});

	test('does not start counting while the photo is still loading', () => {
		const onAdvance = jest.fn();
		const {rerender} = setup({...base, settled: false, onAdvance});

		act(() => jest.advanceTimersByTime(60000));
		expect(onAdvance).not.toHaveBeenCalled();

		rerender({...base, settled: true, onAdvance});
		act(() => jest.advanceTimersByTime(FADE_MS + 5000));
		expect(onAdvance).toHaveBeenCalledTimes(1);
	});

	test('restarts the countdown when the photo changes', () => {
		const onAdvance = jest.fn();
		const {rerender} = setup({...base, onAdvance});

		act(() => jest.advanceTimersByTime(4000));
		rerender({...base, itemId: 'b', settled: false, onAdvance});
		act(() => jest.advanceTimersByTime(4000));
		rerender({...base, itemId: 'b', settled: true, onAdvance});
		act(() => jest.advanceTimersByTime(FADE_MS + 4999));

		expect(onAdvance).not.toHaveBeenCalled();
		act(() => jest.advanceTimersByTime(1));
		expect(onAdvance).toHaveBeenCalledTimes(1);
	});

	test('cancels the pending timer when the slideshow stops', () => {
		const onAdvance = jest.fn();
		const {rerender} = setup({...base, onAdvance});

		act(() => jest.advanceTimersByTime(3000));
		rerender({...base, active: false, onAdvance});
		act(() => jest.advanceTimersByTime(60000));

		expect(onAdvance).not.toHaveBeenCalled();
	});

	test('cancels the pending timer when the viewer unmounts', () => {
		const onAdvance = jest.fn();
		const {unmount} = setup({...base, onAdvance});

		unmount();
		act(() => jest.advanceTimersByTime(60000));

		expect(onAdvance).not.toHaveBeenCalled();
	});

	test('a failed photo skips the fade and goes on after the interval', () => {
		const onAdvance = jest.fn();
		setup({...base, fadeMs: 0, onAdvance});

		act(() => jest.advanceTimersByTime(4999));
		expect(onAdvance).not.toHaveBeenCalled();
		act(() => jest.advanceTimersByTime(1));
		expect(onAdvance).toHaveBeenCalledTimes(1);
	});

	test('calls the latest advance handler', () => {
		const first = jest.fn();
		const second = jest.fn();
		const {rerender} = setup({...base, onAdvance: first});

		rerender({...base, onAdvance: second});
		act(() => jest.advanceTimersByTime(FADE_MS + 5000));

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});
});

describe('stepIndex', () => {
	const list = [photo('a'), video('b'), photo('c')];

	test('wraps in both directions', () => {
		expect(stepIndex(list, 2, 1)).toBe(0);
		expect(stepIndex(list, 0, -1)).toBe(2);
	});

	test('a manual step lands on a video', () => {
		expect(stepIndex(list, 0, 1, {skipVideos: false})).toBe(1);
	});

	test('skips videos when they are off', () => {
		expect(stepIndex(list, 0, 1, {skipVideos: true})).toBe(2);
		expect(stepIndex(list, 2, -1, {skipVideos: true})).toBe(0);
	});

	test('a single photo among videos comes back to itself', () => {
		expect(stepIndex([video('a'), photo('b'), video('c')], 1, 1, {skipVideos: true})).toBe(1);
	});

	test('an empty list has nowhere to go', () => {
		expect(stepIndex([], 0, 1)).toBe(-1);
	});
});

describe('slideshow eligibility', () => {
	test('videos only play when they are on', () => {
		expect(isSlideshowVideo(video('a'), true)).toBe(true);
		expect(isSlideshowVideo(video('a'), false)).toBe(false);
		expect(isSlideshowVideo(photo('a'), true)).toBe(false);
		expect(isSlideshowVideo(undefined, true)).toBe(false);
	});

	test('starts only from a photo with somewhere to go', () => {
		expect(canStartSlideshow([photo('a'), photo('b')], 0, true)).toBe(true);
		expect(canStartSlideshow([photo('a')], 0, true)).toBe(false);
		expect(canStartSlideshow([photo('a'), video('b')], 0, true)).toBe(true);
		expect(canStartSlideshow([photo('a'), video('b')], 0, false)).toBe(false);
		expect(canStartSlideshow([photo('a'), video('b')], 1, true)).toBe(false);
	});

	test('the viewer steps through photos and videos, or just the opened item', () => {
		const other = {Id: 'x', Type: 'Folder'};
		expect(viewerItems([photo('a'), other, video('b')], photo('a'))).toEqual([photo('a'), video('b')]);
		expect(viewerItems([], photo('a'))).toEqual([photo('a')]);
		expect(viewerItems(null, null)).toEqual([]);
	});
});
