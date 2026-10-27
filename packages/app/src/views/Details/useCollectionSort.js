import {useCallback, useMemo, useState} from 'react';

import {DEFAULT_SORT, collectionSortOptions} from './nouveau/nouveauCollectionSort';

// The picker for a collection's playable run. The order itself is kept with the playlist it puts
// in order, so this only holds whether the picker is open.
const useCollectionSort = (collectionOrder) => {
	const [sortOpen, setSortOpen] = useState(false);
	const sortOption = collectionOrder?.sortOption || DEFAULT_SORT;
	const choose = collectionOrder?.choose;
	const sortOptions = useMemo(() => collectionSortOptions(), []);

	const openSort = useCallback(() => setSortOpen(true), []);
	const closeSort = useCallback(() => setSortOpen(false), []);
	const chooseSort = useCallback((id) => {
		choose?.(id);
		setSortOpen(false);
	}, [choose]);

	return {sortOption, sortOptions, sortOpen, openSort, closeSort, chooseSort};
};

export default useCollectionSort;
