import {act, renderHook} from '@testing-library/react';

import seerrApi from '../../services/seerrApi';
import useRequestArrQueues from './useRequestArrQueues';

jest.mock('../../services/seerrApi', () => ({__esModule: true, default: {getArrQueue: jest.fn()}}));

const movie = (tmdbId, status = 2) => ({id: tmdbId, type: 'movie', status, is4k: false, media: {status: 3, tmdbId}});
const asked = () => seerrApi.getArrQueue.mock.calls.map(([service, id]) => `${service}:${id}`).sort();

const flush = () => act(async () => {
	await Promise.resolve();
	await Promise.resolve();
});

beforeEach(() => {
	jest.clearAllMocks();
	seerrApi.getArrQueue.mockImplementation(async (service, id) => ({service, inArr: true, items: [], id}));
});

test('a load asks about every approved HD title on its way, once each', async () => {
	const requests = [movie(1), movie(1), movie(2), movie(3, 1), {...movie(4), is4k: true}];
	const {result} = renderHook(() => useRequestArrQueues({enabled: true, requests, loadToken: 1}));
	await flush();
	expect(asked()).toEqual(['radarr:1', 'radarr:2']);
	expect(Object.keys(result.current.answers).sort()).toEqual(['radarr:1', 'radarr:2']);
});

test('load more asks only about the new titles, and a new load asks about all of them again', async () => {
	const {rerender} = renderHook((props) => useRequestArrQueues({enabled: true, ...props}), {
		initialProps: {requests: [movie(1)], loadToken: 1}
	});
	await flush();
	rerender({requests: [movie(1), movie(2)], loadToken: 1});
	await flush();
	expect(asked()).toEqual(['radarr:1', 'radarr:2']);
	rerender({requests: [movie(1), movie(2)], loadToken: 2});
	await flush();
	expect(asked()).toEqual(['radarr:1', 'radarr:1', 'radarr:2', 'radarr:2']);
});

test('the poll asks only about the titles it names that are still on the screen', async () => {
	const {result} = renderHook(() => useRequestArrQueues({enabled: true, requests: [movie(1), movie(2)], loadToken: 1}));
	await flush();
	seerrApi.getArrQueue.mockClear();
	await act(async () => {
		await result.current.refresh(['radarr:2', 'radarr:9']);
	});
	expect(asked()).toEqual(['radarr:2']);
});

test('an unchanged answer keeps its identity, and a slow one never drops another', async () => {
	const {result} = renderHook(() => useRequestArrQueues({enabled: true, requests: [movie(1), movie(2)], loadToken: 1}));
	await flush();
	const first = result.current.answers['radarr:1'];
	await act(async () => {
		await result.current.refresh(['radarr:2']);
	});
	expect(result.current.answers['radarr:1']).toBe(first);
	expect(result.current.answers['radarr:2']).toBeDefined();
});

test('asks nothing when the plugin does not offer it', async () => {
	renderHook(() => useRequestArrQueues({enabled: false, requests: [movie(1)], loadToken: 1}));
	await flush();
	expect(seerrApi.getArrQueue).not.toHaveBeenCalled();
});

test('an older answer for a title never replaces a newer one', async () => {
	const calls = [];
	seerrApi.getArrQueue.mockImplementation(() => new Promise((resolve) => calls.push(resolve)));
	const {result} = renderHook(() => useRequestArrQueues({enabled: true, requests: [movie(1)], loadToken: 1}));
	act(() => {
		result.current.refresh(['radarr:1']);
	});
	expect(calls).toHaveLength(2);
	await act(async () => {
		calls[1]({service: 'radarr', inArr: true, items: [{id: 5}]});
	});
	await act(async () => {
		calls[0]({service: 'radarr', inArr: true, items: []});
	});
	expect(result.current.answers['radarr:1'].items).toEqual([{id: 5}]);
});

test('answers stop counting once the plugin no longer offers the queue, including ones still on their way', async () => {
	let finish;
	const {result, rerender} = renderHook((props) => useRequestArrQueues({requests: [movie(1), movie(2)], loadToken: 1, ...props}), {
		initialProps: {enabled: true}
	});
	await flush();
	expect(Object.keys(result.current.answers)).toHaveLength(2);
	seerrApi.getArrQueue.mockImplementation(() => new Promise((resolve) => {
		finish = resolve;
	}));
	act(() => {
		result.current.refresh(['radarr:1']);
	});
	rerender({enabled: false});
	expect(result.current.answers).toEqual({});
	await act(async () => {
		finish({service: 'radarr', inArr: true, items: []});
	});
	expect(result.current.answers).toEqual({});
});
