import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {getImageUrl, getFeaturedBackdropUrl} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import MediaBarNewReleaseLabel from '../../components/MediaBarNewReleaseLabel';
import useTrailerPreview from './useTrailerPreview';
import css from './Browse.module.less';
import {carouselIntervalMs} from '../../utils/carouselTiming';
import {useScreensaverActive} from '../../hooks/useScreensaverActive';

const BACKDROP_OPTS = {maxWidth: 1600, quality: 85};
const LOGO_OPTS = {maxWidth: 680, quality: 90};
const SLIDE_TRANSITION_MS = 420;

const SpottableDiv = Spottable('div');

// The clean rounded hero from the other clients. One slide at a time inside a
// rounded frame, a logo or bold title in its corner, bar indicators instead of
// dots, and the artwork breathing slightly while the frame holds focus.
const AyaBanner = memo(({
	isVisible,
	browseVisible = true,
	featuredItems,
	newReleases,
	api,
	settings,
	settingsLoaded,
	getItemServerUrl,
	onSelectItem,
	onNavigateDown,
	onFeaturedFocus,
	onAmbientItemChange
}) => {
	const [activeIndex, setActiveIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);
	const screensaverActive = useScreensaverActive();
	const [baseSlide, setBaseSlide] = useState(null);
	const [incomingSlide, setIncomingSlide] = useState(null);
	const [failedLogos, setFailedLogos] = useState({});

	const carouselIntervalRef = useRef(null);
	const desiredIdRef = useRef(null);

	const safeIndex = Math.min(activeIndex, Math.max(0, featuredItems.length - 1));
	const currentFeatured = featuredItems[safeIndex];

	const backdropUrlOf = useCallback((item) => getFeaturedBackdropUrl(getItemServerUrl(item), item, BACKDROP_OPTS), [getItemServerUrl]);

	const logoUrlOf = useCallback((item) => {
		if (item?._external) return item.LogoUrl || null;
		if (!item?.ImageTags?.Logo) return null;
		return getImageUrl(getItemServerUrl(item), item.Id, 'Logo', LOGO_OPTS);
	}, [getItemServerUrl]);

	const handleTrailerEnded = useCallback(() => {
		if (featuredItems.length > 1) setActiveIndex((prev) => (prev + 1) % featuredItems.length);
	}, [featuredItems.length]);

	const {trailerContainerRef, trailerHolding} = useTrailerPreview({
		currentItem: currentFeatured,
		isVisible: isVisible && browseVisible && featuredFocused,
		enabled: settingsLoaded && settings.featuredTrailerPreview,
		preferMuted: settings.featuredTrailerMuted,
		volume: settings.trailerVolume,
		showCaptions: settings.mediaBarTrailerCaptions,
		captionLanguage: settings.uiLanguage,
		api,
		getItemServerUrl,
		onEnded: handleTrailerEnded
	});

	useEffect(() => {
		setActiveIndex(0);
		setBaseSlide(null);
		setIncomingSlide(null);
	}, [featuredItems]);

	// The next slide waits for its artwork so the fade never shows a half
	// loaded image, and a stale load is dropped when the carousel moved on.
	useEffect(() => {
		const item = currentFeatured;
		if (!item) return undefined;
		desiredIdRef.current = item.Id;
		if (!baseSlide) {
			setBaseSlide(item);
			return undefined;
		}
		if (baseSlide.Id === item.Id) return undefined;
		const url = backdropUrlOf(item);
		if (!url) {
			setIncomingSlide(item);
			return undefined;
		}
		const img = new window.Image();
		const deliver = () => {
			if (desiredIdRef.current === item.Id) setIncomingSlide(item);
		};
		img.onload = deliver;
		img.onerror = deliver;
		img.src = url;
		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [currentFeatured, baseSlide, backdropUrlOf]);

	useEffect(() => {
		if (!incomingSlide) return undefined;
		const timer = setTimeout(() => {
			setBaseSlide(incomingSlide);
			setIncomingSlide(null);
		}, SLIDE_TRANSITION_MS + 80);
		return () => clearTimeout(timer);
	}, [incomingSlide]);

	// The page backdrop behind the frame follows the slide the way the other
	// clients feed their ambient background.
	useEffect(() => {
		if (currentFeatured) onAmbientItemChange?.(currentFeatured);
	}, [currentFeatured, onAmbientItemChange]);

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
		if (!isVisible || screensaverActive || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerHolding) return;
		carouselIntervalRef.current = setInterval(() => {
			setActiveIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, screensaverActive, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerHolding]);

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

	const handleLogoError = useCallback((e) => {
		const failedId = e.currentTarget.getAttribute('data-item-id');
		if (failedId) setFailedLogos((prev) => ({...prev, [failedId]: true}));
	}, []);

	if (!isVisible || !currentFeatured) return null;

	const renderSlide = (item, entering) => {
		const backdropUrl = backdropUrlOf(item);
		const logoUrl = failedLogos[item.Id] ? null : logoUrlOf(item);
		return (
			<div key={item.Id} className={`${css.ayaSlide} ${entering ? css.ayaSlideIn : ''}`}>
				<div className={css.ayaBackdrop}>
					{backdropUrl && <img src={backdropUrl} alt='' />}
				</div>
				<div className={css.ayaContent}>
					{logoUrl
						? <img className={css.ayaLogo} src={logoUrl} alt={item.Name} data-item-id={item.Id} onError={handleLogoError} />
						: <h2 className={css.ayaTitle}>{item.Name}</h2>}
					<MediaBarNewReleaseLabel release={newReleases?.[item.Id]} />
				</div>
			</div>
		);
	};

	return (
		<div className={css.ayaBanner}>
			<SpottableDiv
				className={`${css.ayaScale} ${featuredFocused ? css.ayaScaleFocused : ''}`}
				spotlightId='featured-banner'
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.ayaFrame}>
					{baseSlide && renderSlide(baseSlide, false)}
					{incomingSlide && renderSlide(incomingSlide, true)}
					<div className={css.ayaTrailer} ref={trailerContainerRef} />
					{featuredItems.length > 1 && (
						<div className={css.ayaIndicators}>
							{featuredItems.map((item, index) => (
								<span
									key={item.Id || index}
									className={`${css.ayaIndicator} ${index === safeIndex ? css.ayaIndicatorActive : ''}`}
								/>
							))}
						</div>
					)}
				</div>
				{featuredFocused && <div className={css.ayaFocusRing} />}
			</SpottableDiv>
		</div>
	);
});

export default AyaBanner;
