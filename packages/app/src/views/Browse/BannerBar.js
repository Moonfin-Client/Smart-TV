import {useState, useEffect, useCallback, useRef, memo} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {getImageUrl, getFeaturedBackdropUrl, formatDuration} from '../../utils/helpers';
import {seerrThumbUrl} from '../../utils/tmdbThumb';
import RatingsRow from '../../components/RatingsRow';
import {KEYS} from '../../utils/keys';
import MediaBarNewReleaseLabel from '../../components/MediaBarNewReleaseLabel';
import css from './Browse.module.less';
import {carouselIntervalMs} from '../../utils/carouselTiming';
import {useScreensaverActive} from '../../hooks/useScreensaverActive';

const PRELOAD_ADJACENT_SLIDES = 2;
const MAX_DOTS = 7;

const SpottableDiv = Spottable('div');

const backdropUrl = (serverUrl, item) => getFeaturedBackdropUrl(serverUrl, item, {maxWidth: 1920, quality: 85});

// A title from an outside list has no server banner, so the plugin's titled TMDB thumb stands in.
const bannerUrl = (serverUrl, item) => {
	if (item._external) return seerrThumbUrl(item);
	return item.ImageTags?.Banner
		? getImageUrl(serverUrl, item.Id, 'Banner', {maxWidth: 1280, tag: item.ImageTags.Banner})
		: null;
};

const buildMeta = (item) => {
	const parts = [];
	if (item.ProductionYear) parts.push(String(item.ProductionYear));
	if (item.Type !== 'Series' && item.RunTimeTicks) {
		const dur = formatDuration(item.RunTimeTicks);
		if (dur && dur !== '0m') parts.push(dur);
	}
	if (item.OfficialRating) parts.push(item.OfficialRating);
	return parts.join('  ·  ');
};

const BannerBar = memo(({
	isVisible,
	featuredItems,
	newReleases,
	settings,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);
	// A banner that won't load falls back to the backdrop, with the title back over it.
	const [failedBannerId, setFailedBannerId] = useState(null);
	const screensaverActive = useScreensaverActive();

	const preloadedImagesRef = useRef(new Set());
	const carouselIntervalRef = useRef(null);

	const currentFeatured = featuredItems[currentIndex];

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
				const art = bannerUrl(getItemServerUrl(item), item);
				if (art) {
					preloadImage(art);
				} else {
					preloadImage(backdropUrl(getItemServerUrl(item), item));
					if (item.LogoUrl) preloadImage(item.LogoUrl);
				}
			}
		}
	}, [currentIndex, featuredItems, getItemServerUrl]);

	const startCarouselTimer = useCallback(() => {
		if (carouselIntervalRef.current) {
			clearInterval(carouselIntervalRef.current);
			carouselIntervalRef.current = null;
		}

		const carouselSpeed = carouselIntervalMs(
			settings.autoAdvance,
			settings.autoAdvanceInterval,
			settings.carouselSpeed
		);
		if (!isVisible || screensaverActive || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0) return;

		carouselIntervalRef.current = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, screensaverActive, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed]);

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
		setCurrentIndex((prev) => (prev === 0 ? featuredItems.length - 1 : prev - 1));
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const goNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			if (settings.navbarPosition === 'left' && currentIndex === 0) {
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
	}, [goPrev, goNext, currentIndex, settings.navbarPosition, onNavigateDown]);

	const handleClick = useCallback(() => {
		const item = featuredItems[currentIndex];
		if (item) onSelectItem(item);
	}, [featuredItems, currentIndex, onSelectItem]);

	const handleFocus = useCallback(() => {
		setFeaturedFocused(true);
		onFeaturedFocus?.();
	}, [onFeaturedFocus]);

	const handleBlur = useCallback(() => {
		setFeaturedFocused(false);
	}, []);

	const handleBannerError = useCallback(() => setFailedBannerId(currentFeatured?.Id), [currentFeatured]);

	if (!isVisible || !currentFeatured) return null;

	const serverUrl = getItemServerUrl(currentFeatured);
	const banner = failedBannerId === currentFeatured.Id ? null : bannerUrl(serverUrl, currentFeatured);
	const meta = buildMeta(currentFeatured);
	const dotCount = Math.min(featuredItems.length, MAX_DOTS);
	const dotStart = Math.max(0, Math.min(currentIndex - Math.floor(dotCount / 2), featuredItems.length - dotCount));

	return (
		<div className={css.bannerBanner}>
			<SpottableDiv
				className={css.bannerCard}
				spotlightId='featured-banner'
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.bannerBackdrop}>
					{banner ? (
						<>
							<img className={css.bannerFill} src={banner} alt='' />
							<img className={css.bannerArt} src={banner} alt='' onError={handleBannerError} />
						</>
					) : (
						<img src={backdropUrl(serverUrl, currentFeatured)} alt='' />
					)}
				</div>
				<div className={css.bannerGradient} />

				<div className={css.bannerContent}>
					{banner ? null : currentFeatured.LogoUrl ? (
						<div className={css.bannerLogo}>
							<img src={currentFeatured.LogoUrl} alt={`${currentFeatured.Name} logo`} />
						</div>
					) : (
						<h2 className={css.bannerTitle}>{currentFeatured.Name}</h2>
					)}

					<MediaBarNewReleaseLabel release={newReleases?.[currentFeatured.Id]} />

					{meta && <div className={css.bannerMeta}>{meta}</div>}

					<RatingsRow
						item={currentFeatured}
						serverUrl={serverUrl}
						compact
						surface='mediaBar'
						pluginEnabled={isMdblistEnabled(settings, 'mediaBar')}
					/>
				</div>

				{featuredItems.length > 1 && (
					<div className={css.bannerDots}>
						{Array.from({length: dotCount}, (_, i) => {
							const idx = dotStart + i;
							return (
								<div
									key={idx}
									className={`${css.bannerDot} ${idx === currentIndex ? css.bannerDotActive : ''}`}
								/>
							);
						})}
					</div>
				)}
			</SpottableDiv>
		</div>
	);
});

export default BannerBar;
