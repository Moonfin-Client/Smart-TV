import {act, renderHook} from '@testing-library/react';

import {DEFAULT_SORT, SORT_ALPHABETICAL, SORT_CUSTOM} from './nouveau/nouveauCollectionSort';
import useCollectionSort from './useCollectionSort';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

describe('useCollectionSort', () => {
	it('shows the server order for anything that isn\'t a collection', () => {
		const {result} = renderHook(() => useCollectionSort(null));
		expect(result.current.sortOption).toBe(DEFAULT_SORT);
	});

	it('opens and closes the picker', () => {
		const {result} = renderHook(() => useCollectionSort(null));
		expect(result.current.sortOpen).toBe(false);
		act(() => result.current.openSort());
		expect(result.current.sortOpen).toBe(true);
		act(() => result.current.closeSort());
		expect(result.current.sortOpen).toBe(false);
	});

	it('hands a choice to the playlist and closes the picker', () => {
		const choose = jest.fn();
		const {result} = renderHook(() => useCollectionSort({sortOption: DEFAULT_SORT, choose}));
		act(() => result.current.openSort());
		act(() => result.current.chooseSort(SORT_ALPHABETICAL));
		expect(choose).toHaveBeenCalledWith(SORT_ALPHABETICAL);
		expect(result.current.sortOpen).toBe(false);
	});

	it('shows the collection\'s own order and offers every option', () => {
		const {result} = renderHook(() => useCollectionSort({sortOption: SORT_CUSTOM}));
		expect(result.current.sortOption).toBe(SORT_CUSTOM);
		expect(result.current.sortOptions.map((o) => o.id)).toContain(SORT_CUSTOM);
	});
});
