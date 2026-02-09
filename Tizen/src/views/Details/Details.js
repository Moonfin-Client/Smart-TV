import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {Scroller} from '@enact/sandstone/Scroller';
import {useAuth} from '../../context/AuthContext';
import {createApiForServer} from '../../services/jellyfinApi';
import {useSettings} from '../../context/SettingsContext';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import {formatDuration, getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {isBackKey} from '../../utils/tizenKeys';

import css from './Details.module.less';

const SpottableDiv = Spottable('div');

// Spotlight container for horizontal navigation (buttons, seasons)
const HorizontalContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	preserve5WayFocus: true
}, 'div');

const getResolutionName = (width, height) => {
	// Use width as primary indicator — non-16:9 aspect ratios (e.g. 2:1 ultrawide)
	// can have reduced heights (3840x1920, 3840x1600) that are still 4K content
	if (width >= 3800) return '4K';
	if (width >= 2500) return '1440P';
	if (width >= 1900 || height >= 1000) return '1080P';
	if (width >= 1260 || height >= 700) return '720P';
	if (width >= 1000 || height >= 560) return '576P';
	if (width >= 850 || height >= 460) return '480P';
	return height + 'P';
};

const Details = ({itemId, initialItem, onPlay, onSelectItem, onSelectPerson, onBack}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();

	// Support cross-server items - memoize to prevent infinite re-renders
	const effectiveApi = useMemo(() => {
		if (initialItem?._serverUrl && initialItem?._serverAccessToken) {
			return createApiForServer(initialItem._serverUrl, initialItem._serverAccessToken, initialItem._serverUserId);
		}
		return api;
	}, [initialItem?._serverUrl, initialItem?._serverAccessToken, initialItem?._serverUserId, api]);

	const effectiveServerUrl = useMemo(() => {
		return initialItem?._serverUrl || serverUrl;
	}, [initialItem?._serverUrl, serverUrl]);

	// Helper to tag items with cross-server credentials for playback
	const tagWithServerInfo = useCallback((items) => {
		if (!initialItem?._serverUrl || !initialItem?._serverAccessToken) {
			return items;
		}
		const tagSingleItem = (itemToTag) => ({
			...itemToTag,
			_serverUrl: initialItem._serverUrl,
			_serverAccessToken: initialItem._serverAccessToken,
			_serverUserId: initialItem._serverUserId,
			_serverName: initialItem._serverName,
			_serverId: initialItem._serverId
		});
		return Array.isArray(items) ? items.map(tagSingleItem) : tagSingleItem(items);
	}, [initialItem?._serverUrl, initialItem?._serverAccessToken, initialItem?._serverUserId, initialItem?._serverName, initialItem?._serverId]);
	const [item, setItem] = useState(null);
	const [seasons, setSeasons] = useState([]);
	const [episodes, setEpisodes] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [cast, setCast] = useState([]);
	const [nextUp, setNextUp] = useState([]);
	const [collectionItems, setCollectionItems] = useState([]);
	const [selectedSeason, setSelectedSeason] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);

	const castScrollerRef = useRef(null);
	const seasonsScrollerRef = useRef(null);
	const pageScrollerRef = useRef(null);

	useEffect(() => {
		const loadItem = async () => {
			setIsLoading(true);
			setSeasons([]);
			setEpisodes([]);
			setSimilar([]);
			setCast([]);
			setNextUp([]);
			setCollectionItems([]);
			setSelectedSeason(null);

			try {
				const data = await effectiveApi.getItem(itemId);
				setItem(tagWithServerInfo(data));

				if (data.People?.length > 0) {
					setCast(data.People.slice(0, 20));
				}

				if (data.Type === 'Series') {
					const seasonsData = await effectiveApi.getSeasons(itemId);
					setSeasons(tagWithServerInfo(seasonsData.Items || []));
					if (seasonsData.Items?.length > 0) {
						setSelectedSeason(tagWithServerInfo(seasonsData.Items[0]));
					}

					try {
						const nextUpData = await effectiveApi.getNextUp(1, itemId);
						if (nextUpData.Items?.length > 0) {
							setNextUp(tagWithServerInfo(nextUpData.Items));
						}
					} catch (e) {
						// Next up not available
					}
				}

				if (data.Type === 'Season') {
					try {
						const episodesData = await effectiveApi.getEpisodes(data.SeriesId, data.Id);
						setEpisodes(tagWithServerInfo(episodesData.Items || []));
					} catch (e) {
						// Episodes not available
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
					} catch (e) {
						// Collection items not available
					}
				}

				if (data.Type !== 'Person' && data.Type !== 'BoxSet') {
					try {
						const similarData = await effectiveApi.getSimilar(itemId);
						setSimilar(tagWithServerInfo(similarData.Items || []));
					} catch (e) {
						// Similar items not available
					}
				}

				if (data.Type === 'Person') {
					try {
						const filmography = await effectiveApi.getItemsByPerson(itemId, 50);
						setSimilar(tagWithServerInfo(filmography.Items || []));
					} catch (e) {
						// Filmography not available
					}
				}
			} catch (err) {
				// Item load failed
			} finally {
				setIsLoading(false);
			}
		};
		loadItem();
	}, [effectiveApi, itemId, tagWithServerInfo]);

	// Auto-focus the primary button (Resume or Play) when content loads
	useEffect(() => {
		if (!isLoading && item) {
			// Small delay to ensure DOM is ready
			const timer = setTimeout(() => {
				Spotlight.focus('details-primary-btn');
			}, 150);
			return () => clearTimeout(timer);
		}
	}, [isLoading, item]);

	useEffect(() => {
		if (!selectedSeason || !item || item.Type !== 'Series') return;
		const loadEpisodes = async () => {
			try {
				const episodesData = await effectiveApi.getEpisodes(item.Id, selectedSeason.Id);
				setEpisodes(tagWithServerInfo(episodesData.Items || []));
			} catch (err) {
				// Episodes not available
			}
		};
		loadEpisodes();
	}, [effectiveApi, item, selectedSeason, tagWithServerInfo]);

	const handlePlay = useCallback(() => {
		if (!item) return;

		// Only pass audio/subtitle options for items that support media source selection
		// (Movies, Episodes with their own MediaSources). For Series/Season, let the Player
		// decide based on its settings since the parent's streams don't apply to episodes.
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
				onPlay?.(nextUp[0], false, {}); // Don't pass parent's stream options
			} else if (episodes.length > 0) {
				const unwatched = episodes.find(ep => !ep.UserData?.Played);
				onPlay?.(unwatched || episodes[0], false, {}); // Don't pass parent's stream options
			}
		} else if (item.Type === 'Season') {
			if (episodes.length > 0) {
				const unwatched = episodes.find(ep => !ep.UserData?.Played);
				onPlay?.(unwatched || episodes[0], false, {}); // Don't pass parent's stream options
			}
		} else {
			onPlay?.(item, false, playbackOptions);
		}
	}, [item, episodes, nextUp, onPlay, selectedAudioIndex, selectedSubtitleIndex]);

	const handleResume = useCallback(() => {
		if (!item) return;

		// Resume only applies to items that have their own playback position (Movies, Episodes)
		// These items should support media source selection
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
	}, [effectiveApi, item]);

	const handleToggleWatched = useCallback(async () => {
		if (!item) return;
		const newState = !item.UserData?.Played;
		await effectiveApi.setWatched(item.Id, newState);
		setItem(prev => ({
			...prev,
			UserData: {...prev.UserData, Played: newState, PlayedPercentage: newState ? 100 : 0}
		}));
	}, [effectiveApi, item]);

	const handleGoToSeries = useCallback(() => {
		if (item?.SeriesId) {
			onSelectItem?.({Id: item.SeriesId, Type: 'Series'});
		}
	}, [item, onSelectItem]);

	const handleSelectAudioTrack = useCallback(() => {
		const availableAudioStreams = item?.MediaSources?.[0]?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		if (availableAudioStreams.length <= 1) return;

		const currentIndex = selectedAudioIndex;
		const nextIndex = (currentIndex + 1) % availableAudioStreams.length;
		setSelectedAudioIndex(nextIndex);
	}, [item, selectedAudioIndex]);

	const handleSelectSubtitleTrack = useCallback(() => {
		const availableSubtitleStreams = item?.MediaSources?.[0]?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];
		if (availableSubtitleStreams.length === 0) return;

		const currentIndex = selectedSubtitleIndex;
		const nextIndex = currentIndex >= availableSubtitleStreams.length - 1 ? -1 : currentIndex + 1;
		setSelectedSubtitleIndex(nextIndex);
	}, [item, selectedSubtitleIndex]);

	const handleSeasonSelect = useCallback((ev) => {
		const seasonId = ev.currentTarget.dataset.seasonId;
		const season = seasons.find(s => s.Id === seasonId);
		if (season) {
			// Navigate to the season's details page
			onSelectItem?.(season);
		}
	}, [seasons, onSelectItem]);

	const handleSeasonFocus = useCallback((e) => {
		const card = e.target.closest('.spottable');
		const scroller = seasonsScrollerRef.current;
		if (card && scroller) {
			const cardRect = card.getBoundingClientRect();
			const scrollerRect = scroller.getBoundingClientRect();

			if (cardRect.left < scrollerRect.left) {
				scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
			} else if (cardRect.right > scrollerRect.right) {
				scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
			}
		}
	}, []);

	const handleCastSelect = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		if (personId) {
			onSelectPerson?.({Id: personId});
		}
	}, [onSelectPerson]);

	const handleCastFocus = useCallback((e) => {
		const card = e.target.closest('.spottable');
		const scroller = castScrollerRef.current;
		if (card && scroller) {
			const cardRect = card.getBoundingClientRect();
			const scrollerRect = scroller.getBoundingClientRect();

			if (cardRect.left < scrollerRect.left) {
				scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
			} else if (cardRect.right > scrollerRect.right) {
				scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
			}
		}
	}, []);

	// Handle down key in button row to move focus to next section
	const handleButtonRowKeyDown = useCallback((ev) => {
		if (ev.keyCode === 40) { // Down arrow
			ev.preventDefault();
			ev.stopPropagation();
			// Find the next focusable element below the button row
			const sectionsContainer = document.querySelector(`.${css.sectionsContainer}`);
			if (sectionsContainer) {
				const firstSpottable = sectionsContainer.querySelector('.spottable');
				if (firstSpottable) {
					Spotlight.focus(firstSpottable);
				}
			}
		}
	}, []);

	// Scroll to top when button row receives focus
	const handleButtonRowFocus = useCallback(() => {
		const scroller = pageScrollerRef.current;
		if (scroller && scroller.scrollTo) {
			scroller.scrollTo({position: {y: 0}, animate: true});
		}
	}, []);

	const handleKeyDown = useCallback((ev) => {
		if (isBackKey(ev)) {
			ev.preventDefault();
			onBack?.();
		}
	}, [onBack]);

	if (isLoading || !item) {
		return (
			<div className={css.page}>
				<LoadingSpinner />
			</div>
		);
	}

	const backdropId = getBackdropId(item);
	const backdropUrl = backdropId
		? getImageUrl(effectiveServerUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 90})
		: null;

	const logoUrl = getLogoUrl(effectiveServerUrl, item, {maxWidth: 600, quality: 90});

	const year = item.ProductionYear || '';
	const runtime = item.RunTimeTicks ? formatDuration(item.RunTimeTicks) : '';
	const rating = item.OfficialRating || '';
	const communityRating = item.CommunityRating ? item.CommunityRating.toFixed(1) : '';
	const criticRating = item.CriticRating;

	const mediaSource = item.MediaSources?.[0];
	const videoStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Video');
	const audioStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Audio');

	let resolution = '';
	if (videoStream?.Width && videoStream?.Height) {
		resolution = getResolutionName(videoStream.Width, videoStream.Height);
	}

	let videoCodec = '';
	if (videoStream?.Codec) {
		videoCodec = videoStream.VideoRangeType && videoStream.VideoRangeType !== 'SDR'
			? videoStream.VideoRangeType.toUpperCase()
			: videoStream.Codec.toUpperCase();
	}

	let audioCodec = '';
	if (audioStream?.Codec) {
		audioCodec = audioStream.Profile?.includes('Atmos')
			? 'ATMOS'
			: audioStream.Codec.toUpperCase();
	}

	const directors = item.People?.filter(p => p.Type === 'Director') || [];
	const writers = item.People?.filter(p => p.Type === 'Writer') || [];
	const studios = item.Studios || [];

	const audioStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	const subtitleStreams = mediaSource?.MediaStreams?.filter(s => s.Type === 'Subtitle') || [];

	// Only show audio/subtitle selection for items that have their own MediaSources (Movies, Episodes)
	// Series/Season items don't have MediaSources - their children (Episodes) do
	const supportsMediaSourceSelection = item.MediaType === 'Video' &&
		item.MediaSources?.length > 0 &&
		item.MediaSources[0].Type !== 'Placeholder';
	const hasMultipleAudio = supportsMediaSourceSelection && audioStreams.length > 1;
	const hasSubtitles = supportsMediaSourceSelection && subtitleStreams.length > 0;

	const currentAudioStream = audioStreams[selectedAudioIndex];
	const currentSubtitleStream = selectedSubtitleIndex >= 0 ? subtitleStreams[selectedSubtitleIndex] : null;
	const genres = item.Genres || [];
	const tagline = item.Taglines?.[0];

	const hasPlaybackPosition = item.UserData?.PlaybackPositionTicks > 0;
	const resumeTimeText = hasPlaybackPosition
		? formatDuration(item.UserData.PlaybackPositionTicks)
		: '';

	const isPerson = item.Type === 'Person';
	const isBoxSet = item.Type === 'BoxSet';
	const isSeries = item.Type === 'Series';
	const isSeason = item.Type === 'Season';
	const isEpisode = item.Type === 'Episode';

	return (
		<div className={css.page} onKeyDown={handleKeyDown}>
			{backdropUrl && (
				<div className={css.backdrop}>
					<img
						src={backdropUrl}
						className={css.backdropImage}
						alt=""
						style={{
							filter: settings.backdropBlurDetail > 0 ? `blur(${settings.backdropBlurDetail}px)` : 'none',
							WebkitFilter: settings.backdropBlurDetail > 0 ? `blur(${settings.backdropBlurDetail}px)` : 'none'
						}}
					/>
					<div className={css.backdropOverlay} />
				</div>
			)}

			<Scroller
				ref={pageScrollerRef}
				className={css.scroller}
				direction="vertical"
				horizontalScrollbar="hidden"
				verticalScrollbar="hidden"
			>
				<div className={css.content}>
					<div className={css.detailsHeader}>
						<div className={css.infoSection}>
							<h1 className={css.title}>{item.Name}</h1>

							{isPerson && item.ImageTags?.Primary && (
								<div className={css.personContent}>
									<img
										src={getImageUrl(effectiveServerUrl, item.Id, 'Primary', {maxHeight: 450, quality: 90})}
										className={css.personPhoto}
										alt=""
									/>
									{item.Overview && (
										<p className={css.personOverview}>{item.Overview}</p>
									)}
								</div>
							)}

							{!isPerson && (
								<>
									<div className={css.infoRow}>
										{year && <span className={css.infoBadge}>{year}</span>}
										{rating && <span className={`${css.infoBadge} ${css.pill}`}>{rating}</span>}
										{runtime && <span className={css.infoBadge}>{runtime}</span>}
										{resolution && <span className={`${css.infoBadge} ${css.pill}`}>{resolution}</span>}
										{videoCodec && <span className={`${css.infoBadge} ${css.pill}`}>{videoCodec}</span>}
										{audioCodec && <span className={`${css.infoBadge} ${css.pill}`}>{audioCodec}</span>}
										{communityRating && (
											<span className={css.infoBadge}>
												<span className={css.star}>★</span> {communityRating}
											</span>
										)}
										{criticRating && (
											<span className={css.infoBadge}>
												<span className={css.critic}>🍅</span> {criticRating}%
											</span>
										)}
									</div>

									{tagline && (
										<p className={css.tagline}>{tagline}</p>
									)}

									{item.Overview && (
										<p className={css.overview}>{item.Overview}</p>
									)}

									<div className={css.metadataGroup}>
										{genres.length > 0 && (
											<div className={css.metadataCell}>
												<span className={css.metadataLabel}>Genres</span>
												<span className={css.metadataValue}>{genres.slice(0, 3).join(', ')}</span>
											</div>
										)}
										{directors.length > 0 && (
											<div className={css.metadataCell}>
												<span className={css.metadataLabel}>Director</span>
												<span className={css.metadataValue}>{directors.map(d => d.Name).join(', ')}</span>
											</div>
										)}
										{writers.length > 0 && (
											<div className={css.metadataCell}>
												<span className={css.metadataLabel}>Writers</span>
												<span className={css.metadataValue}>{writers.map(w => w.Name).join(', ')}</span>
											</div>
										)}
										{studios.length > 0 && (
											<div className={css.metadataCell}>
												<span className={css.metadataLabel}>Studio</span>
												<span className={css.metadataValue}>{studios.map(s => s.Name).join(', ')}</span>
											</div>
										)}
									</div>
								</>
							)}
						</div>

						{logoUrl && (
							<div className={css.logoSection}>
								<img src={logoUrl} className={css.logoImage} alt="" />
							</div>
						)}
					</div>

					{!isPerson && !isBoxSet && (
						<HorizontalContainer className={css.actionButtons} onKeyDown={handleButtonRowKeyDown}>
							{hasPlaybackPosition && (
								<SpottableDiv className={css.btnWrapper} onClick={handleResume} spotlightId="details-primary-btn">
									<div className={css.btnAction}>
										<span className={css.btnIcon}>▶</span>
									</div>
									<span className={css.btnLabel}>Resume {resumeTimeText}</span>
								</SpottableDiv>
							)}
							<SpottableDiv className={css.btnWrapper} onClick={handlePlay} onFocus={handleButtonRowFocus} spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}>
								<div className={css.btnAction}>
									{hasPlaybackPosition ? (
										<svg className={css.btnIcon} viewBox="0 -960 960 960">
											<path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/>
										</svg>
									) : (
										<span className={css.btnIcon}>▶</span>
									)}
								</div>
								<span className={css.btnLabel}>{hasPlaybackPosition ? 'Restart from beginning' : 'Play'}</span>
							</SpottableDiv>
							{(isSeries || isSeason) && (
								<SpottableDiv className={css.btnWrapper} onClick={handleShuffle}>
									<div className={css.btnAction}>
										<svg className={css.btnIcon} viewBox="0 -960 960 960">
											<path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>Shuffle</span>
								</SpottableDiv>
							)}
						{hasMultipleAudio && (
							<SpottableDiv className={css.btnWrapper} onClick={handleSelectAudioTrack}>
								<div className={css.btnAction}>
									<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
										<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>
									{currentAudioStream ?
										`Select Audio Track: ${currentAudioStream.DisplayTitle || currentAudioStream.Language || 'Track ' + (selectedAudioIndex + 1)}`
										: 'Audio'}
								</span>
							</SpottableDiv>
						)}
						{hasSubtitles && (
							<SpottableDiv className={css.btnWrapper} onClick={handleSelectSubtitleTrack}>
								<div className={css.btnAction}>
									<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
										<path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm0-80h560v-480H200v480Zm80-120h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360ZM200-240v-480 480Z"/>
									</svg>
								</div>
								<span className={css.btnLabel}>
									{currentSubtitleStream ?
										`Select Subtitle Track: ${currentSubtitleStream.DisplayTitle || currentSubtitleStream.Language || 'Track ' + (selectedSubtitleIndex + 1)}`
										: 'Subtitle: Off'}
								</span>
							</SpottableDiv>
						)}
						{(item.LocalTrailerCount > 0 || item.RemoteTrailers?.length > 0) && (
							<SpottableDiv className={css.btnWrapper} onClick={handleTrailer}>
								<div className={css.btnAction}>
									<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
											<path d="M160-120v-720h80v80h80v-80h320v80h80v-80h80v720h-80v-80h-80v80H320v-80h-80v80h-80Zm80-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm400 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80ZM400-200h160v-560H400v560Zm0-560h160-160Z"/>
										</svg>
									</div>
									<span className={css.btnLabel}>Play Trailer</span>
								</SpottableDiv>
							)}
						<SpottableDiv className={css.btnWrapper} onClick={handleToggleWatched}>
							<div className={css.btnAction}>
							{item.UserData?.Played ? (
								<svg className={`${css.btnIcon} ${css.watched}`} viewBox="0 -960 960 960" fill="currentColor">
									<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
								</svg>
							) : (
								<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
									<path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
								</svg>
							)}
							</div>
							<span className={css.btnLabel}>{item.UserData?.Played ? 'Watched' : 'Mark Watched'}</span>
						</SpottableDiv>
						<SpottableDiv className={css.btnWrapper} onClick={handleToggleFavorite}>
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
							<svg className={css.btnIcon} viewBox="0 -960 960 960">
								<path d="M240-120v-80l40-40H160q-33 0-56.5-23.5T80-320v-440q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v440q0 33-23.5 56.5T800-240H680l40 40v80H240Zm-80-200h640v-440H160v440Zm0 0v-440 440Z"/>
							</svg>
						</div>
						<span className={css.btnLabel}>Go to Series</span>
					</SpottableDiv>
				)}
			</HorizontalContainer>
		)}

					<div className={css.sectionsContainer}>
						{nextUp.length > 0 && (
							<MediaRow
								title="Next Up"
								items={nextUp}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								cardType="landscape"
							/>
						)}

						{isSeries && seasons.length > 0 && (
							<div className={css.seasonsSection}>
								<h2 className={css.sectionTitle}>Seasons</h2>
								<HorizontalContainer className={css.seasonsScroller} ref={seasonsScrollerRef} onFocus={handleSeasonFocus}>
									<div className={css.seasonsList}>
											{seasons.map((season) => (
												<SpottableDiv
													key={season.Id}
													data-season-id={season.Id}
													className={`${css.seasonCard} ${selectedSeason?.Id === season.Id ? css.seasonCardSelected : ''}`}
													onClick={handleSeasonSelect}
												>
													<div className={css.seasonPosterWrapper}>
														{season.ImageTags?.Primary ? (
															<img
																src={getImageUrl(effectiveServerUrl, season.Id, 'Primary', {maxHeight: 400, quality: 90, tag: season.ImageTags.Primary})}
																className={css.seasonPoster}
																alt=""
															/>
														) : (
															<div className={css.seasonPosterPlaceholder}>
																<span>{season.Name}</span>
															</div>
														)}
													</div>
													<span className={css.seasonName}>{season.Name}</span>
										</SpottableDiv>
									))}
								</div>
							</HorizontalContainer>
								{episodes.length > 0 && (
									<MediaRow
										title={selectedSeason?.Name || 'Episodes'}
										items={episodes}
									serverUrl={effectiveServerUrl}
									onSelectItem={onSelectItem}
									cardType="landscape"
									/>
								)}
							</div>
						)}

						{isSeason && episodes.length > 0 && (
							<MediaRow
								title="Episodes"
								items={episodes}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
								cardType="landscape"
							/>
						)}

						{isBoxSet && collectionItems.length > 0 && (
							<MediaRow
								title="Items in Collection"
								items={collectionItems}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
							/>
						)}

						{cast.length > 0 && !isPerson && (
							<div className={css.castSection}>
								<h2 className={css.sectionTitle}>Cast & Crew</h2>
								<div className={css.castScroller} ref={castScrollerRef} onFocus={handleCastFocus}>
									<div className={css.castList}>
										{cast.map((person) => (
											<SpottableDiv
												key={person.Id}
												data-person-id={person.Id}
												className={css.castCard}
												onClick={handleCastSelect}
											>
												<div className={css.castImageWrapper}>
													{person.PrimaryImageTag ? (
														<img
															src={getImageUrl(effectiveServerUrl, person.Id, 'Primary', {maxHeight: 360, quality: 90, tag: person.PrimaryImageTag})}
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
								</div>
							</div>
						)}

						{similar.length > 0 && (
							<MediaRow
								title={isPerson ? 'Filmography' : 'More Like This'}
								items={similar}
								serverUrl={effectiveServerUrl}
								onSelectItem={onSelectItem}
							/>
						)}
					</div>
				</div>
			</Scroller>
		</div>
	);
};

export default Details;
