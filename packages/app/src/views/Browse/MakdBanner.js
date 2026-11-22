import {useState, useEffect, useCallback, useRef, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {isMdblistEnabled, isRatingSourceEnabled, ratingSettingsFor} from '../../services/mdblistApi';
import {getApiForItem} from '../../services/connectionPool';
import {getFeaturedBackdropUrl} from '../../utils/helpers';
import {formatPlaybackEndsAt} from '../../utils/playbackTimeLabels';
import RatingsRow from '../../components/RatingsRow';
import {MaterialIcon} from '../../components/icons/materialIcons';
import {getRtFallbackIcon} from '../../components/icons/rtIcons';
import {KEYS} from '../../utils/keys';
import MediaBarNewReleaseLabel from '../../components/MediaBarNewReleaseLabel';
import useTrailerPreview from './useTrailerPreview';
import css from './Browse.module.less';
import {carouselIntervalMs} from '../../utils/carouselTiming';
import {useScreensaverActive} from '../../hooks/useScreensaverActive';

// The layout is makd's Jellyfin Media Bar, v6 Classic.
const FEATURED_GENRES_LIMIT = 3;
const PRELOAD_ADJACENT_SLIDES = 2;
const MAX_DOTS = 5;
const BUTTON_IDS = {info: 'featured-banner', play: 'makd-play', favorite: 'makd-favorite'};

const SpottableButton = Spottable('button');

// At most five dots. With more titles than that, a dot stands for a share of the run.
export const activeDotIndex = (index, total) => (total <= MAX_DOTS
	? index
	: Math.min(MAX_DOTS - 1, Math.floor((index / total) * MAX_DOTS)));

// List titles that aren't in the library open in Seerr and have nothing to play or favorite.
const isExternalItem = (item) => Boolean((item?._seerr || item?._external) && !item._resolvedFromExternal);

const Separator = () => (
	<svg className={css.makdSep} viewBox='0 0 24 24' aria-hidden='true'>
		<circle cx='12' cy='12' r='8' fill='currentColor' />
	</svg>
);

const withSeparators = (nodes) => nodes.reduce((all, node, i) => {
	if (i > 0) all.push(<Separator key={`sep${i}`} />);
	all.push(node);
	return all;
}, []);

const InfoRow = ({item, settings, serverUrl}) => {
	const fields = [];
	if (isMdblistEnabled(settings, 'mediaBar')) {
		fields.push(
			<span key='ratings' className={css.makdPluginRatings}>
				<RatingsRow item={item} serverUrl={serverUrl} compact surface='mediaBar' labels={false} badges={false} />
			</span>
		);
	} else {
		if (item.CommunityRating && isRatingSourceEnabled(ratingSettingsFor(settings, 'mediaBar'), 'stars')) {
			fields.push(
				<span key='stars' className={css.makdField}>
					<MaterialIcon name='star' className={css.makdStar} />
					{item.CommunityRating.toFixed(1)}
				</span>
			);
		}
		if (item.CriticRating != null) {
			fields.push(
				<span key='critic' className={css.makdField}>
					<img className={css.makdTomato} src={getRtFallbackIcon(item.CriticRating)} alt='' />
					{`${Math.round(item.CriticRating)}%`}
				</span>
			);
		}
	}
	const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null);
	if (year) fields.push(<span key='year' className={css.makdField}>{year}</span>);
	if (item.OfficialRating) fields.push(<span key='age' className={css.makdAge}>{item.OfficialRating}</span>);
	if (item.ChildCount) {
		const seasons = item.ChildCount === 1 ? $L('1 Season') : $L('{count} Seasons').replace('{count}', item.ChildCount);
		fields.push(<span key='runtime' className={css.makdField}>{seasons}</span>);
	} else if (item.Type !== 'Series' && item.RunTimeTicks > 0) {
		const endsAt = formatPlaybackEndsAt(item.RunTimeTicks / 10000000, settings.clockDisplay, settings.timeOffsetHours);
		if (endsAt) fields.push(<span key='runtime' className={css.makdField}>{endsAt}</span>);
	}
	if (fields.length === 0) return null;
	return <div className={css.makdInfoRow}>{withSeparators(fields)}</div>;
};

const MakdBanner = memo(({
	isVisible,
	browseVisible = true,
	featuredItems,
	newReleases,
	serverUrl,
	api,
	settings,
	settingsLoaded,
	getItemServerUrl,
	onSelectItem,
	onPlayItem,
	onNavigateDown,
	onFeaturedFocus,
	onCurrentItemChange
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [featuredFocused, setFeaturedFocused] = useState(false);
	const [favorites, setFavorites] = useState({});
	const screensaverActive = useScreensaverActive();

	const preloadedImagesRef = useRef(new Set());
	const carouselIntervalRef = useRef(null);
	const containerRef = useRef(null);
	// The slide on screen and the one it replaced, so the new art fades in over the old.
	const layersRef = useRef({prev: null, cur: null});

	const currentFeatured = featuredItems[currentIndex];
	const external = isExternalItem(currentFeatured);

	if (currentFeatured && layersRef.current.cur?.item !== currentFeatured) {
		const shown = layersRef.current.cur;
		layersRef.current = {prev: shown, cur: {item: currentFeatured, key: (shown?.key || 0) + 1}};
	}

	const indexRef = useRef(0);
	indexRef.current = currentIndex;

	// Play and Favorite go away on a list title, so focus moves to Info before they do.
	const goTo = useCallback((index) => {
		if (isExternalItem(featuredItems[index])) {
			const name = document.activeElement?.dataset?.makdButton;
			if (name && name !== 'info') Spotlight.focus(BUTTON_IDS.info);
		}
		setCurrentIndex(index);
	}, [featuredItems]);

	// A trailer outlives the carousel interval, so finishing one moves the slide on itself.
	const handleTrailerEnded = useCallback(() => {
		if (featuredItems.length > 1) goTo((indexRef.current + 1) % featuredItems.length);
	}, [featuredItems.length, goTo]);

	const {trailerActive, trailerHolding, trailerContainerRef, stopTrailer} = useTrailerPreview({
		currentItem: currentFeatured,
		isVisible: isVisible && browseVisible && featuredFocused,
		enabled: settingsLoaded && settings.featuredTrailerPreview,
		preferMuted: settings.featuredTrailerMuted,
		volume: settings.trailerVolume,
		showCaptions: settings.mediaBarTrailerCaptions,
		captionLanguage: settings.uiLanguage,
		api,
		getItemServerUrl,
		onEnded: handleTrailerEnded,
		hidesChrome: featuredFocused
	});

	useEffect(() => {
		if (featuredItems[currentIndex]) {
			onCurrentItemChange?.(featuredItems[currentIndex]);
		}
	}, [currentIndex, featuredItems, onCurrentItemChange]);

	useEffect(() => {
		goTo(0);
		preloadedImagesRef.current.clear();
	}, [goTo]);

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
				preloadImage(getFeaturedBackdropUrl(serverUrl, item, {maxWidth: 1920, quality: 85}));
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

		const carouselSpeed = carouselIntervalMs(
			settings.autoAdvance,
			settings.autoAdvanceInterval,
			settings.carouselSpeed
		);
		if (!isVisible || screensaverActive || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerHolding) return;

		carouselIntervalRef.current = setInterval(() => {
			goTo((indexRef.current + 1) % featuredItems.length);
		}, carouselSpeed);
	}, [isVisible, screensaverActive, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerHolding, goTo]);

	useEffect(() => {
		const carouselSpeed = carouselIntervalMs(
			settings.autoAdvance,
			settings.autoAdvanceInterval,
			settings.carouselSpeed
		);
		if (!isVisible || screensaverActive || featuredItems.length <= 1 || !featuredFocused || carouselSpeed <= 0 || trailerHolding) return;
		startCarouselTimer();
		return () => {
			if (carouselIntervalRef.current) {
				clearInterval(carouselIntervalRef.current);
				carouselIntervalRef.current = null;
			}
		};
	}, [isVisible, screensaverActive, featuredItems.length, featuredFocused, settings.autoAdvance, settings.autoAdvanceInterval, settings.carouselSpeed, trailerHolding, startCarouselTimer]);

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
		goTo(indexRef.current === 0 ? featuredItems.length - 1 : indexRef.current - 1);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer, goTo]);

	const handleFeaturedNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		goTo((indexRef.current + 1) % featuredItems.length);
		startCarouselTimer();
	}, [featuredItems.length, startCarouselTimer, goTo]);

	const isFavorite = currentFeatured
		? (favorites[currentFeatured.Id] ?? Boolean(currentFeatured.UserData?.IsFavorite))
		: false;

	const handleInfo = useCallback(() => {
		if (currentFeatured) onSelectItem(currentFeatured);
	}, [currentFeatured, onSelectItem]);

	const handlePlay = useCallback(() => {
		if (currentFeatured) onPlayItem(currentFeatured);
	}, [currentFeatured, onPlayItem]);

	const handleFavorite = useCallback(() => {
		if (!currentFeatured) return;
		const id = currentFeatured.Id;
		const next = !isFavorite;
		setFavorites((saved) => ({...saved, [id]: next}));
		(getApiForItem(currentFeatured) || api).setFavorite(id, next)
			.catch(() => setFavorites((saved) => ({...saved, [id]: !next})));
	}, [currentFeatured, isFavorite, api]);

	// Left and Right walk the buttons, and past either end they change the slide, as the original does.
	const handleButtonKeyDown = useCallback((e) => {
		const order = external ? ['info'] : ['info', 'play', 'favorite'];
		const at = order.indexOf(e.currentTarget.dataset.makdButton);
		if (e.keyCode === KEYS.ENTER && e.repeat) {
			// A held OK would press the button again on every repeat.
			e.preventDefault();
		} else if (trailerActive && (e.keyCode === KEYS.LEFT || e.keyCode === KEYS.RIGHT)) {
			// Over a full screen trailer the first press ends it and brings the bar back.
			// The trailer only starts again for another slide.
			e.preventDefault();
			e.stopPropagation();
			stopTrailer();
		} else if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			if (at > 0) Spotlight.focus(BUTTON_IDS[order[at - 1]]);
			// A docked sidebar takes Left from the first button on any slide.
			else if (settings.navbarPosition === 'left') Spotlight.focus('navbar');
			else handleFeaturedPrev();
		} else if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			if (at >= 0 && at < order.length - 1) Spotlight.focus(BUTTON_IDS[order[at + 1]]);
			else handleFeaturedNext();
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
	}, [external, settings.navbarPosition, handleFeaturedPrev, handleFeaturedNext, onNavigateDown, trailerActive, stopTrailer]);

	const handleFocus = useCallback(() => {
		if (featuredFocused) return;
		setFeaturedFocused(true);
		onFeaturedFocus?.();
	}, [featuredFocused, onFeaturedFocus]);

	const handleBlur = useCallback((e) => {
		if (containerRef.current && e.relatedTarget && containerRef.current.contains(e.relatedTarget)) return;
		setFeaturedFocused(false);
	}, []);

	if (!isVisible || !currentFeatured) return null;

	const {prev, cur} = layersRef.current;
	const layerFor = (layer) => (
		<div key={layer.key} className={css.makdLayer}>
			<img src={getFeaturedBackdropUrl(getItemServerUrl(layer.item), layer.item, {maxWidth: 1920, quality: 85})} alt='' />
		</div>
	);
	const genres = (currentFeatured.Genres || []).slice(0, FEATURED_GENRES_LIMIT);
	const showPlot = !settings.hideHomeMediaDescription && Boolean(currentFeatured.Overview);
	const dotCount = Math.min(featuredItems.length, MAX_DOTS);
	const activeDot = activeDotIndex(currentIndex, featuredItems.length);
	const innerClass = [css.makdInner, trailerActive && css.makdTrailerActive, featuredFocused && css.makdFocused].filter(Boolean).join(' ');

	return (
		<div className={css.makdBanner}>
			<div
				ref={containerRef}
				className={innerClass}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.trailerContainer} ref={trailerContainerRef} />
				<div className={css.makdBackdrop} onClick={handleInfo}>
					{prev && layerFor(prev)}
					{layerFor(cur)}
				</div>
				<div className={css.makdShade} />
				<div className={css.makdWash} />

				<div className={css.makdContent}>
					<div key={cur.key} className={css.makdSlide}>
						<div className={css.makdLogo}>
							{currentFeatured.LogoUrl ? (
								<img src={currentFeatured.LogoUrl} alt={currentFeatured.Name} />
							) : (
								<h2 className={css.makdTitle}>{currentFeatured.Name}</h2>
							)}
						</div>
						<MediaBarNewReleaseLabel release={newReleases?.[currentFeatured.Id]} />
						<InfoRow item={currentFeatured} settings={settings} serverUrl={getItemServerUrl(currentFeatured)} />
						{genres.length > 0 && (
							<div className={css.makdGenres}>
								{withSeparators(genres.map((genre) => <span key={genre}>{genre}</span>))}
							</div>
						)}
						{showPlot && <p className={css.makdPlot}>{currentFeatured.Overview}</p>}
					</div>
					<div className={css.makdButtons}>
						<SpottableButton
							className={css.makdCircle}
							spotlightId={BUTTON_IDS.info}
							data-makd-button='info'
							aria-label={$L('Details')}
							onClick={handleInfo}
							onKeyDown={handleButtonKeyDown}
						>
							<MaterialIcon name='infoOutline' />
						</SpottableButton>
						{!external && (
							<SpottableButton
								className={css.makdPlay}
								spotlightId={BUTTON_IDS.play}
								data-makd-button='play'
								onClick={handlePlay}
								onKeyDown={handleButtonKeyDown}
							>
								<MaterialIcon name='playArrow' />
								<span>{$L('Play')}</span>
							</SpottableButton>
						)}
						{!external && (
							<SpottableButton
								className={`${css.makdCircle} ${isFavorite ? css.makdFavorited : ''}`}
								spotlightId={BUTTON_IDS.favorite}
								data-makd-button='favorite'
								aria-label={$L('Favorite')}
								aria-pressed={isFavorite}
								onClick={handleFavorite}
								onKeyDown={handleButtonKeyDown}
							>
								<MaterialIcon name={isFavorite ? 'favorite' : 'favoriteBorder'} />
							</SpottableButton>
						)}
					</div>
				</div>

				{dotCount > 1 && (
					<div className={css.makdDots}>
						{Array.from({length: dotCount}, (_, idx) => (
							<span key={idx} className={`${css.makdDot} ${idx === activeDot ? css.makdDotActive : ''}`} />
						))}
					</div>
				)}

				{featuredItems.length > 1 && (
					<>
						<div className={`${css.makdArrow} ${css.makdArrowLeft}`} onClick={handleFeaturedPrev}>
							<MaterialIcon name='chevronLeft' />
						</div>
						<div className={`${css.makdArrow} ${css.makdArrowRight}`} onClick={handleFeaturedNext}>
							<MaterialIcon name='chevronRight' />
						</div>
					</>
				)}
			</div>
		</div>
	);
});

export default MakdBanner;
