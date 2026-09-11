import {useState, useEffect, useRef, useCallback} from 'react';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {formatClockTime, shiftedNow} from '../../utils/clock';
import * as jellyfinApi from '../../services/jellyfinApi';
import ScreensaverGradient, {isGradientBackdrop} from './ScreensaverGradient';
import ScreensaverRunner from './ScreensaverRunner';
import {resolveLayout, startBounce} from './screensaverLayout';
import css from './Screensaver.module.less';

const BOUNCE_MARGIN = 20;
const BACKDROP_INTERVAL = 30000;
const BACKDROP_BATCH_SIZE = 60;
const RUNNER_BASE_SIZE = 96;

const SORT_FIELDS = ['DateCreated', 'CommunityRating'];
const SORT_ORDERS = ['Descending', 'Ascending'];
const START_OFFSETS = [0, 30, 60, 90];
const LIBRARY_TYPES = ['movies', 'tvshows'];
const ITEM_FIELDS = 'ImageTags,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,ParentLogoItemId,ParentLogoImageTag,OfficialRating,Genres';

const RATING_MAP = {0: 'G', 7: 'PG', 13: 'PG-13', 17: 'R', 18: 'NC-17'};

const COMPONENT_SIZE = {
	moonfinLogo: {width: 320, height: 140},
	clock: {width: 200, height: 56},
	runner: {width: 120, height: 120}
};

const pickOne = (values) => values[Math.floor(Math.random() * values.length)];

const shuffle = (items) => {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const held = items[i];
		items[i] = items[j];
		items[j] = held;
	}
	return items;
};

const includeItemTypesFor = (contentType) => {
	if (contentType === 'movies') return 'Movie';
	if (contentType === 'tv' || contentType === 'tvshows') return 'Series';
	return 'Movie,Series';
};

const viewMatchesContentType = (collectionType, contentType) => {
	if (!collectionType) return true;
	if (contentType === 'movies') return collectionType === 'movies';
	if (contentType === 'tv' || contentType === 'tvshows') return collectionType === 'tvshows';
	return LIBRARY_TYPES.indexOf(collectionType) !== -1;
};

const loadBackdropBatch = async ({contentType, libraryIds, collectionIds, excludedGenres, maxRating}) => {
	let parentIds = libraryIds.concat(collectionIds).filter(Boolean);
	if (parentIds.length === 0) {
		const views = await jellyfinApi.api.getAllLibraries();
		parentIds = (views?.Items || [])
			.filter(view => viewMatchesContentType(view.CollectionType, contentType))
			.map(view => view.Id)
			.filter(Boolean);
	}

	const query = {
		IncludeItemTypes: includeItemTypesFor(contentType),
		ExcludeItemTypes: 'BoxSet',
		Recursive: true,
		SortBy: pickOne(SORT_FIELDS),
		SortOrder: pickOne(SORT_ORDERS),
		Limit: BACKDROP_BATCH_SIZE,
		Fields: ITEM_FIELDS,
		EnableTotalRecordCount: false,
		EnableImageTypes: 'Backdrop,Logo'
	};
	if (maxRating != null && RATING_MAP[maxRating]) {
		query.MaxOfficialRating = RATING_MAP[maxRating];
	}

	const startIndex = pickOne(START_OFFSETS);

	const fetchFrom = async (parentId) => {
		const run = (start) => {
			const params = {...query, StartIndex: start};
			if (parentId) params.ParentId = parentId;
			return jellyfinApi.api.getItems(params).then(result => result?.Items || []);
		};
		const page = await run(startIndex);
		// A random offset can overshoot a small library and come back with nothing,
		// so the second pass starts from the top.
		if (page.length === 0 && startIndex > 0) return run(0);
		return page;
	};

	const batches = parentIds.length > 0
		? await Promise.all(parentIds.map(parentId => fetchFrom(parentId).catch(() => [])))
		: [await fetchFrom(null)];

	const excluded = excludedGenres.filter(Boolean);
	const items = shuffle([].concat.apply([], batches)).filter(item => {
		if (!getBackdropId(item)) return false;
		return !(item.Genres || []).some(genre => excluded.indexOf(genre) !== -1);
	});

	return items.slice(0, BACKDROP_BATCH_SIZE);
};

const Screensaver = ({
	visible,
	backdrop = 'library',
	component = 'moonfinLogo',
	movement = 'moderate',
	position = 'middle',
	size = 'medium',
	contentType = 'both',
	libraryIds,
	collectionIds,
	excludedGenres,
	dimmingLevel = 50,
	clockDisplay = '24-hour',
	timeOffsetHours = 0,
	maxRating = null,
	onDismiss,
	serverUrl
}) => {
	const showLibrary = backdrop === 'library';
	const showClock = component === 'clock';
	const {scale, speedMultiplier, bounces, box, boxStyle, anchorClass} = resolveLayout({
		component,
		movement,
		position,
		size,
		sizes: COMPONENT_SIZE
	});

	const [rendered, setRendered] = useState(false);
	const [showOverlay, setShowOverlay] = useState(false);
	const [clockText, setClockText] = useState(() => formatClockTime(shiftedNow(timeOffsetHours), clockDisplay));
	const boxRef = useRef(null);
	const boxAnimRef = useRef(null);
	const facingRef = useRef(false);

	const [currentItem, setCurrentItem] = useState(null);
	const [backdropVisible, setBackdropVisible] = useState(false);
	const [batchReady, setBatchReady] = useState(false);
	const backdropTimerRef = useRef(null);
	const backdropBatchRef = useRef([]);
	const backdropUsedRef = useRef(0);

	// Fresh arrays on every parent render would restart the slideshow, so the
	// query is keyed off the joined ids instead.
	const libraryKey = (libraryIds || []).join(',');
	const collectionKey = (collectionIds || []).join(',');
	const genreKey = (excludedGenres || []).join(',');

	useEffect(() => {
		if (visible) {
			setRendered(true);
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					setShowOverlay(true);
				});
			});
		} else {
			setShowOverlay(false);
			setCurrentItem(null);
			setBackdropVisible(false);
			setBatchReady(false);
			backdropBatchRef.current = [];
			backdropUsedRef.current = 0;
			const timer = setTimeout(() => setRendered(false), 1000);
			return () => clearTimeout(timer);
		}
	}, [visible]);

	useEffect(() => {
		if (!visible || !showClock) return;
		const interval = setInterval(() => {
			setClockText(formatClockTime(shiftedNow(timeOffsetHours), clockDisplay));
		}, 1000);
		return () => clearInterval(interval);
	}, [visible, showClock, clockDisplay, timeOffsetHours]);

	useEffect(() => {
		if (!visible || !showLibrary || !serverUrl) return;
		let cancelled = false;

		const options = {
			contentType,
			libraryIds: libraryKey ? libraryKey.split(',') : [],
			collectionIds: collectionKey ? collectionKey.split(',') : [],
			excludedGenres: genreKey ? genreKey.split(',') : [],
			maxRating
		};

		const fetchItems = async () => {
			try {
				const items = await loadBackdropBatch(options);
				if (cancelled || items.length === 0) return;
				backdropBatchRef.current = items;
				backdropUsedRef.current = 0;
				setCurrentItem(items[0]);
				setBatchReady(true);
				setTimeout(() => {
					if (!cancelled) setBackdropVisible(true);
				}, 500);
			} catch (err) {
				console.error('[Screensaver] Failed to fetch backdrop items:', err);
			}
		};

		const initialTimer = setTimeout(fetchItems, 2000);
		return () => {
			cancelled = true;
			clearTimeout(initialTimer);
		};
	}, [visible, showLibrary, serverUrl, contentType, libraryKey, collectionKey, genreKey, maxRating]);

	useEffect(() => {
		if (!visible || !showLibrary || !serverUrl || !batchReady) return;

		const options = {
			contentType,
			libraryIds: libraryKey ? libraryKey.split(',') : [],
			collectionIds: collectionKey ? collectionKey.split(',') : [],
			excludedGenres: genreKey ? genreKey.split(',') : [],
			maxRating
		};

		const cycle = async () => {
			backdropUsedRef.current += 1;

			if (backdropUsedRef.current >= backdropBatchRef.current.length) {
				backdropUsedRef.current = 0;
				try {
					const items = await loadBackdropBatch(options);
					if (items.length > 0) backdropBatchRef.current = items;
				} catch (err) {
					console.error('[Screensaver] Failed to refresh backdrop items:', err);
				}
			}

			const nextItem = backdropBatchRef.current[backdropUsedRef.current];
			if (nextItem) {
				setBackdropVisible(false);
				setTimeout(() => {
					setCurrentItem(nextItem);
					setTimeout(() => setBackdropVisible(true), 100);
				}, 1000);
			}
		};

		backdropTimerRef.current = setInterval(cycle, BACKDROP_INTERVAL);
		return () => {
			if (backdropTimerRef.current) {
				clearInterval(backdropTimerRef.current);
			}
		};
	}, [visible, showLibrary, serverUrl, batchReady, contentType, libraryKey, collectionKey, genreKey, maxRating]);

	useEffect(() => {
		if (!visible || !bounces || !box || !boxRef.current) return;
		return startBounce({
			boxRef,
			animRef: boxAnimRef,
			facingRef,
			bounds: {width: window.innerWidth, height: window.innerHeight},
			width: box.width * scale,
			height: box.height * scale,
			speedMultiplier,
			margin: BOUNCE_MARGIN
		});
	}, [visible, bounces, box, scale, speedMultiplier, rendered]);

	const handleInteraction = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		if (onDismiss) onDismiss();
	}, [onDismiss]);

	if (!rendered) return null;

	const dimmingAlpha = Math.max(0, Math.min(100, dimmingLevel)) / 100;
	const clockAlpha = 1 - (dimmingAlpha * 0.7);

	const backdropId = currentItem ? getBackdropId(currentItem) : null;
	const backdropUrl = backdropId ? getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 80}) : null;
	const itemLogoUrl = currentItem ? getLogoUrl(serverUrl, currentItem, {maxWidth: 400, quality: 90}) : null;

	const renderComponent = () => {
		if (component === 'moonfinLogo') {
			return <img src="resources/banner-dark.png" alt="Moonfin" className={css.componentLogo} />;
		}
		if (component === 'clock') {
			return (
				<div className={css.componentClock} style={{fontSize: Math.round(32 * scale) + 'px', opacity: clockAlpha}}>
					{clockText}
				</div>
			);
		}
		if (component === 'runner') {
			return (
				<ScreensaverRunner
					size={Math.round(RUNNER_BASE_SIZE * scale)}
					speedMultiplier={bounces ? speedMultiplier : 1}
					facingRef={facingRef}
				/>
			);
		}
		return null;
	};

	return (
		<div
			className={css.overlay + ' ' + (showOverlay ? css.overlayVisible : '')}
			onClick={handleInteraction}
			onKeyDown={handleInteraction}
		>
			{showLibrary && (
				<div className={css.backdropContainer}>
					{backdropUrl && (
						<div
							className={css.backdropImage + ' ' + (backdropVisible ? css.backdropImageVisible : '')}
							style={{backgroundImage: 'url(' + backdropUrl + ')'}}
						/>
					)}
					<div className={css.backdropVignette} />
					{currentItem && backdropVisible && itemLogoUrl && (
						<div className={css.backdropInfo}>
							<img
								src={itemLogoUrl}
								alt={currentItem.Name || ''}
								className={css.backdropLogo}
							/>
						</div>
					)}
				</div>
			)}

			{isGradientBackdrop(backdrop) && <ScreensaverGradient backdrop={backdrop} />}

			{showLibrary && !backdropUrl && (
				<div className={css.logoContainerCentered}>
					<img
						src="resources/banner-dark.png"
						alt="Moonfin"
						className={css.logo}
					/>
				</div>
			)}

			{dimmingLevel > 0 && (
				<div
					className={css.dimmingLayer}
					style={{opacity: dimmingAlpha}}
				/>
			)}

			{box && (
				<div className={bounces ? css.bounceLayer : css.staticLayer}>
					<div
						ref={bounces ? boxRef : null}
						className={css.componentBox + (bounces ? '' : ' ' + css[anchorClass])}
						style={boxStyle}
					>
						{renderComponent()}
					</div>
				</div>
			)}
		</div>
	);
};

export default Screensaver;
