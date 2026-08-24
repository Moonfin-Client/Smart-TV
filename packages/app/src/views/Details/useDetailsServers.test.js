jest.mock('../../services/connectionPool', () => ({getItemCopiesFromAllServers: jest.fn()}));

import {renderHook, waitFor} from '@testing-library/react';

import * as connectionPool from '../../services/connectionPool';
import useDetailsServers from './useDetailsServers';

const movie = (over = {}) => ({Id: 'a', Name: 'Dune', Type: 'Movie', ProviderIds: {Imdb: 'tt1160419'}, ...over});
const twoServers = [{id: 's1', name: 'Attic'}, {id: 's2', name: 'Shed'}];

describe('useDetailsServers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		connectionPool.getItemCopiesFromAllServers.mockResolvedValue(twoServers);
	});

	test('the servers holding the title are handed back', async () => {
		const {result} = renderHook(() => useDetailsServers(movie(), true));

		await waitFor(() => expect(result.current).toEqual(twoServers));
	});

	test('a Seerr title has no library copies to look for', async () => {
		renderHook(() => useDetailsServers(movie(), false));

		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).not.toHaveBeenCalled());
	});

	test('a type reached through its own screen is not looked up', async () => {
		renderHook(() => useDetailsServers(movie({Type: 'Season'}), true));

		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).not.toHaveBeenCalled());
	});

	test('marking the title watched does not send it round the servers again', async () => {
		const {rerender} = renderHook(({item}) => useDetailsServers(item, true), {
			initialProps: {item: movie()}
		});
		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).toHaveBeenCalledTimes(1));

		rerender({item: movie({UserData: {Played: true}})});

		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).toHaveBeenCalledTimes(1));
	});

	test('opening a different title does look it up again', async () => {
		const {rerender} = renderHook(({item}) => useDetailsServers(item, true), {
			initialProps: {item: movie()}
		});
		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).toHaveBeenCalledTimes(1));

		rerender({item: movie({Id: 'b', Name: 'Arrival', ProviderIds: {Imdb: 'tt2543164'}})});

		await waitFor(() => expect(connectionPool.getItemCopiesFromAllServers).toHaveBeenCalledTimes(2));
	});
});
