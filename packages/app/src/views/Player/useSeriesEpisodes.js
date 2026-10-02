import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import * as jellyfinApi from '../../services/jellyfinApi';
import {withoutBlockedItems} from '../../services/parentalControls';
import {browsableEpisodes, initialSeasonId, seasonIdOf, tagWithServerOf} from '../../utils/episodeBrowser';

// What the browser last showed for each series, so opening it again draws at once from this and
// refreshes behind it. Watched marks change while you watch, so nothing here is trusted for long:
// every open asks the server again and replaces what it held.
const cache = new Map();

export const clearSeriesEpisodesCache = () => cache.clear();

const cacheKey = (serverUrl, seriesId) => `${serverUrl || ''}|${seriesId}`;

/**
 * The seasons of the series that is playing, and the episodes of whichever one is selected.
 *
 * It asks the same two questions the details screen does, getSeasons for the tabs and getEpisodes
 * for a season, of the server the playing episode came from, and filters and tags what comes back
 * the same way. The playing episode already names its season, so that season's episodes are
 * requested at the same moment as the season list rather than after it. A season is fetched the
 * first time it is chosen, and everything is kept in memory between opens.
 */
const useSeriesEpisodes = ({item, enabled}) => {
	const seriesId = item?.SeriesId;
	// The playing item is read from a ref, so a fresh copy of it (its watched state refreshing,
	// say) doesn't send the browser back to the first season.
	const itemRef = useRef(item);
	itemRef.current = item;
	const itemId = item?.Id;
	const {_serverUrl: serverUrl, _serverAccessToken: token, _serverUserId: userId, _serverType: serverType} = item || {};
	const key = cacheKey(serverUrl, seriesId);

	const api = useMemo(() => {
		if (serverUrl && token && userId) {
			return jellyfinApi.createApiForServer(serverUrl, token, userId, serverType || 'jellyfin');
		}
		return jellyfinApi.api;
	}, [serverUrl, token, userId, serverType]);

	// Drawn from memory when the series was opened before, so there is no wait to see it.
	const [seasons, setSeasons] = useState(() => cache.get(key)?.seasons ?? null);
	const [selectedSeasonId, setSelectedSeasonId] = useState(() => {
		const held = cache.get(key);
		return held?.seasons ? initialSeasonId(held.seasons, item) : seasonIdOf(item);
	});
	const [bySeason, setBySeason] = useState(() => cache.get(key)?.bySeason ?? {});
	const [seasonsFailed, setSeasonsFailed] = useState(false);
	// Seasons already asked for since the browser opened, so each is fetched once, and one that
	// was held from before is still refreshed the first time it is shown.
	const askedRef = useRef(new Set());

	const remember = useCallback((patch) => {
		const held = cache.get(key) || {seasons: null, bySeason: {}};
		cache.set(key, {...held, ...patch, bySeason: {...held.bySeason, ...(patch.bySeason || {})}});
	}, [key]);

	const loadSeason = useCallback((seasonId) => {
		if (!seriesId || seasonId == null || askedRef.current.has(String(seasonId))) return undefined;
		askedRef.current.add(String(seasonId));
		const playing = itemRef.current;
		return api.getEpisodes(seriesId, seasonId)
			.then((data) => {
				const list = tagWithServerOf(playing, withoutBlockedItems(data?.Items || [], playing?.OfficialRating));
				const entry = {items: browsableEpisodes(list)};
				remember({bySeason: {[seasonId]: entry}});
				setBySeason((prev) => ({...prev, [seasonId]: entry}));
			})
			.catch(() => {
				// A season that was already showing keeps what it has, and one that never loaded says so.
				setBySeason((prev) => (prev[seasonId]?.items ? prev : {...prev, [seasonId]: {failed: true}}));
			});
	}, [api, seriesId, remember]);

	useEffect(() => {
		if (!enabled || !seriesId) return undefined;
		let live = true;
		askedRef.current = new Set();
		setSeasonsFailed(false);
		const playing = itemRef.current;

		// The two requests go out together: the season list for the tabs, and the episodes of the
		// season that is playing, which is the list that is about to be looked at.
		loadSeason(seasonIdOf(playing));
		api.getSeasons(seriesId)
			.then((data) => {
				if (!live) return;
				const list = tagWithServerOf(playing, withoutBlockedItems(data?.Items || [], playing?.OfficialRating));
				remember({seasons: list});
				setSeasons(list);
				// The playing season is already selected, unless the server no longer lists it.
				setSelectedSeasonId((selected) => {
					const known = list.some((season) => String(season.Id) === String(selected));
					return known ? selected : initialSeasonId(list, playing);
				});
			})
			.catch(() => {
				if (live) setSeasonsFailed(true);
			});
		return () => {
			live = false;
		};
	}, [enabled, seriesId, itemId, api, loadSeason, remember]);

	useEffect(() => {
		if (enabled) loadSeason(selectedSeasonId);
	}, [enabled, selectedSeasonId, loadSeason]);

	const current = selectedSeasonId != null ? bySeason[selectedSeasonId] : undefined;

	return {
		seasons,
		selectedSeasonId,
		selectSeason: setSelectedSeasonId,
		// Null while the selected season is still on its way.
		episodes: current?.items ?? null,
		failed: seasonsFailed || Boolean(current?.failed)
	};
};

export default useSeriesEpisodes;
