import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';

import * as playback from '../../services/playback';
import {fetchTmdbSeasonRatings, resolveSeriesTmdbId, isRatingSourceAllowed} from '../../services/mdblistApi';
import {getItemSubtitlePref, getSeriesSubtitlePref, getSeriesAudioPref} from '../../services/subtitlePrefs';
import {fromServerStream, matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';
import {resolveBestSubtitle} from '../Player/initialSubtitle';
import {findParentCollections} from './parentCollection';
import {canScoreSeedLocally, getOnlineRecommendations, getRecommendations, mergeRecommendations} from '../../services/homeRecommendations';
import {fetchMissingCollectionItems} from './seerrMissingCollectionItems';
import {buildCollectionIndex, fetchCollectionPage} from './collectionPlaylist';
import {isBlocked as isContentBlocked, isBlockedNow, observeItem} from '../../services/blockedContentGate';
import {getActiveParentalFilter, withoutBlockedItems} from '../../services/parentalControls';
import * as userDataSync from '../../services/userDataSync';
import {useUserDataVersion} from '../../hooks/useUserDataSync';

// Everything the screen shows about one item. The item itself is fetched first and rendered
// on its own, then the rows that hang off it fill in behind, because waiting for all of them
// would leave the screen blank for as long as the slowest one takes.
// The row that opened this screen already carries the title, the artwork and the summary,
// which is most of what the first look at it is. Drawing on that lets the screen go up at
// once and the full record fill the rest in behind, rather than leaving it blank for as
// long as the request takes.
const seedFrom = (candidate, id) => (candidate && candidate.Id === id ? candidate : null);

// An unrated episode is judged by its series, which may need a lookup, so while any rating is
// blocked its row copy waits for the check rather than flashing a title that's about to go.
const seedIsDecided = (seed) => !getActiveParentalFilter().isActive || !seed.SeriesId ||
	Boolean(seed.OfficialRating && String(seed.OfficialRating).trim());

const seedToShow = (candidate, id) => {
	const seed = seedFrom(candidate, id);
	return seed && !isBlockedNow(seed) && seedIsDecided(seed) ? seed : null;
};

// The More Like This row draws everything it is given, so this is how many cards
// it ends up with.
const SIMILAR_LIMIT = 20;

const useDetailsItem = ({itemId, initialItem, effectiveApi, effectiveServerUrl, settings, recommendationsSupported, seerrEnabled, tagWithServerInfo, skip}) => {
	const seedRef = useRef(initialItem);
	seedRef.current = initialItem;
	// Read where they are used rather than depended on, so a change to either one
	// does not refetch the whole screen.
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const scoringRef = useRef(recommendationsSupported);
	scoringRef.current = recommendationsSupported;
	// A server with no Seerr behind it is never asked for missing titles, since that
	// costs failed round trips on every collection opened and can answer nothing.
	const seerrEnabledRef = useRef(seerrEnabled);

	// Where the collection playlist has got to. Held in refs rather than state because paging
	// reads them mid flight and a render in between would hand back a stale position.
	const collectionIndexRef = useRef([]);
	const collectionFetchedRef = useRef(0);
	const collectionHasMoreRef = useRef(false);
	const collectionLoadingRef = useRef(false);
	seerrEnabledRef.current = seerrEnabled;

	const [item, setItem] = useState(() => seedToShow(initialItem, itemId));
	// Whether what is on screen is still the row it was opened from rather than the record
	// the server holds, which is what the buttons are properly built from.
	const [isSeed, setIsSeed] = useState(() => Boolean(seedToShow(initialItem, itemId)));
	const [isBlocked, setIsBlocked] = useState(false);
	const [seasons, setSeasons] = useState([]);
	const [episodes, setEpisodes] = useState([]);
	const [seriesEpisodes, setSeriesEpisodes] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [similarLoaded, setSimilarLoaded] = useState(false);
	// Whether the lists Play picks from have come in, which is what an automatic start waits on.
	const [playListsLoaded, setPlayListsLoaded] = useState(false);
	const [extras, setExtras] = useState([]);
	const [cast, setCast] = useState([]);
	const [nextUp, setNextUp] = useState([]);
	const [nextEpisode, setNextEpisode] = useState(null);
	const [collectionItems, setCollectionItems] = useState([]);
	const [missingCollectionItems, setMissingCollectionItems] = useState([]);
	const [parentCollections, setParentCollections] = useState([]);
	const [similarSource, setSimilarSource] = useState('jellyfin');
	const [albumTracks, setAlbumTracks] = useState([]);
	const [artistAlbums, setArtistAlbums] = useState([]);
	const [playlistItems, setPlaylistItems] = useState([]);
	const [isLoading, setIsLoading] = useState(() => !seedToShow(initialItem, itemId));
	const [episodeRatings, setEpisodeRatings] = useState({});

	const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);

	const loadMoreCollectionItems = useCallback(async () => {
		if (collectionLoadingRef.current || !collectionHasMoreRef.current) return;
		collectionLoadingRef.current = true;
		try {
			const page = await fetchCollectionPage(effectiveApi, collectionIndexRef.current, collectionFetchedRef.current);
			collectionFetchedRef.current = page.fetchedCount;
			collectionHasMoreRef.current = page.hasMore;
			const visible = withoutBlockedItems(page.items);
			if (visible.length) setPlaylistItems((prev) => [...prev, ...tagWithServerInfo(visible)]);
		} catch {
			collectionHasMoreRef.current = false;
		}
		collectionLoadingRef.current = false;
	}, [effectiveApi, tagWithServerInfo]);

	useEffect(() => {
		// Whatever the last item brought with it has to go before anything else, or its rows
		// stay on screen under the next title.
		setSeasons([]);
		setEpisodes([]);
		setSeriesEpisodes([]);
		setEpisodeRatings({});
		setSimilar([]);
		setSimilarLoaded(false);
		setPlayListsLoaded(false);
		setExtras([]);
		setCast([]);
		setNextUp([]);
		setCollectionItems([]);
		setMissingCollectionItems([]);
		collectionIndexRef.current = [];
		collectionFetchedRef.current = 0;
		collectionHasMoreRef.current = false;
		setParentCollections([]);
		setSimilarSource('jellyfin');
		setAlbumTracks([]);
		setArtistAlbums([]);
		setPlaylistItems([]);
		setIsBlocked(false);

		// A Seerr title has no id the server would recognise, so asking for one would only 404
		// and leave the screen spinning.
		if (skip) {
			setIsLoading(false);
			return;
		}

		// The Seerr pass is the one thing here that settles after the load has moved
		// on, so its answer is dropped when the screen already shows something else.
		let cancelled = false;

		const refuse = () => {
			setItem(null);
			setIsSeed(false);
			setIsBlocked(true);
			setIsLoading(false);
		};

		const loadItem = async () => {
			const rowCopy = seedFrom(seedRef.current, itemId);
			if (rowCopy && isBlockedNow(rowCopy)) {
				refuse();
				return;
			}
			const seed = rowCopy && seedIsDecided(rowCopy) ? rowCopy : null;
			if (seed) {
				setItem(tagWithServerInfo(seed));
				setIsSeed(true);
				setIsLoading(false);
			} else {
				setIsSeed(false);
				setIsLoading(true);
			}

			let data;
			try {
				data = await effectiveApi.getItemForDetail(itemId);
			} catch (err) {
				console.error('[Details] Error loading item', err);
				setIsSeed(false);
				setIsLoading(false);
				return;
			}

			// Checked before the record is published, so nothing downstream reads the title or goes
			// off fetching rows for a page that won't be shown.
			const blocked = await isContentBlocked(tagWithServerInfo(data));
			if (cancelled) return;
			if (blocked) {
				refuse();
				return;
			}
			observeItem(data);

			setItem(tagWithServerInfo(data));
			setIsSeed(false);
			setSelectedVersionIndex(0);
			const ms = data.MediaSources?.[0];
			if (ms) {
				const initAudioStreams = ms.MediaStreams?.filter(s => s.Type === 'Audio') || [];
				const initSubtitleStreams = ms.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
				// A track remembered for the series shows as active, and only when there
				// is none does the server's own default stand in.
				const seriesAudioPref = data.SeriesId ? await getSeriesAudioPref(data.SeriesId) : undefined;
				const matchedAudio = seriesAudioPref
					? matchSeriesTrackIndex(initAudioStreams.map(fromServerStream), seriesAudioPref)
					: null;
				const rememberedAudioPos = matchedAudio !== null && matchedAudio >= 0
					? initAudioStreams.findIndex(s => s.Index === matchedAudio)
					: -1;
				if (rememberedAudioPos >= 0) {
					setSelectedAudioIndex(rememberedAudioPos);
				} else if (ms.DefaultAudioStreamIndex != null) {
					const idx = initAudioStreams.findIndex(s => s.Index === ms.DefaultAudioStreamIndex);
					if (idx >= 0) setSelectedAudioIndex(idx);
				}
				// Show the remembered pick as active so it doesn't look like it needs
				// reselecting. The per-item index restores the exact track, and an episode
				// otherwise inherits its series' remembered language.
				let savedSubtitlePos = null;
				const savedItemIndex = await getItemSubtitlePref(itemId);
				if (savedItemIndex !== undefined) {
					if (savedItemIndex < 0) {
						savedSubtitlePos = -1;
					} else {
						const pos = initSubtitleStreams.findIndex(s => s.Index === savedItemIndex);
						if (pos >= 0) savedSubtitlePos = pos;
					}
				}
				if (savedSubtitlePos === null && data.SeriesId) {
					const seriesPref = await getSeriesSubtitlePref(data.SeriesId);
					const matched = seriesPref
						? matchSeriesTrackIndex(initSubtitleStreams.map(fromServerStream), seriesPref)
						: null;
					if (matched === -1) {
						savedSubtitlePos = -1;
					} else if (matched !== null) {
						const pos = initSubtitleStreams.findIndex(s => s.Index === matched);
						if (pos >= 0) savedSubtitlePos = pos;
					}
				}
				if (savedSubtitlePos !== null) {
					setSelectedSubtitleIndex(savedSubtitlePos);
				} else {
					setSelectedSubtitleIndex(resolveBestSubtitle(initSubtitleStreams, settingsRef.current, ms));
				}
			} else {
				setSelectedAudioIndex(0);
				setSelectedSubtitleIndex(-1);
			}
			// Kept whole, because the screens split this into cast and crew and
			// capping here would drop the crew off the end of a long list.
			if (data.People?.length > 0) {
				setCast(data.People);
			}

			setIsLoading(false);

			// What an unrated season or episode is judged by, so blocking a series takes its
			// episodes with it.
			const fallbackRating = data.OfficialRating;

			const bg = async () => {
				if (data.Type === 'Series') {
					// Nouveau and Minimalist show one season's episodes at a time behind a selector.
					// Asking for the whole run once and splitting it here beats a fetch per season,
					// since the viewer walks the selector and would otherwise wait at every step.
					const style = settingsRef.current?.detailScreenStyle;
					const wantsEpisodes = style === 'v4' || style === 'v5';
					const [seasonsData, nextUpData, episodesData] = await Promise.all([
						effectiveApi.getSeasons(itemId).catch(() => null),
						effectiveApi.getNextUp(1, itemId).catch(() => null),
						wantsEpisodes ? effectiveApi.getEpisodes(itemId).catch(() => null) : null
					]);
					if (seasonsData) setSeasons(tagWithServerInfo(withoutBlockedItems(seasonsData.Items || [], fallbackRating)));
					if (nextUpData?.Items?.length > 0) setNextUp(tagWithServerInfo(nextUpData.Items));
					if (episodesData) setSeriesEpisodes(tagWithServerInfo(withoutBlockedItems(episodesData.Items || [], fallbackRating)));
				}

				if (data.Type === 'Season') {
					const episodesData = await effectiveApi.getEpisodes(data.SeriesId, data.Id).catch(() => null);
					if (episodesData) setEpisodes(tagWithServerInfo(withoutBlockedItems(episodesData.Items || [], fallbackRating)));
				}

				if (data.Type === 'Episode') {
					const seasonId = data.SeasonId || data.ParentId;
					// Spotlight and Minimalist offer the whole run grouped by season, which this
					// episode's own season cant fill. No other style shows it, so no other style
					// pays for it.
					const episodeStyle = settingsRef.current?.detailScreenStyle;
					const wantsWholeSeries = Boolean(data.SeriesId) &&
						(episodeStyle === 'v3' || episodeStyle === 'v5');
					const [seasonData, seriesData] = await Promise.all([
						data.SeriesId && seasonId
							? effectiveApi.getEpisodes(data.SeriesId, seasonId).catch(() => null)
							: null,
						wantsWholeSeries ? effectiveApi.getEpisodes(data.SeriesId).catch(() => null) : null
					]);
					if (seasonData) setEpisodes(tagWithServerInfo(withoutBlockedItems(seasonData.Items || [], fallbackRating)));
					if (seriesData) setSeriesEpisodes(tagWithServerInfo(withoutBlockedItems(seriesData.Items || [], fallbackRating)));
				}

				if (data.Type === 'BoxSet') {
					const collectionData = await effectiveApi.getItems({
						ParentId: data.Id,
						SortBy: 'ProductionYear,SortName',
						SortOrder: 'Ascending',
						Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds'
					}).catch(() => null);
					if (collectionData) {
						const tagged = tagWithServerInfo(withoutBlockedItems(collectionData.Items || []));
						setCollectionItems(tagged);
						if (tagged.length > 0 && seerrEnabledRef.current) {
							fetchMissingCollectionItems({
								boxSet: data,
								members: tagged,
								settings: settingsRef.current
							}).then((missing) => {
								if (cancelled || missing.length === 0) return;
								setMissingCollectionItems(missing);
							}).catch(() => {});
						}
					}
				}

				if (data.Type === 'MusicAlbum') {
					const [tracksData, albumSimilarData] = await Promise.all([
						effectiveApi.getAlbumTracks(data.Id).catch(() => null),
						effectiveApi.getSimilar(itemId).catch(() => null)
					]);
					if (tracksData) setAlbumTracks(tagWithServerInfo(withoutBlockedItems(tracksData.Items || [])));
					if (albumSimilarData) setSimilar(tagWithServerInfo(withoutBlockedItems(albumSimilarData.Items || [])));
				}

				if (data.Type === 'MusicArtist') {
					const [albumsData, artistSimilarData] = await Promise.all([
						effectiveApi.getAlbumsByArtist(data.Id).catch(() => null),
						effectiveApi.getSimilar(itemId).catch(() => null)
					]);
					if (albumsData) setArtistAlbums(tagWithServerInfo(withoutBlockedItems(albumsData.Items || [])));
					if (artistSimilarData) setSimilar(tagWithServerInfo(withoutBlockedItems(artistSimilarData.Items || [])));
				}

				if (data.Type === 'Playlist') {
					const playlistData = await effectiveApi.getPlaylistItems(data.Id).catch(() => null);
					if (playlistData) setPlaylistItems(tagWithServerInfo(withoutBlockedItems(playlistData.Items || [])));
				}

				setPlayListsLoaded(true);

				const needsSimilar = data.Type !== 'Person' && data.Type !== 'BoxSet' &&
					data.Type !== 'MusicAlbum' && data.Type !== 'MusicArtist' && data.Type !== 'Playlist';
				const needsExtras = data.Type === 'Movie' || data.Type === 'Episode' || data.Type === 'Video';
				const needsBoxSet = data.Type === 'Movie' || data.Type === 'Video';

				// Moonfin is only asked where the server said it can score, since
				// otherwise every open pays a failed request before the stock row.
				// Reports which source actually filled the list as well as the list itself. Every
				// branch falls back to the server's own similar items when the chosen source
				// has nothing, so the preference alone would name the wrong one.
				const fetchSimilar = async () => {
					if (!needsSimilar || !effectiveApi?.getSimilar) return null;
					const currentSettings = settingsRef.current;
					const source = currentSettings?.recommendationSystemSource || 'local';
					const canScore = scoringRef.current && !!effectiveApi.getMoonfinSimilar;
					const stock = () => effectiveApi.getSimilar(itemId, SIMILAR_LIMIT, 'moonfin').catch(() => null);
					const scored = () => effectiveApi.getMoonfinSimilar(itemId, SIMILAR_LIMIT).catch(() => null);
					const localScored = () => (canScoreSeedLocally(data)
						? getRecommendations(effectiveApi, data, {includeWatched: true, limit: SIMILAR_LIMIT}).catch(() => [])
						: Promise.resolve([]));

					if (source === 'server') return {data: await stock(), source: 'jellyfin'};

					if (source === 'online') {
						const onlineCards = await getOnlineRecommendations(currentSettings, data).catch(() => []);
						if (onlineCards.length) return {data: {Items: onlineCards}, source: 'tmdb'};
					}

					if (source === 'hybrid') {
						const [stockData, scoredData] = await Promise.all([
							stock(),
							canScore ? scored() : localScored().then((items) => ({Items: items}))
						]);
						const merged = mergeRecommendations(stockData?.Items, scoredData?.Items, SIMILAR_LIMIT);
						if (merged.length) return {data: {Items: merged}, source: 'moonfin'};
					}

					if (source === 'local') {
						if (canScore) {
							const scoredData = await scored();
							if (scoredData?.Items?.length) return {data: scoredData, source: 'moonfin'};
						}
						const localRecs = await localScored();
						if (localRecs.length) return {data: {Items: localRecs}, source: 'moonfin'};
					}

					return {data: await effectiveApi.getSimilar(itemId, SIMILAR_LIMIT).catch(() => null), source: 'jellyfin'};
				};

				const [similarResult, extrasData, collections] = await Promise.all([
					fetchSimilar(),
					needsExtras ? effectiveApi.getSpecialFeatures(itemId).catch(() => null) : Promise.resolve(null),
					needsBoxSet ? findParentCollections(effectiveApi, data).catch(() => []) : Promise.resolve([])
				]);

				if (similarResult?.data) {
					setSimilar(tagWithServerInfo(withoutBlockedItems(similarResult.data.Items || [])));
					setSimilarSource(similarResult.source);
				}
				// Recorded whether or not anything came back, so a section that holds its place
				// while the answer is out knows when to stop holding it.
				setSimilarLoaded(true);
				if (extrasData) setExtras(tagWithServerInfo(withoutBlockedItems(extrasData.filter(e => e.Id !== itemId))));
				for (const boxSet of collections) {
					const colData = await effectiveApi.getItems({
						ParentId: boxSet.Id,
						SortBy: 'PremiereDate,SortName',
						SortOrder: 'Ascending',
						// A box set has no people of its own, so its Cast card pools them from
						// everything inside it.
						Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,People'
					}).catch(() => null);
					// A collection holding nothing but the title being looked at says nothing.
					const members = withoutBlockedItems(colData?.Items || []);
					if (members.length <= 1) continue;

					const tagged = tagWithServerInfo(members);
					if (cancelled) return;
					setParentCollections((prev) => [...prev, {
						id: boxSet.Id,
						name: boxSet.Name || $L('Collection'),
						boxSetItem: boxSet,
						items: tagged,
						missingItems: []
					}]);

					if (seerrEnabledRef.current) {
						fetchMissingCollectionItems({
							boxSet,
							members: tagged,
							settings: settingsRef.current
						}).then((missing) => {
							if (cancelled || missing.length === 0) return;
							setParentCollections((prev) => prev.map((entry) => (
								entry.id === boxSet.Id ? {...entry, missingItems: missing} : entry
							)));
						}).catch(() => {});
					}
				}

				// A collection plays in order, which means every movie in it plus every episode
				// of every series in it. Only the first page is read here, the rest follows as
				// the viewer scrolls.
				if (data.Type === 'BoxSet') {
					const index = await buildCollectionIndex(effectiveApi, itemId);
					if (cancelled) return;
					collectionIndexRef.current = index;
					const page = await fetchCollectionPage(effectiveApi, index, 0);
					if (cancelled) return;
					collectionFetchedRef.current = page.fetchedCount;
					collectionHasMoreRef.current = page.hasMore;
					setPlaylistItems(tagWithServerInfo(withoutBlockedItems(page.items)));
				}

				if (data.Type === 'Person') {
					const filmography = await effectiveApi.getItemsByPerson(itemId, 50).catch(() => null);
					if (filmography) setSimilar(tagWithServerInfo(withoutBlockedItems(filmography.Items || [])));
				}
			};

			bg().catch(() => {});
		};
		loadItem();
		return () => { cancelled = true; };
	}, [effectiveApi, itemId, tagWithServerInfo, skip]);

	useEffect(() => {
		if (!item || !episodes.length) return undefined;
		if (!settings.useMoonfinPlugin || !settings.tmdbEpisodeRatingsEnabled) return undefined;
		if (!isRatingSourceAllowed(settings.mdblistRatingSources, 'tmdb')) return undefined;
		if (item.Type !== 'Season' && item.Type !== 'Episode') return undefined;

		const seasonNumber = item.Type === 'Season' ? item.IndexNumber : item.ParentIndexNumber;
		if (seasonNumber == null) return undefined;

		let cancelled = false;
		// The SeasonRatings route wants the series TMDB id, not the Season/Episode
		// item's own provider id.
		resolveSeriesTmdbId(item).then(seriesTmdbId => {
			if (cancelled || !seriesTmdbId) return null;
			return fetchTmdbSeasonRatings(effectiveServerUrl, seriesTmdbId, seasonNumber);
		}).then(data => {
			if (cancelled || !data?.episodes) return;
			const ratingsMap = {};
			for (const ep of data.episodes) {
				ratingsMap[ep.episodeNumber] = ep.voteAverage;
			}
			setEpisodeRatings(ratingsMap);
		});
		return () => { cancelled = true; };
	}, [item, episodes.length, settings.useMoonfinPlugin, settings.tmdbEpisodeRatingsEnabled, settings.mdblistRatingSources, effectiveServerUrl]);

	// The card has to reach into the next season, which the current season's episode
	// list can't answer on its own.
	useEffect(() => {
		if (item?.Type !== 'Episode') {
			setNextEpisode(null);
			return undefined;
		}
		let cancelled = false;
		playback.getNextEpisode(item).then((next) => {
			if (!cancelled) setNextEpisode(next);
		});
		return () => { cancelled = true; };
	}, [item]);

	// Pulls one title out of this collection and out of every list that carries it, so the grid
	// and the playlist stop showing it without a reload. The lists change first so the card goes on
	// the press that confirmed it, and come back if the server says no, which the caller hears
	// about through the rethrow.
	const removeFromCollection = useCallback(async (member) => {
		if (item?.Type !== 'BoxSet') return;
		const previousCollection = collectionItems;
		const previousPlaylist = playlistItems;
		const previousIndex = collectionIndexRef.current;
		const previousFetched = collectionFetchedRef.current;
		const previousHasMore = collectionHasMoreRef.current;

		// The playlist reads the index a page at a time, so its place only steps back when the
		// hole opened behind it. Stepping one that sits ahead would read an id twice.
		const position = previousIndex.indexOf(member.Id);
		setCollectionItems(previousCollection.filter((entry) => entry.Id !== member.Id));
		setPlaylistItems(previousPlaylist.filter((entry) => entry.Id !== member.Id));
		collectionIndexRef.current = previousIndex.filter((id) => id !== member.Id);
		if (position >= 0 && position < previousFetched) collectionFetchedRef.current = previousFetched - 1;
		collectionHasMoreRef.current = collectionFetchedRef.current < collectionIndexRef.current.length;

		try {
			await effectiveApi.removeFromCollection(item.Id, [member.Id]);
		} catch (err) {
			setCollectionItems(previousCollection);
			setPlaylistItems(previousPlaylist);
			collectionIndexRef.current = previousIndex;
			collectionFetchedRef.current = previousFetched;
			collectionHasMoreRef.current = previousHasMore;
			throw err;
		}

		// A saved order still naming it would put the title back on the next open.
		const order = await effectiveApi.getCollectionOrder?.(item.Id).catch(() => null);
		if (Array.isArray(order) && order.indexOf(member.Id) !== -1) {
			await effectiveApi.saveCollectionOrder(item.Id, order.filter((id) => id !== member.Id)).catch(() => {});
		}
	}, [item, collectionItems, playlistItems, effectiveApi]);

	const refreshItem = useCallback(async () => {
		try {
			const data = await effectiveApi.getItemForDetail(itemId);
			if (data) {
				setItem(tagWithServerInfo(data));
			}
		} catch (err) {
			console.error('[Details] Error refreshing item', err);
		}
	}, [effectiveApi, itemId, tagWithServerInfo]);

	// Everything here was fetched once, and the watched state can move under it on this set or
	// another one, so the screen draws from it with what's known now laid over it.
	const userDataVersion = useUserDataVersion();
	const synced = useMemo(() => ({
		item: userDataSync.apply(item),
		seasons: userDataSync.applyAll(seasons),
		episodes: userDataSync.applyAll(episodes),
		seriesEpisodes: userDataSync.applyAll(seriesEpisodes),
		similar: userDataSync.applyAll(similar),
		extras: userDataSync.applyAll(extras),
		nextUp: userDataSync.applyAll(nextUp),
		nextEpisode: userDataSync.apply(nextEpisode),
		collectionItems: userDataSync.applyAll(collectionItems),
		parentCollections: userDataSync.applyToRows(parentCollections),
		albumTracks: userDataSync.applyAll(albumTracks),
		artistAlbums: userDataSync.applyAll(artistAlbums),
		playlistItems: userDataSync.applyAll(playlistItems)
	}), [item, seasons, episodes, seriesEpisodes, similar, extras, nextUp, nextEpisode, collectionItems, // eslint-disable-line react-hooks/exhaustive-deps
		parentCollections, albumTracks, artistAlbums, playlistItems, userDataVersion]);

	return {
		...synced,
		setItem,
		isSeed,
		isLoading,
		isBlocked,
		cast,
		missingCollectionItems,
		similarSource,
		similarLoaded,
		playListsLoaded,
		loadMoreCollectionItems,
		removeFromCollection,
		setPlaylistItems,
		episodeRatings,
		selectedVersionIndex,
		setSelectedVersionIndex,
		selectedAudioIndex,
		setSelectedAudioIndex,
		selectedSubtitleIndex,
		setSelectedSubtitleIndex,
		refreshItem
	};
};

export default useDetailsItem;
