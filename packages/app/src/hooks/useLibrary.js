import {useState, useEffect, useCallback} from 'react';
import {useAuth} from '../context/AuthContext';

export function useLibrary(libraryId) {
	const {api} = useAuth();
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [page, setPage] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const pageSize = 50;

	const loadItems = useCallback(async (pageNum = 0, append = false) => {
		if (!libraryId) return;

		setIsLoading(true);
		setError(null);

		try {
			const result = await api.getItems({
				ParentId: libraryId,
				StartIndex: pageNum * pageSize,
				Limit: pageSize,
				SortBy: 'SortName',
				SortOrder: 'Ascending',
				Recursive: true,
				IncludeItemTypes: 'Movie,Series',
				Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,Status'
			});

			const newItems = result.Items || [];
			setItems(append ? prev => [...prev, ...newItems] : newItems);
			setHasMore(newItems.length === pageSize);
			setPage(pageNum);
		} catch (err) {
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	}, [api, libraryId]);

	useEffect(() => {
		loadItems(0, false);
	}, [loadItems]);

	const loadMore = useCallback(() => {
		if (!isLoading && hasMore) {
			loadItems(page + 1, true);
		}
	}, [isLoading, hasMore, page, loadItems]);

	const refresh = useCallback(() => {
		loadItems(0, false);
	}, [loadItems]);

	return {items, isLoading, error, hasMore, loadMore, refresh};
}

export default useLibrary;
