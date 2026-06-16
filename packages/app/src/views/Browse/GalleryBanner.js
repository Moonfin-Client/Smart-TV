import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {getImageUrl, getBackdropId, formatDuration} from '../../utils/helpers';
import {buildQueryString} from '../../utils/urlCompat';
import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import RatingsRow from '../../components/RatingsRow';
import {createApiForServer, getApiKey, getServerUrl as getDefaultServerUrl} from '../../services/jellyfinApi';
import {KEYS} from '../../utils/keys';
import {genreGlowRgb} from './galleryGlow';
import css from './Browse.module.less';

const GALLERY_GENRES_LIMIT = 3;
const GALLERY_CAST_LIMIT = 5;
const PAGE_SIZE = 5;
const BACKDROP_OPTS = {maxWidth: 1000, quality: 80};
const DETAIL_FETCH_DELAY = 350;
const TRAILER_REVEAL_MS = 4000;
const LOCAL_TRAILER_STREAM_PARAMS = {
	Static: 'false',
	videoCodec: 'h264',
	audioCodec: 'aac',
	maxVideoBitDepth: '8',
	audioBitRate: '128000',
	audioChannels: '2',
	subtitleMethod: 'Drop'
};

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const padIndex = (n) => String(n + 1).padStart(2, '0');

const GalleryBanner = memo(({
	isVisible,
	featuredItems,
	api,
	settings,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus,
	onCurrentItemChange
}) => {
	const [activeIndex, setActiveIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);
	const [activeDetail, setActiveDetail] = useState(null);
	const [trailerActive, setTrailerActive] = useState(false);
	const [screensaverActive, setScreensaverActive] = useState(false);

	const carouselIntervalRef = useRef(null);
	const detailCacheRef = useRef({});
	const trailerContainerRef = useRef(null);
	const trailerVideoRef = useRef(null);
	const trailerSkipIntervalRef = useRef(null);
	const trailerStateRef = useRef('idle');
	const trailerVideoIdRef = useRef(null);
	const trailerRevealTimerRef = useRef(null);
	const sponsorSegmentsRef = useRef([]);

	const safeIndex = Math.min(activeIndex, Math.max(0, featuredItems.length - 1));
	const currentFeatured = featuredItems[safeIndex];

	const pageStart = Math.floor(safeIndex / PAGE_SIZE) * PAGE_SIZE;
	const panels = featuredItems.slice(pageStart, pageStart + PAGE_SIZE);

	useEffect(() => {
		if (featuredItems[safeIndex]) {
			onCurrentItemChange?.(featuredItems[safeIndex]);
		}
	}, [safeIndex, featuredItems, onCurrentItemChange]);

	useEffect(() => {
		setActiveIndex(0);
		detailCacheRef.current = {};
	}, [featuredItems]);

	useEffect(() => {
		if (!currentFeatured?.Id) {
			setActiveDetail(null);
			return;
		}

		const cached = detailCacheRef.current[currentFeatured.Id];
		if (cached) {
			setActiveDetail(cached);
			return;
		}

		setActiveDetail(null);
		let cancelled = false;

		const timer = setTimeout(async () => {
			try {
				const serverApi = currentFeatured._serverUrl && currentFeatured._serverAccessToken
					? createApiForServer(currentFeatured._serverUrl, currentFeatured._serverAccessToken, currentFeatured._serverUserId)
					: api;
				if (!serverApi?.getItem) return;

				const detailed = await serverApi.getItem(currentFeatured.Id);
				if (cancelled) return;

				const people = Array.isArray(detailed?.People) ? detailed.People : [];
				const detail = {
					director: people.find((p) => p.Type === 'Director')?.Name || null,
					cast: people.filter((p) => p.Type === 'Actor').slice(0, GALLERY_CAST_LIMIT).map((p) => p.Name)
				};
				detailCacheRef.current[currentFeatured.Id] = detail;
				setActiveDetail(detail);
			} catch {
				if (!cancelled) setActiveDetail({director: null, cast: []});
			}
		}, DETAIL_FETCH_DELAY);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [currentFeatured, api]);

	const stopTrailer = useCallback(() => {
		if (trailerRevealTimerRef.current) {
			clearTimeout(trailerRevealTimerRef.current);
			trailerRevealTimerRef.current = null;
		}
		if (trailerSkipIntervalRef.current) {
			clearInterval(trailerSkipIntervalRef.current);
			trailerSkipIntervalRef.current = null;
		}
		setTrailerActive(false);
		const video = trailerVideoRef.current;
		if (video) {
			try { video.pause(); } catch (e) { /* ignore */ }
			try {
				video.src = '';
				video.removeAttribute('src');
				if (video.srcObject) video.srcObject = null;
			} catch (e) { /* ignore */ }
			video.classList.remove(css.trailerVisible);
			video.classList.remove(css.trailerVideo);
			video.onplaying = null;
			video.onended = null;
			video.onerror = null;
		}
		trailerStateRef.current = 'idle';
		trailerVideoIdRef.current = null;
		sponsorSegmentsRef.current = [];
	}, []);

	const getRemoteTrailersForItem = useCallback(async (item) => {
		if (!item?.Id) return [];

		const initialTrailers = Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : [];
		if (initialTrailers.length > 0) return initialTrailers;

		try {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			if (!serverApi?.getItem) return [];
			const detailed = await serverApi.getItem(item.Id);
			return Array.isArray(detailed?.RemoteTrailers) ? detailed.RemoteTrailers : [];
		} catch {
			return [];
		}
	}, [api]);

	const getLocalTrailerStreamUrlForItem = useCallback(async (item) => {
		if (!item?.Id) return null;

		try {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			if (!serverApi?.getLocalTrailers) return null;

			const trailers = await serverApi.getLocalTrailers(item.Id);
			const trailerItems = Array.isArray(trailers?.Items) ? trailers.Items : Array.isArray(trailers) ? trailers : [];
			const trailerId = trailerItems.find((t) => t?.Id)?.Id;
			if (!trailerId) return null;

			const resolvedServerUrl = item._serverUrl || getItemServerUrl(item) || getDefaultServerUrl();
			if (!resolvedServerUrl) return null;

			const resolvedToken = item._serverAccessToken || getApiKey();
			const params = {
				...LOCAL_TRAILER_STREAM_PARAMS,
				...(resolvedToken ? {ApiKey: resolvedToken} : {})
			};
			return `${resolvedServerUrl}/Videos/${encodeURIComponent(trailerId)}/stream?${buildQueryString(params)}`;
		} catch {
			return null;
		}
	}, [api, getItemServerUrl]);

	const startTrailerPreview = useCallback(async (videoId, directUrl = null) => {
		const requestId = videoId || directUrl || null;
		trailerStateRef.current = 'resolving';
		trailerVideoIdRef.current = requestId;
		await stopPlaybackForTrailer(trailerVideoRef.current);

		const [{fetchSponsorSegments, fetchVideoStreamUrl, getTrailerStartTime}, {getSharedVideoElement}] = await Promise.all([
			import('../../services/youtubeTrailer'),
			import('@moonfin/platform-webos/video')
		]);

		let segments = [];
		let streamUrl = directUrl || null;
		let startTime = 0;
		try {
			if (!streamUrl && videoId) {
				const results = await Promise.all([
					fetchSponsorSegments(videoId).catch(() => []),
					fetchVideoStreamUrl(videoId, false)
				]);
				segments = results[0];
				streamUrl = results[1];
				startTime = getTrailerStartTime(segments);
			}
		} catch (e) { /* ignore */ }

		if (trailerStateRef.current !== 'resolving' || trailerVideoIdRef.current !== requestId) return;
		if (!streamUrl) {
			trailerStateRef.current = 'unavailable';
			return;
		}
		sponsorSegmentsRef.current = segments;

		const container = trailerContainerRef.current;
		if (!container) return;

		const preferMuted = settings.featuredTrailerMuted;

		let video = trailerVideoRef.current;
		if (!video) {
			video = getSharedVideoElement();
			trailerVideoRef.current = video;
		}
		video.className = css.trailerVideo;
		video.playsInline = true;
		video.controls = false;

		video.muted = preferMuted;
		video.volume = preferMuted ? 0 : 1;
		video.autoplay = true;
		video.classList.remove(css.trailerVisible);

		if (!container.contains(video)) {
			container.appendChild(video);
		}

		if (trailerSkipIntervalRef.current) {
			clearInterval(trailerSkipIntervalRef.current);
			trailerSkipIntervalRef.current = null;
		}

		if (segments.length > 0) {
			trailerSkipIntervalRef.current = setInterval(() => {
				if (!video || video.paused) return;
				const t = video.currentTime;
				for (let i = 0; i < segments.length; i++) {
					if (t >= segments[i].start && t < segments[i].end - 0.5) {
						video.currentTime = segments[i].end;
						break;
					}
				}
			}, 500);
		}

		video.onplaying = () => {
			if (trailerStateRef.current === 'resolving' && trailerVideoIdRef.current === requestId) {
				trailerStateRef.current = 'playing';
				trailerRevealTimerRef.current = setTimeout(() => {
					if (trailerStateRef.current === 'playing' && trailerVideoIdRef.current === requestId) {
						video.classList.add(css.trailerVisible);
						setTrailerActive(true);
					}
				}, TRAILER_REVEAL_MS);
			}
		};

		video.onended = () => {
			stopTrailer();
		};

		video.onerror = () => {
			trailerStateRef.current = 'unavailable';
			video.classList.remove(css.trailerVisible);
		};

		video.src = streamUrl;
		if (startTime > 0) video.currentTime = startTime;
		const playPromise = video.play();
		if (playPromise) {
			playPromise.catch(() => {
				if (!video || video.muted) return;
				video.muted = true;
				video.volume = 0;
				const retryPromise = video.play();
				if (retryPromise) retryPromise.catch(() => {});
			});
		}
	}, [stopTrailer, settings.featuredTrailerMuted]);

	useEffect(() => {
		if (!settings.featuredTrailerPreview || !isVisible || !currentFeatured || screensaverActive) {
			stopTrailer();
			return;
		}

		stopTrailer();
		let cancelled = false;

		const resolveAndStartTrailer = async () => {
			try {
				const {extractYouTubeId, extractYouTubeIdFromUrl} = await import('../../services/youtubeTrailer');
				if (cancelled) return;

				let resolvedVideoId = null;
				let directUrl = await getLocalTrailerStreamUrlForItem(currentFeatured);
				if (cancelled) return;

				if (!directUrl) {
					resolvedVideoId = extractYouTubeId(currentFeatured);
				}

				if (!directUrl && !resolvedVideoId) {
					const remoteTrailers = await getRemoteTrailersForItem(currentFeatured);
					if (cancelled) return;

					for (let i = 0; i < remoteTrailers.length; i++) {
						const trailerUrl = remoteTrailers[i]?.Url || remoteTrailers[i]?.url || '';
						if (!trailerUrl) continue;

						const trailerVideoId = extractYouTubeIdFromUrl(trailerUrl);
						if (trailerVideoId) {
							resolvedVideoId = trailerVideoId;
							break;
						}

						if (!directUrl) {
							directUrl = trailerUrl;
						}
					}
				}

				if (cancelled) return;

				if (resolvedVideoId || directUrl) {
					startTrailerPreview(resolvedVideoId, directUrl);
				}
			} catch (e) {
				if (!cancelled) stopTrailer();
			}
		};

		resolveAndStartTrailer();

		return () => {
			cancelled = true;
			stopTrailer();
		};
	}, [currentFeatured, isVisible, screensaverActive, settings.featuredTrailerPreview, getLocalTrailerStreamUrlForItem, getRemoteTrailersForItem, startTrailerPreview, stopTrailer]);

	useEffect(() => {
		const handleScreensaver = (e) => setScreensaverActive(!!e.detail?.active);
		window.addEventListener('moonfin:screensaver', handleScreensaver);
		return () => window.removeEventListener('moonfin:screensaver', handleScreensaver);
	}, []);

	useEffect(() => {
		const handleVisibility = () => {
			if (document.hidden) stopTrailer();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	}, [stopTrailer]);

	useEffect(() => {
		return () => stopTrailer();
	}, [stopTrailer]);

	const startCarouselTimer = useCallback(() => {
		if (carouselIntervalRef.current) {
			clearInterval(carouselIntervalRef.current);
			carouselIntervalRef.current = null;
		}

		const autoAdvanceEnabled = settings.autoAdvance !== false;
		const configuredInterval = Number(settings.autoAdvanceInterval);
		const carouselSpeed = Number.isFinite(configuredInterval) && configuredInterval > 0
			? configuredInterval * 1000
			: (settings.carouselSpeed || 8000);
		if (!autoAdvanceEnabled || !isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerActive) return;

		carouselIntervalRef.current = setInterval(() => {
			setActiveIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerActive]);

	useEffect(() => {
		startCarouselTimer();
		return () => {
			if (carouselIntervalRef.current) {
				clearInterval(carouselIntervalRef.current);
				carouselIntervalRef.current = null;
			}
		};
	}, [startCarouselTimer]);

	const goPrev = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setActiveIndex((prev) => (prev === 0 ? featuredItems.length - 1 : prev - 1));
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const goNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setActiveIndex((prev) => (prev + 1) % featuredItems.length);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			if (settings.navbarPosition === 'left' && safeIndex === 0) {
				Spotlight.focus('navbar');
			} else {
				goPrev();
			}
		} else if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			goNext();
		} else if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			setFeaturedFocused(false);
			onNavigateDown?.();
		}
	}, [goPrev, goNext, safeIndex, settings.navbarPosition, onNavigateDown]);

	const handleClick = useCallback(() => {
		const item = featuredItems[safeIndex];
		if (item) onSelectItem(item);
	}, [featuredItems, safeIndex, onSelectItem]);

	const handleFocus = useCallback(() => {
		setFeaturedFocused(true);
		onFeaturedFocus?.();
	}, [onFeaturedFocus]);

	const handleBlur = useCallback(() => {
		setFeaturedFocused(false);
	}, []);

	const handlePrevClick = useCallback((e) => {
		e.stopPropagation();
		goPrev();
	}, [goPrev]);

	const handleNextClick = useCallback((e) => {
		e.stopPropagation();
		goNext();
	}, [goNext]);

	if (!isVisible || !currentFeatured) return null;

	const glowStyle = {'--gallery-glow-rgb': genreGlowRgb(currentFeatured.Genres)};

	return (
		<div className={css.galleryBanner}>
			<SpottableDiv
				className={css.galleryInner}
				spotlightId='featured-banner'
				style={glowStyle}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.galleryGlow} />
				<div className={css.galleryRow}>
					{panels.map((item, i) => {
						const absoluteIndex = pageStart + i;
						const isActive = absoluteIndex === safeIndex;
						const backdropId = getBackdropId(item);
						const backdropUrl = backdropId
							? getImageUrl(getItemServerUrl(item), backdropId, 'Backdrop', BACKDROP_OPTS)
							: null;

						return (
							<div
								key={item.Id || absoluteIndex}
								className={`${css.galleryPanel} ${isActive ? css.galleryPanelActive : ''} ${isActive && trailerActive ? css.galleryTrailerActive : ''}`}
							>
								<div className={css.galleryPanelBackdrop}>
									{backdropUrl && <img src={backdropUrl} alt='' />}
								</div>
								{isActive && <div className={css.galleryTrailer} ref={trailerContainerRef} />}
								<div className={css.galleryPanelScrim} />

								<div className={css.galleryIdle}>
									<span className={css.galleryIndex}>{padIndex(absoluteIndex)}</span>
									<span className={css.galleryLine} />
									<div className={css.galleryTitleWrap}>
										<span className={css.galleryVerticalTitle}>{item.Name}</span>
									</div>
									<span className={css.galleryLine} />
								</div>

								{isActive && (
									<div className={css.galleryActive}>
										<div className={css.galleryActiveLeft}>
											<h2 className={css.galleryActiveTitle}>{item.Name}</h2>

											<div className={css.galleryBadges}>
												{item.Type !== 'Series' && item.RunTimeTicks && (() => {
													const dur = formatDuration(item.RunTimeTicks);
													return dur && dur !== '0m'
														? <span className={css.galleryPill}>{dur}</span>
														: null;
												})()}
												{item.OfficialRating && (
													<span className={`${css.galleryPill} ${css.galleryPillOutlined}`}>{item.OfficialRating}</span>
												)}
												{item.ProductionYear && (
													<span className={css.galleryPill}>{item.ProductionYear}</span>
												)}
												{item.Genres?.slice(0, GALLERY_GENRES_LIMIT).map((g, gi) => (
													<span key={gi} className={`${css.galleryPill} ${css.galleryPillTinted}`}>{g}</span>
												))}
											</div>

											<RatingsRow
												item={item}
												serverUrl={getItemServerUrl(item)}
												compact
												pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false}
											/>

											{item.Overview && (
												<p className={css.galleryOverview}>{item.Overview}</p>
											)}
										</div>

										<div className={css.galleryActiveRight}>
											{activeDetail === null ? (
												<div className={css.galleryShimmer}>
													<span style={{width: '40%'}} />
													<span style={{width: '70%'}} />
													<span style={{width: '30%'}} />
													<span style={{width: '85%'}} />
												</div>
											) : (
												<>
													{activeDetail.director && (
														<div className={css.galleryCredit}>
															<span className={css.galleryCreditLabel}>{$L('Director')}</span>
															<span className={css.galleryCreditValue}>{activeDetail.director}</span>
														</div>
													)}
													{activeDetail.cast?.length > 0 && (
														<div className={css.galleryCredit}>
															<span className={css.galleryCreditLabel}>{$L('Starring')}</span>
															<span className={css.galleryCreditValue}>{activeDetail.cast.join(', ')}</span>
														</div>
													)}
												</>
											)}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{featuredItems.length > 1 && (
					<>
						{settings.navbarPosition !== 'left' && (
							<SpottableButton
								className={`${css.carouselNav} ${css.carouselNavLeft}`}
								onClick={handlePrevClick}
							>
								<svg viewBox='0 0 24 24' width='32' height='32'>
									<path fill='currentColor' d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' />
								</svg>
							</SpottableButton>
						)}
						<SpottableButton
							className={`${css.carouselNav} ${css.carouselNavRight}`}
							onClick={handleNextClick}
						>
							<svg viewBox='0 0 24 24' width='32' height='32'>
								<path fill='currentColor' d='M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z' />
							</svg>
						</SpottableButton>
					</>
				)}
			</SpottableDiv>
		</div>
	);
});

export default GalleryBanner;
