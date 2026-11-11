import {act, renderHook} from '@testing-library/react';

import seerrApi from '../../services/seerrApi';
import useArrQueue from './useArrQueue';

jest.mock('../../services/seerrApi', () => ({__esModule: true, default: {getArrQueue: jest.fn()}}));

const details = (extra = {}) => ({id: 10378, mediaInfo: {status: 3, tmdbId: 10378}, ...extra});

// Each call hands back a promise the test settles when it wants, in any order.
const pending = () => {
	const calls = [];
	seerrApi.getArrQueue.mockImplementation(() => new Promise((resolve) => calls.push(resolve)));
	return calls;
};

beforeEach(() => {
	jest.clearAllMocks();
});

test('an older answer for the same title never replaces a newer one', async () => {
	const calls = pending();
	const {result, rerender} = renderHook((props) => useArrQueue({enabled: true, mediaType: 'movie', ...props}), {
		initialProps: {details: details()}
	});
	rerender({details: details()});
	expect(calls).toHaveLength(2);
	await act(async () => {
		calls[1]({items: ['newer']});
	});
	await act(async () => {
		calls[0]({items: ['older']});
	});
	expect(result.current.response).toEqual({items: ['newer']});
});

test('a slow answer still shows when nothing newer has come back', async () => {
	const calls = pending();
	const {result, rerender} = renderHook((props) => useArrQueue({enabled: true, mediaType: 'movie', ...props}), {
		initialProps: {details: details()}
	});
	rerender({details: details()});
	await act(async () => {
		calls[0]({items: ['first']});
	});
	expect(result.current.response).toEqual({items: ['first']});
});

test('a removal drops the answer on screen and asks the queue again', async () => {
	const calls = pending();
	const shown = details();
	const {result} = renderHook(() => useArrQueue({enabled: true, mediaType: 'movie', details: shown}));
	await act(async () => {
		calls[0]({items: ['stuck']});
	});
	expect(result.current.response).toEqual({items: ['stuck']});
	act(() => result.current.invalidate());
	expect(result.current.response).toBeNull();
	expect(calls).toHaveLength(2);
	await act(async () => {
		calls[1]({items: []});
	});
	expect(result.current.response).toEqual({items: []});
});

test('an answer that set off before a removal is thrown away', async () => {
	const calls = pending();
	const {result} = renderHook(() => useArrQueue({enabled: true, mediaType: 'movie', details: details()}));
	act(() => result.current.invalidate());
	await act(async () => {
		calls[0]({items: ['stuck']});
	});
	expect(result.current.response).toBeNull();
});

test('a series without a TVDB id on its media info uses the one in its external ids', async () => {
	seerrApi.getArrQueue.mockResolvedValue(null);
	renderHook(() => useArrQueue({
		enabled: true,
		mediaType: 'tv',
		details: {id: 1, mediaInfo: {status: 3, tmdbId: 1}, externalIds: {tvdbId: 280619}}
	}));
	expect(seerrApi.getArrQueue).toHaveBeenCalledWith('sonarr', '280619');
});
