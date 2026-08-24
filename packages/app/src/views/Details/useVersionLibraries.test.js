import {renderHook, waitFor} from '@testing-library/react';

import useVersionLibraries from './useVersionLibraries';

const collectionFolder = (Name) => [
	{Id: 'lib', Name, Type: 'CollectionFolder'},
	{Id: 'root', Name: 'Media Folders', Type: 'UserRootFolder'}
];

const itemWith = (...ids) => ({Id: ids[0], MediaSources: ids.map((Id) => ({Id}))});

describe('useVersionLibraries', () => {
	test('a single version has nothing to tell apart, so no lookup is made', async () => {
		const getAncestors = jest.fn();
		const {result} = renderHook(() => useVersionLibraries(itemWith('a'), {getAncestors}));

		await waitFor(() => expect(result.current).toEqual({}));
		expect(getAncestors).not.toHaveBeenCalled();
	});

	test('versions in different libraries are each named', async () => {
		const getAncestors = jest.fn((id) => Promise.resolve(collectionFolder(id === 'a' ? 'Movies' : '4K Movies')));
		const {result} = renderHook(() => useVersionLibraries(itemWith('a', 'b'), {getAncestors}));

		await waitFor(() => expect(result.current).toEqual({a: 'Movies', b: '4K Movies'}));
		expect(getAncestors).toHaveBeenCalledTimes(2);
	});

	test('versions sharing one library are left unnamed, since the library says nothing', async () => {
		const getAncestors = jest.fn(() => Promise.resolve(collectionFolder('Movies')));
		const {result} = renderHook(() => useVersionLibraries(itemWith('a', 'b'), {getAncestors}));

		await waitFor(() => expect(getAncestors).toHaveBeenCalledTimes(2));
		expect(result.current).toEqual({});
	});

	test('a lookup that fails leaves that version unnamed rather than the rest', async () => {
		const libraries = {a: 'Movies', b: '4K Movies'};
		const getAncestors = jest.fn((id) => (libraries[id]
			? Promise.resolve(collectionFolder(libraries[id]))
			: Promise.reject(new Error('gone'))));
		const {result} = renderHook(() => useVersionLibraries(itemWith('a', 'b', 'c'), {getAncestors}));

		await waitFor(() => expect(result.current).toEqual(libraries));
		expect(getAncestors).toHaveBeenCalledTimes(3);
	});

	test('an item with no versions at all is handled without throwing', async () => {
		const {result} = renderHook(() => useVersionLibraries(null, {getAncestors: jest.fn()}));

		await waitFor(() => expect(result.current).toEqual({}));
	});
});
