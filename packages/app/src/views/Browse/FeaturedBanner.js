import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {getImageUrl, getBackdropId, formatDuration} from '../../utils/helpers';
import RatingsRow from '../../components/RatingsRow';
import {KEYS} from '../../utils/keys';
import useTrailerPreview from './useTrailerPreview';
import css from './Browse.module.less';

const FEATURED_GENRES_LIMIT = 3;
const PRELOAD_ADJACENT_SLIDES = 2;

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const FeaturedBanner = memo(({
	isVisible,
	featuredItems,
	serverUrl,
	api,
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
	const [featuredFocused, setFeaturedFocused] = useState(false);

	const preloadedImagesRef = useRef(new Set());
	const carouselIntervalRef = useRef(null);

	const currentFeatured = featuredItems[currentIndex];

	const {trailerActive, trailerContainerRef} = useTrailerPreview({
		currentItem: currentFeatured,
		isVisible,
		enabled: settings.featuredTrailerPreview,
		preferMuted: settings.featuredTrailerMuted,
		api,
		getItemServerUrl
	});

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

		const autoAdvanceEnabled = settings.autoAdvance !== false;
		const configuredInterval = Number(settings.autoAdvanceInterval);
		const carouselSpeed = Number.isFinite(configuredInterval) && configuredInterval > 0
			? configuredInterval * 1000
			: (settings.carouselSpeed || 8000);
		if (!autoAdvanceEnabled || !isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerActive) return;

		carouselIntervalRef.current = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerActive]);

	useEffect(() => {
		const autoAdvanceEnabled = settings.autoAdvance !== false;
		const configuredInterval = Number(settings.autoAdvanceInterval);
		const carouselSpeed = Number.isFinite(configuredInterval) && configuredInterval > 0
			? configuredInterval * 1000
			: (settings.carouselSpeed || 8000);
		if (!autoAdvanceEnabled || !isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerActive) return;
		startCarouselTimer();
		return () => {
			if (carouselIntervalRef.current) {
				clearInterval(carouselIntervalRef.current);
				carouselIntervalRef.current = null;
			}
		};
	}, [isVisible, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerActive, startCarouselTimer]);

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
