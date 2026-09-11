import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';

import * as playback from '../../services/playback';
import {fetchTmdbSeasonRatings, resolveSeriesTmdbId, isRatingSourceAllowed} from '../../services/mdblistApi';
import {getItemSubtitlePref, getSeriesSubtitlePref, getSeriesAudioPref} from '../../services/subtitlePrefs';
import {fromServerStream, matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';
import {findParentCollection} from './parentCollection';
import {getOnlineRecommendations, mergeRecommendations} from '../../services/homeRecommendations';
import {fetchMissingCollectionItems, mergeCollectionWithMissing} from './seerrMissingCollectionItems';

// Everything the screen shows about one item. The item itself is fetched first and rendered
// on its own, then the rows that hang off it fill in behind, because waiting for all of them
// would leave the screen blank for as long as the slowest one takes.
// The row that opened this screen already carries the title, the artwork and the summary,
// which is most of what the first look at it is. Drawing on that lets the screen go up at
// once and the full record fill the rest in behind, rather than leaving it blank for as
// long as the request takes.
const seedFrom = (candidate, id) => (candidate && candidate.Id === id ? candidate : null);

// The More Like This row draws everything it is given, so this is how many cards
// it ends up with.
const SIMILAR_LIMIT = 15;

const useDetailsItem = ({itemId, initialItem, effectiveApi, effectiveServerUrl, settings, recommendationsSupported, tagWithServerInfo, skip}) => {
	const seedRef = useRef(initialItem);
	seedRef.current = initialItem;
	// Read where they are used rather than depended on, so a change to either one
	// does not refetch the whole screen.
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const scoringRef = useRef(recommendationsSupported);
	scoringRef.current = recommendationsSupported;

	const [item, setItem] = useState(() => seedFrom(initialItem, itemId));
	// Whether what is on screen is still the row it was opened from rather than the record
	// the server holds, which is what the buttons are properly built from.
	const [isSeed, setIsSeed] = useState(() => Boolean(seedFrom(initialItem, itemId)));
	const [seasons, setSeasons] = useState([]);
	const [episodes, setEpisodes] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [extras, setExtras] = useState([]);
	const [cast, setCast] = useState([]);
	const [nextUp, setNextUp] = useState([]);
	const [nextEpisode, setNextEpisode] = useState(null);
	const [collectionItems, setCollectionItems] = useState([]);
	const [parentCollection, setParentCollection] = useState([]);
	const [parentCollectionName, setParentCollectionName] = useState('');
	const [albumTracks, setAlbumTracks] = useState([]);
	const [artistAlbums, setArtistAlbums] = useState([]);
	const [playlistItems, setPlaylistItems] = useState([]);
	const [isLoading, setIsLoading] = useState(() => !seedFrom(initialItem, itemId));
	const [episodeRatings, setEpisodeRatings] = useState({});

	const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);

	useEffect(() => {
		// Whatever the last item brought with it has to go before anything else, or its rows
		// stay on screen under the next title.
		setSeasons([]);
		setEpisodes([]);
		setEpisodeRatings({});
		setSimilar([]);
		setExtras([]);
		setCast([]);
		setNextUp([]);
		setCollectionItems([]);
		setParentCollection([]);
		setParentCollectionName('');
		setAlbumTracks([]);
		setArtistAlbums([]);
		setPlaylistItems([]);

		// A Seerr title has no id the server would recognise, so asking for one would only 404
		// and leave the screen spinning.
		if (skip) {
			setIsLoading(false);
			return;
		}

		const loadItem = async () => {
			const seed = seedFrom(seedRef.current, itemId);
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
				} else if (ms.DefaultSubtitleStreamIndex != null) {
					const idx = initSubtitleStreams.findIndex(s => s.Index === ms.DefaultSubtitleStreamIndex);
					if (idx >= 0) setSelectedSubtitleIndex(idx);
				} else {
					setSelectedSubtitleIndex(-1);
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

			const bg = async () => {
				if (data.Type === 'Series') {
					const [seasonsData, nextUpData] = await Promise.all([
						effectiveApi.getSeasons(itemId).catch(() => null),
						effectiveApi.getNextUp(1, itemId).catch(() => null)
					]);
					if (seasonsData) setSeasons(tagWithServerInfo(seasonsData.Items || []));
					if (nextUpData?.Items?.length > 0) setNextUp(tagWithServerInfo(nextUpData.Items));
				}

				if (data.Type === 'Season') {
					const episodesData = await effectiveApi.getEpisodes(data.SeriesId, data.Id).catch(() => null);
					if (episodesData) setEpisodes(tagWithServerInfo(episodesData.Items || []));
				}

				if (data.Type === 'Episode') {
					const seasonId = data.SeasonId || data.ParentId;
					if (data.SeriesId && seasonId) {
						const episodesData = await effectiveApi.getEpisodes(data.SeriesId, seasonId).catch(() => null);
						if (episodesData) setEpisodes(tagWithServerInfo(episodesData.Items || []));
					}
				}

				if (data.Type === 'BoxSet') {
					const collectionData = await effectiveApi.getItems({
						ParentId: data.Id,
						SortBy: 'ProductionYear,SortName',
						SortOrder: 'Ascending',
						Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds'
					}).catch(() => null);
					if (collectionData) {
						const tagged = tagWithServerInfo(collectionData.Items || []);
						setCollectionItems(tagged);
						if (tagged.length > 0 && settingsRef.current?.seerrShowMissingCollectionItems !== false) {
							fetchMissingCollectionItems({
								boxSet: data,
								members: tagged,
								settings: settingsRef.current
							}).then((missing) => {
								if (missing.length > 0) {
									setCollectionItems((prev) => mergeCollectionWithMissing(prev, missing));
								}
							}).catch(() => {});
						}
					}
				}

				if (data.Type === 'MusicAlbum') {
					const [tracksData, albumSimilarData] = await Promise.all([
						effectiveApi.getAlbumTracks(data.Id).catch(() => null),
						effectiveApi.getSimilar(itemId).catch(() => null)
					]);
					if (tracksData) setAlbumTracks(tagWithServerInfo(tracksData.Items || []));
					if (albumSimilarData) setSimilar(tagWithServerInfo(albumSimilarData.Items || []));
				}

				if (data.Type === 'MusicArtist') {
					const [albumsData, artistSimilarData] = await Promise.all([
						effectiveApi.getAlbumsByArtist(data.Id).catch(() => null),
						effectiveApi.getSimilar(itemId).catch(() => null)
					]);
					if (albumsData) setArtistAlbums(tagWithServerInfo(albumsData.Items || []));
					if (artistSimilarData) setSimilar(tagWithServerInfo(artistSimilarData.Items || []));
				}

				if (data.Type === 'Playlist') {
					const playlistData = await effectiveApi.getPlaylistItems(data.Id).catch(() => null);
					if (playlistData) setPlaylistItems(tagWithServerInfo(playlistData.Items || []));
				}

				const needsSimilar = data.Type !== 'Person' && data.Type !== 'BoxSet' &&
					data.Type !== 'MusicAlbum' && data.Type !== 'MusicArtist' && data.Type !== 'Playlist';
				const needsExtras = data.Type === 'Movie' || data.Type === 'Episode' || data.Type === 'Video';
				const needsBoxSet = data.Type === 'Movie' || data.Type === 'Video';

				// Moonfin is only asked where the server said it can score, since
				// otherwise every open pays a failed request before the stock row.
				const fetchSimilar = async () => {
					if (!needsSimilar || !effectiveApi?.getSimilar) return null;
					const currentSettings = settingsRef.current;
					const source = currentSettings?.recommendationSystemSource || 'local';
					const canScore = scoringRef.current && !!effectiveApi.getMoonfinSimilar;
					const stock = () => effectiveApi.getSimilar(itemId, SIMILAR_LIMIT, 'moonfin').catch(() => null);
					const scored = () => effectiveApi.getMoonfinSimilar(itemId, SIMILAR_LIMIT).catch(() => null);

					if (source === 'server') return stock();

					if (source === 'online') {
						const onlineCards = await getOnlineRecommendations(currentSettings, data).catch(() => []);
						if (onlineCards.length) return {Items: onlineCards};
					}

					if (source === 'hybrid') {
						const [stockData, scoredData] = await Promise.all([stock(), canScore ? scored() : null]);
						const merged = mergeRecommendations(stockData?.Items, scoredData?.Items, SIMILAR_LIMIT);
						if (merged.length) return {Items: merged};
					}

					if (source === 'local' && canScore) {
						const scoredData = await scored();
						if (scoredData?.Items?.length) return scoredData;
					}

					return effectiveApi.getSimilar(itemId, SIMILAR_LIMIT).catch(() => null);
				};

				const [similarData, extrasData, boxSet] = await Promise.all([
					fetchSimilar(),
					needsExtras ? effectiveApi.getSpecialFeatures(itemId).catch(() => null) : Promise.resolve(null),
					needsBoxSet ? findParentCollection(effectiveApi, data).catch(() => null) : Promise.resolve(null)
				]);

				if (similarData) setSimilar(tagWithServerInfo(similarData.Items || []));
				if (extrasData) setExtras(tagWithServerInfo(extrasData.filter(e => e.Id !== itemId)));
				if (boxSet) {
					const colData = await effectiveApi.getItems({
						ParentId: boxSet.Id,
						SortBy: 'PremiereDate,SortName',
						SortOrder: 'Ascending',
						Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds'
					}).catch(() => null);
					// A collection holding nothing but the title being looked at says nothing.
					const members = colData?.Items || [];
					if (members.length > 1) {
						const tagged = tagWithServerInfo(members);
						setParentCollectionName(boxSet.Name || $L('Collection'));
						setParentCollection(tagged);
						if (settingsRef.current?.seerrShowMissingCollectionItems !== false) {
							fetchMissingCollectionItems({
								boxSet,
								members: tagged,
								settings: settingsRef.current
							}).then((missing) => {
								if (missing.length > 0) {
									setParentCollection((prev) => mergeCollectionWithMissing(prev, missing));
								}
							}).catch(() => {});
						}
					}
				}

				if (data.Type === 'Person') {
					const filmography = await effectiveApi.getItemsByPerson(itemId, 50).catch(() => null);
					if (filmography) setSimilar(tagWithServerInfo(filmography.Items || []));
				}
			};

			bg().catch(() => {});
		};
		loadItem();
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

	return {
		item,
		setItem,
		isSeed,
		isLoading,
		seasons,
		episodes,
		similar,
		extras,
		cast,
		nextUp,
		nextEpisode,
		collectionItems,
		parentCollection,
		parentCollectionName,
		albumTracks,
		artistAlbums,
		playlistItems,
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
