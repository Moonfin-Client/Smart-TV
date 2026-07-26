import {useState, useEffect, useCallback, useRef, memo} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {getImageUrl, getBackdropId, formatDuration} from '../../utils/helpers';
import RatingsRow from '../../components/RatingsRow';
import {KEYS} from '../../utils/keys';
import css from './Browse.module.less';

const FEATURED_GENRES_LIMIT = 3;
const PRELOAD_ADJACENT_SLIDES = 2;

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const MakdBanner = memo(({
	isVisible,
	featuredItems,
	serverUrl,
	settings,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus,
	onCurrentItemChange
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);

	const preloadedImagesRef = useRef(new Set());
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
		if (!isVisible || featuredItems.length <= 1 || !featuredFocused || carouselSpeed === 0) return;

		carouselIntervalRef.current = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, featuredItems.length, featuredFocused, settings.carouselSpeed]);

	useEffect(() => {
		if (!isVisible || featuredItems.length <= 1 || !featuredFocused || settings.carouselSpeed === 0) return;
		startCarouselTimer();
		return () => {
			if (carouselIntervalRef.current) {
				clearInterval(carouselIntervalRef.current);
				carouselIntervalRef.current = null;
			}
		};
	}, [isVisible, featuredItems.length, featuredFocused, settings.carouselSpeed, startCarouselTimer]);

	useEffect(() => {
		return () => {
			if (carouselIntervalRef.current) {
				clearInterval(carouselIntervalRef.current);
				carouselIntervalRef.current = null;
			}
		};
	}, []);

	const handleFeaturedPrev = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentIndex((prev) => (prev === 0 ? featuredItems.length - 1 : prev - 1));
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleFeaturedNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
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
		<div className={css.makdBanner}>
			<SpottableDiv
				className={css.makdInner}
				spotlightId='featured-banner'
				onClick={handleFeaturedClick}
				onKeyDown={handleFeaturedKeyDown}
				onFocus={handleFeaturedFocus}
				onBlur={handleFeaturedBlur}
			>
				<div className={css.makdBackdrop}>
					<img
						src={getImageUrl(getItemServerUrl(currentFeatured), getBackdropId(currentFeatured), 'Backdrop', {maxWidth: 1920, quality: 85})}
						alt=''
					/>
				</div>
				<div className={css.makdGradient} />

				{featuredItems.length > 1 && (
					<>
						{settings.navbarPosition !== 'left' && (
							<SpottableButton
								className={`${css.carouselNav} ${css.carouselNavLeft}`}
								onClick={handleCarouselPrevClick}
							>
								<svg viewBox='0 0 24 24' width='32' height='32'>
									<path fill='currentColor' d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' />
								</svg>
							</SpottableButton>
						)}
						<SpottableButton
							className={`${css.carouselNav} ${css.carouselNavRight}`}
							onClick={handleCarouselNextClick}
						>
							<svg viewBox='0 0 24 24' width='32' height='32'>
								<path fill='currentColor' d='M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z' />
							</svg>
						</SpottableButton>
					</>
				)}

				<div className={css.makdContent}>
					{currentFeatured.LogoUrl ? (
						<div className={css.makdLogo}>
							<img src={currentFeatured.LogoUrl} alt={`${currentFeatured.Name} logo`} />
						</div>
					) : null}

					<div className={`${css.makdTextBlock} ${currentFeatured.LogoUrl ? css.makdTextWithLogo : css.makdTextNoLogo}`}>
						{!currentFeatured.LogoUrl && (
							<h2 className={css.makdTitle}>{currentFeatured.Name}</h2>
						)}

						<div className={css.makdMeta}>
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

						<RatingsRow
							item={currentFeatured}
							serverUrl={getItemServerUrl(currentFeatured)}
							compact
							pluginEnabled={isMdblistEnabled(settings)}
						/>

						<p className={css.makdOverview}>
							{currentFeatured.Overview || $L('No description available.')}
						</p>
					</div>
				</div>

				{featuredItems.length > 1 && (
					<div className={css.makdDots}>
						{featuredItems.map((_, idx) => (
							<div
								key={idx}
								className={`${css.makdDot} ${idx === currentIndex ? css.makdDotActive : ''}`}
							/>
						))}
					</div>
				)}
			</SpottableDiv>
		</div>
	);
});

export default MakdBanner;
