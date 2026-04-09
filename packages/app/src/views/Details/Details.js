import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {Scroller} from '@enact/sandstone/Scroller';

import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import RatingsRow from '../../components/RatingsRow';
import {formatDuration, getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {KEYS, isBackKey} from '../../utils/keys';
import {fetchVideoStreamUrl} from '../../services/youtubeTrailer';
import AddToPlaylistModal from '../../components/AddToPlaylistModal';
import {toSubtitleLanguage, mapRemoteSubtitleOptions} from '../Player/remoteSubtitleUtils';

import css from './Details.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');
const HorizontalContainer = SpotlightContainerDecorator({restrict: 'self-first'}, 'div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const PosterBadges = ({userData}) => (
	<>
		{userData?.IsFavorite && (
			<div className={css.posterBadgeFavorite}>
				<svg viewBox="0 0 24 24"><path fill="#ff4081" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
			</div>
		)}
		{userData?.Played && (
			<div className={css.posterBadgeWatched}>
				<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
			</div>
		)}
	</>
);

const getMediaBadges = (item) => {
	const badges = [];
	const mediaSource = item.MediaSources?.[0];
	const streams = mediaSource?.MediaStreams || [];
	const video = streams.find(s => s.Type === 'Video');
	const audio = streams.find(s => s.Type === 'Audio');

	if (video) {
		// Resolution badge
		if (video.Width >= 3800) badges.push({type: 'badge4k', label: '4K'});
		else if (video.Width >= 1900) badges.push({type: 'badgeHd', label: '1080p'});
		else if (video.Width >= 1260) badges.push({type: 'badgeHd', label: '720p'});

		// HDR/DV badges
		const rangeType = video.VideoRangeType;
		if (rangeType === 'DOVIWithHDR10' || rangeType === 'DOVI') {
			badges.push({type: 'badgeDv', label: 'DV'});
		}
		if (rangeType && rangeType !== 'SDR') {
			if (rangeType.includes('HDR10Plus')) badges.push({type: 'badgeHdr', label: 'HDR10+'});
			else if (rangeType.includes('HDR10') || rangeType === 'DOVIWithHDR10') badges.push({type: 'badgeHdr', label: 'HDR10'});
			else if (rangeType !== 'DOVI') badges.push({type: 'badgeHdr', label: 'HDR'});
		} else if (video.VideoRange === 'HDR') {
			badges.push({type: 'badgeHdr', label: 'HDR'});
		}

		// Video codec badge
		const videoCodec = video.Codec?.toUpperCase();
		if (videoCodec) {
			const codecLabel = videoCodec === 'HEVC' ? 'HEVC' : videoCodec === 'AV1' ? 'AV1' : videoCodec === 'H264' ? 'H.264' : videoCodec === 'VP9' ? 'VP9' : videoCodec;
			badges.push({type: 'badgeCodec', label: codecLabel});
		}
	}

	// Container badge
	const container = mediaSource?.Container?.toUpperCase();
	if (container) {
		badges.push({type: 'badgeContainer', label: container});
	}

	if (audio) {
		// Audio format badge
		if (audio.Profile?.includes('Atmos') || audio.Title?.includes('Atmos')) {
			badges.push({type: 'badgeAtmos', label: 'ATMOS'});
		} else if (audio.Profile?.includes('DTS:X') || audio.Title?.includes('DTS:X')) {
			badges.push({type: 'badgeDtsx', label: 'DTS:X'});
		} else if (audio.Channels > 6) {
			badges.push({type: 'badgeSurround', label: `${audio.Channels - 1}.1`});
		} else if (audio.Channels === 6) {
			badges.push({type: 'badgeSurround', label: '5.1'});
		} else if (audio.Channels === 2) {
			badges.push({type: 'badgeSurround', label: $L('Stereo')});
		}

		// Audio codec badge
		const audioCodec = audio.Codec?.toUpperCase();
		if (audioCodec) {
			const audioLabel = audioCodec === 'AAC' ? 'AAC' : audioCodec === 'AC3' ? 'AC3' : audioCodec === 'EAC3' ? 'EAC3' : audioCodec === 'FLAC' ? 'FLAC' : audioCodec === 'DTS' ? 'DTS' : audioCodec === 'TRUEHD' ? 'TrueHD' : audioCodec;
			badges.push({type: 'badgeAudioCodec', label: audioLabel});
		}
	}

	return badges;
};

const Details = ({itemId, initialItem, onPlay, onSelectItem, onSelectPerson, backHandlerRef}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();

	// Cross-server support
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
			_serverAccessToken: initialItem._serverAccessToken,
			_serverUserId: initialItem._serverUserId,
			_serverName: initialItem._serverName,
			_serverId: initialItem._serverId
		});
		return Array.isArray(items) ? items.map(tagSingleItem) : tagSingleItem(items);
	}, [initialItem?._serverUrl, initialItem?._serverAccessToken, initialItem?._serverUserId, initialItem?._serverName, initialItem?._serverId]);

	// State
	const [item, setItem] = useState(null);
	const [seasons, setSeasons] = useState([]);
	const [episodes, setEpisodes] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [cast, setCast] = useState([]);
	const [nextUp, setNextUp] = useState([]);
	const [collectionItems, setCollectionItems] = useState([]);
	const [albumTracks, setAlbumTracks] = useState([]);
	const [artistAlbums, setArtistAlbums] = useState([]);
	const [playlistItems, setPlaylistItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);
	const [showMediaInfo, setShowMediaInfo] = useState(false);
	const [activeModal, setActiveModal] = useState(null);
	const [remoteSubtitleResults, setRemoteSubtitleResults] = useState([]);
	const [isSearchingRemoteSubtitles, setIsSearchingRemoteSubtitles] = useState(false);
	const [trailerOverlay, setTrailerOverlay] = useState(null);
	const [trailerStreamUrl, setTrailerStreamUrl] = useState(null);
	const [showPlaylistModal, setShowPlaylistModal] = useState(false);
	const [toastMessage, setToastMessage] = useState(null);

	// Refs
	const pageScrollerRef = useRef(null);
	const pageScrollToRef = useRef(null);

	// Data loading
	useEffect(() => {
		const loadItem = async () => {
			setIsLoading(true);
			setSeasons([]);
			setEpisodes([]);
			setSimilar([]);
			setCast([]);
			setNextUp([]);
			setCollectionItems([]);
			setAlbumTracks([]);
			setArtistAlbums([]);
			setPlaylistItems([]);
			setShowMediaInfo(false);

			try {
				const data = await effectiveApi.getItem(itemId);
				setItem(tagWithServerInfo(data));

				setSelectedVersionIndex(0);
				const ms = data.MediaSources?.[0];
				if (ms) {
					const initAudioStreams = ms.MediaStreams?.filter(s => s.Type === 'Audio') || [];
					const initSubtitleStreams = ms.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];

					if (ms.DefaultAudioStreamIndex != null) {
						const idx = initAudioStreams.findIndex(s => s.Index === ms.DefaultAudioStreamIndex);
						if (idx >= 0) setSelectedAudioIndex(idx);
					}

					if (ms.DefaultSubtitleStreamIndex != null) {
						const idx = initSubtitleStreams.findIndex(s => s.Index === ms.DefaultSubtitleStreamIndex);
						if (idx >= 0) setSelectedSubtitleIndex(idx);
					} else {
						setSelectedSubtitleIndex(-1);
					}
				} else {
					setSelectedAudioIndex(0);
					setSelectedSubtitleIndex(-1);
				}

				if (data.People?.length > 0) {
					setCast(data.People.slice(0, 20));
				}

				if (data.Type === 'Series') {
					const seasonsData = await effectiveApi.getSeasons(itemId);
					setSeasons(tagWithServerInfo(seasonsData.Items || []));

					try {
						const nextUpData = await effectiveApi.getNextUp(1, itemId);
						if (nextUpData.Items?.length > 0) {
							setNextUp(tagWithServerInfo(nextUpData.Items));
						}
					} catch { /* Next up not available */ }
				}

				if (data.Type === 'Season') {
					try {
						const episodesData = await effectiveApi.getEpisodes(data.SeriesId, data.Id);
						setEpisodes(tagWithServerInfo(episodesData.Items || []));
					} catch { /* Episodes not available */ }
				}

				if (data.Type === 'Episode') {
					const seasonId = data.SeasonId || data.ParentId;
					if (data.SeriesId && seasonId) {
						try {
							const episodesData = await effectiveApi.getEpisodes(data.SeriesId, seasonId);
							setEpisodes(tagWithServerInfo(episodesData.Items || []));
						} catch { /* Same-season episodes not available */ }
					}
				}

				if (data.Type === 'BoxSet') {
					try {
						const collectionData = await effectiveApi.getItems({
							ParentId: data.Id,
							SortBy: 'ProductionYear,SortName',
							SortOrder: 'Ascending',
							Fields: 'PrimaryImageAspectRatio,ProductionYear'
						});
						setCollectionItems(tagWithServerInfo(collectionData.Items || []));
					} catch { /* Collection items not available */ }
				}

				if (data.Type === 'MusicAlbum') {
					try {
						const tracksData = await effectiveApi.getAlbumTracks(data.Id);
						setAlbumTracks(tagWithServerInfo(tracksData.Items || []));
					} catch { /* Album tracks not available */ }
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch { /* Similar albums not available */ }
				}

				if (data.Type === 'MusicArtist') {
					try {
						const albumsData = await effectiveApi.getAlbumsByArtist(data.Id);
						setArtistAlbums(tagWithServerInfo(albumsData.Items || []));
					} catch { /* Artist albums not available */ }
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch { /* Similar artists not available */ }
				}

				if (data.Type === 'Playlist') {
					try {
						const playlistData = await effectiveApi.getPlaylistItems(data.Id);
						setPlaylistItems(tagWithServerInfo(playlistData?.Items || []));
					} catch { /* Playlist items not available */ }
				}

				if (data.Type !== 'Person' && data.Type !== 'BoxSet' && data.Type !== 'MusicAlbum' && data.Type !== 'MusicArtist' && data.Type !== 'Playlist') {
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch { /* Similar items not available */ }
				}

				if (data.Type === 'Person') {
					try {
						const filmography = await effectiveApi.getItemsByPerson(itemId, 50);
						setSimilar(tagWithServerInfo(filmography.Items || []));
					} catch { /* Filmography not available */ }
				}
			} catch (err) {
				console.error('[Details] Error loading item', err);
			} finally {
				setIsLoading(false);
			}
		};
		loadItem();
	}, [effectiveApi, itemId, tagWithServerInfo]);

	// Auto-focus the primary button when content loads
	useEffect(() => {
		if (!isLoading && item) {
			const timer = setTimeout(() => {
				Spotlight.focus('details-primary-btn');
			}, 150);
			return () => clearTimeout(timer);
		}
	}, [isLoading, item]);

	// === HANDLERS ===

	const handlePlay = useCallback(() => {
		if (!item) return;

		const supportsSelection = item.MediaType === 'Video' &&
			item.MediaSources?.length > 0 &&
			item.MediaSources[0].Type !== 'Placeholder';

		let playbackOptions = {};
		if (supportsSelection) {
			const playMediaSource = item.MediaSources[selectedVersionIndex] || item.MediaSources[0];
			const audioStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const subtitleStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const selectedAudio = audioStreamsList[selectedAudioIndex];
			const subtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreamsList[selectedSubtitleIndex] : null;
			playbackOptions = {
				mediaSourceId: playMediaSource.Id,
				audioStreamIndex: selectedAudio?.Index,
				subtitleStreamIndex: subtitleStream?.Index ?? -1
			};
		}

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
			onPlay?.(item, false, playbackOptions);
		}
	}, [item, episodes, nextUp, seasons, albumTracks, playlistItems, onPlay, onSelectItem, selectedAudioIndex, selectedSubtitleIndex, selectedVersionIndex]);

	const handleResume = useCallback(() => {
		if (!item) return;

		const supportsSelection = item.MediaType === 'Video' &&
			item.MediaSources?.length > 0 &&
			item.MediaSources[0].Type !== 'Placeholder';

		let playbackOptions = {};
		if (supportsSelection) {
			const resumeMediaSource = item.MediaSources[selectedVersionIndex] || item.MediaSources[0];
			const audioStreamsList = resumeMediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const subtitleStreamsList = resumeMediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const selectedAudio = audioStreamsList[selectedAudioIndex];
			const subtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreamsList[selectedSubtitleIndex] : null;
			playbackOptions = {
				mediaSourceId: resumeMediaSource.Id,
				audioStreamIndex: selectedAudio?.Index,
				subtitleStreamIndex: subtitleStream?.Index ?? -1
			};
		}

		onPlay?.(item, true, playbackOptions);
	}, [item, onPlay, selectedAudioIndex, selectedSubtitleIndex, selectedVersionIndex]);

	const handleShuffle = useCallback(() => {
		if (item) {
			onPlay?.(item, false, true);
		}
	}, [item, onPlay]);

	const handleTrailer = useCallback(() => {
		// Trailers disabled — isolating decoder exhaustion issue
		// if (item?.LocalTrailerCount > 0) {
		// 	onPlay?.(item, false, false, true);
		// } else if (item?.RemoteTrailers?.length > 0) {
		// 	const trailerUrl = item.RemoteTrailers[0].Url || '';
		// 	const videoId = extractYouTubeIdFromUrl(trailerUrl);
		// 	if (videoId) {
		// 		setTrailerOverlay(videoId);
		// 		window.requestAnimationFrame(() => Spotlight.focus('trailer-close-btn'));
		// 	} else if (trailerUrl) {
		// 		window.open(trailerUrl, '_blank');
		// 	}
		// }
	}, []);

	const handleToggleFavorite = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.IsFavorite;
		await effectiveApi.setFavorite(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, IsFavorite: newState}
		}));
		window.requestAnimationFrame(() => Spotlight.focus('details-favorite-btn') || Spotlight.focus('season-favorite-btn'));
	}, [effectiveApi, item]);

	const handleToggleWatched = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.Played;
		await effectiveApi.setWatched(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, Played: newState, PlayedPercentage: newState ? 100 : 0}
		}));
		window.requestAnimationFrame(() => Spotlight.focus('details-watched-btn') || Spotlight.focus('season-watched-btn'));
	}, [effectiveApi, item]);

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

	const handleCloseMediaInfo = useCallback(() => setShowMediaInfo(false), []);
	const handleOpenMediaInfo = useCallback(() => setShowMediaInfo(true), []);
	const handleStopPropagation = useCallback((e) => e.stopPropagation(), []);

	const trailerVideoRef = useRef(null);

	const handleCloseTrailer = useCallback(() => {
		if (trailerVideoRef.current) {
			try {
				trailerVideoRef.current.pause();
				// Do NOT call load() — corrupts Chrome 53 HW decoder.
				trailerVideoRef.current.src = '';
				trailerVideoRef.current.removeAttribute('src');
			} catch { /* ignore */ }
		}
		setTrailerOverlay(null);
		setTrailerStreamUrl(null);
	}, []);

	const handleTrailerOverlayKeyDown = useCallback((e) => {
		if (isBackKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			handleCloseTrailer();
		}
	}, [handleCloseTrailer]);

	useEffect(() => {
		if (!trailerOverlay) {
			setTrailerStreamUrl(null);
			return;
		}
		let cancelled = false;

		const resolveStream = async () => {
			const url = await fetchVideoStreamUrl(trailerOverlay, true);
			if (cancelled) return;
			if (url) {
				setTrailerStreamUrl(url);
			} else {
				setTrailerOverlay(null);
			}
		};

		resolveStream();
		return () => { cancelled = true; };
	}, [trailerOverlay]);

	const openModal = useCallback((modal) => {
		setActiveModal(modal);
		window.requestAnimationFrame(() => {
			const modalId = `${modal}-modal`;
			const focusResult = Spotlight.focus(modalId);
			if (!focusResult) {
				const selectedItem = document.querySelector(`[data-modal="${modal}"] [data-selected="true"]`);
				const firstItem = document.querySelector(`[data-modal="${modal}"] button`);
				if (selectedItem) {
					Spotlight.focus(selectedItem);
				} else if (firstItem) {
					Spotlight.focus(firstItem);
				}
			}
		});
	}, []);

	const handleOpenAudioModal = useCallback(() => openModal('audio'), [openModal]);
	const handleOpenSubtitleModal = useCallback(() => openModal('subtitle'), [openModal]);
	const handleOpenVersionModal = useCallback(() => openModal('version'), [openModal]);

	const closeModal = useCallback(() => {
		setActiveModal(null);
	}, []);

	const handleSelectAudio = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		setSelectedAudioIndex(index);
		closeModal();
	}, [closeModal]);

	const handleSelectSubtitle = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		setSelectedSubtitleIndex(index);
		closeModal();
	}, [closeModal]);

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
				setSelectedSubtitleIndex(newIdx);
			}
		} catch { /* ignore */ }
		closeModal();
	}, [remoteSubtitleResults, item, effectiveApi, selectedVersionIndex, closeModal, tagWithServerInfo]);

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
		if (ms.DefaultSubtitleStreamIndex != null) {
			const idx = versionSubtitleStreams.findIndex(s => s.Index === ms.DefaultSubtitleStreamIndex);
			setSelectedSubtitleIndex(idx >= 0 ? idx : -1);
		} else {
			setSelectedSubtitleIndex(-1);
		}
		closeModal();
	}, [item, closeModal]);

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
				// Fisher-Yates shuffle
				const shuffled = [...tracks];
				for (let i = shuffled.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
				}
				onPlay?.(shuffled[0], false, {audioPlaylist: shuffled});
			}
		} catch { /* ignore */ }
	}, [item, effectiveApi, onPlay]);

	const handleCastSelect = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		if (personId) {
			onSelectPerson?.({Id: personId});
		}
	}, [onSelectPerson]);

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
		const shuffled = [...playlistItems];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
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
	}, [playlistItems, effectiveApi, item]);

	const showToast = useCallback((msg) => {
		setToastMessage(msg);
	}, []);

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
	}, [playlistItems, effectiveApi, item, showToast]);

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

	const handleOpenPlaylistModal = useCallback(() => {
		setShowPlaylistModal(true);
	}, []);

	const handleClosePlaylistModal = useCallback(() => {
		setShowPlaylistModal(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, []);

	// Register back handler interceptor for modals
	useEffect(() => {
		if (!backHandlerRef) return;
		backHandlerRef.current = () => {
			if (showPlaylistModal) { handleClosePlaylistModal(); return true; }
			if (activeModal) { closeModal(); return true; }
			if (showMediaInfo) { setShowMediaInfo(false); return true; }
			return false;
		};
		return () => { if (backHandlerRef) backHandlerRef.current = null; };
	}, [backHandlerRef, activeModal, showMediaInfo, showPlaylistModal, closeModal, handleClosePlaylistModal]);

const handleSectionKeyDown = useCallback((ev) => {
		const currentSpottable = ev.target.closest('.spottable');
		if (!currentSpottable) return;

		if (ev.keyCode === KEYS.LEFT || ev.keyCode === KEYS.RIGHT) { // Left / Right
			const scroller = currentSpottable.closest(`.${css.sectionScroll}`) || currentSpottable.closest(`.${css.castScroller}`);
			if (!scroller) return; // Let MediaRow handle its own left/right

			const allCards = Array.from(scroller.querySelectorAll('.spottable'));
			const currentIdx = allCards.indexOf(currentSpottable);
			if (currentIdx === -1) return;

			const targetIdx = ev.keyCode === KEYS.LEFT ? currentIdx - 1 : currentIdx + 1;
			if (targetIdx < 0 || targetIdx >= allCards.length) return;

			ev.preventDefault();
			ev.stopPropagation();
			Spotlight.focus(allCards[targetIdx]);
		} else if (ev.keyCode === KEYS.UP) { // Up arrow
			const container = currentSpottable.closest(`.${css.sectionsContainer}`);
			if (!container) return;

			const currentRow = currentSpottable.closest(`.${css.section}`) || currentSpottable.closest('[data-row-index]') || currentSpottable.closest(`.${css.inlineRow}`);
			if (!currentRow) return;

			const allRows = Array.from(container.children);
			const currentIndex = allRows.indexOf(currentRow);

			if (currentIndex <= 0) {
				ev.preventDefault();
				ev.stopPropagation();
				Spotlight.focus('details-action-buttons');
			} else {
				const prevRow = allRows[currentIndex - 1];
				const prevSpottable = prevRow.querySelector('.spottable');
				if (prevSpottable) {
					ev.preventDefault();
					ev.stopPropagation();
					Spotlight.focus(prevSpottable);
				}
			}
		} else if (ev.keyCode === KEYS.DOWN) { // Down arrow
			const container = currentSpottable.closest(`.${css.sectionsContainer}`);
			if (!container) return;

			const currentRow = currentSpottable.closest(`.${css.section}`) || currentSpottable.closest('[data-row-index]');
			if (!currentRow) return;

			const allRows = Array.from(container.children);
			const currentIndex = allRows.indexOf(currentRow);

			if (currentIndex >= 0 && currentIndex < allRows.length - 1) {
				const nextRow = allRows[currentIndex + 1];
				const nextSpottable = nextRow.querySelector('.spottable');
				if (nextSpottable) {
					ev.preventDefault();
					ev.stopPropagation();
					Spotlight.focus(nextSpottable);
				}
			}
		}
	}, []);

	const handleButtonRowKeyDown = useCallback((ev) => {
		if (ev.keyCode === KEYS.DOWN) { // Down arrow
			ev.preventDefault();
			ev.stopPropagation();
			const sectionsContainer = document.querySelector(`.${css.sectionsContainer}`);
			if (sectionsContainer) {
				const firstSpottable = sectionsContainer.querySelector('.spottable');
				if (firstSpottable) {
					Spotlight.focus(firstSpottable);
				}
			}
		}
	}, []);

	const handleSeasonButtonKeyDown = useCallback((ev) => {
		if (ev.keyCode === KEYS.DOWN) { // Down arrow
			ev.preventDefault();
			ev.stopPropagation();
			// Try episode list first (seasons), then track list (albums)
			const list = document.querySelector(`.${css.seasonEpisodesList}`) || document.querySelector(`.${css.trackList}`);
			if (list) {
				const firstSpottable = list.querySelector('.spottable');
				if (firstSpottable) {
					Spotlight.focus(firstSpottable);
				}
			}
		}
	}, []);

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

	const handleScrollerFocus = useCallback((e) => {
		const card = e.target.closest('.spottable');
		const scroller = e.currentTarget;
		if (card && scroller) {
			window.requestAnimationFrame(() => {
				const cardRect = card.getBoundingClientRect();
				const scrollerRect = scroller.getBoundingClientRect();
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			});
		}
	}, []);

	// === LOADING STATE ===

	if (isLoading || !item) {
		return (
			<div className={css.page}>
				<div className={css.loading}>
					<LoadingSpinner />
				</div>
			</div>
		);
	}

	// === DATA DERIVATION ===

	const backdropId = getBackdropId(item);
	const backdropUrl = backdropId
		? getImageUrl(effectiveServerUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 90})
		: null;

	const logoUrl = getLogoUrl(effectiveServerUrl, item, {maxWidth: 400, quality: 90});

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

	// Poster URL
	let posterUrl = null;
	if (isEpisode) {
		if (item.ImageTags?.Thumb) {
			posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Thumb', {maxWidth: 500, quality: 90});
		} else if (item.ImageTags?.Primary) {
			posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxWidth: 500, quality: 90});
		}
	} else if (item.ImageTags?.Primary) {
		posterUrl = getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxHeight: 600, quality: 90});
	}

	// Info data
	const year = item.ProductionYear || '';
	const runtime = item.RunTimeTicks ? formatDuration(item.RunTimeTicks) : '';
	const endsAt = (() => {
		if (!item.RunTimeTicks) return '';
		const endTime = new Date(Date.now() + item.RunTimeTicks / 10000);
		const hours = endTime.getHours();
		const minutes = endTime.getMinutes();
		if (settings.clockDisplay === '12-hour') {
			const ampm = hours >= 12 ? 'PM' : 'AM';
			const h = hours % 12 || 12;
			const m = minutes < 10 ? '0' + minutes : minutes;
			return $L('Ends at {time}').replace('{time}', `${h}:${m} ${ampm}`);
		} else {
			const h = hours.toString().padStart(2, '0');
			const m = minutes < 10 ? '0' + minutes : minutes;
			return $L('Ends at {time}').replace('{time}', `${h}:${m}`);
		}
	})();
	const officialRating = item.OfficialRating || '';
	const badges = getMediaBadges(item);
	const seasonCount = item.ChildCount || seasons.length || 0;

	// Media source info
	const mediaSource = item.MediaSources?.[selectedVersionIndex] || item.MediaSources?.[0];
	const audioStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	const subtitleStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
	const supportsMediaSourceSelection = item.MediaType === 'Video' &&
		item.MediaSources?.length > 0 &&
		item.MediaSources[0].Type !== 'Placeholder';
	const hasMultipleVersions = supportsMediaSourceSelection && (item.MediaSources?.length || 0) > 1;
	const hasMultipleAudio = supportsMediaSourceSelection && audioStreams.length > 1;
	const hasSubtitles = supportsMediaSourceSelection && subtitleStreams.length > 0;
	const currentAudioStream = audioStreams[selectedAudioIndex];
	const currentSubtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreams[selectedSubtitleIndex] : null;

	// Metadata
	const genres = item.Genres || [];
	const tagline = item.Taglines?.[0];
	const directors = item.People?.filter(p => p.Type === 'Director') || [];
	const writers = item.People?.filter(p => p.Type === 'Writer') || [];
	const studios = item.Studios || [];

	const hasPlaybackPosition = item.UserData?.PlaybackPositionTicks > 0;
	const resumeTimeText = hasPlaybackPosition ? formatDuration(item.UserData.PlaybackPositionTicks) : '';

	// Person-specific data
	const personMovies = isPerson ? similar.filter(i => i.Type === 'Movie') : [];
	const personSeries = isPerson ? similar.filter(i => i.Type === 'Series') : [];
	const birthDate = isPerson && item.PremiereDate ? new Date(item.PremiereDate) : null;
	const birthPlace = isPerson && item.ProductionLocations?.length > 0 ? item.ProductionLocations[0] : '';

	// === RENDER HELPERS ===

	const renderBackdrop = () => (
		<>
			{backdropUrl && !isPerson && (
				<div className={css.backdrop}>
					<img
						src={backdropUrl}
						className={css.backdropImage}
						alt=""
						style={settings.backdropBlurDetail > 0 ? {filter: `blur(${settings.backdropBlurDetail}px)`} : undefined}
					/>
				</div>
			)}
			{isPerson && <div className={`${css.backdrop} ${css.personBackdrop}`} />}
			<div className={css.backdropGradient} />
		</>
	);

	const renderMediaInfoModal = () => {
		if (!showMediaInfo || !mediaSource) return null;
		const streams = mediaSource.MediaStreams || [];
		return (
			<div className={css.modalOverlay} onClick={handleCloseMediaInfo}>
				<div className={css.mediaInfoMenu} onClick={handleStopPropagation}>
					<h3 className={css.modalTitle}>{$L('Media Info')}</h3>
					<div className={css.mediaInfoContent}>
						{streams.length === 0 && <p className={css.mediaInfoRow}>{$L('No media info available')}</p>}
						{streams.map((stream, i) => (
							<div key={i} className={css.mediaInfoStream}>
								<div className={css.mediaInfoStreamHeader}>
									{stream.Type}{stream.Language ? ` (${stream.Language})` : ''}
								</div>
								{stream.DisplayTitle && <div className={css.mediaInfoRow}>{stream.DisplayTitle}</div>}
								{stream.Type === 'Video' && (
									<div className={css.mediaInfoRow}>
										{[
											stream.Width && stream.Height ? `${stream.Width}×${stream.Height}` : null,
											stream.Codec?.toUpperCase(),
											stream.BitRate ? `${Math.round(stream.BitRate / 1000000)} Mbps` : null,
											stream.VideoRange,
											stream.VideoRangeType && stream.VideoRangeType !== 'SDR' ? stream.VideoRangeType : null
										].filter(Boolean).join(' · ')}
									</div>
								)}
								{stream.Type === 'Audio' && (
									<div className={css.mediaInfoRow}>
										{[
											stream.Codec?.toUpperCase(),
											stream.Channels ? `${stream.Channels} ch` : null,
											stream.SampleRate ? `${stream.SampleRate} Hz` : null,
											stream.BitRate ? `${Math.round(stream.BitRate / 1000)} kbps` : null
										].filter(Boolean).join(' · ')}
									</div>
								)}
								{stream.Type === 'Subtitle' && (
									<div className={css.mediaInfoRow}>
										{[stream.Codec?.toUpperCase(), stream.IsExternal ? $L('External') : $L('Embedded')].filter(Boolean).join(' · ')}
									</div>
								)}
							</div>
						))}
					</div>
					<div className={css.mediaInfoClose}>
						<SpottableDiv className={css.mediaInfoCloseBtn} onClick={handleCloseMediaInfo} spotlightId="media-info-close">
							{$L('Close')}
						</SpottableDiv>
					</div>
				</div>
			</div>
		);
	};

	const renderActionButtons = (showPlayButtons = true) => (
		<HorizontalContainer className={css.actionButtons} onKeyDown={handleButtonRowKeyDown} onFocus={handleButtonRowFocus} spotlightId="details-action-buttons">
			{showPlayButtons && !isBook && hasPlaybackPosition && (
				<SpottableDiv className={css.btnWrapper} onClick={handleResume} spotlightId="details-primary-btn">
					<div className={css.btnAction}>
						<span className={css.btnIcon}>▶</span>
					</div>
					<span className={css.btnLabel}>{$L('Resume')}</span>
					<span className={css.btnDetail}>{resumeTimeText}</span>
				</SpottableDiv>
			)}
			{showPlayButtons && (isBook ? isReadableBook : true) && (
				<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}>
					<div className={css.btnAction}>
						{hasPlaybackPosition && !isBook ? (
							<svg className={css.btnIcon} viewBox="0 -960 960 960">
								<path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/>
							</svg>
						) : isBook ? (
							<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
								<path d="M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394ZM480-160q-48-38-104-59t-116-21q-42 0-82.5 11T96-204q-19 11-37.5-1T40-238v-462q0-11 5.5-21T62-734q46-24 96-37t102-13q58 0 113.5 15T480-728q51-26 106.5-41T700-784q52 0 102 13t96 37q11 7 16.5 17t5.5 21v462q0 23-18.5 35t-37.5 1q-41-24-81.5-35T700-244q-60 0-116 21t-104 63ZM276-489Z"/>
							</svg>
						) : (
							<span className={css.btnIcon}>▶</span>
						)}
					</div>
					<span className={css.btnLabel}>{isBook ? $L('Read') : hasPlaybackPosition ? $L('Restart') : $L('Play')}</span>
				</SpottableDiv>
			)}
			{(isSeries || isSeason) && (
				<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Shuffle')}</span>
				</SpottableDiv>
			)}
			{hasMultipleVersions && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenVersionModal}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T740-80H240Zm280-520v-200H240v640h500v-440H520ZM240-800v200-200 640-640Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Version')}</span>
					<span className={css.btnDetail}>{mediaSource?.Name || `${$L('Version')} ${selectedVersionIndex + 1}`}</span>
				</SpottableDiv>
			)}
			{hasMultipleAudio && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenAudioModal}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Audio')}</span>
					{currentAudioStream && (
						<span className={css.btnDetail}>
							{currentAudioStream.DisplayTitle || currentAudioStream.Language || `${$L('Track')} ${selectedAudioIndex + 1}`}
						</span>
					)}
				</SpottableDiv>
			)}
			{supportsMediaSourceSelection && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenSubtitleModal}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm0-80h560v-480H200v480Zm80-120h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360ZM200-240v-480 480Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Subtitle')}</span>
					{currentSubtitleStream ? (
						<span className={css.btnDetail}>
							{currentSubtitleStream.DisplayTitle || currentSubtitleStream.Language || `${$L('Track')} ${selectedSubtitleIndex + 1}`}
						</span>
					) : (
						<span className={css.btnDetail}>{$L('Off')}</span>
					)}
				</SpottableDiv>
			)}
			{(item.LocalTrailerCount > 0 || item.RemoteTrailers?.length > 0) && (
				<SpottableDiv className={css.btnWrapper} onClick={handleTrailer}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M160-120v-720h80v80h80v-80h320v80h80v-80h80v720h-80v-80h-80v80H320v-80h-80v80h-80Zm80-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm400 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80ZM400-200h160v-560H400v560Zm0-560h160-160Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Trailer')}</span>
				</SpottableDiv>
			)}
			<SpottableDiv className={css.btnWrapper} onClick={handleToggleWatched} spotlightId="details-watched-btn">
				<div className={css.btnAction}>
					<svg className={`${css.btnIcon} ${item.UserData?.Played ? css.watched : ''}`} viewBox="0 -960 960 960" fill="currentColor">
						<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
					</svg>
				</div>
				<span className={css.btnLabel}>{item.UserData?.Played ? $L('Watched') : $L('Mark Watched')}</span>
			</SpottableDiv>
			<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
				<div className={css.btnAction}>
					<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
						<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
					</svg>
				</div>
				<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
			</SpottableDiv>
			{isEpisode && item.SeriesId && (
				<SpottableDiv className={css.btnWrapper} onClick={handleGoToSeries}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M240-120v-80l40-40H160q-33 0-56.5-23.5T80-320v-440q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v440q0 33-23.5 56.5T800-240H680l40 40v80H240Zm-80-200h640v-440H160v440Zm0 0v-440 440Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Series')}</span>
				</SpottableDiv>
			)}
			{supportsMediaSourceSelection && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenMediaInfo}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Media Info')}</span>
				</SpottableDiv>
			)}
			<SpottableDiv className={css.btnWrapper} onClick={handleOpenPlaylistModal}>
				<div className={css.btnAction}>
					<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
						<path d="M120-320v-80h480v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Zm520 480v-320l240 160-240 160Z"/>
					</svg>
				</div>
				<span className={css.btnLabel}>{$L('Add to Playlist')}</span>
			</SpottableDiv>
		</HorizontalContainer>
	);

	const renderMetadata = () => {
		const metaItems = [];
		if (genres.length > 0) metaItems.push({label: $L('Genres'), value: genres.slice(0, 3).join(', ')});
		if (directors.length > 0) metaItems.push({label: $L('Director'), value: directors.map(d => d.Name).join(', ')});
		if (writers.length > 0) metaItems.push({label: $L('Writers'), value: writers.map(w => w.Name).join(', ')});
		if (studios.length > 0) metaItems.push({label: $L('Studio'), value: studios.map(s => s.Name).join(', ')});
		if (metaItems.length === 0) return null;
		return (
			<div className={css.metadataGroup}>
				{metaItems.map((meta, i) => (
					<div key={i} className={css.metadataCell}>
						<span className={css.metadataLabel}>{meta.label}</span>
						<span className={css.metadataValue}>{meta.value}</span>
					</div>
				))}
			</div>
		);
	};

	// === PERSON RENDER ===

	if (isPerson) {
		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.personHeader}>
							<div className={css.personPhotoWrapper}>
								{item.ImageTags?.Primary ? (
									<img
										src={getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxHeight: 450, quality: 90})}
										className={css.personPhoto}
										alt=""
									/>
								) : (
									<div className={css.personPhotoPlaceholder}>
										<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/></svg>
									</div>
								)}
							</div>
							<div className={css.personInfo}>
								<h1 className={css.title}>{item.Name}</h1>
								<div className={css.infoRow}>
									{birthDate && (
										<span className={css.infoItem}>
											{$L('Born')} {birthDate.toLocaleDateString()}
											{' '}({$L('age')} {Math.floor((Date.now() - birthDate.getTime()) / 31557600000)})
										</span>
									)}
									{birthPlace && <span className={css.infoItem}>{birthPlace}</span>}
								</div>
								{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}
								{item.Overview && <p className={css.overview}>{item.Overview}</p>}
							</div>
						</div>

						<div className={css.sectionsContainer}>
							{personMovies.length > 0 && (
								<MediaRow
									title={`${$L('Movies')} (${personMovies.length})`}
									items={personMovies}
									serverUrl={effectiveServerUrl}
									onSelectItem={onSelectItem}
									className={css.inlineRow}
								/>
							)}
							{personSeries.length > 0 && (
								<MediaRow
									title={`${$L('TV Series')} (${personSeries.length})`}
									items={personSeries}
									serverUrl={effectiveServerUrl}
									onSelectItem={onSelectItem}
									className={css.inlineRow}
								/>
							)}
						</div>
					</div>
				</Scroller>
			</div>
		);
	}

	// === SEASON DETAIL RENDER ===

	if (isSeason) {
		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.seasonDetailHeader}>
							{posterUrl && (
								<div className={css.seasonDetailPoster}>
									<img src={posterUrl} alt="" />
									<PosterBadges userData={item.UserData} />
								</div>
							)}
							<div className={css.seasonDetailInfo}>
								{item.SeriesName && <span className={css.seasonDetailSeries}>{item.SeriesName}</span>}
								<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
								<span className={css.seasonDetailCount}>
									{episodes.length} {episodes.length !== 1 ? $L('Episodes') : $L('Episode')}
								</span>
								{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}
							</div>
						</div>

						{episodes.length > 0 && (
							<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={handleButtonRowFocus}>
								<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
									<div className={css.btnAction}>
										<span className={css.btnIcon}>▶</span>
									</div>
									<span className={css.btnLabel}>{$L('Play')}</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{$L('Shuffle')}</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleToggleWatched} spotlightId="season-watched-btn">
									<div className={css.btnAction}>
										<svg className={`${css.btnIcon} ${item.UserData?.Played ? css.watched : ''}`} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{item.UserData?.Played ? $L('Watched') : $L('Unwatched')}</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="season-favorite-btn">
									<div className={css.btnAction}>
										<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
											<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
								</SpottableDiv>
							</HorizontalContainer>
						)}

						<div className={css.seasonEpisodesList}>
							{episodes.map(ep => {
								const epThumbUrl = ep.ImageTags?.Primary
									? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80})
									: null;
								const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
								const epProgress = ep.UserData?.PlayedPercentage || 0;
								const isPlayed = ep.UserData?.Played;

								return (
									<SpottableDiv key={ep.Id} className={css.seasonEp} data-episode-id={ep.Id} onClick={handleEpisodeSelect}>
										<div className={css.seasonEpThumb}>
											{epThumbUrl ? (
												<img src={epThumbUrl} alt="" />
											) : (
												<div className={css.seasonEpThumbPlaceholder}>
													<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z"/></svg>
												</div>
											)}
											{epProgress > 0 && (
												<div className={css.episodeProgress}>
													<div className={css.episodeProgressBar} style={{width: `${Math.min(epProgress, 100)}%`}} />
												</div>
											)}
											{isPlayed && (
												<div className={css.watchedIndicator}>
													<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/></svg>
												</div>
											)}
											{ep.UserData?.IsFavorite && (
												<div className={css.favoriteBadge}>
													<svg viewBox="0 0 24 24"><path fill="#ff4081" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
												</div>
											)}
										</div>
										<div className={css.seasonEpBody}>
											<div className={css.seasonEpTop}>
												<span className={css.seasonEpNumber}>{$L('Episode')} {ep.IndexNumber || '?'}</span>
												<span className={css.seasonEpMeta}>
													{epRuntime && <span>{epRuntime}</span>}
												</span>
											</div>
											<span className={css.seasonEpTitle}>{ep.Name}</span>
											{ep.Overview && <p className={css.seasonEpOverview}>{ep.Overview}</p>}
										</div>
									</SpottableDiv>
								);
							})}
						</div>
					</div>
				</Scroller>
			</div>
		);
	}

	if (isPlaylist) {
		const playlistItemCount = playlistItems.length;
		const totalDuration = playlistItems.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);

		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.seasonDetailHeader}>
							{posterUrl && (
								<div className={css.seasonDetailPoster}>
									<img src={posterUrl} alt="" />
									<PosterBadges userData={item.UserData} />
								</div>
							)}
							<div className={css.seasonDetailInfo}>
								<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
								<span className={css.seasonDetailCount}>
									{playlistItemCount} {playlistItemCount !== 1 ? $L('Items') : $L('Item')}
									{totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
								</span>
								{genres.length > 0 && (
									<span className={css.seasonDetailCount}>{genres.join(', ')}</span>
								)}
								{item.Overview && <p className={css.overview}>{item.Overview}</p>}
							</div>
						</div>

						<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={handleButtonRowFocus}>
							{playlistItems.length > 0 && (
								<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
									<div className={css.btnAction}>
										<span className={css.btnIcon}>▶</span>
									</div>
									<span className={css.btnLabel}>{$L('Play')}</span>
								</SpottableDiv>
							)}
							{playlistItems.length > 1 && (
								<SpottableDiv className={css.btnWrapper} onClick={handlePlaylistShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{$L('Shuffle')}</span>
								</SpottableDiv>
							)}
							<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
								<div className={css.btnAction}>
									<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
										<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
							</SpottableDiv>
						</HorizontalContainer>

						<p className={css.playlistHint}>{$L('◀ ▶ to re-order · DEL to remove')}</p>

						<div className={`${css.trackList} ${css.playlistItemsList}`} onKeyDown={handlePlaylistItemKeyDown}>
							{playlistItems.map((plItem, idx) => {
								const plDuration = plItem.RunTimeTicks ? formatDuration(plItem.RunTimeTicks) : '';
								const plArtist = plItem.AlbumArtist || plItem.Artists?.[0] || '';
								const isAudio = plItem.MediaType === 'Audio';
								const thumbUrl = plItem.ImageTags?.Primary
									? getImageUrl(effectiveServerUrl, plItem.Id, 'Primary', {maxHeight: 80, quality: 80})
									: null;

								return (
									<SpottableDiv
										key={plItem.PlaylistItemId || plItem.Id}
										className={css.playlistItem}
										data-playlist-item-id={plItem.Id}
										data-playlist-index={idx}
										onClick={handlePlaylistItemSelect}
									>
										<span className={css.trackNumber}>{idx + 1}</span>
										{thumbUrl && (
											<div className={css.playlistItemThumb}>
												<img src={thumbUrl} alt="" />
											</div>
										)}
										<div className={css.trackInfo}>
											<span className={css.trackTitle}>{plItem.Name}</span>
											{plArtist && <span className={css.trackArtist}>{plArtist}</span>}
											{!isAudio && plItem.Type && <span className={css.trackArtist}>{plItem.Type}</span>}
										</div>
										<span className={css.trackDuration}>{plDuration}</span>
										<div className={css.playlistReorderArrows}>
											<span className={`${css.reorderArrow} ${idx === 0 ? css.reorderArrowDisabled : ''}`}>▲</span>
											<span className={`${css.reorderArrow} ${idx === playlistItems.length - 1 ? css.reorderArrowDisabled : ''}`}>▼</span>
										</div>
									</SpottableDiv>
								);
							})}
						</div>
					</div>
				</Scroller>

				{toastMessage && (
					<div className={css.toast} onAnimationEnd={() => setToastMessage(null)}>{toastMessage}</div>
				)}
			</div>
		);
	}

	// === ALBUM DETAIL RENDER ===

	if (isAlbum) {
		const albumArtist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || '';
		const trackCount = albumTracks.length;
		const totalDuration = albumTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);

		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.seasonDetailHeader}>
							{posterUrl && (
								<div className={css.seasonDetailPoster}>
									<img src={posterUrl} alt="" />
									<PosterBadges userData={item.UserData} />
								</div>
							)}
							<div className={css.seasonDetailInfo}>
								{albumArtist && <span className={css.seasonDetailSeries}>{albumArtist}</span>}
								<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
								<span className={css.seasonDetailCount}>
									{year ? `${year} · ` : ''}{trackCount} {trackCount !== 1 ? $L('Tracks') : $L('Track')}
									{totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
								</span>
								{genres.length > 0 && (
									<span className={css.seasonDetailCount}>{genres.join(', ')}</span>
								)}
								{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}
							</div>
						</div>

						<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={handleButtonRowFocus}>
							{albumTracks.length > 0 && (
								<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
									<div className={css.btnAction}>
										<span className={css.btnIcon}>▶</span>
									</div>
									<span className={css.btnLabel}>{$L('Play')}</span>
								</SpottableDiv>
							)}
							{albumTracks.length > 1 && (
								<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{$L('Shuffle')}</span>
								</SpottableDiv>
							)}
							<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
								<div className={css.btnAction}>
									<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
										<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
							</SpottableDiv>
						</HorizontalContainer>

						<div className={css.trackList}>
							<div className={css.sectionHeader}>
								<h3 className={css.sectionTitle}>Tracks ({trackCount})</h3>
							</div>
							{albumTracks.map((track, idx) => {
								const trackDuration = track.RunTimeTicks ? formatDuration(track.RunTimeTicks) : '';
								const isPlayed = track.UserData?.Played;
								const trackArtist = track.AlbumArtist || track.Artists?.[0] || '';
								const showArtist = trackArtist && trackArtist !== albumArtist;

								return (
									<SpottableDiv key={track.Id} className={css.trackItem} data-track-id={track.Id} onClick={handleTrackPlay}>
										<span className={css.trackNumber}>{track.IndexNumber || idx + 1}</span>
										<div className={css.trackInfo}>
											<span className={css.trackTitle}>{track.Name}</span>
											{showArtist && <span className={css.trackArtist}>{trackArtist}</span>}
										</div>
										{isPlayed && (
											<span className={css.trackPlayed}>
												<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/></svg>
											</span>
										)}
										<span className={css.trackDuration}>{trackDuration}</span>
									</SpottableDiv>
								);
							})}
						</div>

						{item.Overview && (
							<div className={css.albumOverview}>
								<p className={css.overview}>{item.Overview}</p>
							</div>
						)}

						<div className={css.sectionsContainer}>
							{similar.length > 0 && (
								<MediaRow
									title={$L('More Like This')}
									items={similar}
									serverUrl={effectiveServerUrl}
									cardType="square"
									onSelectItem={onSelectItem}
									className={css.inlineRow}
									rowIndex={0}
								/>
							)}
						</div>
					</div>
				</Scroller>
			</div>
		);
	}

	// === ARTIST DETAIL RENDER ===

	if (isMusicArtist) {
		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.personHeader}>
							<div className={css.personPhotoWrapper}>
								{item.ImageTags?.Primary ? (
									<img
										src={getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxHeight: 450, quality: 90})}
										className={css.personPhoto}
										alt=""
									/>
								) : (
									<div className={css.personPhotoPlaceholder}>
										<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/></svg>
									</div>
								)}
							</div>
							<div className={css.personInfo}>
								<h1 className={css.title}>{item.Name}</h1>
								{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}
								{item.Overview && <p className={css.overview}>{item.Overview}</p>}
								<HorizontalContainer className={css.actionButtons} spotlightId="details-action-buttons">
									{artistAlbums.length > 0 && (
										<SpottableDiv className={css.btnWrapper} onClick={handleArtistPlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
											<div className={css.btnAction}>
												<span className={css.btnIcon}>▶</span>
											</div>
											<span className={css.btnLabel}>{$L('Play')}</span>
										</SpottableDiv>
									)}
									{artistAlbums.length > 0 && (
										<SpottableDiv className={css.btnWrapper} onClick={handleArtistShuffle}>
											<div className={css.btnAction}>
												<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor"><path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 568-568H624v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/></svg>
											</div>
											<span className={css.btnLabel}>{$L('Shuffle')}</span>
										</SpottableDiv>
									)}
									<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
										<div className={css.btnAction}>
											<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
												<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
											</svg>
										</div>
										<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
									</SpottableDiv>
								</HorizontalContainer>
							</div>
						</div>

						<div className={css.sectionsContainer}>
							{artistAlbums.length > 0 && (
								<MediaRow
									title={$L('Discography') + ' (' + artistAlbums.length + ')'}
									items={artistAlbums}
									serverUrl={effectiveServerUrl}
									cardType="square"
									onSelectItem={onSelectItem}
									className={css.inlineRow}
									rowIndex={0}
								/>
							)}

							{similar.length > 0 && (
								<MediaRow
									title={$L('Similar Artists')}
									items={similar}
									serverUrl={effectiveServerUrl}
									cardType="square"
									onSelectItem={onSelectItem}
									className={css.inlineRow}
									rowIndex={1}
								/>
							)}
						</div>
					</div>
				</Scroller>
			</div>
		);
	}

	// === AUDIO TRACK DETAIL RENDER ===

	if (isAudioTrack) {
		const trackArtist = item.AlbumArtist || item.Artists?.[0] || '';
		const albumName = item.Album || '';

		return (
			<div className={css.page}>
				{renderBackdrop()}
				<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
					<div className={css.content}>
						<div className={css.detailsHeader}>
							<div className={css.infoSection}>
								{trackArtist && <span className={css.seriesName}>{trackArtist}</span>}
								<div className={css.titleSection}>
									<h1 className={css.title}>{item.Name}</h1>
								</div>
								<div className={css.infoRow}>
									<div className={css.infoTextItems}>
										{albumName && <span className={css.infoItem}>{albumName}</span>}
										{year && <span className={css.infoItem}>{year}</span>}
										{runtime && <span className={css.infoItem}>{runtime}</span>}
									</div>
									{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}
								</div>
								{item.Overview && <p className={css.overview}>{item.Overview}</p>}
							</div>
							<div className={css.posterSection}>
								<div className={css.poster}>
									{posterUrl ? (
										<img src={posterUrl} alt="" />
									) : (
										<div className={css.posterPlaceholder}>
											<svg viewBox="0 -960 960 960" fill="currentColor">
												<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
											</svg>
										</div>
									)}
									<PosterBadges userData={item.UserData} />
								</div>
							</div>
						</div>

						<HorizontalContainer className={css.actionButtons} spotlightId="details-action-buttons">
							<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
								<div className={css.btnAction}>
									<span className={css.btnIcon}>▶</span>
								</div>
								<span className={css.btnLabel}>{$L('Play')}</span>
							</SpottableDiv>
							<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
								<div className={css.btnAction}>
									<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
										<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
							</SpottableDiv>
						</HorizontalContainer>
					</div>
				</Scroller>
			</div>
		);
	}

	// === MAIN DETAILS RENDER (Movie / Series / Episode / BoxSet) ===

	return (
		<div className={css.page}>
			{renderBackdrop()}

			<Scroller ref={pageScrollerRef} cbScrollTo={handlePageScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
				<div className={css.content}>
					{/* Header: info + poster */}
					<div className={css.detailsHeader}>
					<div className={`${css.infoSection} ${isEpisode ? css.infoSectionWide : ''}`}>
							{/* Episode header */}
							{isEpisode && (
								<div className={css.episodeHeader}>
									{item.SeriesName && <span className={css.seriesName}>{item.SeriesName}</span>}
									{item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined && (
										<span className={css.episodeNumber}>S{item.ParentIndexNumber} E{item.IndexNumber}</span>
									)}
								</div>
							)}

							{/* Title or Logo */}
							<div className={css.titleSection}>
								{logoUrl ? (
									<img src={logoUrl} className={css.logoImage} alt={item.Name} />
								) : (
									<h1 className={css.title}>{item.Name}</h1>
								)}
							</div>

							{/* Info row with badges */}
							<div className={css.infoRow}>
								{/* Text items with bullet separators */}
								<div className={css.infoTextItems}>
									{year && <span className={css.infoItem}>{year}</span>}
									{officialRating && <span className={css.infoItem}>{officialRating}</span>}
									{runtime && !isSeries && <span className={css.infoItem}>{runtime}</span>}
									{endsAt && !isSeries && <span className={css.infoItem}>{endsAt}</span>}
									{isSeries && seasonCount > 0 && (
										<span className={css.infoItem}>{seasonCount} {seasonCount !== 1 ? $L('Seasons') : $L('Season')}</span>
									)}
								</div>
								{/* Media badges */}
								{badges.length > 0 && (
									<div className={css.infoBadges}>
										{badges.map((badge, i) => (
											<span key={i} className={`${css.badge} ${css[badge.type]}`}>{badge.label}</span>
										))}
									</div>
								)}
							</div>

							<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false} />

							{/* Tagline */}
							{tagline && <p className={css.tagline}>&ldquo;{tagline}&rdquo;</p>}

							{/* Overview */}
							{item.Overview && <p className={css.overview}>{item.Overview}</p>}
						</div>

						{/* Poster section */}
						<div className={`${css.posterSection} ${isEpisode ? css.posterLandscape : ''}`}>
							<div className={css.poster}>
								{posterUrl ? (
									<img src={posterUrl} alt="" />
								) : (
									<div className={css.posterPlaceholder}>
										<svg viewBox="0 0 24 24" fill="currentColor">
											<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
										</svg>
									</div>
								)}
								<PosterBadges userData={item.UserData} />
							</div>
						</div>
					</div>

					{!isBoxSet && renderActionButtons()}

					{/* Metadata */}
					{renderMetadata()}

					{/* Sections */}
					<div className={css.sectionsContainer} onKeyDown={handleSectionKeyDown}>
						{/* Next Up (for Series) */}
						{nextUp.length > 0 && (
							<MediaRow
								title={$L('Next Up')}
								items={nextUp}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								cardType="landscape"
								className={css.inlineRow}
							/>
						)}

						{/* Seasons (for Series) */}
						{isSeries && seasons.length > 0 && (
							<RowContainer className={css.section}>
								<div className={css.sectionHeader}>
									<h3 className={css.sectionTitle}>{$L('Seasons')}</h3>
								</div>
								<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
									{seasons.map(season => {
										const seasonPosterUrl = season.ImageTags?.Primary
											? getImageUrl(effectiveServerUrl, season.Id, 'Primary', {maxHeight: 350, quality: 80})
											: null;
										const isWatched = season.UserData?.Played;
										const unplayed = season.UserData?.UnplayedItemCount;

										return (
											<SpottableDiv key={season.Id} className={css.seasonCard} data-season-id={season.Id} onClick={handleSeasonSelect}>
												<div className={css.seasonPosterWrapper}>
													{seasonPosterUrl ? (
														<img src={seasonPosterUrl} alt="" />
													) : (
														<div className={css.seasonPosterPlaceholder}>
															<span>{season.Name}</span>
														</div>
													)}
													{isWatched && (
														<div className={css.watchedIndicator}>
															<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/></svg>
														</div>
													)}
													{!isWatched && unplayed > 0 && (
														<div className={css.unplayedCount}>{unplayed}</div>
													)}
												</div>
												<span className={css.seasonName}>{season.Name}</span>
											</SpottableDiv>
										);
									})}
								</div>
							</RowContainer>
						)}

						{/* Episodes (for Episode type - same season horizontal cards) */}
						{isEpisode && episodes.length > 0 && (
							<RowContainer className={css.section}>
								<div className={css.sectionHeader}>
									<h3 className={css.sectionTitle}>
										{item.ParentIndexNumber !== undefined ? $L('Season {number} Episodes').replace('{number}', item.ParentIndexNumber) : $L('Episodes')}
									</h3>
								</div>
								<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
									{episodes.map(ep => {
										const epThumbUrl = ep.ImageTags?.Primary
											? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80})
											: null;
										const isCurrentEp = ep.Id === item.Id;
										const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
										const epProgress = ep.UserData?.PlayedPercentage || 0;

										return (
											<SpottableDiv
												key={ep.Id}
												className={`${css.episodeCard} ${isCurrentEp ? css.episodeCurrent : ''}`}
												data-episode-id={ep.Id}
												onClick={handleEpisodeSelect}
											>
												<div className={css.episodeThumb}>
													{epThumbUrl ? (
														<img src={epThumbUrl} alt="" />
													) : (
														<div className={css.episodeThumbPlaceholder}>
															<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z"/></svg>
														</div>
													)}
													{epProgress > 0 && (
														<div className={css.episodeProgress}>
															<div className={css.episodeProgressBar} style={{width: `${Math.min(epProgress, 100)}%`}} />
														</div>
													)}
													{ep.UserData?.Played && (
														<div className={css.watchedIndicator}>
															<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
														</div>
													)}
													{ep.UserData?.IsFavorite && (
														<div className={css.favoriteBadge}>
															<svg viewBox="0 0 24 24"><path fill="#ff4081" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
														</div>
													)}
												</div>
												<div className={css.episodeInfo}>
													<span className={css.episodeEpNumber}>E{ep.IndexNumber || '?'}</span>
													<span className={css.episodeEpTitle}>{ep.Name}</span>
													{epRuntime && <span className={css.episodeEpRuntime}>{epRuntime}</span>}
												</div>
											</SpottableDiv>
										);
									})}
								</div>
							</RowContainer>
						)}

						{/* Collection items (for BoxSet) */}
						{isBoxSet && collectionItems.length > 0 && (
							<MediaRow
								title={$L('Items in Collection')}
								items={collectionItems}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								className={css.inlineRow}
							/>
						)}

						{/* Cast & Crew */}
						{cast.length > 0 && (
							<RowContainer className={css.section}>
								<div className={css.sectionHeader}>
									<h3 className={css.sectionTitle}>{$L('Cast & Crew')}</h3>
								</div>
								<div className={css.castScroller} onFocus={handleScrollerFocus}>
									{cast.map(person => (
										<SpottableDiv key={person.Id} className={css.castCard} data-person-id={person.Id} onClick={handleCastSelect}>
											<div className={css.castImageWrapper}>
												{person.PrimaryImageTag ? (
													<img
														src={getImageUrl(effectiveServerUrl, person.Id, 'Primary', {maxHeight: 280, quality: 80})}
														className={css.castImage}
														alt=""
													/>
												) : (
													<div className={css.castPlaceholder}>
														{person.Name?.charAt(0)}
													</div>
												)}
											</div>
											<span className={css.castName}>{person.Name}</span>
											<span className={css.castRole}>{person.Role || person.Type}</span>
										</SpottableDiv>
									))}
								</div>
							</RowContainer>
						)}

						{/* More Like This */}
						{similar.length > 0 && (
							<MediaRow
								title={$L('More Like This')}
								items={similar}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								className={css.inlineRow}
							/>
						)}
					</div>
				</div>
			</Scroller>

			{/* Version / Audio / Subtitle Track Modals */}
			{activeModal === 'version' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="version" spotlightId="version-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Version')}</h2>
						<div className={css.trackList}>
							{item.MediaSources.map((source, i) => {
								const video = source.MediaStreams?.find(s => s.Type === 'Video');
								const resLabel = video?.Width >= 3800 ? '4K' : video?.Width >= 1900 ? '1080p' : video?.Width >= 1260 ? '720p' : video?.Width ? `${video.Width}p` : '';
								return (
									<SpottableButton
										key={source.Id}
										className={`${css.trackItem} ${i === selectedVersionIndex ? css.selected : ''}`}
										data-index={i}
										data-selected={i === selectedVersionIndex ? 'true' : undefined}
										onClick={handleSelectVersion}
									>
										<span className={css.trackName}>{source.Name || `${$L('Version')} ${i + 1}`}</span>
										{resLabel && <span className={css.trackInfo}>{resLabel}</span>}
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Audio Track')}</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => (
								<SpottableButton
									key={stream.Index}
									className={`${css.trackItem} ${i === selectedAudioIndex ? css.selected : ''}`}
									data-index={i}
									data-selected={i === selectedAudioIndex ? 'true' : undefined}
									onClick={handleSelectAudio}
								>
									<span className={css.trackName}>{stream.DisplayTitle || stream.Language || `${$L('Track')} ${i + 1}`}</span>
									{stream.Channels && <span className={css.trackInfo}>{stream.Channels}ch</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Subtitle')}</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${selectedSubtitleIndex === -1 ? css.selected : ''}`}
								data-index={-1}
								data-selected={selectedSubtitleIndex === -1 ? 'true' : undefined}
								onClick={handleSelectSubtitle}
							>
								<span className={css.trackName}>{$L('Off')}</span>
							</SpottableButton>
							{subtitleStreams.map((stream, i) => (
								<SpottableButton
									key={stream.Index}
									className={`${css.trackItem} ${i === selectedSubtitleIndex ? css.selected : ''}`}
									data-index={i}
									data-selected={i === selectedSubtitleIndex ? 'true' : undefined}
									onClick={handleSelectSubtitle}
								>
									<span className={css.trackName}>{stream.DisplayTitle || stream.Language || `${$L('Track')} ${i + 1}`}</span>
									{stream.IsForced && <span className={css.trackInfo}>{$L('Forced')}</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>
							<SpottableButton spotlightId="btn-subtitle-download" className={css.actionBtn} onClick={handleOpenRemoteSubtitleSearch}>
								{$L('Download')}
							</SpottableButton>
						</p>
						<p className={css.trackModalFooter} style={{marginTop: 5, fontSize: 14, opacity: 0.5}}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitleDownload' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="subtitleDownload" spotlightId="subtitleDownload-modal">
						<h2 className={css.trackModalTitle}>{$L('Download Subtitles')}</h2>
						<div className={css.trackList}>
							{isSearchingRemoteSubtitles && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('Searching...')}</span>
								</SpottableDiv>
							)}
							{!isSearchingRemoteSubtitles && remoteSubtitleResults.length === 0 && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('No remote subtitles found')}</span>
								</SpottableDiv>
							)}
							{!isSearchingRemoteSubtitles && remoteSubtitleResults.map((subtitle, idx) => (
								<SpottableButton
									key={subtitle.id || idx}
									className={css.trackItem}
									data-index={idx}
									onClick={handleSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
									<span className={css.trackName}>{subtitle.name || $L('Subtitle')}</span>
									{subtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{subtitle.info}</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{renderMediaInfoModal()}

			{trailerOverlay && (
				<div className={css.trailerOverlay} onClick={handleCloseTrailer} onKeyDown={handleTrailerOverlayKeyDown}>
					<SpottableButton className={css.trailerCloseBtn} onClick={handleCloseTrailer} spotlightId="trailer-close-btn">
						<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
							<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
						</svg>
					</SpottableButton>
					<div className={css.trailerIframeWrap} onClick={handleStopPropagation}>
						{trailerStreamUrl ? (
							<video
								ref={trailerVideoRef}
								className={css.trailerIframe}
								src={trailerStreamUrl}
								autoPlay
								controls
								playsInline
							/>
						) : (
							<div className={css.trailerLoading}>
								{$L('Loading trailer...')}
							</div>
						)}
					</div>
				</div>
			)}

			<AddToPlaylistModal
				open={showPlaylistModal}
				itemId={item?.Id}
				api={effectiveApi}
				onClose={handleClosePlaylistModal}
				onSuccess={showToast}
			/>

			{toastMessage && (
				<div className={css.toast} onAnimationEnd={() => setToastMessage(null)}>{toastMessage}</div>
			)}
		</div>
	);
};

export default Details;