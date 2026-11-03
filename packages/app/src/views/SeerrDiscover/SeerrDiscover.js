import {useState, useEffect, useCallback, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useSeerr} from '../../context/SeerrContext';
import {pointerHover} from '../../utils/focusScroll';
import {useSettings} from '../../context/SettingsContext';
import {useAuth} from '../../context/AuthContext';
import {ModernMediaRow} from '../../components/MediaRow';
import {modernRowSpacing} from '../../components/MediaCard/modernCardLayout';
import seerrApi from '../../services/seerrApi';
import {seerrGenreBackdrop} from '../../utils/seerrGenreArt';
import LoadingSpinner from '../../components/LoadingSpinner';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle} from '../../components/seerr/SeerrStatusBanner';
import {KEYS} from '../../utils/keys';
import hydrateRequestMediaItems from '../../utils/seerrHydration';
import {STREAMING_NETWORKS, MOVIE_STUDIOS, pickShortcutBackdrops, normalizeMediaItem, normalizeRequestItem, seerrBrowseTitle, seerrShortcuts} from '../../utils/seerrHomeRows';
import {libraryIdOf} from '../../utils/seerrTarget';
import {isSupportedSlider, loadDiscoverSliders, loadSliderPage} from '../../utils/seerrSliders';
import {isScrolledAway} from '../../utils/quickReturn';
import {focusedCardIndex, cardToRestore} from '../../utils/rowFocusMemory';

import css from './SeerrDiscover.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-first'
}, 'div');

const ITEMS_PER_PAGE = 9;

let _rowConfigs;
const buildRowConfigs = () => [
	{id: 'shortcuts', title: seerrBrowseTitle(), type: 'shortcut'},
	{id: 'myRequests', title: $L('Recent Requests'), type: 'request'},
	{id: 'trending', title: $L('Trending Now'), type: 'media', fetchFn: 'trending'},
	{id: 'popularMovies', title: $L('Popular Movies'), type: 'media', fetchFn: 'trendingMovies'},
	{id: 'popularTv', title: $L('Popular TV Shows'), type: 'media', fetchFn: 'trendingTv'},
	{id: 'genreMovies', title: $L('Browse Movies by Genre'), type: 'genre', mediaType: 'movie'},
	{id: 'genreTv', title: $L('Browse TV by Genre'), type: 'genre', mediaType: 'tv'},
	{id: 'studios', title: $L('Browse by Studio'), type: 'studio'},
	{id: 'networks', title: $L('Browse by Network'), type: 'network'},
	{id: 'upcomingMovies', title: $L('Upcoming Movies'), type: 'media', fetchFn: 'upcomingMovies'},
	{id: 'upcomingTv', title: $L('Upcoming TV Shows'), type: 'media', fetchFn: 'upcomingTv'}
];

const getRowConfigs = () => {
	_rowConfigs ??= buildRowConfigs();
	// The one title that follows the server, which can change while this module stays loaded.
	_rowConfigs[0].title = seerrBrowseTitle();
	return _rowConfigs;
};

// Discover stays off this copy of the row, since this screen is the
// destination it would point at.
const getShortcuts = (trendingResults = []) => {
	const shortcuts = seerrShortcuts().filter((shortcut) => shortcut.key !== 'discover');
	const shuffled = trendingResults.slice().sort(() => Math.random() - 0.5);
	const backdrops = pickShortcutBackdrops(shortcuts, shuffled);
	return shortcuts.map((shortcut) => ({
		key: shortcut.key,
		name: shortcut.name(),
		backdrop: backdrops[shortcut.key]
	}));
};

let lastFocusedRowIndex = null;
let lastFocusedCardIndex = -1;

// Where a request stands, as its card words it. Request status wins only for declined
// and failed.
const requestStatusInfo = (request) => {
	const requestStatus = request.status;
	const mediaStatus = request.media?.status;
	if (requestStatus === 1) return {text: $L('Pending'), cls: css.requestStatusPending};
	if (requestStatus === 3) return {text: $L('Declined'), cls: css.requestStatusDeclined};
	if (requestStatus === 4) return {text: $L('Failed'), cls: css.requestStatusDeclined};
	if (requestStatus === 5) return {text: $L('Available'), cls: css.requestStatusAvailable};
	if (mediaStatus === 5) return {text: $L('Available'), cls: css.requestStatusAvailable};
	if (mediaStatus === 4) return {text: $L('Partial'), cls: css.requestStatusAvailable};
	if (mediaStatus === 3) return {text: $L('Requested'), cls: css.requestStatusDownloading};
	if (requestStatus === 2) return {text: $L('Approved'), cls: css.requestStatusApproved};
	return {text: $L('Unknown'), cls: css.requestStatusPending};
};

// The rows the Modern style draws with Home's row and cards. Shortcuts, genres, studios
// and networks stay tiles in both styles.
const isModernRowType = (type) => type === 'media' || type === 'request';

// Home's cards read normalized items, so the raw Seerr results go through the same
// normalizers the Home rows use.
const toModernItems = (config, rawItems) => {
	if (config.type === 'request') {
		return rawItems.filter((request) => request?.media?.tmdbId).map((request) => ({
			...normalizeRequestItem(request),
			// One title can carry more than one request, and each keeps a card of its own.
			Id: `seerr-request-${request.id}`,
			Subtitle: requestStatusInfo(request).text
		}));
	}
	return rawItems.map(normalizeMediaItem);
};

// Memoized card components for performance
const MediaCard = memo(function MediaCard({item, mediaType, onSelect, onFocus}) {
	const {settings} = useSettings();
	const badgeStyle = seerrBadgeStyle(settings);
	const posterUrl = seerrApi.getImageUrl(item.poster_path || item.posterPath, 'w342');
	const title = item.title || item.name;
	const status = item.mediaInfo?.status;
	const banner = badgeStyle === 'banner' && hasSeerrDot(status);
	const itemMediaType = item.media_type || item.mediaType || mediaType;

	const handleClick = useCallback(() => {
		onSelect?.(item, mediaType);
	}, [item, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.(item);
	}, [item, onFocus]);

	return (
		<SpottableDiv className={css.mediaCard} onClick={handleClick} onFocus={handleFocus}>
			<div className={`${css.posterContainer}${banner ? ' ' + css.underSeerrBanner : ''}`}>
				{posterUrl ? (
					<img className={css.poster} src={posterUrl} alt={title} loading="lazy" />
				) : (
					<div className={css.noPoster}>{title?.[0]}</div>
				)}
				{banner && <SeerrStatusBanner status={status} />}
				{itemMediaType && (
					<div className={`${css.mediaTypeBadge} ${itemMediaType === 'movie' ? css.movieBadge : css.seriesBadge}`}>
						{itemMediaType === 'movie' ? $L('Movie') : $L('Series')}
					</div>
				)}
				{badgeStyle === 'badge' && [2, 3, 4, 5].includes(status) && (
					<div className={`${css.availabilityBadge} ${css[`availability${status}`]}`} />
				)}
			</div>
		</SpottableDiv>
	);
});

const ShortcutCard = memo(function ShortcutCard({shortcut, onSelect}) {
	const backdropUrl = shortcut.backdrop ? seerrApi.getImageUrl(shortcut.backdrop, 'w780') : '';

	const handleClick = useCallback(() => {
		onSelect?.(shortcut.key);
	}, [shortcut.key, onSelect]);

	return (
		<SpottableDiv className={css.genreCard} onClick={handleClick}>
			{backdropUrl && <img className={css.genreBackdrop} src={backdropUrl} alt={shortcut.name} loading="lazy" />}
			<div className={css.genreOverlay}>
				<span className={css.genreTitle}>{shortcut.name}</span>
			</div>
		</SpottableDiv>
	);
});

const GenreCard = memo(function GenreCard({genre, mediaType, onSelect, onFocus}) {
	const art = seerrGenreBackdrop(genre.id, genre.backdrops);
	const backdropUrl = art ? seerrApi.getImageUrl(art.path, art.size) : '';

	const handleClick = useCallback(() => {
		onSelect?.(genre.id, genre.name, mediaType);
	}, [genre.id, genre.name, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.({backdrops: genre.backdrops});
	}, [genre.backdrops, onFocus]);

	return (
		<SpottableDiv className={css.genreCard} onClick={handleClick} onFocus={handleFocus}>
			{backdropUrl && <img className={css.genreBackdrop} src={backdropUrl} alt={genre.name} loading="lazy" />}
			<div className={css.genreOverlayFlat}>
				<span className={css.genreTitleSeerr}>{genre.name}</span>
			</div>
		</SpottableDiv>
	);
});

const NetworkCard = memo(function NetworkCard({network, onSelect}) {
	const logoUrl = seerrApi.getImageUrl('/' + network.logo, 'w185');

	const handleClick = useCallback(() => {
		onSelect?.(network.id, network.name);
	}, [network.id, network.name, onSelect]);

	return (
		<SpottableDiv className={css.networkCard} onClick={handleClick}>
			<div className={css.networkLogoContainer}>
				<img className={css.networkLogo} src={logoUrl} alt={network.name} loading="lazy" />
			</div>
		</SpottableDiv>
	);
});

const StudioCard = memo(function StudioCard({studio, onSelect}) {
	const logoUrl = seerrApi.getImageUrl('/' + studio.logo, 'w185');

	const handleClick = useCallback(() => {
		onSelect?.(studio.id, studio.name);
	}, [studio.id, studio.name, onSelect]);

	return (
		<SpottableDiv className={css.networkCard} onClick={handleClick}>
			<div className={css.networkLogoContainer}>
				<img className={css.networkLogo} src={logoUrl} alt={studio.name} loading="lazy" />
			</div>
		</SpottableDiv>
	);
});

// Request card component - shows user's requests with status
const RequestCard = memo(function RequestCard({request, onSelect, onFocus}) {
	const media = request.media;
	const posterUrl = media?.posterPath ? seerrApi.getImageUrl(media.posterPath, 'w342') : null;
	const title = media?.title || media?.name || 'Unknown';
	const requestStatus = request.status;
	const mediaType = request.type;

	// A pending request shows the dot rather than a label.
	const {text: statusText, cls: statusClass} = requestStatus !== 1 ? requestStatusInfo(request) : {};

	const handleClick = useCallback(() => {
		const item = {
			id: media?.tmdbId,
			tmdbId: media?.tmdbId,
			title: media?.title,
			name: media?.name,
			poster_path: media?.posterPath,
			backdrop_path: media?.backdropPath,
			overview: media?.overview,
			media_type: mediaType,
			mediaType: mediaType,
			_seerrLibraryId: libraryIdOf(media)
		};
		onSelect?.(item, mediaType);
	}, [media, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.({
			backdrop_path: media?.backdropPath,
			title: media?.title || media?.name,
			overview: media?.overview
		});
	}, [media, onFocus]);

	return (
		<SpottableDiv className={css.requestCard} onClick={handleClick} onFocus={handleFocus}>
			<div className={css.requestPosterContainer}>
				{posterUrl ? (
					<img className={css.requestPoster} src={posterUrl} alt={title} loading="lazy" />
				) : (
					<div className={css.noPoster}>{title?.[0]}</div>
				)}
				{mediaType && (
					<div className={`${css.mediaTypeBadge} ${mediaType === 'movie' ? css.movieBadge : css.seriesBadge}`}>
						{mediaType === 'movie' ? $L('Movie') : $L('Series')}
					</div>
				)}
				{requestStatus === 1 ? (
					<div className={`${css.availabilityBadge} ${css.availability2}`} />
				) : (
					<div className={`${css.requestStatusBadge} ${statusClass}`}>
						{statusText}
					</div>
				)}
			</div>
		</SpottableDiv>
	);
});

// Memoized row component
const DiscoverRow = memo(function DiscoverRow({
	config,
	items,
	rowIndex,
	isLoading,
	onSelectItem,
	onSelectGenre,
	onSelectNetwork,
	onSelectStudio,
	onOpenShortcut,
	onFocusItem,
	onNavigateUp,
	onNavigateDown,
	onLoadMore,
	onRowFocus
}) {
	const scrollerRef = useRef(null);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp?.(rowIndex);
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown?.(rowIndex);
		} else if (e.keyCode === KEYS.LEFT) {
			const firstSpottable = e.currentTarget.querySelector('.spottable');
			if (firstSpottable && firstSpottable.contains(document.activeElement)) {
				e.preventDefault();
				e.stopPropagation();
				Spotlight.focus('navbar');
			}
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	const handleFocus = useCallback((e) => {
		onRowFocus?.(rowIndex);

		const card = e.target.closest(`.${css.mediaCard}, .${css.genreCard}, .${css.networkCard}, .${css.requestCard}`);
		const scroller = scrollerRef.current;
		const hover = pointerHover();
		if (card && scroller) {
			if (!hover) {
				const cardRect = card.getBoundingClientRect();
				const scrollerRect = scroller.getBoundingClientRect();

				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			}

			const cards = scroller.querySelectorAll(`.${css.mediaCard}, .${css.genreCard}, .${css.networkCard}, .${css.requestCard}`);
			const cardIndex = Array.from(cards).indexOf(card);
			if (cardIndex >= cards.length - 3) {
				onLoadMore?.(config.id);
			}
		}

		const row = hover ? null : e.target.closest(`.${css.contentRow}`);
		if (row) {
			row.scrollIntoView({behavior: 'smooth', block: 'center'});
		}
	}, [config.id, onLoadMore, rowIndex, onRowFocus]);

	const renderCards = useMemo(() => {
		switch (config.type) {
			case 'shortcut':
				return items.map(item => (
					<ShortcutCard key={item.key} shortcut={item} onSelect={onOpenShortcut} />
				));
			case 'request':
				return items.map(item => (
					<RequestCard
						key={item.id}
						request={item}
						onSelect={onSelectItem}
						onFocus={onFocusItem}
					/>
				));
			case 'genre':
				return items.map(item => (
					<GenreCard
						key={item.id}
						genre={item}
						mediaType={config.mediaType}
						onSelect={onSelectGenre}
						onFocus={onFocusItem}
					/>
				));
			case 'network':
				return items.map(item => (
					<NetworkCard key={item.id} network={item} onSelect={onSelectNetwork} />
				));
			case 'studio':
				return items.map(item => (
					<StudioCard key={item.id} studio={item} onSelect={onSelectStudio} />
				));
			default:
				return items.map(item => (
					<MediaCard
						key={item.id}
						item={item}
						mediaType={config.mediaType}
						onSelect={onSelectItem}
						onFocus={onFocusItem}
					/>
				));
		}
	}, [config.type, config.mediaType, items, onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio, onOpenShortcut, onFocusItem]);

	return (
		<div className={css.contentRow} data-row-index={rowIndex}>
			<h2 className={css.rowTitle}>{config.title}</h2>
			<div className={css.rowScroller} ref={scrollerRef}>
				<RowContainer
					className={css.rowItems}
					spotlightId={`discover-row-${rowIndex}`}
					onKeyDown={handleKeyDown}
					onFocus={handleFocus}
				>
					{renderCards}
					{isLoading && (
						<div className={css.rowLoadingIndicator}>
							<span>{$L('Loading...')}</span>
						</div>
					)}
				</RowContainer>
			</div>
		</div>
	);
});

// Badge count survives panel switches for a short while so revisiting
// discover doesn't refetch the counts every time.
let cachedBadge = {count: 0, at: 0};
const BADGE_TTL_MS = 60000;

const SeerrDiscover = ({onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio, onOpenRequests, onOpenShortcut, backHandlerRef}) => {
	const {isAuthenticated, isEnabled, user: contextUser} = useSeerr();
	const {settings} = useSettings();
	const {serverUrl} = useAuth();
	// Discover follows the Home rows style. Modern cards carry their own details, so the
	// info header goes with it, the way Home drops its top info area.
	const useModernRows = settings.homeRowsStyle !== 'v1';
	const rowSpacing = modernRowSpacing(settings);
	const [rows, setRows] = useState({});
	const [rowPages, setRowPages] = useState({});
	const [rowHasMore, setRowHasMore] = useState({});
	const [rowLoading, setRowLoading] = useState({});
	// The custom sliders a Seerr admin set up, drawn after this screen's own rows in Seerr's order.
	const [sliderConfigs, setSliderConfigs] = useState([]);
	const rowConfigs = useMemo(() => [...getRowConfigs(), ...sliderConfigs], [sliderConfigs]);
	const [isLoading, setIsLoading] = useState(true);
	const [backdropUrl, setBackdropUrl] = useState('');
	const [focusedItem, setFocusedItem] = useState(null);
	const [requestsBadge, setRequestsBadge] = useState(cachedBadge.count);
	const backdropTimeoutRef = useRef(null);
	const rowsContainerRef = useRef(null);

	// Back on a scrolled discover list returns it to the first row before it leaves
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			const container = rowsContainerRef.current;
			if (!isScrolledAway(container)) return false;
			container.scrollTop = 0;
			Spotlight.focus('discover-row-0');
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef]);

	useEffect(() => {
		if (!isAuthenticated) return;
		if (Date.now() - cachedBadge.at < BADGE_TTL_MS) {
			setRequestsBadge(cachedBadge.count);
			return;
		}
		let stale = false;
		seerrApi.getUser().catch(() => null).then(async (u) => {
			if (stale) return;
			const perms = u?.permissions;
			let count = 0;
			if (seerrApi.canManageRequests(perms)) {
				count += await seerrApi.getRequestCount().then(c => c?.pending || 0).catch(() => 0);
			}
			if (seerrApi.canManageIssues(perms)) {
				count += await seerrApi.getIssueCount().then(c => c?.open || 0).catch(() => 0);
			}
			if (!stale) {
				cachedBadge = {count, at: Date.now()};
				setRequestsBadge(count);
			}
		});
		return () => {
			stale = true;
		};
	}, [isAuthenticated]);

	useEffect(() => {
		return () => {
			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const loadInitialData = async () => {
			if (!isAuthenticated) return;
			setIsLoading(true);
			try {
				// Prefer context user (Moonfin) or fall back to API user
				const apiUser = await seerrApi.getUser().catch(() => null);
				const currentUser = contextUser?.seerrUserId
					? {id: contextUser.seerrUserId, ...apiUser}
					: apiUser;

				const [
					myRequestsData,
					trendingData,
					moviesData,
					tvData,
					genreMovies,
					genreTv,
					upcomingMoviesData,
					upcomingTvData
				] = await Promise.all([
					currentUser?.id ? seerrApi.getMyRequests(currentUser.id, 50).catch((e) => { console.error('[SeerrDiscover] myRequests error:', e); return {results: []}; }) : {results: []},
					seerrApi.trending().catch(() => ({results: []})),
					seerrApi.trendingMovies(1).catch(() => ({results: []})),
					seerrApi.trendingTv(1).catch(() => ({results: []})),
					seerrApi.getGenreSliderMovies().catch(() => []),
					seerrApi.getGenreSliderTv().catch(() => []),
					seerrApi.upcomingMovies(1).catch(() => ({results: []})),
					seerrApi.upcomingTv(1).catch(() => ({results: []}))
				]);

				const hydratedMyRequests = await hydrateRequestMediaItems(myRequestsData.results || []);

				setRows({
					shortcuts: getShortcuts(trendingData.results || []),
					myRequests: hydratedMyRequests,
					trending: (trendingData.results || []).slice(0, ITEMS_PER_PAGE),
					popularMovies: (moviesData.results || []).slice(0, ITEMS_PER_PAGE),
					popularTv: (tvData.results || []).slice(0, ITEMS_PER_PAGE),
					genreMovies: genreMovies || [],
					genreTv: genreTv || [],
					studios: MOVIE_STUDIOS,
					networks: STREAMING_NETWORKS,
					upcomingMovies: (upcomingMoviesData.results || []).slice(0, ITEMS_PER_PAGE),
					upcomingTv: (upcomingTvData.results || []).slice(0, ITEMS_PER_PAGE)
				});

				// Track pagination state
				setRowPages({
					trending: 1,
					popularMovies: 1,
					popularTv: 1,
					upcomingMovies: 1,
					upcomingTv: 1
				});

				// Track if more items available (API returns 20 per page, so if we got 20, there's likely more)
				setRowHasMore({
					trending: (trendingData.results || []).length >= 20,
					popularMovies: (moviesData.results || []).length >= 20,
					popularTv: (tvData.results || []).length >= 20,
					upcomingMovies: (upcomingMoviesData.results || []).length >= 20,
					upcomingTv: (upcomingTvData.results || []).length >= 20
				});
			} catch (err) {
				console.error('Failed to load Seerr data:', err);
			} finally {
				setIsLoading(false);
			}
		};

		if (isAuthenticated) {
			loadInitialData();
		} else {
			setIsLoading(false);
		}
	}, [isAuthenticated, contextUser]);

	// The sliders wait for this screen's own rows, since those replace every row when they land. A
	// missing or failing endpoint just leaves them out, and their rows load two at a time.
	useEffect(() => {
		if (!isAuthenticated || isLoading) return undefined;
		let cancelled = false;
		(async () => {
			let sliders;
			try {
				sliders = (await loadDiscoverSliders({force: true})).filter(isSupportedSlider);
			} catch {
				return;
			}
			if (cancelled || !sliders.length) return;
			setSliderConfigs(sliders.map((slider) => ({id: `slider-${slider.id}`, title: slider.title, type: 'media', fetchFn: 'slider', slider})));
			for (let i = 0; i < sliders.length; i += 2) {
				const batch = sliders.slice(i, i + 2);
				const pages = await Promise.all(batch.map((slider) => loadSliderPage(slider, 1).catch(() => null)));
				if (cancelled) return;
				batch.forEach((slider, index) => {
					const page = pages[index];
					if (!page) return;
					const id = `slider-${slider.id}`;
					setRows((prev) => ({...prev, [id]: page.results.slice(0, ITEMS_PER_PAGE)}));
					setRowPages((prev) => ({...prev, [id]: 1}));
					setRowHasMore((prev) => ({...prev, [id]: page.totalPages > 1}));
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isAuthenticated, isLoading]);

	// Load more items for a specific row
	const loadMoreForRow = useCallback(async (rowId) => {
		if (rowLoading[rowId] || !rowHasMore[rowId]) return;

		const config = rowConfigs.find(r => r.id === rowId);
		if (!config || !config.fetchFn) return;

		setRowLoading(prev => ({...prev, [rowId]: true}));

		try {
			const currentPage = rowPages[rowId] || 1;
			const nextPage = currentPage + 1;

			let data;
			switch (config.fetchFn) {
				case 'trending':
					data = await seerrApi.trending(nextPage);
					break;
				case 'trendingMovies':
					data = await seerrApi.trendingMovies(nextPage);
					break;
				case 'trendingTv':
					data = await seerrApi.trendingTv(nextPage);
					break;
				case 'upcomingMovies':
					data = await seerrApi.upcomingMovies(nextPage);
					break;
				case 'upcomingTv':
					data = await seerrApi.upcomingTv(nextPage);
					break;
				case 'slider':
					data = await loadSliderPage(config.slider, nextPage);
					break;
				default:
					return;
			}

			const newItems = data.results || [];
			if (newItems.length > 0) {
				setRows(prev => {
					const existingIds = new Set(prev[rowId].map(item => item.id));
					const uniqueNew = newItems.filter(item => !existingIds.has(item.id));
					return {...prev, [rowId]: [...prev[rowId], ...uniqueNew.slice(0, ITEMS_PER_PAGE)]};
				});
				setRowPages(prev => ({...prev, [rowId]: nextPage}));
				setRowHasMore(prev => ({...prev, [rowId]: config.slider ? nextPage < data.totalPages : newItems.length >= 20}));
			} else {
				setRowHasMore(prev => ({...prev, [rowId]: false}));
			}
		} catch (err) {
			console.error(`Failed to load more for ${rowId}:`, err);
		} finally {
			setRowLoading(prev => ({...prev, [rowId]: false}));
		}
	}, [rowConfigs, rowLoading, rowHasMore, rowPages]);

	// The Modern rows only look at their items when deciding to redraw, so they're handed
	// a callback that always reaches the current paging state.
	const loadMoreRef = useRef(loadMoreForRow);
	loadMoreRef.current = loadMoreForRow;
	const handleLoadMore = useCallback((rowId) => loadMoreRef.current(rowId), []);

	const handleItemFocus = useCallback((item) => {
		setFocusedItem(item);
		if (backdropTimeoutRef.current) {
			clearTimeout(backdropTimeoutRef.current);
		}
		backdropTimeoutRef.current = setTimeout(() => {
			// A Modern card hands over the normalized item, which carries its backdrop
			// ready made. The page keeps the plain backdrop, never the titled thumb.
			if (item?._externalBackdropUrl) {
				setBackdropUrl(item._externalBackdropUrl);
			} else if (item?.backdrop_path || item?.backdropPath) {
				const path = item.backdrop_path || item.backdropPath;
				setBackdropUrl(seerrApi.getImageUrl(path, 'w1280'));
			} else if (item?.backdrops?.length > 0) {
				setBackdropUrl(seerrApi.getImageUrl(item.backdrops[0], 'w1280'));
			}
		}, 150);
	}, []);

	const handleSelectItem = useCallback((item, mediaType) => {
		const type = mediaType || item.media_type || item.mediaType || (item.title ? 'movie' : 'tv');
		lastFocusedCardIndex = focusedCardIndex(`discover-row-${lastFocusedRowIndex}`, document.activeElement);
		onSelectItem?.({
			mediaId: item.id,
			mediaType: type,
			libraryId: item._seerrLibraryId || libraryIdOf(item.mediaInfo)
		});
	}, [onSelectItem]);

	// A Modern card picks the same Seerr title the classic card builds from the raw result.
	const handleSelectModernItem = useCallback((item) => {
		const raw = item._seerrRaw || {};
		handleSelectItem({id: raw.mediaId, _seerrLibraryId: item._seerrLibraryId}, raw.mediaType);
	}, [handleSelectItem]);

	const rowItems = useMemo(() => {
		const items = {};
		rowConfigs.forEach((config) => {
			const raw = rows[config.id];
			items[config.id] = raw && useModernRows && isModernRowType(config.type) ? toModernItems(config, raw) : raw;
		});
		return items;
	}, [rowConfigs, rows, useModernRows]);

	const visibleRows = useMemo(() => {
		return rowConfigs.filter(r => rowItems[r.id]?.length > 0);
	}, [rowConfigs, rowItems]);
	const visibleCountRef = useRef(0);
	visibleCountRef.current = visibleRows.length;

	const handleRequestsPillKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP || e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('discover-row-0');
		}
	}, []);

	// Brings a row into view. A Modern row rests with its top pinned to the top of the list,
	// the way Home rests its rows, since the focused card's details grow below it. It's
	// pinned again over the next frames because the row focus just left shrinks back after
	// this runs. Discover's own rows keep the smooth scroll they always had.
	const scrollRowIntoView = useCallback((index, options) => {
		const container = rowsContainerRef.current;
		const row = container?.querySelector(`[data-row-index="${index}"]`);
		if (!row) return;
		if (row.classList.contains(css.contentRow)) {
			row.scrollIntoView(options);
			return;
		}
		const pin = () => {
			const offset = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
			if (Math.abs(offset) > 1) container.scrollTop += offset;
		};
		pin();
		window.requestAnimationFrame(pin);
		window.requestAnimationFrame(() => window.requestAnimationFrame(pin));
	}, []);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			// The requests pill sits between the rows and the navbar.
			if (Spotlight.focus('discover-requests-pill')) {
				return;
			}
			Spotlight.focus('navbar');
			return;
		}
		const targetIndex = fromRowIndex - 1;
		Spotlight.focus(`discover-row-${targetIndex}`);
		scrollRowIntoView(targetIndex, {behavior: 'smooth', block: 'start'});
	}, [scrollRowIntoView]);

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= visibleCountRef.current) return;
		Spotlight.focus(`discover-row-${targetIndex}`);
		scrollRowIntoView(targetIndex, {behavior: 'smooth', block: 'center'});
	}, [scrollRowIntoView]);

	const handleRowFocus = useCallback((rowIndex) => {
		if (typeof rowIndex === 'number') {
			// A card index only means anything in the row it came from.
			if (rowIndex !== lastFocusedRowIndex) lastFocusedCardIndex = -1;
			lastFocusedRowIndex = rowIndex;
		}
	}, []);

	// The classic rows bring themselves into view as focus moves through them, and a
	// Modern row leaves that to the screen, so it's done here instead.
	const handleModernRowFocus = useCallback((rowIndex) => {
		handleRowFocus(rowIndex);
		if (!pointerHover()) scrollRowIntoView(rowIndex);
	}, [handleRowFocus, scrollRowIntoView]);

	useEffect(() => {
		if (!isLoading && visibleRows.length > 0) {
			setTimeout(() => {
				if (lastFocusedRowIndex !== null && lastFocusedRowIndex < visibleRows.length) {
					const rowId = `discover-row-${lastFocusedRowIndex}`;
					const card = cardToRestore(rowId, lastFocusedCardIndex);
					if (!card || !Spotlight.focus(card)) {
						Spotlight.focus(rowId);
					}
					scrollRowIntoView(lastFocusedRowIndex, {block: 'center'});
				} else {
					Spotlight.focus('discover-row-0');
				}
			}, 100);
		}
	}, [isLoading, visibleRows.length, scrollRowIntoView]);

	if (!isEnabled) {
		return (
			<div className={css.container}>
				<div className={css.notConfigured}>
					<p>{$L('Seerr is not enabled.')}</p>
					<p>{$L('Go to Settings to configure Seerr.')}</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<div className={css.container}>
				<div className={css.notConfigured}>
					<p>{$L('Seerr is not authenticated.')}</p>
					<p>{$L('Go to Settings to log in to Seerr.')}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.container}>
			{settings.showHomeBackdrop !== false && (
				<div className={css.backdrop}>
					{backdropUrl && (
						<div
							className={css.backdropImage}
							style={{
								backgroundImage: `url(${backdropUrl})`,
								filter: settings.backdropBlurHome > 0 ? `blur(${settings.backdropBlurHome}px)` : 'none'
							}}
						/>
					)}
					<div className={css.backdropOverlay} />
				</div>
			)}
			{!isLoading && isAuthenticated && onOpenRequests && (
				<SpottableDiv
					className={`${css.requestsPill} ${settings.navbarPosition === 'left' ? '' : css.requestsPillBelowNav}`}
					spotlightId="discover-requests-pill"
					onClick={onOpenRequests}
					onKeyDown={handleRequestsPillKeyDown}
				>
					{$L('Requests')}
					{requestsBadge > 0 && <span className={css.requestsPillBadge}>{requestsBadge}</span>}
				</SpottableDiv>
			)}
			{isLoading ? (
				<LoadingSpinner />
			) : (
				<div className={`${css.mainContent} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`}>
					{/* The info header for the focused item, Classic only */}
					{!useModernRows && (
						<div className={css.detailSection}>
							{focusedItem && (focusedItem.title || focusedItem.name) ? (
								<>
									<h2 className={css.detailTitle}>{focusedItem.title || focusedItem.name}</h2>
									<div className={css.detailMeta}>
										{focusedItem.vote_average > 0 && (
											<span className={css.detailRating}>★ {focusedItem.vote_average?.toFixed(1)}</span>
										)}
										{(focusedItem.release_date || focusedItem.first_air_date) && (
											<span className={css.detailYear}>
												{(focusedItem.release_date || focusedItem.first_air_date)?.substring(0, 4)}
											</span>
										)}
									</div>
									{focusedItem.overview && (
										<p className={css.detailOverview}>{focusedItem.overview}</p>
									)}
								</>
							) : (
								<h2 className={css.detailTitle}>{$L('Discover')}</h2>
							)}
						</div>
					)}
					<div className={`${css.rowsContainer} ${useModernRows ? css.modernRows : ''}`} ref={rowsContainerRef}>
						{visibleRows.map((config, index) => (useModernRows && isModernRowType(config.type) ? (
							<ModernMediaRow
								key={config.id}
								rowId={config.id}
								title={config.title}
								items={rowItems[config.id]}
								serverUrl={serverUrl}
								rowIndex={index}
								spotlightId={`discover-row-${index}`}
								onSelectItem={handleSelectModernItem}
								onFocus={handleModernRowFocus}
								onFocusItem={handleItemFocus}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								onLoadMore={handleLoadMore}
								rowSpacing={rowSpacing}
							/>
						) : (
							<DiscoverRow
								key={config.id}
								config={config}
								items={rowItems[config.id] || []}
								rowIndex={index}
								isLoading={rowLoading[config.id]}
								onSelectItem={handleSelectItem}
								onSelectGenre={onSelectGenre}
								onSelectNetwork={onSelectNetwork}
								onSelectStudio={onSelectStudio}
								onOpenShortcut={onOpenShortcut}
								onFocusItem={handleItemFocus}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								onLoadMore={loadMoreForRow}
								onRowFocus={handleRowFocus}
							/>
						)))}
					</div>
				</div>
			)}
		</div>
	);
};

export default SeerrDiscover;
