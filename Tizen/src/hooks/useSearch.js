import {useState, useCallback} from 'react';
import {useAuth} from '../context/AuthContext';

export function useSearch() {
	const {api} = useAuth();
	const [results, setResults] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [query, setQuery] = useState('');

	const search = useCallback(async (searchQuery, limit = 24) => {
		if (!searchQuery || searchQuery.length < 2) {
			setResults([]);
			return;
		}

		setIsLoading(true);
		setError(null);
		setQuery(searchQuery);

		try {
			const result = await api.search(searchQuery, limit);
			setResults(result.Items || []);
		} catch (err) {
			setError(err.message);
			setResults([]);
		} finally {
			setIsLoading(false);
		}
	}, [api]);

	const clear = useCallback(() => {
		setResults([]);
		setQuery('');
		setError(null);
	}, []);

	return {results, isLoading, error, query, search, clear};
}

export default useSearch;
