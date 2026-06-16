import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {getImageUrl, getBackdropId, formatDuration} from '../../utils/helpers';
import RatingsRow from '../../components/RatingsRow';
import {KEYS} from '../../utils/keys';
import css from './Browse.module.less';

const PRELOAD_ADJACENT_SLIDES = 2;
const MAX_DOTS = 7;

const SpottableDiv = Spottable('div');

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
	settings,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);

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
				const backdropId = getBackdropId(item);
				if (backdropId) {
					preloadImage(getImageUrl(getItemServerUrl(item), backdropId, 'Backdrop', {maxWidth: 1920, quality: 85}));
				}
				if (item.LogoUrl) {
					preloadImage(item.LogoUrl);
				}
			}
		}
	}, [currentIndex, featuredItems, getItemServerUrl]);

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
		if (!autoAdvanceEnabled || !isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0) return;

		carouselIntervalRef.current = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed]);

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

	if (!isVisible || !currentFeatured) return null;

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
					<img
						src={getImageUrl(getItemServerUrl(currentFeatured), getBackdropId(currentFeatured), 'Backdrop', {maxWidth: 1920, quality: 85})}
						alt=''
					/>
				</div>
				<div className={css.bannerGradient} />

				<div className={css.bannerContent}>
					{currentFeatured.LogoUrl ? (
						<div className={css.bannerLogo}>
							<img src={currentFeatured.LogoUrl} alt={`${currentFeatured.Name} logo`} />
						</div>
					) : (
						<h2 className={css.bannerTitle}>{currentFeatured.Name}</h2>
					)}

					{meta && <div className={css.bannerMeta}>{meta}</div>}

					<RatingsRow
						item={currentFeatured}
						serverUrl={getItemServerUrl(currentFeatured)}
						compact
						pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false}
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
