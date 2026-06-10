import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {getImageUrl} from '../../utils/helpers';
import {genreGlowRgb} from './galleryGlow';
import {KEYS} from '../../utils/keys';
import css from './Browse.module.less';

const SPINES_PER_SIDE = 7;
const POSTER_OPTS = {maxWidth: 500, quality: 85};

const SpottableDiv = Spottable('div');

const padIndex = (n) => String(n + 1).padStart(2, '0');

const Spine = ({item, index, onSelect}) => {
	const handleClick = useCallback((e) => {
		e.stopPropagation();
		onSelect(index);
	}, [onSelect, index]);

	return (
		<div
			className={css.bookshelfSpine}
			style={{backgroundColor: `rgb(${genreGlowRgb(item.Genres)})`}}
			onClick={handleClick}
		>
			<div className={css.bookshelfSpineLight} />
			<div className={css.bookshelfSpineContent}>
				<span className={css.bookshelfSpineIndex}>{padIndex(index)}</span>
				<span className={css.bookshelfSpineDivider} />
				<div className={css.bookshelfSpineTitleWrap}>
					<span className={css.bookshelfSpineTitle}>{item.Name}</span>
				</div>
			</div>
		</div>
	);
};

const BookshelfBar = memo(({
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

	const safeIndex = Math.min(currentIndex, Math.max(0, featuredItems.length - 1));
	const currentFeatured = featuredItems[safeIndex];

	useEffect(() => {
		setCurrentIndex(0);
		preloadedImagesRef.current.clear();
	}, [featuredItems]);

	useEffect(() => {
		if (!currentFeatured) return;

		const preloadImage = (url) => {
			if (!url || preloadedImagesRef.current.has(url)) return;
			const img = new window.Image();
			img.src = url;
			preloadedImagesRef.current.add(url);
		};

		for (let offset = -1; offset <= 1; offset++) {
			const item = featuredItems[safeIndex + offset];
			if (item) {
				preloadImage(getImageUrl(getItemServerUrl(item), item.Id, 'Primary', POSTER_OPTS));
			}
		}
	}, [safeIndex, featuredItems, currentFeatured, getItemServerUrl]);

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

	const select = useCallback((index) => {
		if (index < 0 || index >= featuredItems.length) return;
		setCurrentIndex(index);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const goPrev = useCallback(() => {
		setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
		startCarouselTimer();
	}, [startCarouselTimer]);

	const goNext = useCallback(() => {
		setCurrentIndex((prev) => (prev < featuredItems.length - 1 ? prev + 1 : prev));
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			if (safeIndex === 0 && settings.navbarPosition === 'left') {
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

	if (!isVisible || !currentFeatured) return null;

	const leftStart = Math.max(0, safeIndex - SPINES_PER_SIDE);
	const leftItems = featuredItems.slice(leftStart, safeIndex);
	const rightItems = featuredItems.slice(safeIndex + 1, safeIndex + 1 + SPINES_PER_SIDE);
	const posterUrl = getImageUrl(getItemServerUrl(currentFeatured), currentFeatured.Id, 'Primary', POSTER_OPTS);

	return (
		<div className={css.bookshelfBanner}>
			<SpottableDiv
				className={css.bookshelfInner}
				spotlightId='featured-banner'
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.bookshelfRow}>
					<div className={`${css.bookshelfSide} ${css.bookshelfSideLeft}`}>
						{leftItems.map((item, i) => (
							<Spine key={item.Id || (leftStart + i)} item={item} index={leftStart + i} onSelect={select} />
						))}
					</div>

					<div className={css.bookshelfCenter}>
						<div className={css.bookshelfBook} style={{backgroundColor: `rgb(${genreGlowRgb(currentFeatured.Genres)})`}}>
							<div className={css.bookshelfBookPoster}>
								<img src={posterUrl} alt='' />
								<div className={css.bookshelfPaperTint} />
							</div>
							<div className={css.bookshelfBookShading} />
						</div>
					</div>

					<div className={`${css.bookshelfSide} ${css.bookshelfSideRight}`}>
						{rightItems.map((item, i) => (
							<Spine key={item.Id || (safeIndex + 1 + i)} item={item} index={safeIndex + 1 + i} onSelect={select} />
						))}
					</div>
				</div>

				<div className={css.bookshelfLedge} />
			</SpottableDiv>
		</div>
	);
});

export default BookshelfBar;
