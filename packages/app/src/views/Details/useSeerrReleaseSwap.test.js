import {act, renderHook} from '@testing-library/react';

import seerrApi from '../../services/seerrApi';
import useSeerrReleaseSwap from './useSeerrReleaseSwap';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {
		removeArrQueueItem: jest.fn(),
		getMovie: jest.fn(),
		getTv: jest.fn()
	}
}));

const stuck = {service: 'radarr', id: 9, release: 'Big.Buck.Bunny.$1-GRP'};

const setup = (props = {}) => {
	const calls = {setDetails: jest.fn(), setError: jest.fn(), setNotice: jest.fn()};
	const view = renderHook((p) => useSeerrReleaseSwap({...calls, mediaId: 10378, mediaType: 'movie', release: stuck, ...p}), {initialProps: props});
	return {...view, ...calls};
};

beforeEach(() => {
	seerrApi.removeArrQueueItem.mockResolvedValue(true);
	seerrApi.getMovie.mockResolvedValue({id: 10378});
});

test('confirming removes the release the dialog named, says so and reloads the title', async () => {
	const {result, setDetails, setNotice} = setup();
	act(() => result.current.handleSwapReleaseClick());
	expect(result.current.showSwapPopup).toBe(true);
	expect(result.current.swapRelease).toBe(stuck);

	await act(() => result.current.handleSwapConfirm());
	expect(seerrApi.removeArrQueueItem).toHaveBeenCalledWith('radarr', 9);
	expect(setNotice).toHaveBeenCalledWith('Removed. Radarr is searching for another release.');
	expect(setDetails).toHaveBeenCalledWith({id: 10378});
	expect(result.current.showSwapPopup).toBe(false);
});

test('a failed removal says so and reloads nothing', async () => {
	seerrApi.removeArrQueueItem.mockRejectedValue(Object.assign(new Error('Admin only'), {status: 403}));
	const {result, setError, setNotice, setDetails} = setup();
	act(() => result.current.handleSwapReleaseClick());
	await act(() => result.current.handleSwapConfirm());
	expect(setError).toHaveBeenCalledWith("Couldn't remove the download");
	expect(setNotice).not.toHaveBeenCalled();
	expect(setDetails).not.toHaveBeenCalled();
	expect(result.current.showsSwapRelease).toBe(true);
});

test('the dialog closes when the download stops being stuck, and stays closed when another stalls', () => {
	const {result, rerender} = setup();
	act(() => result.current.handleSwapReleaseClick());
	rerender({release: null});
	expect(result.current.showSwapPopup).toBe(false);
	expect(result.current.showsSwapRelease).toBe(false);
	rerender({release: {...stuck, id: 10}});
	expect(result.current.showSwapPopup).toBe(false);
	expect(result.current.showsSwapRelease).toBe(true);
});

test('the button hides while a removal is on its way', async () => {
	let finish;
	seerrApi.removeArrQueueItem.mockReturnValue(new Promise((resolve) => {
		finish = resolve;
	}));
	const {result} = setup();
	act(() => result.current.handleSwapReleaseClick());
	let done;
	act(() => {
		done = result.current.handleSwapConfirm();
	});
	expect(result.current.showsSwapRelease).toBe(false);
	await act(async () => {
		finish(true);
		await done;
	});
	expect(result.current.showsSwapRelease).toBe(true);
});

test('a reload that lands after the viewer moved to another title is dropped', async () => {
	let finish;
	seerrApi.removeArrQueueItem.mockReturnValue(new Promise((resolve) => {
		finish = resolve;
	}));
	const {result, rerender, setDetails} = setup();
	act(() => result.current.handleSwapReleaseClick());
	let done;
	act(() => {
		done = result.current.handleSwapConfirm();
	});
	rerender({mediaId: 45745, release: null});
	await act(async () => {
		finish(true);
		await done;
	});
	expect(setDetails).not.toHaveBeenCalled();
});
