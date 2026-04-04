import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {getImageUrl, getBackdropId, formatDuration} from '../../utils/helpers';
import RatingsRow from '../../components/RatingsRow';
import {KEYS} from '../../utils/keys';
import css from './Browse.module.less';

const FEATURED_GENRES_LIMIT = 3;
const PRELOAD_ADJACENT_SLIDES = 2;
const TRAILER_REVEAL_MS = 4000;

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const FeaturedBanner = memo(({
	isVisible,
	featuredItems,
	serverUrl,
	settings,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus,
	uiPanelStyle,
	uiButtonStyle,
	onCurrentItemChange
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [trailerActive, setTrailerActive] = useState(false);
	const [featuredFocused, setFeaturedFocused] = useState(false);

	const preloadedImagesRef = useRef(new Set());
	const trailerContainerRef = useRef(null);
	const trailerVideoRef = useRef(null);
	const trailerSkipIntervalRef = useRef(null);
	const trailerStateRef = useRef('idle');
	const trailerVideoIdRef = useRef(null);
	const trailerRevealTimerRef = useRef(null);
	const sponsorSegmentsRef = useRef([]);
	const carouselIntervalRef = useRef(null);

	const currentFeatured = featuredItems[currentIndex];

	useEffect(() => {
		if (featuredItems[currentIndex]) {
			onCurrentItemChange?.(featuredItems[currentIndex]);
		}
	}, [currentIndex, featuredItems, onCurrentItemChange]);

	useEffect(() => {
		setCurrentIndex(0);
		preloadedImagesRef.current.clear();
	}, [featuredItems]);

	useEffect(() => {
		if (featuredItems.length === 0) return;

		const preloadImage = (url) => {
			if (!url || preloadedImagesRef.current.has(url)) return;
			const img = new window.Image();
			img.src = url;
			preloadedImagesRef.current.add(url);
		};

		for (let offset = -PRELOAD_ADJACENT_SLIDES; offset <= PRELOAD_ADJACENT_SLIDES; offset++) {
			const index = (currentIndex + offset + featuredItems.length) % featuredItems.length;
			const item = featuredItems[index];
			if (item) {
				const backdropId = getBackdropId(item);
				if (backdropId) {
					preloadImage(getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 85}));
				}
				if (item.LogoUrl) {
					preloadImage(item.LogoUrl);
				}
			}
		}
	}, [currentIndex, featuredItems, serverUrl]);

	const startCarouselTimer = useCallback(() => {
		if (carouselIntervalRef.current) {
			clearInterval(carouselIntervalRef.current);
			carouselIntervalRef.current = null;
		}

		const carouselSpeed = settings.carouselSpeed || 8000;
		if (!isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed === 0 || trailerActive) return;

		carouselIntervalRef.current = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, featuredItems.length, featuredFocused, settings.carouselSpeed, trailerActive]);

	useEffect(() => {
	  if (!isVisible || featuredItems.length <= 1 || !featuredFocused || settings.carouselSpeed === 0 || trailerActive) return;
		startCarouselTimer();
		return () => {
		  if (carouselIntervalRef.current) {
       	clearInterval(carouselIntervalRef.current);
       	carouselIntervalRef.current = null;
			}
		}
	}, [isVisible, featuredItems.length, featuredFocused, settings.carouselSpeed, trailerActive]);

	const stopTrailer = useCallback(async () => {
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
			const {cleanupVideoElement} = await import('@moonfin/platform-webos/video');
			cleanupVideoElement(video);
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

	const startTrailerPreview = useCallback(async (videoId) => {
		trailerStateRef.current = 'resolving';
		trailerVideoIdRef.current = videoId;

		const [{fetchSponsorSegments, fetchVideoStreamUrl, getTrailerStartTime}, {getSharedVideoElement}] = await Promise.all([
			import('../../services/youtubeTrailer'),
			import('@moonfin/platform-webos/video')
		]);

		let segments = [];
		let streamUrl = null;
		try {
			const results = await Promise.all([
				fetchSponsorSegments(videoId).catch(() => []),
				fetchVideoStreamUrl(videoId, false)
			]);
			segments = results[0];
			streamUrl = results[1];
		} catch (e) { /* ignore */ }

		if (trailerStateRef.current !== 'resolving' || trailerVideoIdRef.current !== videoId) return;
		if (!streamUrl) {
			trailerStateRef.current = 'unavailable';
			return;
		}
		sponsorSegmentsRef.current = segments;

		const startTime = getTrailerStartTime(segments);
		const container = trailerContainerRef.current;
		if (!container) return;

		const isMuted = settings.featuredTrailerMuted;

		let video = trailerVideoRef.current;
		if (!video) {
			video = getSharedVideoElement();
			trailerVideoRef.current = video;
		}
		video.className = css.trailerVideo;
		video.playsInline = true;
		video.controls = false;

		video.muted = isMuted;
		video.volume = isMuted ? 0 : 1;
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
			if (trailerStateRef.current === 'resolving' && trailerVideoIdRef.current === videoId) {
				trailerStateRef.current = 'playing';
				trailerRevealTimerRef.current = setTimeout(() => {
					if (trailerStateRef.current === 'playing' && trailerVideoIdRef.current === videoId) {
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
		if (playPromise) playPromise.catch(() => {});
	}, [stopTrailer, settings.featuredTrailerMuted]);

	useEffect(() => {
		stopTrailer();
		return;
		/* eslint-disable no-unreachable */
		if (!settings.featuredTrailerPreview || !isVisible || !currentFeatured) {
			stopTrailer();
			return;
		}
		stopTrailer();
		import('../../services/youtubeTrailer').then(({extractYouTubeId}) => {
			const videoId = extractYouTubeId(currentFeatured);
			if (videoId) {
				startTrailerPreview(videoId);
			}
		});
	}, [currentIndex, currentFeatured, isVisible, settings.featuredTrailerPreview, startTrailerPreview, stopTrailer]);

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

	const handleFeaturedPrev = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentIndex((prev) =>
			prev === 0 ? featuredItems.length - 1 : prev - 1
		);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleFeaturedNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentIndex((prev) =>
			(prev + 1) % featuredItems.length
		);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleFeaturedKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			if (settings.navbarPosition === 'left') {
				Spotlight.focus('navbar');
			} else {
				handleFeaturedPrev();
			}
		} else if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			handleFeaturedNext();
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
	}, [handleFeaturedPrev, handleFeaturedNext, settings.navbarPosition, onNavigateDown]);

	const handleFeaturedClick = useCallback(() => {
		const item = featuredItems[currentIndex];
		if (item) onSelectItem(item);
	}, [featuredItems, currentIndex, onSelectItem]);

	const handleFeaturedFocus = useCallback(() => {
		setFeaturedFocused(true);
		onFeaturedFocus?.();
	}, [onFeaturedFocus]);

	const handleFeaturedBlur = useCallback(() => {
		setFeaturedFocused(false);
	}, []);

	const handleCarouselPrevClick = useCallback((e) => {
		e.stopPropagation();
		handleFeaturedPrev();
	}, [handleFeaturedPrev]);

	const handleCarouselNextClick = useCallback((e) => {
		e.stopPropagation();
		handleFeaturedNext();
	}, [handleFeaturedNext]);

	if (!isVisible || !currentFeatured) return null;

	return (
		<div className={css.featuredBanner}>
			<SpottableDiv
				className={`${css.featuredInner} ${trailerActive ? css.trailerActive : ''}`}
				spotlightId="featured-banner"
				onClick={handleFeaturedClick}
				onKeyDown={handleFeaturedKeyDown}
				onFocus={handleFeaturedFocus}
				onBlur={handleFeaturedBlur}
			>
				<div className={css.featuredBackdrop}>
					<img
						src={getImageUrl(getItemServerUrl(currentFeatured), getBackdropId(currentFeatured), 'Backdrop', {maxWidth: 1920, quality: 85})}
						alt=""
					/>
				</div>

				<div className={css.trailerContainer} ref={trailerContainerRef} />

				{featuredItems.length > 1 && (
					<>
						{settings.navbarPosition !== 'left' && (
							<SpottableButton
								className={`${css.carouselNav} ${css.carouselNavLeft}`}
								onClick={handleCarouselPrevClick}
								style={uiButtonStyle}
							>
								<svg viewBox="0 0 24 24" width="32" height="32">
									<path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
								</svg>
							</SpottableButton>
						)}
						<SpottableButton
							className={`${css.carouselNav} ${css.carouselNavRight}`}
							onClick={handleCarouselNextClick}
							style={uiButtonStyle}
						>
							<svg viewBox="0 0 24 24" width="32" height="32">
								<path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
							</svg>
						</SpottableButton>
					</>
				)}

				<div className={css.featuredLogoContainer}>
					{currentFeatured.LogoUrl && (
						<img
							src={currentFeatured.LogoUrl}
							alt={`${currentFeatured.Name} logo`}
						/>
					)}
				</div>

				<div className={css.featuredContent}>
					<div className={css.featuredInfoBox} style={uiPanelStyle}>
						<div className={css.featuredMeta}>
							{currentFeatured.ProductionYear && (
								<span className={css.metaItem}>{currentFeatured.ProductionYear}</span>
							)}
							{currentFeatured.OfficialRating && (
								<span className={css.metaItem}>{currentFeatured.OfficialRating}</span>
							)}
							{(() => {
								if (!currentFeatured.RunTimeTicks || currentFeatured.Type === 'Series') return null;
								const dur = formatDuration(currentFeatured.RunTimeTicks);
								return dur && dur !== '0m' ? <span className={css.metaItem}>{dur}</span> : null;
							})()}
							{currentFeatured.Genres?.slice(0, FEATURED_GENRES_LIMIT).map((g, i) => (
								<span key={i} className={css.metaItem}>{g}</span>
							))}
						</div>
						<RatingsRow item={currentFeatured} serverUrl={getItemServerUrl(currentFeatured)} compact pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false} />
						<p className={css.featuredOverview}>
							{currentFeatured.Overview || $L('No description available.')}
						</p>
					</div>

				</div>

				{featuredItems.length > 1 && (
					<div className={css.featuredIndicators}>
						{featuredItems.map((_, idx) => (
							<div
								key={idx}
								className={`${css.indicatorDot} ${idx === currentIndex ? css.active : ''}`}
							/>
						))}
					</div>
				)}
			</SpottableDiv>
		</div>
	);
});

export default FeaturedBanner;
