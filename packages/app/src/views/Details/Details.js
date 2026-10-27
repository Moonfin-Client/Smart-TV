import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {isKidsMode, kidsModeSettings} from '../../utils/kidsMode';
import {sectionVisibility} from '../../utils/detailSectionLayout';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import {searchesForTrailer} from '../../services/youtubeTrailer';
import {saveAudioPref, saveSubtitlePref} from '../../services/subtitlePrefs';
import {fromServerStream} from '../../utils/seriesTrackPrefs';
import ModernDetailContent from './ModernDetailContent';
import DetailSkeleton from './DetailSkeleton';
import {formatDuration, getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {MATERIAL_ICON_PATHS} from '../Settings/materialIconMap';
import {fetchPrerolls} from '../../utils/cinemaMode';
import {bookReader} from '../../utils/books';
import {
	toSubtitleLanguage,
	subtitleDownloadLanguages,
	searchRemoteSubtitlesIn,
	mapRemoteSubtitleOptions,
	pollForSubtitleAppearance,
	remoteSubtitleSearchError,
	remoteSubtitleDownloadError,
	remoteSubtitleNotAppearedMessage
} from '../Player/remoteSubtitleUtils';
import {detailsSubtitlePosition} from '../Player/initialSubtitle';
import useLongPress from '../../utils/longPress';
import {formatPlaybackEndsAt} from '../../utils/playbackTimeLabels';
import {formatFileSize} from '../../utils/formatFileSize';
import {pickEpisodePlayTarget, shouldResumeTarget} from '../../utils/episodePlayTarget';
import {collectionQueue, collectionPlayTarget} from '../../utils/collectionPlayback';

import {isSeerrOnlyItem, libraryIdOf, personRouteFor} from '../../utils/seerrTarget';
import {buildSeerrDetailItem} from '../../utils/seerrDetailItem';
import {COLLECTION_ITEM_TYPES, IDENTIFIABLE_TYPES, getMediaBadges, seriesThumbUrl, shuffleArray, splitCastAndCrew} from './detailsMedia';
import {orderItemsByIds} from './collectionPlaylist';
import useDetailsItem from './useDetailsItem';
import useDetailsModals from './useDetailsModals';
import useDetailsTrailer from './useDetailsTrailer';
import useDetailsReviews from './useDetailsReviews';
import useSeerrOverlay from './useSeerrOverlay';
import DetailScrollPage from './DetailScrollPage';
import DetailBackdrop from './DetailBackdrop';
import DetailActionButtons from './DetailActionButtons';
import DetailTrackModals from './DetailTrackModals';
import DetailDialogs from './DetailDialogs';
import SeerrDialogs from './SeerrDialogs';
import TrailerOverlay from './TrailerOverlay';
import TrailerPicker from './TrailerPicker';
import ReviewDialog from './ReviewDialog';
import PersonalRatingDialog from '../../components/PersonalRatingDialog';
import {clampRating, clearedRatingPatch, isRatableItemType, normalizeRatingStyle, numericRatingPatch, thumbRatingPatch} from '../../utils/personalRating';
import {personCalendarDate, personDateLines, splitFilmography} from '../../utils/personCredits';
import {mergeCollectionWithMissing, mergeMissingByReleaseOrder} from './seerrMissingCollectionItems';
import ClassicDetailScreen from './ClassicDetailScreen';
import SpotlightDetailContent from './spotlight/SpotlightDetailContent';
import NouveauDetailContent from './nouveau/NouveauDetailContent';
import MinimalistDetailContent from './minimalist/MinimalistDetailContent';
import PersonScreen from './PersonScreen';
import SeasonScreen from './SeasonScreen';
import PlaylistScreen from './PlaylistScreen';
import AlbumScreen from './AlbumScreen';
import ArtistScreen from './ArtistScreen';
import AudioTrackScreen from './AudioTrackScreen';

import css from './Details.module.less';

// Every style past Classic takes the same contract, so the setting only decides which of them
// draws the screen.
const DETAIL_CONTENT = {v3: SpotlightDetailContent, v4: NouveauDetailContent, v5: MinimalistDetailContent};
// The missing titles already ride in the list a collection's page is handed.
const NO_ITEMS = [];

const Details = ({itemId: itemIdProp, initialItem, onPlay, onSelectItem, onSelectPerson, onSelectStudio, onItemDeleted, autoPlay, onAutoPlayed, seerrNav, backHandlerRef}) => {
	const {api, serverUrl, user} = useAuth();
	// Kids Mode has its say before anything on this screen reads a setting, and every piece below
	// takes what it is handed rather than reaching for the context itself. Held steady across
	// renders, or the effects and memos that depend on it would run again every time.
	const {settings: storedSettings} = useSettings();
	const settings = useMemo(() => kidsModeSettings(storedSettings), [storedSettings]);
	// Which sections the viewer left on. Read once here so every style and the Seerr block
	// agree, and a hidden section reads as one with nothing in it. The data behind it stays,
	// since playback and the pickers still read it.
	const showsSection = useMemo(() => sectionVisibility(settings.hiddenDetailSectionsTv), [settings.hiddenDetailSectionsTv]);
	const {pluginInfo, isEnabled: seerrEnabled} = useSeerr();
	const recommendationsSupported = pluginInfo?.recommendationsSupported === true;
	const {isInGroup: isSyncPlayInGroup} = useSyncPlay();

	const effectiveApi = useMemo(() => {
		if (initialItem?._serverUrl && initialItem._serverAccessToken) {
			return jellyfinApi.createApiForServer(initialItem._serverUrl, initialItem._serverAccessToken, initialItem._serverUserId);
		}
		return api;
	}, [initialItem, api]);

	const effectiveServerUrl = useMemo(() => {
		return initialItem?._serverUrl || serverUrl;
	}, [initialItem?._serverUrl, serverUrl]);

	const tagWithServerInfo = useCallback((items) => {
		if (!initialItem?._serverUrl) return items;
		const tagSingleItem = (singleItem) => ({
			...singleItem,
			_serverUrl: initialItem._serverUrl,
			_serverType: initialItem._serverType,
			_serverAccessToken: initialItem._serverAccessToken,
			_serverUserId: initialItem._serverUserId,
			_serverName: initialItem._serverName,
			_serverId: initialItem._serverId
		});
		return Array.isArray(items) ? items.map(tagSingleItem) : tagSingleItem(items);
	}, [initialItem?._serverUrl, initialItem?._serverType, initialItem?._serverAccessToken, initialItem?._serverUserId, initialItem?._serverName, initialItem?._serverId]);

	const [remoteSubtitleResults, setRemoteSubtitleResults] = useState([]);
	const [isSearchingRemoteSubtitles, setIsSearchingRemoteSubtitles] = useState(false);
	const [isDownloadingRemoteSubtitle, setIsDownloadingRemoteSubtitle] = useState(false);
	const [remoteSubtitleError, setRemoteSubtitleError] = useState(null);
	const [toastMessage, setToastMessage] = useState(null);
	const [logoFailed, setLogoFailed] = useState(false);
	const ratingSaveRef = useRef(false);

	const handleLogoError = useCallback(() => setLogoFailed(true), []);
	const handleToastEnd = useCallback(() => setToastMessage(null), []);
	const showToast = useCallback((msg) => setToastMessage(msg), []);

	const pageScrollerRef = useRef(null);
	const pageScrollToRef = useRef(null);

	// Seerr hands back the media server's own id for a title it knows is already in the
	// library. The screen swaps itself for the real item, which has playback and everything
	// else a synthetic one has none of.
	const [seerrLibraryId, setSeerrLibraryId] = useState(null);
	useEffect(() => setSeerrLibraryId(null), [itemIdProp]);
	const itemId = seerrLibraryId || itemIdProp;

	// A new item brings its own artwork, so a logo that failed for the last one must not
	// keep its title hidden behind the fallback.
	useEffect(() => setLogoFailed(false), [itemId]);

	// Seerr supplies the whole screen for a title the library doesn't have.
	const seerrOnly = isSeerrOnlyItem(initialItem) && !seerrLibraryId;

	const data = useDetailsItem({
		itemId,
		initialItem,
		effectiveApi,
		effectiveServerUrl,
		settings,
		recommendationsSupported,
		seerrEnabled,
		tagWithServerInfo,
		skip: seerrOnly
	});
	const {
		setItem, isLoading: libraryLoading, isBlocked: blockedByRating, isSeed, seasons, episodes, seriesEpisodes, similar, extras, cast, nextUp, nextEpisode,
		collectionItems, missingCollectionItems, parentCollections, similarSource, similarLoaded, playListsLoaded, loadMoreCollectionItems, removeFromCollection, albumTracks, artistAlbums,
		playlistItems, setPlaylistItems, collectionIndexRef, collectionSort, collectionPlaylistLoading, chooseCollectionSort, moveCollectionItem,
		episodeRatings, refreshItem,
		selectedVersionIndex, setSelectedVersionIndex,
		selectedAudioIndex, setSelectedAudioIndex,
		selectedSubtitleIndex, setSelectedSubtitleIndex
	} = data;

	const seerr = useSeerrOverlay({item: seerrOnly ? initialItem : data.item, seerrOnly, showsSection});

	// A tap that came in as a bare TMDB or IMDb id can turn out to be a title the
	// library holds, which only Seerr's answer reveals.
	useEffect(() => {
		if (!seerrOnly) return;
		const ownedId = libraryIdOf(seerr.details?.mediaInfo);
		if (ownedId) setSeerrLibraryId(ownedId);
	}, [seerrOnly, seerr.details]);

	const seerrItem = useMemo(
		() => (seerrOnly ? buildSeerrDetailItem(seerr.details, seerr.mediaType) : null),
		[seerrOnly, seerr.details, seerr.mediaType]
	);
	const item = seerrOnly ? seerrItem : data.item;
	const isLoading = seerrOnly ? seerr.loading : libraryLoading;

	const {cast: detailCast, crew: detailCrew} = useMemo(() => {
		const split = splitCastAndCrew(seerrOnly ? item?.People || [] : cast);
		return {
			cast: showsSection('cast') ? split.cast : [],
			crew: showsSection('crew') ? split.crew : []
		};
	}, [seerrOnly, item?.People, cast, showsSection]);

	// The Seerr popups have to answer BACK before the screen's own overlays do, and the ref is
	// how they reach the handler useDetailsModals owns.
	const seerrBackRef = useRef(null);
	useEffect(() => {
		seerrBackRef.current = seerr.closeTopPopup;
	}, [seerr.closeTopPopup]);

	// A request that failed leaves the button looking exactly as it did, so the toast is the
	// only thing that says so.
	const {actionError: seerrActionError, clearActionError: clearSeerrActionError} = seerr;
	useEffect(() => {
		if (!seerrActionError) return;
		showToast(seerrActionError);
		clearSeerrActionError();
	}, [seerrActionError, clearSeerrActionError, showToast]);

	// The expanded overview box collapses on BACK through the same chain the
	// screen's overlays use.
	const overviewBackRef = useRef(null);
	const spotlightBackRef = useRef(null);
	const trailerBackRef = useRef(null);
	const reviewBackRef = useRef(null);
	const modals = useDetailsModals({backHandlerRef, onArtworkClosed: refreshItem, seerrBackRef, overviewBackRef, spotlightBackRef, trailerBackRef, reviewBackRef});
	const {activeModal, openModal, closeModal, advancedResumeRef} = modals;

	const trailer = useDetailsTrailer({
		item,
		effectiveApi,
		onPlay,
		trailerVolume: settings.trailerVolume,
		showCaptions: settings.mediaBarTrailerCaptions,
		captionLanguage: settings.uiLanguage,
		seerrOnly,
		backRef: trailerBackRef
	});

	// An older plugin has no reviews route, and its ping says so.
	const reviews = useDetailsReviews({
		item,
		effectiveApi,
		enabled: settings.useMoonfinPlugin === true && pluginInfo?.tmdbReviewsSupported === true && showsSection('reviews'),
		backRef: reviewBackRef
	});

	const canChangeArtwork = useMemo(() => {
		if (!item) return false;
		const type = item.Type;
		const isMediaType =
			type === 'Movie' ||
			type === 'Episode' ||
			type === 'Series' ||
			type === 'Season' ||
			type === 'Audio' ||
			type === 'MusicAlbum' ||
			type === 'BoxSet';
		const isFolder =
			type === 'Folder' ||
			type === 'CollectionFolder' ||
			type === 'UserView' ||
			type === 'Genre' ||
			type === 'MusicGenre';

		return (isMediaType || isFolder) &&
			jellyfinApi.getServerType() === 'jellyfin' &&
			user?.Policy?.IsAdministrator;
	}, [item, user]);

	const canIdentify = useMemo(() => {
		if (!item) return false;
		return IDENTIFIABLE_TYPES.includes(item.Type) &&
			jellyfinApi.getServerType() === 'jellyfin' &&
			user?.Policy?.IsAdministrator;
	}, [item, user]);

	const isBoxSet = item?.Type === 'BoxSet';

	// A moved row can be drawn afresh, so focus is put back on it in its new place.
	const handleCollectionMove = useCallback((itemIndex, direction) => {
		const newIndex = itemIndex + direction;
		if (newIndex < 0 || newIndex >= playlistItems.length) return;
		const list = Spotlight.getCurrent()?.closest('[data-index]')?.parentElement;
		moveCollectionItem(itemIndex, newIndex);
		window.requestAnimationFrame(() => {
			const row = list?.querySelector(`[data-index="${newIndex}"]`);
			if (row) Spotlight.focus(row);
		});
	}, [playlistItems.length, moveCollectionItem]);

	const collectionOrder = useMemo(() => (isBoxSet ? {
		sortOption: collectionSort,
		loading: collectionPlaylistLoading,
		choose: chooseCollectionSort
	} : null), [isBoxSet, collectionSort, collectionPlaylistLoading, chooseCollectionSort]);

	// Keyed on the id rather than the item, because marking watched or favourite
	// builds a new item object, which would otherwise yank focus back to Play.
	const loadedItemId = item?.Id;
	const autoFocusedRef = useRef(null);
	useEffect(() => {
		if (isLoading || !loadedItemId) return undefined;
		const timer = setTimeout(() => {
			Spotlight.focus(seerrOnly ? 'details-action-buttons' : 'details-primary-btn');
			autoFocusedRef.current = Spotlight.getCurrent();
		}, 150);
		return () => clearTimeout(timer);
	}, [isLoading, loadedItemId, seerrOnly]);

	// The row a title is opened from doesn't carry everything the buttons are built from, so
	// a Resume can appear once the full record lands and take the primary spot from under
	// the focus, leaving it on Restart. Put it back, but only while it is still sitting where
	// it was put, so a viewer who has already moved along the row is left where they are.
	useEffect(() => {
		if (isSeed || seerrOnly || !autoFocusedRef.current) return;
		if (Spotlight.getCurrent() !== autoFocusedRef.current) return;
		Spotlight.focus('details-primary-btn');
		autoFocusedRef.current = Spotlight.getCurrent();
	}, [isSeed, seerrOnly]);

	// A hidden logo falls back to the title text, as a missing one does.
	const logoUrl = useMemo(
			() => (item && showsSection('logo') ? getLogoUrl(effectiveServerUrl, item, {maxWidth: 400, quality: 90}) : null),
			[item, effectiveServerUrl, showsSection]
		);

	// A single video with real sources is the only thing with one stream to pick a
	// version, audio track or quality for.
	const supportsStreamSelection = item?.MediaType === 'Video' &&
		item.MediaSources?.length > 0 &&
		item.MediaSources[0].Type !== 'Placeholder';

	// Whether a track was picked on this screen. Both pickers start on something the
	// viewer never chose, subtitles on None and audio on the file's first track, so
	// passing those on regardless would read as a deliberate choice and the language
	// preferences would never get a say.
	const subtitleChosenRef = useRef(false);
	const audioChosenRef = useRef(false);

	// Until a track is picked here, show the one playback will start on. It follows
	// the settings along with the version and audio on screen.
	useEffect(() => {
		if (subtitleChosenRef.current || !item) return undefined;
		let cancelled = false;
		const ms = item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0];
		const audio = ms?.MediaStreams?.filter(s => s.Type === 'Audio')[selectedAudioIndex];
		detailsSubtitlePosition(item, ms, settings, audio).then((pos) => {
			if (!cancelled && !subtitleChosenRef.current) setSelectedSubtitleIndex(pos);
		});
		return () => {
			cancelled = true;
		};
	}, [item, selectedVersionIndex, selectedAudioIndex, settings, setSelectedSubtitleIndex]);

	// The version, audio and subtitle picks made on this screen, in the shape the
	// player wants them. Shared with the advanced playback menu so both routes start
	// from the same selection.
	const buildPlaybackOptions = useCallback(() => {
		if (!supportsStreamSelection) return {};

		const playMediaSource = item.MediaSources[selectedVersionIndex] || item.MediaSources[0];
		const audioStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		const subtitleStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
		const selectedAudio = audioStreamsList[selectedAudioIndex];
		const subtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreamsList[selectedSubtitleIndex] : null;
		return {
			mediaSourceId: playMediaSource.Id,
			...(audioChosenRef.current ? {audioStreamIndex: selectedAudio?.Index} : {}),
			...(subtitleChosenRef.current ? {subtitleStreamIndex: subtitleStream?.Index ?? -1} : {})
		};
	}, [item, supportsStreamSelection, selectedVersionIndex, selectedAudioIndex, selectedSubtitleIndex]);

	// A movie split across files plays its other parts after it. A picked alternate version has
	// parts of its own, so they're asked for by the version that plays.
	const fetchAdditionalParts = useCallback(async (mediaSourceId) => {
		if (!(item.PartCount > 1)) return [];
		const result = await effectiveApi.getAdditionalParts(mediaSourceId || item.Id).catch(() => null);
		return tagWithServerInfo(result?.Items || []);
	}, [item, effectiveApi, tagWithServerInfo]);

	// A list plays on from the pressed row. Songs and videos go to different players, so the
	// queue only carries the rows the same player can take.
	const playListFrom = useCallback((list, entry) => {
		const audio = entry.MediaType === 'Audio';
		const queue = list.filter((candidate) => (candidate.MediaType === 'Audio') === audio);
		onPlay?.(entry, false, {[audio ? 'audioPlaylist' : 'videoQueue']: queue});
	}, [onPlay]);

	const handlePlay = useCallback(async (targetItem, tracksOverride) => {
		if (!item) return;

		const playbackOptions = buildPlaybackOptions();

		if (item.Type === 'Series') {
			// The season list under a series only carries seasons, so the episodes are
			// fetched here where the pick actually needs their watch state.
			const episodesData = await effectiveApi.getEpisodes(item.Id).catch(() => null);
			const allEpisodes = tagWithServerInfo(episodesData?.Items || []);
			const target = pickEpisodePlayTarget(allEpisodes, nextUp[0] || null);
			if (target) {
				onPlay?.(target, shouldResumeTarget(target), {});
			} else if (seasons.length > 0) {
				onSelectItem?.(seasons[0]);
			}
		} else if (item.Type === 'Season') {
			if (episodes.length > 0) {
				const target = pickEpisodePlayTarget(episodes) || episodes[0];
				onPlay?.(target, shouldResumeTarget(target), {});
			}
		} else if (item.Type === 'BoxSet') {
			// The rest of the collection rides along in playlist order, so finishing one film starts
			// the next rather than sending the viewer back to pick it.
			const queue = orderItemsByIds(collectionQueue(collectionItems), collectionIndexRef.current);
			const target = collectionPlayTarget(queue);
			if (target) {
				onPlay?.(target, shouldResumeTarget(target), {videoQueue: queue});
			}
		} else if (item.Type === 'MusicAlbum') {
			if (albumTracks.length > 0) {
				onPlay?.(albumTracks[0], false, {audioPlaylist: albumTracks});
			}
		} else if (item.Type === 'Playlist') {
			const tracks = tracksOverride || (Array.isArray(targetItem) ? targetItem : playlistItems);
			const matched = (targetItem && !Array.isArray(targetItem) && targetItem.Id)
				? tracks.find((t) => (targetItem.PlaylistItemId ? t.PlaylistItemId === targetItem.PlaylistItemId : t.Id === targetItem.Id))
				: null;
			const first = matched || tracks[0];
			if (tracks.length > 0 && first) playListFrom(tracks, first);
		} else {
			// A SyncPlay group queues the pressed item for everyone, so intros and parts stay out of it.
			const [prerolls, parts] = isSyncPlayInGroup
				? [[], []]
				: await Promise.all([
					fetchPrerolls(effectiveApi, item, settings).then(tagWithServerInfo),
					fetchAdditionalParts(playbackOptions.mediaSourceId)
				]);
			if (prerolls.length > 0) {
				// The version, audio and subtitle picks belong to the movie, and the queue
				// starts on an intro, so applying them here would target the wrong file.
				onPlay?.(prerolls[0], false, {videoQueue: [...prerolls, item, ...parts]});
			} else {
				onPlay?.(item, false, parts.length ? {...playbackOptions, videoQueue: [item, ...parts]} : playbackOptions);
			}
		}
	}, [item, episodes, nextUp, seasons, collectionItems, albumTracks, playlistItems, onPlay, onSelectItem, buildPlaybackOptions, effectiveApi, settings, tagWithServerInfo, isSyncPlayInGroup, playListFrom, fetchAdditionalParts, collectionIndexRef]);

	const handleResume = useCallback(async () => {
		if (!item) return;
		const playbackOptions = buildPlaybackOptions();
		const parts = isSyncPlayInGroup ? [] : await fetchAdditionalParts(playbackOptions.mediaSourceId);
		onPlay?.(item, true, parts.length ? {...playbackOptions, videoQueue: [item, ...parts]} : playbackOptions);
	}, [item, onPlay, buildPlaybackOptions, isSyncPlayInGroup, fetchAdditionalParts]);

	// Plays the item on screen the way a card's Play does, carrying on from where it was left.
	const playItemOnScreen = useCallback(() => {
		if (item?.UserData?.PlaybackPositionTicks > 0) handleResume();
		else handlePlay();
	}, [item, handleResume, handlePlay]);

	// The episode on screen plays when picked from its own list rather than opening again.
	const openOrPlay = useCallback((target) => {
		if (item?.Type === 'Episode' && target?.Id === item.Id) playItemOnScreen();
		else onSelectItem?.(target);
	}, [item, playItemOnScreen, onSelectItem]);

	// Play from a card's menu lands here and starts the way the Play button would, once the record
	// and the lists it picks from are in, which keeps the next episode pick and the track choices.
	useEffect(() => {
		if (!autoPlay || isSeed || !playListsLoaded || !item) return;
		onAutoPlayed?.();
		playItemOnScreen();
	}, [autoPlay, isSeed, playListsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleShuffle = useCallback(async () => {
		if (!item) return;

		// A series or season is not itself playable, so shuffle builds a randomized
		// queue of its episodes and plays through them. Handing the series item
		// straight to the player is what produced the playback error before.
		if (item.Type === 'Series' || item.Type === 'Season') {
			let episodeList = [];
			if (item.Type === 'Season' && episodes.length > 0) {
				episodeList = episodes;
			} else {
				const res = await effectiveApi.getItems({
					ParentId: item.Id,
					IncludeItemTypes: 'Episode',
					Recursive: true,
					Fields: 'MediaSources,MediaStreams',
					Limit: 500
				}).catch(() => null);
				episodeList = tagWithServerInfo(res?.Items || []);
			}

			const playable = episodeList.filter(ep => ep?.Id);
			if (playable.length === 0) return;

			const shuffled = shuffleArray(playable);
			onPlay?.(shuffled[0], false, {videoQueue: shuffled});
			return;
		}

		if (item.Type === 'BoxSet') {
			const queue = shuffleArray(collectionQueue(collectionItems));
			if (queue.length === 0) return;
			onPlay?.(queue[0], false, {videoQueue: queue});
			return;
		}

		// An album shuffles its own loaded tracks into the audio queue.
		if (item.Type === 'MusicAlbum') {
			if (albumTracks.length === 0) return;
			const shuffled = shuffleArray(albumTracks);
			onPlay?.(shuffled[0], false, {audioPlaylist: shuffled});
			return;
		}

		onPlay?.(item, false, {});
	}, [item, episodes, collectionItems, albumTracks, onPlay, effectiveApi, tagWithServerInfo]);

	const handleToggleFavorite = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.IsFavorite;
		await effectiveApi.setFavorite(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, IsFavorite: newState}
		}));
		window.requestAnimationFrame(() => Spotlight.focus('details-favorite-btn'));
	}, [effectiveApi, item, setItem]);

	const handleToggleWatched = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.Played;
		await effectiveApi.setWatched(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, Played: newState, PlayedPercentage: newState ? 100 : 0}
		}));
		window.dispatchEvent(new CustomEvent('moonfin:browseRefresh'));
		window.requestAnimationFrame(() => Spotlight.focus('details-watched-btn'));
	}, [effectiveApi, item, setItem]);

	// A rating shows on the screen before the server answers, and goes back to
	// what it was if the save fails.
	const applyRating = useCallback(async (patch, save) => {
		if (!item || ratingSaveRef.current) return;
		ratingSaveRef.current = true;
		const previousUserData = item.UserData;
		setItem(prev => ({...prev, UserData: {...prev.UserData, ...patch}}));
		try {
			await save();
		} catch {
			setItem(prev => ({...prev, UserData: previousUserData}));
			showToast($L('Could not save rating'));
		} finally {
			ratingSaveRef.current = false;
		}
	}, [item, setItem, showToast]);

	const handleSetThumbRating = useCallback((likes) => (
		applyRating(thumbRatingPatch(likes), () => effectiveApi.setRating(item.Id, likes))
	), [applyRating, effectiveApi, item]);

	const handleSetNumericRating = useCallback((rating) => {
		const score = clampRating(rating);
		return applyRating(numericRatingPatch(score), () => effectiveApi.setNumericRating(item.Id, score));
	}, [applyRating, effectiveApi, item]);

	const handleClearRating = useCallback(() => (
		applyRating(clearedRatingPatch(), () => effectiveApi.clearRating(item.Id))
	), [applyRating, effectiveApi, item]);

	const handleGoToSeries = useCallback(() => {
		if (item?.SeriesId) {
			const seriesItem = {Id: item.SeriesId, Type: 'Series'};
			if (item._serverUrl) {
				seriesItem._serverUrl = item._serverUrl;
				seriesItem._serverAccessToken = item._serverAccessToken;
				seriesItem._serverUserId = item._serverUserId;
				seriesItem._serverName = item._serverName;
				seriesItem._serverId = item._serverId;
			}
			onSelectItem?.(seriesItem);
		}
	}, [item, onSelectItem]);

	const handleSelectTranscodeQuality = useCallback((e) => {
		const bitrate = parseInt(e.currentTarget.dataset.bitrate, 10);
		closeModal();
		if (!item || isNaN(bitrate)) return;
		onPlay?.(item, advancedResumeRef.current, {
			...buildPlaybackOptions(),
			forceBitrate: bitrate,
			forceTranscode: true
		});
	}, [item, onPlay, buildPlaybackOptions, closeModal, advancedResumeRef]);

	// Transcode overrides and the external player handoff should not be a long press away in Kids
	// Mode. Gated at the source so both entry points are covered, and the button keeps its tap.
	const offersStreamOptions = supportsStreamSelection && !isKidsMode(settings);
	const playLongPress = useLongPress(offersStreamOptions ? modals.handleAdvancedPlay : null, handlePlay);
	const resumeLongPress = useLongPress(offersStreamOptions ? modals.handleAdvancedResume : null, handleResume);

	// A pick made here is remembered for the title, and an episode's for its series as well.
	const pickedStreams = useCallback((type) => {
		const source = item?.MediaSources?.[selectedVersionIndex] || item?.MediaSources?.[0];
		return source?.MediaStreams?.filter((stream) => stream.Type === type) || [];
	}, [item, selectedVersionIndex]);

	const handleSelectAudio = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		audioChosenRef.current = true;
		setSelectedAudioIndex(index);
		const streams = pickedStreams('Audio');
		if (streams[index]) saveAudioPref(item, streams[index].Index, streams.map(fromServerStream));
		closeModal();
	}, [closeModal, setSelectedAudioIndex, pickedStreams, item]);

	const handleSelectSubtitle = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		subtitleChosenRef.current = true;
		setSelectedSubtitleIndex(index);
		const streams = pickedStreams('Subtitle');
		saveSubtitlePref(item, streams[index] ? streams[index].Index : -1, streams.map(fromServerStream));
		closeModal();
	}, [closeModal, setSelectedSubtitleIndex, pickedStreams, item]);

	const handleOpenRemoteSubtitleSearch = useCallback(async () => {
		if (!item?.Id) return;
		setRemoteSubtitleResults([]);
		setIsSearchingRemoteSubtitles(true);
		setRemoteSubtitleError(null);
		openModal('subtitleDownload');
		try {
			const ms = item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0];
			const subs = ms?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const audios = ms?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const currentSub = selectedSubtitleIndex >= 0 ? subs[selectedSubtitleIndex] : null;
			const currentAudio = audios[selectedAudioIndex];
			const languages = subtitleDownloadLanguages(
				settings.subtitleDownloadLanguages,
				toSubtitleLanguage(currentSub?.Language, currentAudio?.Language, subs[0]?.Language)
			);
			const results = await searchRemoteSubtitlesIn(effectiveApi, item.Id, languages);
			setRemoteSubtitleResults(mapRemoteSubtitleOptions(results));
		} catch (err) {
			setRemoteSubtitleResults([]);
			setRemoteSubtitleError(remoteSubtitleSearchError(err));
		} finally {
			setIsSearchingRemoteSubtitles(false);
		}
	}, [item, selectedVersionIndex, selectedSubtitleIndex, selectedAudioIndex, effectiveApi, openModal, settings.subtitleDownloadLanguages]);

	const handleSelectRemoteSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index) || !remoteSubtitleResults[index] || !item?.Id) return;
		const oldSubs = (item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0])?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
		const oldIndexes = new Set(oldSubs.map(s => s.Index));
		setIsDownloadingRemoteSubtitle(true);
		setRemoteSubtitleError(null);
		try {
			await effectiveApi.downloadRemoteSubtitle(item.Id, remoteSubtitleResults[index].id);

			// The file is saved before the metadata refresh that lists it, so the
			// track is only there some time after this call comes back.
			const appeared = await pollForSubtitleAppearance(async () => {
				const refreshed = await effectiveApi.getItemMediaInfo(item.Id);
				const ms = refreshed?.MediaSources?.[selectedVersionIndex] || refreshed?.MediaSources?.[0];
				const subs = ms?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
				const position = subs.findIndex(s => !oldIndexes.has(s.Index));
				return position >= 0 ? {position} : null;
			});

			if (!appeared) {
				setRemoteSubtitleError(remoteSubtitleNotAppearedMessage());
				return;
			}

			subtitleChosenRef.current = true;
			setSelectedSubtitleIndex(appeared.position);
			setItem(tagWithServerInfo(await effectiveApi.getItem(item.Id)));
			closeModal();
		} catch (err) {
			setRemoteSubtitleError(remoteSubtitleDownloadError(err));
		} finally {
			setIsDownloadingRemoteSubtitle(false);
		}
	}, [remoteSubtitleResults, item, effectiveApi, selectedVersionIndex, closeModal, tagWithServerInfo, setItem, setSelectedSubtitleIndex]);

	const handleSelectVersion = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index) || !item?.MediaSources?.[index]) return;
		// The version already on screen keeps the tracks picked for it.
		if (index === selectedVersionIndex) {
			closeModal();
			return;
		}
		setSelectedVersionIndex(index);
		const ms = item.MediaSources[index];
		const versionAudioStreams = ms.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		if (ms.DefaultAudioStreamIndex != null) {
			const idx = versionAudioStreams.findIndex(s => s.Index === ms.DefaultAudioStreamIndex);
			setSelectedAudioIndex(idx >= 0 ? idx : 0);
		} else {
			setSelectedAudioIndex(0);
		}
		// A different version brings its own tracks, so whatever was picked for the old
		// one no longer stands. The subtitle effect above works out the new one.
		subtitleChosenRef.current = false;
		audioChosenRef.current = false;
		closeModal();
	}, [item, selectedVersionIndex, closeModal, setSelectedVersionIndex, setSelectedAudioIndex]);

	const handleSeasonSelect = useCallback((ev) => {
		const seasonId = ev.currentTarget.dataset.seasonId;
		const season = seasons.find(s => s.Id === seasonId);
		if (season) {
			onSelectItem?.(season);
		}
	}, [seasons, onSelectItem]);

	const handleEpisodeSelect = useCallback((ev) => {
		const episodeId = ev.currentTarget.dataset.episodeId;
		const episode = episodes.find(ep => ep.Id === episodeId);
		if (episode) {
			openOrPlay(episode);
		}
	}, [episodes, openOrPlay]);

	// Nouveau's episode cards play from the artwork and open from the block beneath it, so playing
	// one needs its own way in rather than the Play button, which belongs to the item on screen.
	const handleEpisodePlay = useCallback((episode) => {
		if (episode) onPlay?.(episode, false);
	}, [onPlay]);

	const handleChapterSelect = useCallback((ev) => {
		if (!item) return;
		const startTicks = Number(ev.currentTarget.dataset.startTicks);
		onPlay?.(item, false, {startPositionTicks: startTicks});
	}, [item, onPlay]);

	const handleExtraSelect = useCallback((ev) => {
		const extraId = ev.currentTarget.dataset.extraId;
		const extra = extras.find(e => e.Id === extraId);
		if (extra) onPlay?.(extra, false, {});
	}, [extras, onPlay]);

	// A track row's press: an album's songs, a playlist from that row on, or a collection's
	// play order.
	const playTrack = useCallback((track, tracksOverride) => {
		const list = tracksOverride || (item.Type === 'MusicAlbum' ? albumTracks : playlistItems);
		playListFrom(list, track);
	}, [item, albumTracks, playlistItems, playListFrom]);

	const handleTrackPlay = useCallback((ev) => {
		const trackId = ev.currentTarget.dataset.trackId;
		const track = albumTracks.find(t => t.Id === trackId);
		if (track) playTrack(track);
	}, [albumTracks, playTrack]);

	const handleArtistPlay = useCallback(async () => {
		if (!item || item.Type !== 'MusicArtist') return;
		try {
			const tracksData = await effectiveApi.getArtistItems(item.Id, 200);
			const tracks = tracksData.Items || [];
			if (tracks.length > 0) {
				onPlay?.(tracks[0], false, {audioPlaylist: tracks});
			}
		} catch {
			if (artistAlbums.length > 0) {
				onSelectItem?.(artistAlbums[0]);
			}
		}
	}, [item, effectiveApi, artistAlbums, onPlay, onSelectItem]);

	const handleArtistShuffle = useCallback(async () => {
		if (!item || item.Type !== 'MusicArtist') return;
		try {
			const tracksData = await effectiveApi.getArtistItems(item.Id, 200);
			const tracks = tracksData.Items || [];
			if (tracks.length > 0) {
				const shuffled = shuffleArray(tracks);
				onPlay?.(shuffled[0], false, {audioPlaylist: shuffled});
			}
		} catch { /* ignore */ }
	}, [item, effectiveApi, onPlay]);

	// A Seerr row card is a title rather than a library item, so it goes back through the Seerr
	// side of the app with the identity the card was built from.
	const handleSelectSeerrCard = useCallback((card) => {
		if (card?._seerrRaw) seerrNav?.onSelectItem?.(card._seerrRaw);
	}, [seerrNav]);

	const openPerson = useCallback((person) => {
		const route = personRouteFor(person, seerrOnly);
		if (!route) return;
		if (route.seerr) seerrNav?.onSelectPerson?.(route.id, route.name);
		else onSelectPerson?.({Id: route.id});
	}, [onSelectPerson, seerrOnly, seerrNav]);

	const handleCastSelect = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		if (!personId) return;
		openPerson(item?.People?.find((p) => p.Id === personId) || {Id: personId});
	}, [openPerson, item]);

	// Opening the row's item moved into the long press menu, so a press plays from that row.
	const handlePlaylistItemSelect = useCallback((ev, trackOverride, listOverride) => {
		const targetId = ev?.currentTarget?.dataset?.playlistItemId;
		const list = listOverride || playlistItems;
		const plItem = trackOverride || list.find(t => t.Id === targetId);
		if (plItem) playTrack(plItem, list);
	}, [playlistItems, playTrack]);

	const handlePlaylistShuffle = useCallback((tracksOverride) => {
		// The shared Shuffle button calls this with its click event rather than a list.
		const tracks = Array.isArray(tracksOverride) ? tracksOverride : playlistItems;
		if (tracks.length < 2) return;
		const shuffled = shuffleArray(tracks);
		playListFrom(shuffled, shuffled[0]);
	}, [playlistItems, playListFrom]);

	const handlePlaylistItemReorder = useCallback(async (itemIndex, direction) => {
		const newIndex = itemIndex + direction;
		if (newIndex < 0 || newIndex >= playlistItems.length) return;

		const movingItem = playlistItems[itemIndex];

		const newItems = [...playlistItems];
		newItems.splice(itemIndex, 1);
		newItems.splice(newIndex, 0, movingItem);
		setPlaylistItems(newItems);

		window.requestAnimationFrame(() => {
			const listEl = document.querySelector(`.${css.playlistItemsList}`);
			if (listEl) {
				const items = listEl.querySelectorAll('.spottable');
				if (items[newIndex]) {
					Spotlight.focus(items[newIndex]);
				}
			}
		});

		try {
			await effectiveApi.movePlaylistItem(item.Id, movingItem.PlaylistItemId, newIndex);
		} catch {
			const revertItems = [...newItems];
			revertItems.splice(newIndex, 1);
			revertItems.splice(itemIndex, 0, movingItem);
			setPlaylistItems(revertItems);
		}
	}, [playlistItems, effectiveApi, item, setPlaylistItems]);

	const handleRemoveFromPlaylist = useCallback(async (entryId) => {
		if (!entryId || !item) return;
		const prevItems = [...playlistItems];
		// The focused row is about to go, so its neighbour takes the focus.
		const row = document.activeElement;
		const neighbour = row?.nextElementSibling || row?.previousElementSibling;
		setPlaylistItems(prev => prev.filter(p => p.PlaylistItemId !== entryId));
		window.requestAnimationFrame(() => {
			if (neighbour && !document.body.contains(row)) Spotlight.focus(neighbour);
		});
		try {
			await effectiveApi.removeFromPlaylist(item.Id, [entryId]);
			showToast($L('Removed from playlist'));
		} catch {
			setPlaylistItems(prevItems);
		}
	}, [playlistItems, effectiveApi, item, showToast, setPlaylistItems]);

	const handlePlaylistItemKeyDown = useCallback((ev) => {
		const currentSpottable = ev.target.closest('.spottable');
		if (!currentSpottable) return;
		const itemIndex = parseInt(currentSpottable.dataset.playlistIndex, 10);
		if (isNaN(itemIndex)) return;

		if (ev.keyCode === KEYS.LEFT) {
			if (itemIndex > 0) {
				ev.preventDefault();
				ev.stopPropagation();
				handlePlaylistItemReorder(itemIndex, -1);
			}
		} else if (ev.keyCode === KEYS.RIGHT) {
			if (itemIndex < playlistItems.length - 1) {
				ev.preventDefault();
				ev.stopPropagation();
				handlePlaylistItemReorder(itemIndex, 1);
			}
		} else if (ev.keyCode === 46 || ev.keyCode === 403) {
			ev.preventDefault();
			ev.stopPropagation();
			const plItem = playlistItems[itemIndex];
			if (plItem?.PlaylistItemId) {
				handleRemoveFromPlaylist(plItem.PlaylistItemId);
			}
		}
	}, [handlePlaylistItemReorder, handleRemoveFromPlaylist, playlistItems]);

	const closeDeleteDialog = modals.handleCloseDeleteDialog;
	const handleConfirmDelete = useCallback(async () => {
		try {
			await effectiveApi.deleteItem(item.Id);
			closeDeleteDialog();
			onItemDeleted?.();
		} catch {
			closeDeleteDialog();
			setToastMessage($L('Failed to delete item'));
		}
	}, [effectiveApi, item?.Id, onItemDeleted, closeDeleteDialog]);

	const handleButtonRowFocus = useCallback(() => {
		if (pageScrollToRef.current) {
			pageScrollToRef.current({position: {y: 0}, animate: true});
		} else if (pageScrollerRef.current && pageScrollerRef.current.scrollTo) {
			pageScrollerRef.current.scrollTo({position: {y: 0}, animate: true});
		}
	}, []);

	const handlePageScrollTo = useCallback((fn) => {
		pageScrollToRef.current = fn;
	}, []);

	// A card on a collection's own page can be taken out of that collection from its menu.
	const collectionMenu = useMemo(() => (item?.Type === 'BoxSet' ? {
		collectionRemoval: {collectionName: item.Name || '', remove: removeFromCollection}
	} : null), [item?.Type, item?.Name, removeFromCollection]);

	// Reordering needs an entry id per track, which only a real playlist carries.
	const canManagePlaylist = item?.Type === 'Playlist' && playlistItems.length > 0 &&
		playlistItems.every((track) => track.PlaylistItemId);

	// What the long press menu on a playlist row can do. The same title can sit in a playlist
	// twice, so a row is found by its entry id when it has one.
	const playlistMenu = useMemo(() => {
		// A collection's rows can move in its play order, which switches it to the custom order,
		// but they can't leave the collection from here.
		if (item?.Type === 'BoxSet') {
			if (!playlistItems.length) return null;
			const at = (entry) => playlistItems.findIndex((candidate) => candidate.Id === entry.Id);
			return {
				playlist: {
					canManage: true,
					canRemove: false,
					positionOf: (entry) => ({first: at(entry) <= 0, last: at(entry) >= playlistItems.length - 1}),
					play: playTrack,
					move: (entry, direction) => handleCollectionMove(at(entry), direction)
				}
			};
		}
		if (item?.Type !== 'Playlist') return null;
		const indexOf = (entry) => playlistItems.findIndex((candidate) => (entry.PlaylistItemId
			? candidate.PlaylistItemId === entry.PlaylistItemId
			: candidate.Id === entry.Id));
		return {
			playlist: {
				canManage: canManagePlaylist,
				positionOf: (entry) => {
					const at = indexOf(entry);
					return {first: at <= 0, last: at >= playlistItems.length - 1};
				},
				play: playTrack,
				remove: (entry) => handleRemoveFromPlaylist(entry.PlaylistItemId),
				move: (entry, direction) => handlePlaylistItemReorder(indexOf(entry), direction)
			}
		};
	}, [item?.Type, playlistItems, canManagePlaylist, playTrack, handleRemoveFromPlaylist, handlePlaylistItemReorder, handleCollectionMove]);

	// No artwork, name or retry on purpose, since a retry would read as an invitation.
	if (!seerrOnly && blockedByRating) {
		return (
			<div className={css.page}>
				<div className={css.blocked}>
					<svg className={css.blockedIcon} viewBox='0 -960 960 960' fill='currentColor' aria-hidden='true' focusable='false'>
						<path d={MATERIAL_ICON_PATHS.lock} />
					</svg>
					<div className={css.blockedText}>{$L("This isn't available")}</div>
				</div>
			</div>
		);
	}

	if (isLoading || !item) {
		return (
			<div className={css.page}>
				<DetailSkeleton detailStyle={settings.detailScreenStyle} sidebar={settings.navbarPosition === 'left'} />
			</div>
		);
	}

	const backdropId = getBackdropId(item);
	// Seerr artwork already arrives as a finished url, since it lives on TMDB rather than here.
	const backdropUrl = item._externalBackdropUrl ||
		(backdropId ? getImageUrl(effectiveServerUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 90}) : null);

	const isEpisode = item.Type === 'Episode';
	const isSeries = item.Type === 'Series';
	const isSeason = item.Type === 'Season';
	const isPerson = item.Type === 'Person';
	const isAlbum = item.Type === 'MusicAlbum';
	const isMusicArtist = item.Type === 'MusicArtist';
	const isPlaylist = item.Type === 'Playlist';
	const isAudioTrack = item.Type === 'Audio';
	const isBook = item.Type === 'Book';
	const isReadableBook = isBook && !!bookReader(item);
	// Plex has no personal ratings, since its one rating stands in for favorites.
	const isRatable = isRatableItemType(item.Type) && (item._serverType || jellyfinApi.getServerType()) !== 'plex';
	const ratingStyle = normalizeRatingStyle(settings.personalRatingStyle);

	// A series keeps the button with nothing counted against it, since a trailer sitting in a
	// season folder belongs to that season rather than the series it came from. A movie or show
	// on a server that keeps no trailer links has YouTube searched for one.
	const searchesTrailer = (item.Type === 'Movie' || isSeries) && searchesForTrailer(item, jellyfinApi.getServerType());
	const hasTrailer = seerrOnly
		? item.RemoteTrailers?.length > 0
		: (item.LocalTrailerCount > 0 || item.RemoteTrailers?.length > 0 || isSeries || searchesTrailer);

	// Collections only hold video content, so the action is hidden on people,
	// music and playlists rather than offering a call the server would reject.
	const canAddToCollection = COLLECTION_ITEM_TYPES.includes(item.Type);

	let posterUrl = item._externalPosterUrl || null;
	if (!posterUrl) {
		if (isEpisode) {
			// The classic layout is the only one that offers this, so the modern one
			// keeps the episode's own still whatever the setting says.
			const seriesPoster = settings.detailUseSeriesThumbnails && settings.detailScreenStyle === 'v1'
				? seriesThumbUrl(effectiveServerUrl, item, {maxWidth: 500, quality: 90})
				: null;
			if (seriesPoster) {
				posterUrl = seriesPoster;
			} else if (item.ImageTags?.Thumb) {
				posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Thumb', {maxWidth: 500, quality: 90});
			} else if (item.ImageTags?.Primary) {
				posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxWidth: 500, quality: 90});
			}
		} else if (item.ImageTags?.Primary) {
			posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxHeight: 600, quality: 90});
		}
	}

	const year = item.ProductionYear || '';
	const runtime = item.RunTimeTicks ? formatDuration(item.RunTimeTicks) : '';
	const endsAt = formatPlaybackEndsAt(item.RunTimeTicks / 10000000, settings.clockDisplay, settings.timeOffsetHours);
	const officialRating = item.OfficialRating || '';
	const seasonCount = item.ChildCount || seasons.length || 0;
	const sidebarDocked = settings.navbarPosition === 'left';

	const mediaSource = item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0];
	// Both halves of the technical row are gated here, so neither screen has to
	// know the setting. A container is left without a size, since its own is the
	// sum of its children.
	const showTech = Boolean(settings.detailShowTechnicalDetails);
	const techBadges = showTech ? getMediaBadges(item, selectedVersionIndex) : [];
	const techSize = showTech && item.Type !== 'Series' && item.Type !== 'Season'
		? formatFileSize(mediaSource?.Size)
		: null;
	const audioStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	const subtitleStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
	const supportsMediaSourceSelection = item.MediaType === 'Video' &&
		item.MediaSources?.length > 0 &&
		item.MediaSources[0].Type !== 'Placeholder';
	const hasMultipleVersions = supportsMediaSourceSelection && (item.MediaSources?.length || 0) > 1;
	const hasMultipleAudio = supportsMediaSourceSelection && audioStreams.length > 1;
	const currentAudioStream = audioStreams[selectedAudioIndex];
	const currentSubtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreams[selectedSubtitleIndex] : null;

	const genres = item.Genres || [];
	const tagline = showsSection('tagline') ? item.Taglines?.[0] : undefined;

	const shownNextUp = showsSection('upNext') ? nextUp : [];
	const shownNextEpisode = showsSection('upNext') ? nextEpisode : null;
	const shownExtras = showsSection('extras') ? extras : [];
	// A person's filmography travels in `similar`, so only the real similar rows go.
	const showsSimilar = isPerson || showsSection('moreLikeThis');
	const shownSimilar = showsSimilar ? similar : [];
	// A hidden row never holds a loading slot open.
	const shownSimilarLoaded = showsSimilar ? similarLoaded : true;
	const shownParentCollections = showsSection('collections') ? parentCollections : [];
	// A collection's playlist order, not a playlist's own tracks.
	const shownPlaylistItems = isBoxSet && !showsSection('playlistOrder') ? [] : playlistItems;

	const hasPlaybackPosition = item.UserData?.PlaybackPositionTicks > 0;
	const resumeTimeText = hasPlaybackPosition ? formatDuration(item.UserData.PlaybackPositionTicks) : '';

	const showsMissingTitles = settings.seerrShowMissingCollectionItems !== false;
	// Modern and Classic list each collection led by the collection itself, so there's a way into
	// it, with its missing titles merged in.
	const collectionSections = shownParentCollections.map((collection) => ({
		id: collection.id,
		name: collection.name,
		items: [
			collection.boxSetItem,
			...(showsMissingTitles ? mergeCollectionWithMissing(collection.items || [], collection.missingItems) : (collection.items || []))
		].filter(Boolean)
	}));
	// A collection's own page slots its missing titles in by release date in every style.
	const shownCollectionItems = isBoxSet && showsMissingTitles
		? mergeMissingByReleaseOrder(collectionItems, missingCollectionItems)
		: collectionItems;

	const filmography = isPerson ? splitFilmography(similar, showsSection, settings.personPageSortOption) : null;
	const personMovies = filmography?.movies || [];
	const personSeries = filmography?.series || [];
	const personDates = isPerson ? personDateLines(item.PremiereDate, item.EndDate) : [];
	const birthDate = isPerson ? personCalendarDate(item.PremiereDate) : null;
	const birthPlace = isPerson && showsSection('birthplace') && item.ProductionLocations?.length > 0 ? item.ProductionLocations[0] : '';

	const backdrop = (
		<DetailBackdrop backdropUrl={settings.detailsBackdropEnabled !== false ? backdropUrl : null} isPerson={isPerson} blur={settings.backdropBlurDetail} />
	);

	const trailerLayer = (
		<>
			<TrailerPicker
				choices={trailer.trailerChoices}
				item={item}
				serverUrl={effectiveServerUrl}
				onPick={trailer.pickTrailer}
				onClose={trailer.closeTrailerChoices}
			/>
			<TrailerOverlay
				videoId={trailer.trailerOverlay}
				streamUrl={trailer.trailerStreamUrl}
				videoRef={trailer.trailerVideoRef}
				onClose={trailer.handleCloseTrailer}
			/>
		</>
	);

	const overlays = (
		<>
			<DetailTrackModals
				activeModal={activeModal}
				onCloseModal={closeModal}
				item={item}
				audioStreams={audioStreams}
				subtitleStreams={subtitleStreams}
				selectedVersionIndex={selectedVersionIndex}
				selectedAudioIndex={selectedAudioIndex}
				selectedSubtitleIndex={selectedSubtitleIndex}
				preferExternalSubtitles={settings.preferExternalSubtitles === true}
				onSelectTranscodeQuality={handleSelectTranscodeQuality}
				onSelectVersion={handleSelectVersion}
				onSelectAudio={handleSelectAudio}
				onSelectSubtitle={handleSelectSubtitle}
				onOpenRemoteSubtitleSearch={handleOpenRemoteSubtitleSearch}
				isSearchingRemoteSubtitles={isSearchingRemoteSubtitles}
				isDownloadingRemoteSubtitle={isDownloadingRemoteSubtitle}
				remoteSubtitleError={remoteSubtitleError}
				remoteSubtitleResults={remoteSubtitleResults}
				onSelectRemoteSubtitle={handleSelectRemoteSubtitle}
			/>
			{trailerLayer}
			<DetailDialogs
				item={item}
				api={effectiveApi}
				serverUrl={effectiveServerUrl}
				modals={modals}
				onItemRefreshed={refreshItem}
				onConfirmDelete={handleConfirmDelete}
				onToast={showToast}
				toastMessage={toastMessage}
				onToastEnd={handleToastEnd}
			/>
			<PersonalRatingDialog
				open={modals.showRatingDialog}
				style={ratingStyle}
				userData={item.UserData}
				onSetThumbRating={handleSetThumbRating}
				onSetNumericRating={handleSetNumericRating}
				onClearRating={handleClearRating}
				onClose={modals.handleCloseRatingDialog}
			/>
			<SeerrDialogs seerr={seerr} title={item.Name} />
			<ReviewDialog review={reviews.openReview} onClose={reviews.handleCloseReview} />
		</>
	);

	if (settings.detailScreenStyle !== 'v1') {
		// Spotlight, Minimalist and Nouveau have no track list, so a playlist always gets Modern's.
		const DetailContent = (item.Type !== 'Playlist' && DETAIL_CONTENT[settings.detailScreenStyle]) || ModernDetailContent;
		return (
			<div className={css.page}>
				<DetailContent
					inSyncPlayGroup={isSyncPlayInGroup}
					onWatchWithGroup={handlePlay}
					key={item.Id}
					item={item}
					settings={settings}
					showsSection={showsSection}
					seerr={seerr}
					seerrNav={seerrNav}
					seerrOnly={seerrOnly}
					onSelectSeerrCard={handleSelectSeerrCard}
					canChangeArtwork={canChangeArtwork}
					handleOpenArtworkModal={modals.handleOpenArtworkModal}
					effectiveApi={effectiveApi}
					serverToken={initialItem?._serverAccessToken || jellyfinApi.getApiKey()}
					effectiveServerUrl={effectiveServerUrl}
					isEpisode={isEpisode}
					isSeries={isSeries}
					isSeason={isSeason}
					isPerson={isPerson}
					isBoxSet={isBoxSet}
					isAlbum={isAlbum}
					isMusicArtist={isMusicArtist}
					isPlaylist={isPlaylist}
					isBook={isBook}
					isReadableBook={isReadableBook}
					backdropUrl={backdropUrl}
					posterUrl={posterUrl}
					logoUrl={logoUrl}
					onLogoError={handleLogoError}
					year={year}
					runtime={runtime}
					endsAt={endsAt}
					officialRating={officialRating}
					seasonCount={seasonCount}
					genres={genres}
					techBadges={techBadges}
					techSize={techSize}
					overviewBackRef={overviewBackRef}
					tagline={tagline}
					hasPlaybackPosition={hasPlaybackPosition}
					resumeTimeText={resumeTimeText}
					seasons={seasons}
					episodes={episodes}
					seriesEpisodes={seriesEpisodes}
					similar={shownSimilar}
					extras={shownExtras}
					cast={detailCast}
					crew={detailCrew}
					nextUp={shownNextUp}
					collectionItems={shownCollectionItems}
					collectionSections={collectionSections}
					albumTracks={albumTracks}
					artistAlbums={artistAlbums}
					playlistItems={shownPlaylistItems}
					collectionOrder={collectionOrder}
					personMovies={personMovies}
					personSeries={personSeries}
					birthDate={birthDate}
					birthPlace={birthPlace}
					episodeRatings={episodeRatings}
					mediaSource={mediaSource}
					selectedAudioIndex={selectedAudioIndex}
					selectedSubtitleIndex={selectedSubtitleIndex}
					supportsMediaSourceSelection={supportsMediaSourceSelection}
					hasMultipleVersions={hasMultipleVersions}
					hasMultipleAudio={hasMultipleAudio}
					handlePlay={handlePlay}
					handleResume={handleResume}
					handleShuffle={isPlaylist ? handlePlaylistShuffle : handleShuffle}
					hasTrailer={hasTrailer}
					handleTrailer={trailer.handleTrailer}
					handleToggleWatched={handleToggleWatched}
					handleToggleFavorite={handleToggleFavorite}
					showsPersonalRating={isRatable}
					personalRatingStyle={ratingStyle}
					handleOpenRatingDialog={modals.handleOpenRatingDialog}
					handleGoToSeries={handleGoToSeries}
					handleOpenVersionModal={modals.handleOpenVersionModal}
					handleOpenAudioModal={modals.handleOpenAudioModal}
					handleOpenSubtitleModal={modals.handleOpenSubtitleModal}
					handleOpenPlaylistModal={modals.handleOpenPlaylistModal}
					handleOpenCollectionModal={canAddToCollection ? modals.handleOpenCollectionModal : null}
					handleOpenIdentifyModal={canIdentify ? modals.handleOpenIdentifyModal : null}
					handleOpenDeleteDialog={modals.handleOpenDeleteDialog}
					handleChapterSelect={handleChapterSelect}
					handleEpisodePlay={handleEpisodePlay}
					handleExtraSelect={handleExtraSelect}
					playTrack={playTrack}
					playlistMenu={playlistMenu}
					onSelectItem={openOrPlay}
					onSelectPerson={openPerson}
					onSelectStudio={onSelectStudio}
					similarSource={similarSource}
					similarLoaded={shownSimilarLoaded}
					reviews={reviews.reviews}
					onSelectReview={reviews.handleSelectReview}
					missingCollectionItems={NO_ITEMS}
					parentCollections={shownParentCollections}
					loadMoreCollectionItems={loadMoreCollectionItems}
					collectionMenu={collectionMenu}
					filmography={filmography}
					canManagePlaylist={canManagePlaylist}
					spotlightBackRef={spotlightBackRef}
					onReorderPlaylistItem={handlePlaylistItemReorder}
					onRemovePlaylistItem={handleRemoveFromPlaylist}
				/>
				{overlays}
			</div>
		);
	}

	if (isPerson) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked}>
				<PersonScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					showsSection={showsSection}
					filmography={filmography}
					personDates={personDates}
					birthPlace={birthPlace}
					onSelectItem={onSelectItem}
					onSelectSeerrItem={seerrNav?.onSelectItem}
				/>
			</DetailScrollPage>
		);
	}

	if (isPlaylist) {
		const toast = toastMessage
			? <div className={css.toast} onAnimationEnd={handleToastEnd}>{toastMessage}</div>
			: null;
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked} footer={toast}>
				<PlaylistScreen
					item={item}
					serverUrl={effectiveServerUrl}
					showsSection={showsSection}
					posterUrl={posterUrl}
					genres={genres}
					playlistItems={playlistItems}
					onPlay={handlePlay}
					onShuffle={handlePlaylistShuffle}
					onToggleFavorite={handleToggleFavorite}
					onItemSelect={handlePlaylistItemSelect}
					playlistMenu={playlistMenu}
					onItemKeyDown={handlePlaylistItemKeyDown}
					onFocusRow={handleButtonRowFocus}
					spotlightBackRef={spotlightBackRef}
				/>
			</DetailScrollPage>
		);
	}

	if (isAlbum) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked}>
				<AlbumScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					showsSection={showsSection}
					posterUrl={posterUrl}
					year={year}
					genres={genres}
					albumTracks={albumTracks}
					similar={shownSimilar}
					onPlay={handlePlay}
					onShuffle={handleShuffle}
					onToggleFavorite={handleToggleFavorite}
					onTrackPlay={handleTrackPlay}
					onSelectItem={onSelectItem}
					onFocusRow={handleButtonRowFocus}
				/>
			</DetailScrollPage>
		);
	}

	if (isMusicArtist) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked}>
				<ArtistScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					artistAlbums={artistAlbums}
					similar={shownSimilar}
					onPlay={handleArtistPlay}
					onShuffle={handleArtistShuffle}
					onToggleFavorite={handleToggleFavorite}
					onSelectItem={onSelectItem}
					onFocusRow={handleButtonRowFocus}
				/>
			</DetailScrollPage>
		);
	}

	if (isAudioTrack) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked}>
				<AudioTrackScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					showsSection={showsSection}
					posterUrl={posterUrl}
					year={year}
					runtime={runtime}
					onPlay={handlePlay}
					onToggleFavorite={handleToggleFavorite}
					onFocusRow={handleButtonRowFocus}
				/>
			</DetailScrollPage>
		);
	}

	const actionButtons = (
		<DetailActionButtons
			item={item}
			settings={settings}
			seerr={seerr}
			seerrOnly={seerrOnly}
			searchesTrailer={searchesTrailer}
			isSeries={isSeries}
			isSeason={isSeason}
			isBoxSet={isBoxSet}
			isEpisode={isEpisode}
			isBook={isBook}
			isReadableBook={isReadableBook}
			hasPlaybackPosition={hasPlaybackPosition}
			resumeTimeText={resumeTimeText}
			inSyncPlayGroup={isSyncPlayInGroup}
			onWatchWithGroup={handlePlay}
			mediaSource={mediaSource}
			supportsMediaSourceSelection={supportsMediaSourceSelection}
			hasMultipleVersions={hasMultipleVersions}
			hasMultipleAudio={hasMultipleAudio}
			selectedVersionIndex={selectedVersionIndex}
			selectedAudioIndex={selectedAudioIndex}
			selectedSubtitleIndex={selectedSubtitleIndex}
			currentAudioStream={currentAudioStream}
			currentSubtitleStream={currentSubtitleStream}
			canAddToCollection={canAddToCollection}
			canIdentify={canIdentify}
			playLongPress={playLongPress}
			resumeLongPress={resumeLongPress}
			onFocusRow={handleButtonRowFocus}
			onShuffle={handleShuffle}
			onOpenVersionModal={modals.handleOpenVersionModal}
			onOpenAudioModal={modals.handleOpenAudioModal}
			onOpenSubtitleModal={modals.handleOpenSubtitleModal}
			onTrailer={trailer.handleTrailer}
			onToggleWatched={handleToggleWatched}
			onToggleFavorite={handleToggleFavorite}
			showsPersonalRating={isRatable}
			personalRatingStyle={ratingStyle}
			onOpenRatingDialog={modals.handleOpenRatingDialog}
			onGoToSeries={handleGoToSeries}
			onOpenPlaylistModal={modals.handleOpenPlaylistModal}
			onOpenCollectionModal={modals.handleOpenCollectionModal}
			onOpenDeleteDialog={modals.handleOpenDeleteDialog}
			onOpenIdentifyModal={modals.handleOpenIdentifyModal}
		/>
	);

	if (isSeason) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked} footer={overlays}>
				<SeasonScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					showsSection={showsSection}
					posterUrl={posterUrl}
					episodes={episodes}
					episodeRatings={episodeRatings}
					actionButtons={actionButtons}
					onEpisodeSelect={handleEpisodeSelect}
				/>
			</DetailScrollPage>
		);
	}

	return (
		<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked} footer={overlays}>
			<ClassicDetailScreen
				item={item}
				collectionMenu={collectionMenu}
				serverUrl={effectiveServerUrl}
				serverToken={initialItem?._serverAccessToken || jellyfinApi.getApiKey()}
				settings={settings}
				showsSection={showsSection}
				isEpisode={isEpisode}
				isSeries={isSeries}
				isBoxSet={isBoxSet}
				logoUrl={logoUrl}
				logoFailed={logoFailed}
				onLogoError={handleLogoError}
				posterUrl={posterUrl}
				year={year}
				runtime={runtime}
				endsAt={endsAt}
				officialRating={officialRating}
				seasonCount={seasonCount}
				genres={genres}
				techBadges={techBadges}
				techSize={techSize}
				overviewBackRef={overviewBackRef}
				tagline={tagline}
				actionButtons={actionButtons}
				seerr={seerr}
				seerrNav={seerrNav}
				onSelectSeerrCard={handleSelectSeerrCard}
				seasons={seasons}
				episodes={episodes}
				episodeRatings={episodeRatings}
				nextUp={shownNextUp}
				nextEpisode={shownNextEpisode}
				collectionItems={shownCollectionItems}
				extras={shownExtras}
				cast={detailCast}
				crew={detailCrew}
				collectionSections={collectionSections}
				similar={shownSimilar}
				reviews={reviews.reviews}
				onSelectReview={reviews.handleSelectReview}
				onSeasonSelect={handleSeasonSelect}
				onEpisodeSelect={handleEpisodeSelect}
				onChapterSelect={handleChapterSelect}
				onExtraSelect={handleExtraSelect}
				onCastSelect={handleCastSelect}
				onSelectItem={openOrPlay}
			/>
		</DetailScrollPage>
	);
};

export default Details;
