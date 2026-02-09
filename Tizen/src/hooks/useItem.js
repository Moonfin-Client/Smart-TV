import {useState, useEffect, useCallback} from 'react';
import {useAuth} from '../context/AuthContext';

export function useItem(itemId) {
	const {api} = useAuth();
	const [item, setItem] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const load = useCallback(async () => {
		if (!itemId) return;

		setIsLoading(true);
		setError(null);

		try {
			const data = await api.getItem(itemId);
			setItem(data);
		} catch (err) {
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	}, [api, itemId]);

	useEffect(() => {
		load();
	}, [load]);

	return {item, isLoading, error, refresh: load};
}

export function useSeasons(seriesId) {
	const {api} = useAuth();
	const [seasons, setSeasons] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!seriesId) return;

		api.getSeasons(seriesId).then((result) => {
			setSeasons(result.Items || []);
			setIsLoading(false);
		}).catch(() => {
			setIsLoading(false);
		});
	}, [api, seriesId]);

	return {seasons, isLoading};
}

export function useEpisodes(seriesId, seasonId) {
	const {api} = useAuth();
	const [episodes, setEpisodes] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!seriesId || !seasonId) return;

		api.getEpisodes(seriesId, seasonId).then((result) => {
			setEpisodes(result.Items || []);
			setIsLoading(false);
		}).catch(() => {
			setIsLoading(false);
		});
	}, [api, seriesId, seasonId]);

	return {episodes, isLoading};
}

export function useSimilar(itemId) {
	const {api} = useAuth();
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!itemId) return;

		api.getSimilar(itemId).then((result) => {
			setItems(result.Items || []);
			setIsLoading(false);
		}).catch(() => {
			setIsLoading(false);
		});
	}, [api, itemId]);

	return {items, isLoading};
}

export default useItem;
