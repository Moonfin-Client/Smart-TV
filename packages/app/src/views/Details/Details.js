import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import ModernDetailContent from './ModernDetailContent';
import {formatDuration, getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {fetchPrerolls} from '../../utils/cinemaMode';
import {toSubtitleLanguage, mapRemoteSubtitleOptions} from '../Player/remoteSubtitleUtils';
import useLongPress from '../../utils/longPress';
import {formatPlaybackEndsAt} from '../../utils/playbackTimeLabels';

import {isSeerrOnlyItem} from '../../utils/seerrTarget';
import {buildSeerrDetailItem} from '../../utils/seerrDetailItem';
import {COLLECTION_ITEM_TYPES, IDENTIFIABLE_TYPES, getMediaBadges, seriesThumbUrl, shuffleArray, splitCastAndCrew} from './detailsMedia';
import useDetailsItem from './useDetailsItem';
import useDetailsModals from './useDetailsModals';
import useDetailsTrailer from './useDetailsTrailer';
import useSeerrOverlay from './useSeerrOverlay';
import DetailScrollPage from './DetailScrollPage';
import DetailBackdrop from './DetailBackdrop';
import DetailActionButtons from './DetailActionButtons';
import DetailTrackModals from './DetailTrackModals';
import DetailDialogs from './DetailDialogs';
import SeerrDialogs from './SeerrDialogs';
import TrailerOverlay from './TrailerOverlay';
import PersonalRatingDialog from '../../components/PersonalRatingDialog';
import {clampRating, clearedRatingPatch, isRatableItemType, normalizeRatingStyle, numericRatingPatch, thumbRatingPatch} from '../../utils/personalRating';
import ClassicDetailScreen from './ClassicDetailScreen';
import PersonScreen from './PersonScreen';
import SeasonScreen from './SeasonScreen';
import PlaylistScreen from './PlaylistScreen';
import AlbumScreen from './AlbumScreen';
import ArtistScreen from './ArtistScreen';
import AudioTrackScreen from './AudioTrackScreen';

import css from './Details.module.less';

const Details = ({itemId, initialItem, onPlay, onSelectItem, onSelectPerson, onSelectStudio, onItemDeleted, seerrNav, backHandlerRef}) => {
	const {api, serverUrl, user} = useAuth();
	const {settings} = useSettings();
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
	const [toastMessage, setToastMessage] = useState(null);
	const [logoFailed, setLogoFailed] = useState(false);
	const ratingSaveRef = useRef(false);

	const handleLogoError = useCallback(() => setLogoFailed(true), []);
	const handleToastEnd = useCallback(() => setToastMessage(null), []);
	const showToast = useCallback((msg) => setToastMessage(msg), []);

	const pageScrollerRef = useRef(null);
	const pageScrollToRef = useRef(null);

	// A new item brings its own artwork, so a logo that failed for the last one must not
	// keep its title hidden behind the fallback.
	useEffect(() => setLogoFailed(false), [itemId]);

	// Seerr supplies the whole screen for a title the library doesn't have.
	const seerrOnly = isSeerrOnlyItem(initialItem);

	const data = useDetailsItem({
		itemId,
		initialItem,
		effectiveApi,
		effectiveServerUrl,
		settings,
		tagWithServerInfo,
		skip: seerrOnly
	});
	const {
		setItem, isLoading: libraryLoading, isSeed, seasons, episodes, similar, extras, cast, nextUp, nextEpisode,
		collectionItems, parentCollection, parentCollectionName, albumTracks, artistAlbums,
		playlistItems, setPlaylistItems, episodeRatings, refreshItem,
		selectedVersionIndex, setSelectedVersionIndex,
		selectedAudioIndex, setSelectedAudioIndex,
		selectedSubtitleIndex, setSelectedSubtitleIndex
	} = data;

	const seerr = useSeerrOverlay({item: seerrOnly ? initialItem : data.item, seerrOnly});

	const seerrItem = useMemo(
		() => (seerrOnly ? buildSeerrDetailItem(seerr.details, seerr.mediaType) : null),
		[seerrOnly, seerr.details, seerr.mediaType]
	);
	const item = seerrOnly ? seerrItem : data.item;
	const isLoading = seerrOnly ? seerr.loading : libraryLoading;

	const {cast: detailCast, crew: detailCrew} = useMemo(
		() => splitCastAndCrew(seerrOnly ? item?.People || [] : cast),
		[seerrOnly, item?.People, cast]
	);

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
	const modals = useDetailsModals({backHandlerRef, onArtworkClosed: refreshItem, seerrBackRef, overviewBackRef});
	const {activeModal, openModal, closeModal, advancedResumeRef} = modals;

	const trailer = useDetailsTrailer({
		item,
		effectiveApi,
		onPlay,
		trailerMuted: settings.featuredTrailerMuted
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

	const logoUrl = useMemo(
			() => (item ? getLogoUrl(effectiveServerUrl, item, {maxWidth: 400, quality: 90}) : null),
			[item, effectiveServerUrl]
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

	const handlePlay = useCallback(async () => {
		if (!item) return;

		const playbackOptions = buildPlaybackOptions();

		if (item.Type === 'Series') {
			if (nextUp.length > 0) {
				onPlay?.(nextUp[0], false, {});
			} else if (seasons.length > 0) {
				onSelectItem?.(seasons[0]);
			}
		} else if (item.Type === 'Season') {
			if (episodes.length > 0) {
				const unwatched = episodes.find(ep => !ep.UserData?.Played);
				onPlay?.(unwatched || episodes[0], false, {});
			}
		} else if (item.Type === 'MusicAlbum') {
			if (albumTracks.length > 0) {
				onPlay?.(albumTracks[0], false, {audioPlaylist: albumTracks});
			}
		} else if (item.Type === 'Playlist') {
			if (playlistItems.length > 0) {
				const firstItem = playlistItems[0];
				if (firstItem.MediaType === 'Audio') {
					onPlay?.(firstItem, false, {audioPlaylist: playlistItems});
				} else {
					onPlay?.(firstItem, false, {});
				}
			}
		} else {
			// A SyncPlay group queues the pressed item for everyone, so intros stay out of it.
			const prerolls = isSyncPlayInGroup
				? []
				: tagWithServerInfo(await fetchPrerolls(effectiveApi, item, settings));
			if (prerolls.length > 0) {
				// The version, audio and subtitle picks belong to the movie, and the queue
				// starts on an intro, so applying them here would target the wrong file.
				onPlay?.(prerolls[0], false, {videoQueue: [...prerolls, item]});
			} else {
				onPlay?.(item, false, playbackOptions);
			}
		}
	}, [item, episodes, nextUp, seasons, albumTracks, playlistItems, onPlay, onSelectItem, buildPlaybackOptions, effectiveApi, settings, tagWithServerInfo, isSyncPlayInGroup]);

	const handleResume = useCallback(() => {
		if (!item) return;
		onPlay?.(item, true, buildPlaybackOptions());
	}, [item, onPlay, buildPlaybackOptions]);

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

		// An album shuffles its own loaded tracks into the audio queue.
		if (item.Type === 'MusicAlbum') {
			if (albumTracks.length === 0) return;
			const shuffled = shuffleArray(albumTracks);
			onPlay?.(shuffled[0], false, {audioPlaylist: shuffled});
			return;
		}

		onPlay?.(item, false, {});
	}, [item, episodes, albumTracks, onPlay, effectiveApi, tagWithServerInfo]);

	const handleToggleFavorite = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.IsFavorite;
		await effectiveApi.setFavorite(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, IsFavorite: newState}
		}));
		window.requestAnimationFrame(() => Spotlight.focus('details-favorite-btn') || Spotlight.focus('season-favorite-btn'));
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
		window.requestAnimationFrame(() => Spotlight.focus('details-watched-btn') || Spotlight.focus('season-watched-btn'));
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

	const playLongPress = useLongPress(supportsStreamSelection ? modals.handleAdvancedPlay : null, handlePlay);
	const resumeLongPress = useLongPress(supportsStreamSelection ? modals.handleAdvancedResume : null, handleResume);

	const handleSelectAudio = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		audioChosenRef.current = true;
		setSelectedAudioIndex(index);
		closeModal();
	}, [closeModal, setSelectedAudioIndex]);

	const handleSelectSubtitle = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		subtitleChosenRef.current = true;
		setSelectedSubtitleIndex(index);
		closeModal();
	}, [closeModal, setSelectedSubtitleIndex]);

	const handleOpenRemoteSubtitleSearch = useCallback(async () => {
		if (!item?.Id) return;
		setRemoteSubtitleResults([]);
		setIsSearchingRemoteSubtitles(true);
		openModal('subtitleDownload');
		try {
			const ms = item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0];
			const subs = ms?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const audios = ms?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const currentSub = selectedSubtitleIndex >= 0 ? subs[selectedSubtitleIndex] : null;
			const currentAudio = audios[selectedAudioIndex];
			const language = toSubtitleLanguage(
				currentSub?.Language,
				currentAudio?.Language,
				subs[0]?.Language
			);
			const results = await effectiveApi.searchRemoteSubtitles(item.Id, language);
			setRemoteSubtitleResults(mapRemoteSubtitleOptions(Array.isArray(results) ? results : results?.SearchResults || []));
		} catch {
			setRemoteSubtitleResults([]);
		} finally {
			setIsSearchingRemoteSubtitles(false);
		}
	}, [item, selectedVersionIndex, selectedSubtitleIndex, selectedAudioIndex, effectiveApi, openModal]);

	const handleSelectRemoteSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index) || !remoteSubtitleResults[index] || !item?.Id) return;
		try {
			await effectiveApi.downloadRemoteSubtitle(item.Id, remoteSubtitleResults[index].id);
			const refreshed = await effectiveApi.getItem(item.Id);
			setItem(tagWithServerInfo(refreshed));
			const ms = refreshed.MediaSources?.[selectedVersionIndex] || refreshed.MediaSources?.[0];
			const newSubs = ms?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const oldSubs = (item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0])?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			if (newSubs.length > oldSubs.length) {
				const newIdx = newSubs.length - 1;
				subtitleChosenRef.current = true;
				setSelectedSubtitleIndex(newIdx);
			}
		} catch { /* ignore */ }
		closeModal();
	}, [remoteSubtitleResults, item, effectiveApi, selectedVersionIndex, closeModal, tagWithServerInfo, setItem, setSelectedSubtitleIndex]);

	const handleSelectVersion = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index) || !item?.MediaSources?.[index]) return;
		setSelectedVersionIndex(index);
		const ms = item.MediaSources[index];
		const versionAudioStreams = ms.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		const versionSubtitleStreams = ms.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
		if (ms.DefaultAudioStreamIndex != null) {
			const idx = versionAudioStreams.findIndex(s => s.Index === ms.DefaultAudioStreamIndex);
			setSelectedAudioIndex(idx >= 0 ? idx : 0);
		} else {
			setSelectedAudioIndex(0);
		}
		// A different version brings its own tracks, so whatever was picked for the old
		// one no longer stands.
		subtitleChosenRef.current = false;
		audioChosenRef.current = false;
		if (ms.DefaultSubtitleStreamIndex != null) {
			const idx = versionSubtitleStreams.findIndex(s => s.Index === ms.DefaultSubtitleStreamIndex);
			setSelectedSubtitleIndex(idx >= 0 ? idx : -1);
		} else {
			setSelectedSubtitleIndex(-1);
		}
		closeModal();
	}, [item, closeModal, setSelectedVersionIndex, setSelectedAudioIndex, setSelectedSubtitleIndex]);

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
			onSelectItem?.(episode);
		}
	}, [episodes, onSelectItem]);

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

	const handleTrackPlay = useCallback((ev) => {
		const trackId = ev.currentTarget.dataset.trackId;
		const track = albumTracks.find(t => t.Id === trackId);
		if (track) {
			onPlay?.(track, false, {audioPlaylist: albumTracks});
		}
	}, [albumTracks, onPlay]);

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

	const handleCastSelect = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		if (!personId) return;
		// A Seerr cast member is a TMDB person, so they open on the Seerr side of the app.
		if (seerrOnly) {
			const person = item?.People?.find((p) => p.Id === personId);
			seerrNav?.onSelectPerson?.(Number(personId), person?.Name);
			return;
		}
		onSelectPerson?.({Id: personId});
	}, [onSelectPerson, seerrOnly, seerrNav, item]);

	const handlePlaylistItemSelect = useCallback((ev) => {
		const plItemId = ev.currentTarget.dataset.playlistItemId;
		const plItem = playlistItems.find(t => t.Id === plItemId);
		if (plItem) {
			if (plItem.MediaType === 'Audio') {
				onPlay?.(plItem, false, {audioPlaylist: playlistItems});
			} else {
				onSelectItem?.(plItem);
			}
		}
	}, [playlistItems, onPlay, onSelectItem]);

	const handlePlaylistShuffle = useCallback(() => {
		if (playlistItems.length < 2) return;
		const shuffled = shuffleArray(playlistItems);
		const firstItem = shuffled[0];
		if (firstItem.MediaType === 'Audio') {
			onPlay?.(firstItem, false, {audioPlaylist: shuffled});
		} else {
			onPlay?.(firstItem, false, {});
		}
	}, [playlistItems, onPlay]);

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
		setPlaylistItems(prev => prev.filter(p => p.PlaylistItemId !== entryId));
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

	if (isLoading || !item) {
		return (
			<div className={css.page}>
				<div className={css.loading}>
					<LoadingSpinner />
				</div>
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
	const isBoxSet = item.Type === 'BoxSet';
	const isAlbum = item.Type === 'MusicAlbum';
	const isMusicArtist = item.Type === 'MusicArtist';
	const isPlaylist = item.Type === 'Playlist';
	const isAudioTrack = item.Type === 'Audio';
	const isBook = item.Type === 'Book';
	const isReadableBook = isBook && item.Path?.toLowerCase().endsWith('.cbz');
	const isRatable = isRatableItemType(item.Type);
	const ratingStyle = normalizeRatingStyle(settings.personalRatingStyle);

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
	let techSize = null;
	if (showTech && mediaSource?.Size > 0 && item.Type !== 'Series' && item.Type !== 'Season') {
		const mb = mediaSource.Size / (1024 * 1024);
		techSize = mb > 999 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
	}
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
	const tagline = item.Taglines?.[0];

	const hasPlaybackPosition = item.UserData?.PlaybackPositionTicks > 0;
	const resumeTimeText = hasPlaybackPosition ? formatDuration(item.UserData.PlaybackPositionTicks) : '';

	const personMovies = isPerson ? similar.filter(i => i.Type === 'Movie') : [];
	const personSeries = isPerson ? similar.filter(i => i.Type === 'Series') : [];
	const birthDate = isPerson && item.PremiereDate ? new Date(item.PremiereDate) : null;
	const birthPlace = isPerson && item.ProductionLocations?.length > 0 ? item.ProductionLocations[0] : '';

	const backdrop = (
		<DetailBackdrop backdropUrl={backdropUrl} isPerson={isPerson} blur={settings.backdropBlurDetail} />
	);

	const trailerLayer = (
		<TrailerOverlay
			videoId={trailer.trailerOverlay}
			streamUrl={trailer.trailerStreamUrl}
			videoRef={trailer.trailerVideoRef}
			muted={settings.featuredTrailerMuted}
			onClose={trailer.handleCloseTrailer}
			onKeyDown={trailer.handleTrailerOverlayKeyDown}
		/>
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
				onSelectTranscodeQuality={handleSelectTranscodeQuality}
				onSelectVersion={handleSelectVersion}
				onSelectAudio={handleSelectAudio}
				onSelectSubtitle={handleSelectSubtitle}
				onOpenRemoteSubtitleSearch={handleOpenRemoteSubtitleSearch}
				isSearchingRemoteSubtitles={isSearchingRemoteSubtitles}
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
		</>
	);

	if (settings.detailScreenStyle !== 'v1') {
		return (
			<div className={css.page}>
				<ModernDetailContent
					key={item.Id}
					item={item}
					settings={settings}
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
					similar={similar}
					extras={extras}
					cast={detailCast}
					crew={detailCrew}
					nextUp={nextUp}
					collectionItems={collectionItems}
					albumTracks={albumTracks}
					artistAlbums={artistAlbums}
					playlistItems={playlistItems}
					personMovies={personMovies}
					personSeries={personSeries}
					birthDate={birthDate}
					birthPlace={birthPlace}
					episodeRatings={episodeRatings}
					mediaSource={mediaSource}
					supportsMediaSourceSelection={supportsMediaSourceSelection}
					hasMultipleVersions={hasMultipleVersions}
					hasMultipleAudio={hasMultipleAudio}
					handlePlay={handlePlay}
					handleResume={handleResume}
					handleShuffle={handleShuffle}
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
					handleExtraSelect={handleExtraSelect}
					handleTrackPlay={handleTrackPlay}
					onSelectItem={onSelectItem}
					onSelectPerson={onSelectPerson}
					onSelectStudio={onSelectStudio}
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
					personMovies={personMovies}
					personSeries={personSeries}
					birthDate={birthDate}
					birthPlace={birthPlace}
					onSelectItem={onSelectItem}
				/>
			</DetailScrollPage>
		);
	}

	if (isSeason) {
		return (
			<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked}>
				<SeasonScreen
					item={item}
					serverUrl={effectiveServerUrl}
					settings={settings}
					posterUrl={posterUrl}
					episodes={episodes}
					episodeRatings={episodeRatings}
					onPlay={handlePlay}
					onShuffle={handleShuffle}
					onToggleWatched={handleToggleWatched}
					onToggleFavorite={handleToggleFavorite}
					onEpisodeSelect={handleEpisodeSelect}
					onFocusRow={handleButtonRowFocus}
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
					posterUrl={posterUrl}
					genres={genres}
					playlistItems={playlistItems}
					onPlay={handlePlay}
					onShuffle={handlePlaylistShuffle}
					onToggleFavorite={handleToggleFavorite}
					onItemSelect={handlePlaylistItemSelect}
					onItemKeyDown={handlePlaylistItemKeyDown}
					onFocusRow={handleButtonRowFocus}
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
					posterUrl={posterUrl}
					year={year}
					genres={genres}
					albumTracks={albumTracks}
					similar={similar}
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
					similar={similar}
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
			isSeries={isSeries}
			isSeason={isSeason}
			isEpisode={isEpisode}
			isBook={isBook}
			isReadableBook={isReadableBook}
			hasPlaybackPosition={hasPlaybackPosition}
			resumeTimeText={resumeTimeText}
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

	return (
		<DetailScrollPage backdrop={backdrop} scrollerRef={pageScrollerRef} onScrollTo={handlePageScrollTo} sidebarDocked={sidebarDocked} footer={overlays}>
			<ClassicDetailScreen
				item={item}
				serverUrl={effectiveServerUrl}
				settings={settings}
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
				nextUp={nextUp}
				nextEpisode={nextEpisode}
				collectionItems={collectionItems}
				extras={extras}
				cast={detailCast}
				crew={detailCrew}
				parentCollection={parentCollection}
				parentCollectionName={parentCollectionName}
				similar={similar}
				onSeasonSelect={handleSeasonSelect}
				onEpisodeSelect={handleEpisodeSelect}
				onChapterSelect={handleChapterSelect}
				onExtraSelect={handleExtraSelect}
				onCastSelect={handleCastSelect}
				onSelectItem={onSelectItem}
			/>
		</DetailScrollPage>
	);
};

export default Details;
