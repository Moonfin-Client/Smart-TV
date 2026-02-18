import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
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
			badges.push({type: 'badgeSurround', label: 'Stereo'});
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
	const [isLoading, setIsLoading] = useState(true);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);
	const [showMediaInfo, setShowMediaInfo] = useState(false);
	const [activeModal, setActiveModal] = useState(null);

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
			setShowMediaInfo(false);

			try {
				const data = await effectiveApi.getItem(itemId);
				setItem(tagWithServerInfo(data));

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
					} catch (e) { /* Next up not available */ }
				}

				if (data.Type === 'Season') {
					try {
						const episodesData = await effectiveApi.getEpisodes(data.SeriesId, data.Id);
						setEpisodes(tagWithServerInfo(episodesData.Items || []));
					} catch (e) { /* Episodes not available */ }
				}

				if (data.Type === 'Episode') {
					const seasonId = data.SeasonId || data.ParentId;
					if (data.SeriesId && seasonId) {
						try {
							const episodesData = await effectiveApi.getEpisodes(data.SeriesId, seasonId);
							setEpisodes(tagWithServerInfo(episodesData.Items || []));
						} catch (e) { /* Same-season episodes not available */ }
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
					} catch (e) { /* Collection items not available */ }
				}

				if (data.Type === 'MusicAlbum') {
					try {
						const tracksData = await effectiveApi.getAlbumTracks(data.Id);
						setAlbumTracks(tagWithServerInfo(tracksData.Items || []));
					} catch (e) { /* Album tracks not available */ }
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch (e) { /* Similar albums not available */ }
				}

				if (data.Type === 'MusicArtist') {
					try {
						const albumsData = await effectiveApi.getAlbumsByArtist(data.Id);
						setArtistAlbums(tagWithServerInfo(albumsData.Items || []));
					} catch (e) { /* Artist albums not available */ }
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch (e) { /* Similar artists not available */ }
				}

				if (data.Type !== 'Person' && data.Type !== 'BoxSet' && data.Type !== 'MusicAlbum' && data.Type !== 'MusicArtist') {
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch (e) { /* Similar items not available */ }
				}

				if (data.Type === 'Person') {
					try {
						const filmography = await effectiveApi.getItemsByPerson(itemId, 50);
						setSimilar(tagWithServerInfo(filmography.Items || []));
					} catch (e) { /* Filmography not available */ }
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
			const playMediaSource = item.MediaSources[0];
			const audioStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const subtitleStreamsList = playMediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const selectedAudio = audioStreamsList[selectedAudioIndex];
			const subtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreamsList[selectedSubtitleIndex] : null;
			playbackOptions = {
				audioStreamIndex: selectedAudio?.Index ?? selectedAudioIndex,
				subtitleStreamIndex: subtitleStream?.Index ?? selectedSubtitleIndex
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
		} else if (item.Type === 'MusicArtist') {
			// Navigate to first album
			if (artistAlbums.length > 0) {
				onSelectItem?.(artistAlbums[0]);
			}
		} else {
			onPlay?.(item, false, playbackOptions);
		}
	}, [item, episodes, nextUp, seasons, albumTracks, artistAlbums, onPlay, onSelectItem, selectedAudioIndex, selectedSubtitleIndex]);

	const handleResume = useCallback(() => {
		if (!item) return;

		const supportsSelection = item.MediaType === 'Video' &&
			item.MediaSources?.length > 0 &&
			item.MediaSources[0].Type !== 'Placeholder';

		let playbackOptions = {};
		if (supportsSelection) {
			const resumeMediaSource = item.MediaSources[0];
			const audioStreamsList = resumeMediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
			const subtitleStreamsList = resumeMediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
			const selectedAudio = audioStreamsList[selectedAudioIndex];
			const subtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreamsList[selectedSubtitleIndex] : null;
			playbackOptions = {
				audioStreamIndex: selectedAudio?.Index ?? selectedAudioIndex,
				subtitleStreamIndex: subtitleStream?.Index ?? selectedSubtitleIndex
			};
		}

		onPlay?.(item, true, playbackOptions);
	}, [item, onPlay, selectedAudioIndex, selectedSubtitleIndex]);

	const handleShuffle = useCallback(() => {
		if (item) {
			onPlay?.(item, false, true);
		}
	}, [item, onPlay]);

	const handleTrailer = useCallback(() => {
		if (item?.LocalTrailerCount > 0) {
			onPlay?.(item, false, false, true);
		} else if (item?.RemoteTrailers?.length > 0) {
			const trailerUrl = item.RemoteTrailers[0].Url;
			if (trailerUrl) {
				window.open(trailerUrl, '_blank');
			}
		}
	}, [item, onPlay]);

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

	const handleAlbumSelect = useCallback((ev) => {
		const albumId = ev.currentTarget.dataset.albumId;
		const album = artistAlbums.find(a => a.Id === albumId);
		if (album) {
			onSelectItem?.(album);
		}
	}, [artistAlbums, onSelectItem]);

	const handleCastSelect = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		if (personId) {
			onSelectPerson?.({Id: personId});
		}
	}, [onSelectPerson]);

	// Register back handler interceptor for modals
	useEffect(() => {
		if (!backHandlerRef) return;
		backHandlerRef.current = () => {
			if (activeModal) { closeModal(); return true; }
			if (showMediaInfo) { setShowMediaInfo(false); return true; }
			return false;
		};
		return () => { if (backHandlerRef) backHandlerRef.current = null; };
	}, [backHandlerRef, activeModal, showMediaInfo, closeModal]);

const handleSectionKeyDown = useCallback((ev) => {
		const currentSpottable = ev.target.closest('.spottable');
		if (!currentSpottable) return;

		if (ev.keyCode === 37 || ev.keyCode === 39) { // Left / Right
			const scroller = currentSpottable.closest(`.${css.sectionScroll}`) || currentSpottable.closest(`.${css.castScroller}`);
			if (!scroller) return; // Let MediaRow handle its own left/right

			const allCards = Array.from(scroller.querySelectorAll('.spottable'));
			const currentIdx = allCards.indexOf(currentSpottable);
			if (currentIdx === -1) return;

			const targetIdx = ev.keyCode === 37 ? currentIdx - 1 : currentIdx + 1;
			if (targetIdx < 0 || targetIdx >= allCards.length) return;

			ev.preventDefault();
			ev.stopPropagation();
			Spotlight.focus(allCards[targetIdx]);
		} else if (ev.keyCode === 38) { // Up arrow
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
		} else if (ev.keyCode === 40) { // Down arrow
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
		if (ev.keyCode === 40) { // Down arrow
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
		if (ev.keyCode === 40) { // Down arrow
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
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const h = hours % 12 || 12;
		const m = minutes < 10 ? '0' + minutes : minutes;
		return `Ends at ${h}:${m} ${ampm}`;
	})();
	const officialRating = item.OfficialRating || '';
	const communityRating = item.CommunityRating ? item.CommunityRating.toFixed(1) : '';
	const criticRating = item.CriticRating;
	const badges = getMediaBadges(item);
	const seasonCount = item.ChildCount || seasons.length || 0;

	// Media source info
	const mediaSource = item.MediaSources?.[0];
	const audioStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	const subtitleStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
	const supportsMediaSourceSelection = item.MediaType === 'Video' &&
		item.MediaSources?.length > 0 &&
		item.MediaSources[0].Type !== 'Placeholder';
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
					<h3 className={css.modalTitle}>Media Info</h3>
					<div className={css.mediaInfoContent}>
						{streams.length === 0 && <p className={css.mediaInfoRow}>No media info available</p>}
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
										{[stream.Codec?.toUpperCase(), stream.IsExternal ? 'External' : 'Embedded'].filter(Boolean).join(' · ')}
									</div>
								)}
							</div>
						))}
					</div>
					<div className={css.mediaInfoClose}>
						<SpottableDiv className={css.mediaInfoCloseBtn} onClick={handleCloseMediaInfo} spotlightId="media-info-close">
							Close
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
					<span className={css.btnLabel}>Resume</span>
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
					<span className={css.btnLabel}>{isBook ? 'Read' : hasPlaybackPosition ? 'Restart' : 'Play'}</span>
				</SpottableDiv>
			)}
			{(isSeries || isSeason) && (
				<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>Shuffle</span>
				</SpottableDiv>
			)}
			{hasMultipleAudio && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenAudioModal}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>Audio</span>
					{currentAudioStream && (
						<span className={css.btnDetail}>
							{currentAudioStream.DisplayTitle || currentAudioStream.Language || 'Track ' + (selectedAudioIndex + 1)}
						</span>
					)}
				</SpottableDiv>
			)}
			{hasSubtitles && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenSubtitleModal}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm0-80h560v-480H200v480Zm80-120h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360ZM200-240v-480 480Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>Subtitle</span>
					{currentSubtitleStream ? (
						<span className={css.btnDetail}>
							{currentSubtitleStream.DisplayTitle || currentSubtitleStream.Language || 'Track ' + (selectedSubtitleIndex + 1)}
						</span>
					) : (
						<span className={css.btnDetail}>Off</span>
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
					<span className={css.btnLabel}>Trailer</span>
				</SpottableDiv>
			)}
			<SpottableDiv className={css.btnWrapper} onClick={handleToggleWatched} spotlightId="details-watched-btn">
				<div className={css.btnAction}>
					<svg className={`${css.btnIcon} ${item.UserData?.Played ? css.watched : ''}`} viewBox="0 -960 960 960" fill="currentColor">
						<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
					</svg>
				</div>
				<span className={css.btnLabel}>{item.UserData?.Played ? 'Watched' : 'Mark Watched'}</span>
			</SpottableDiv>
			<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
				<div className={css.btnAction}>
					<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
						<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
					</svg>
				</div>
				<span className={css.btnLabel}>{item.UserData?.IsFavorite ? 'Favorited' : 'Favorite'}</span>
			</SpottableDiv>
			{isEpisode && item.SeriesId && (
				<SpottableDiv className={css.btnWrapper} onClick={handleGoToSeries}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M240-120v-80l40-40H160q-33 0-56.5-23.5T80-320v-440q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v440q0 33-23.5 56.5T800-240H680l40 40v80H240Zm-80-200h640v-440H160v440Zm0 0v-440 440Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>Series</span>
				</SpottableDiv>
			)}
			{supportsMediaSourceSelection && (
				<SpottableDiv className={css.btnWrapper} onClick={handleOpenMediaInfo}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
						</svg>
					</div>
					<span className={css.btnLabel}>Media Info</span>
				</SpottableDiv>
			)}
		</HorizontalContainer>
	);

	const renderMetadata = () => {
		const metaItems = [];
		if (genres.length > 0) metaItems.push({label: 'Genres', value: genres.slice(0, 3).join(', ')});
		if (directors.length > 0) metaItems.push({label: 'Director', value: directors.map(d => d.Name).join(', ')});
		if (writers.length > 0) metaItems.push({label: 'Writers', value: writers.map(w => w.Name).join(', ')});
		if (studios.length > 0) metaItems.push({label: 'Studio', value: studios.map(s => s.Name).join(', ')});
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
											Born {birthDate.toLocaleDateString()}
											{' '}(age {Math.floor((Date.now() - birthDate.getTime()) / 31557600000)})
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
									title={`Movies (${personMovies.length})`}
									items={personMovies}
									serverUrl={effectiveServerUrl}
									onSelectItem={onSelectItem}
									className={css.inlineRow}
								/>
							)}
							{personSeries.length > 0 && (
								<MediaRow
									title={`Series (${personSeries.length})`}
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
								</div>
							)}
							<div className={css.seasonDetailInfo}>
								{item.SeriesName && <span className={css.seasonDetailSeries}>{item.SeriesName}</span>}
								<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
								<span className={css.seasonDetailCount}>
									{episodes.length} Episode{episodes.length !== 1 ? 's' : ''}
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
									<span className={css.btnLabel}>Play</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>Shuffle</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleToggleWatched} spotlightId="season-watched-btn">
									<div className={css.btnAction}>
										<svg className={`${css.btnIcon} ${item.UserData?.Played ? css.watched : ''}`} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{item.UserData?.Played ? 'Watched' : 'Unwatched'}</span>
								</SpottableDiv>
								<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="season-favorite-btn">
									<div className={css.btnAction}>
										<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
											<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>{item.UserData?.IsFavorite ? 'Favorited' : 'Favorite'}</span>
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
										</div>
										<div className={css.seasonEpBody}>
											<div className={css.seasonEpTop}>
												<span className={css.seasonEpNumber}>Episode {ep.IndexNumber || '?'}</span>
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
								</div>
							)}
							<div className={css.seasonDetailInfo}>
								{albumArtist && <span className={css.seasonDetailSeries}>{albumArtist}</span>}
								<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
								<span className={css.seasonDetailCount}>
									{year ? `${year} · ` : ''}{trackCount} Track{trackCount !== 1 ? 's' : ''}
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
									<span className={css.btnLabel}>Play</span>
								</SpottableDiv>
							)}
							{albumTracks.length > 1 && (
								<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>Shuffle</span>
								</SpottableDiv>
							)}
							<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
								<div className={css.btnAction}>
									<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
										<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>{item.UserData?.IsFavorite ? 'Favorited' : 'Favorite'}</span>
							</SpottableDiv>
						</HorizontalContainer>

						<div className={css.trackList}>
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
									title="More Like This"
									items={similar}
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
										<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
											<div className={css.btnAction}>
												<span className={css.btnIcon}>▶</span>
											</div>
											<span className={css.btnLabel}>Play</span>
										</SpottableDiv>
									)}
									<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
										<div className={css.btnAction}>
											<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
												<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
											</svg>
										</div>
										<span className={css.btnLabel}>{item.UserData?.IsFavorite ? 'Favorited' : 'Favorite'}</span>
									</SpottableDiv>
								</HorizontalContainer>
							</div>
						</div>

						<div className={css.sectionsContainer}>
							{artistAlbums.length > 0 && (
								<RowContainer className={css.section}>
									<div className={css.sectionHeader}>
										<h3 className={css.sectionTitle}>Discography ({artistAlbums.length})</h3>
									</div>
									<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
										{artistAlbums.map(album => {
											const albumPosterUrl = album.ImageTags?.Primary
												? getImageUrl(effectiveServerUrl, album.Id, 'Primary', {maxHeight: 350, quality: 80})
												: null;

											return (
												<SpottableDiv key={album.Id} className={css.seasonCard} data-album-id={album.Id} onClick={handleAlbumSelect}>
													<div className={css.seasonPosterWrapper}>
														{albumPosterUrl ? (
															<img src={albumPosterUrl} alt="" />
														) : (
															<div className={css.seasonPosterPlaceholder}>
																<span>{album.Name}</span>
															</div>
														)}
													</div>
													<span className={css.seasonName}>{album.Name}</span>
													{album.ProductionYear && <span className={css.albumYear}>{album.ProductionYear}</span>}
												</SpottableDiv>
											);
										})}
									</div>
								</RowContainer>
							)}

							{similar.length > 0 && (
								<MediaRow
									title="Similar Artists"
									items={similar}
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
								</div>
							</div>
						</div>

						<HorizontalContainer className={css.actionButtons} spotlightId="details-action-buttons">
							<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId="details-primary-btn">
								<div className={css.btnAction}>
									<span className={css.btnIcon}>▶</span>
								</div>
								<span className={css.btnLabel}>Play</span>
							</SpottableDiv>
							<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite} spotlightId="details-favorite-btn">
								<div className={css.btnAction}>
									<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
										<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>{item.UserData?.IsFavorite ? 'Favorited' : 'Favorite'}</span>
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
										<span className={css.infoItem}>{seasonCount} Season{seasonCount !== 1 ? 's' : ''}</span>
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
								{/* Ratings */}
								{(communityRating || criticRating) && (
									<div className={css.infoRatings}>
										{communityRating && (
											<span className={css.ratingItem}>
												<span className={css.star}>★</span>{communityRating}
											</span>
										)}
										{criticRating && (
											<span className={css.ratingItem}>
												<span className={css.tomatoIcon}>🍅</span>{criticRating}%
											</span>
										)}
									</div>
								)}
							</div>

							{settings.useMoonfinPlugin && settings.mdblistEnabled !== false && <RatingsRow item={item} serverUrl={effectiveServerUrl} />}

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
								title="Next Up"
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
									<h3 className={css.sectionTitle}>Seasons</h3>
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
										{item.ParentIndexNumber !== undefined ? `Season ${item.ParentIndexNumber} Episodes` : 'Episodes'}
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
								title="Items in Collection"
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
									<h3 className={css.sectionTitle}>Cast & Crew</h3>
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
								title="More Like This"
								items={similar}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								className={css.inlineRow}
							/>
						)}
					</div>
				</div>
			</Scroller>

			{/* Audio/Subtitle Track Modals */}
			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.trackModalTitle}>Select Audio Track</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => (
								<SpottableButton
									key={stream.Index}
									className={`${css.trackItem} ${i === selectedAudioIndex ? css.selected : ''}`}
									data-index={i}
									data-selected={i === selectedAudioIndex ? 'true' : undefined}
									onClick={handleSelectAudio}
								>
									<span className={css.trackName}>{stream.DisplayTitle || stream.Language || `Track ${i + 1}`}</span>
									{stream.Channels && <span className={css.trackInfo}>{stream.Channels}ch</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.trackModalPanel} onClick={handleStopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.trackModalTitle}>Select Subtitle</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${selectedSubtitleIndex === -1 ? css.selected : ''}`}
								data-index={-1}
								data-selected={selectedSubtitleIndex === -1 ? 'true' : undefined}
								onClick={handleSelectSubtitle}
							>
								<span className={css.trackName}>Off</span>
							</SpottableButton>
							{subtitleStreams.map((stream, i) => (
								<SpottableButton
									key={stream.Index}
									className={`${css.trackItem} ${i === selectedSubtitleIndex ? css.selected : ''}`}
									data-index={i}
									data-selected={i === selectedSubtitleIndex ? 'true' : undefined}
									onClick={handleSelectSubtitle}
								>
									<span className={css.trackName}>{stream.DisplayTitle || stream.Language || `Track ${i + 1}`}</span>
									{stream.IsForced && <span className={css.trackInfo}>Forced</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}

			{renderMediaInfoModal()}
		</div>
	);
};

export default Details;