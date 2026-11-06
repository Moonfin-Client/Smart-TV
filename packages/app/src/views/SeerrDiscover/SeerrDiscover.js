import {useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useSeerr} from '../../context/SeerrContext';
import {pointerHover} from '../../utils/focusScroll';
import {useSettings} from '../../context/SettingsContext';
import {useAuth} from '../../context/AuthContext';
import {ModernMediaRow} from '../../components/MediaRow';
import BackdropLayer from '../../components/BackdropLayer';
import {modernCardMetrics, posterSizeScale} from '../../components/MediaCard/modernCardLayout';
import seerrApi from '../../services/seerrApi';
import {seerrGenreBackdrop} from '../../utils/seerrGenreArt';
import LoadingSpinner from '../../components/LoadingSpinner';
import SeerrPosterCard from '../../components/seerr/SeerrPosterCard';
import {MaterialIcon} from '../../components/icons/materialIcons';
import {CORE_ICON_PATHS} from '../Settings/settingsCoreIcons';
import {registerThemeSheet} from '../../theme/themeOverrides';
import {KEYS} from '../../utils/keys';
import hydrateRequestMediaItems, {hydrateRecentlyAddedItems, hydrateWatchlistItems} from '../../utils/seerrHydration';
import {STREAMING_NETWORKS, MOVIE_STUDIOS, pickShortcutBackdrops, normalizeMediaItem, seerrBrowseTitle, seerrShortcuts} from '../../utils/seerrHomeRows';
import {libraryIdOf} from '../../utils/seerrTarget';
import {isSupportedSlider, loadDiscoverSliders, loadSliderPage} from '../../utils/seerrSliders';
import {isScrolledAway} from '../../utils/quickReturn';
import {focusedCardIndex, cardToRestore, focusedRowIndex} from '../../utils/rowFocusMemory';
import {scrimStyle} from '../../utils/scrimImage';

import css from './SeerrDiscover.module.less';

registerThemeSheet('seerrDiscover', css);

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-first'
}, 'div');

// Core's own reads for its local rows ask for 15.
const LOCAL_ROW_LIMIT = 15;

// Core's discover rows and titles, in its default order.
let _rowConfigs;
const buildRowConfigs = () => [
	{id: 'shortcuts', title: seerrBrowseTitle(), type: 'shortcut'},
	{id: 'recentRequests', title: $L('Recent Requests'), type: 'media'},
	{id: 'yourWatchlist', title: $L('Your Watchlist'), type: 'media', fetchFn: 'watchlist'},
	{id: 'recentlyAdded', title: $L('Recently Added'), type: 'media'},
	{id: 'trending', title: $L('Trending'), type: 'media', fetchFn: 'trending'},
	{id: 'popularMovies', title: $L('Popular Movies'), type: 'media', fetchFn: 'trendingMovies'},
	{id: 'genreMovies', title: $L('Movie Genres'), type: 'genre', mediaType: 'movie'},
	{id: 'upcomingMovies', title: $L('Upcoming Movies'), type: 'media', fetchFn: 'upcomingMovies'},
	{id: 'studios', title: $L('Studios'), type: 'studio'},
	{id: 'popularTv', title: $L('Popular Series'), type: 'media', fetchFn: 'trendingTv'},
	{id: 'genreTv', title: $L('Series Genres'), type: 'genre', mediaType: 'tv'},
	{id: 'upcomingTv', title: $L('Upcoming Series'), type: 'media', fetchFn: 'upcomingTv'},
	{id: 'networks', title: $L('Networks'), type: 'network'}
];

const getRowConfigs = () => {
	_rowConfigs ??= buildRowConfigs();
	// The one title that follows the server, which can change while this module stays loaded.
	_rowConfigs[0].title = seerrBrowseTitle();
	return _rowConfigs;
};

// Where Core puts the pills and the rows on its TV canvas, drawn at 1920. The left rail moves
// everything in and lets the rows start higher, since no bar sits over them.
// The Classic info panel shares the pills' top and starts 64 points in, 96 beside the rail.
const TOP_NAV_LAYOUT = {pillsTop: 139, rowsTop: 212, inset: 134, infoLeft: 107};
const SIDEBAR_LAYOUT = {pillsTop: 47, rowsTop: 120, inset: 147, infoLeft: 160};

// Core's poster and tile sizes on its 1150 point TV canvas, drawn at 1920. Posters in both styles
// follow the poster size the way Home's do, and tiles keep their 180 by 90 points at Medium and
// grow with it. A Classic row leaves room for a focused poster's growth and ring above it and
// 65 points for its title and year under it, as Core does.
const DP = 1920 / 1150;
export const discoverSizes = (posterSize, zoom) => {
	const {imageHeight, cardWidth} = modernCardMetrics({posterSize});
	const scale = posterSizeScale(posterSize);
	const growth = zoom ? Math.round(imageHeight * 0.12) : 0;
	return {
		posterWidth: cardWidth,
		posterHeight: imageHeight,
		posterGap: zoom ? Math.round((12 + cardWidth / DP * 0.06) * DP) : Math.round(12 * DP),
		// Two pixels over Core's 5 points keeps the ring's top edge inside the row's clip.
		rowTop: Math.round(5 * DP) + 2 + growth,
		rowHeight: Math.round(imageHeight + 75 * DP + growth),
		// Core's tiles are exactly twice as wide as they are tall.
		tileWidth: 2 * Math.round(90 * DP * scale),
		tileHeight: Math.round(90 * DP * scale),
		logoInset: Math.round(16 * DP * scale)
	};
};

// Core's discover scrim, the same stops whether or not a backdrop shows under it.
const SCRIM = [{to: 'bottom', rgb: '0, 0, 0', stops: [[0, 0.8], [0.25, 0.33], [0.6, 0.87], [1, 0.87]]}];

const SHORTCUT_ICONS = {
	movies: CORE_ICON_PATHS.movie,
	series: CORE_ICON_PATHS.tv,
	issues: CORE_ICON_PATHS.report_problem_outlined
};

// Core hides adult titles on its media rows by default, going by TMDB's flag or the words below.
const NSFW_PATTERNS = [
	/\bsex\b/i, /sexual/i, /\bporn\b/i, /erotic/i, /\bnude\b/i, /nudity/i,
	/\bxxx\b/i, /adult film/i, /prostitute/i, /stripper/i, /\bescort\b/i,
	/seduction/i, /\baffair\b/i, /threesome/i, /\borgy\b/i, /kinky/i,
	/fetish/i, /\bbdsm\b/i, /dominatrix/i
];
const isNsfw = (item) => Boolean(item?.adult) ||
	NSFW_PATTERNS.some((pattern) => pattern.test(`${item?.title || item?.name || ''} ${item?.overview || ''}`));

// The media rows leave out what's already in the library, what Seerr blocks and adult titles.
// Requests, the watchlist and Recently Added show as they come.
const filterDiscoverItems = (items = []) => items.filter((item) => {
	const status = item?.mediaInfo?.status;
	return status !== 4 && status !== 5 && status !== 6 && !isNsfw(item);
});

// A request becomes a title card, the way Core turns its requests into discover items. The id
// stays per request, since a title asked for twice keeps a card for each.
const requestToItem = (request) => {
	const media = request.media || {};
	return {
		id: media.tmdbId ?? media.id,
		mediaType: request.type || media.mediaType,
		title: media.title || media.name,
		name: media.name || media.title,
		overview: media.overview,
		releaseDate: media.releaseDate,
		firstAirDate: media.firstAirDate,
		posterPath: media.posterPath,
		backdropPath: media.backdropPath,
		voteAverage: media.voteAverage,
		mediaInfo: media,
		_requestId: request.id
	};
};

const toModernItem = (item) => {
	const normalized = normalizeMediaItem(item);
	return item._requestId != null ? {...normalized, Id: `seerr-request-${item._requestId}`} : normalized;
};

const yearOf = (item) => (item.releaseDate || item.release_date || item.firstAirDate || item.first_air_date || '').substring(0, 4);

// The Classic style's poster, with its title and year under it.
const MediaCard = memo(function MediaCard({item, mediaType, sizes, first, onSelect, onFocus}) {
	const title = item.title || item.name;

	const handleClick = useCallback(() => {
		onSelect?.(item, mediaType);
	}, [item, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.(item);
	}, [item, onFocus]);

	return (
		<SeerrPosterCard
			className={css.mediaCard}
			style={{width: `${sizes.posterWidth}px`, marginLeft: first ? 0 : `${sizes.posterGap}px`}}
			item={item}
			mediaType={mediaType}
			imageHeight={sizes.posterHeight}
			subtitle={yearOf(item)}
			placeholder={<div className={css.noPoster}>{title?.[0]}</div>}
			onClick={handleClick}
			onFocus={handleFocus}
		/>
	);
});

const tileStyle = (sizes, first) => ({width: `${sizes.tileWidth}px`, height: `${sizes.tileHeight}px`, marginLeft: first ? 0 : '20px'});

const ShortcutTile = memo(function ShortcutTile({shortcut, sizes, first, onSelect}) {
	const backdropUrl = shortcut.backdrop ? seerrApi.getImageUrl(shortcut.backdrop, 'w780') : '';
	const iconPath = SHORTCUT_ICONS[shortcut.key];

	const handleClick = useCallback(() => {
		onSelect?.(shortcut.key);
	}, [shortcut.key, onSelect]);

	return (
		<SpottableDiv className={css.tile} style={tileStyle(sizes, first)} onClick={handleClick}>
			{backdropUrl && <img className={css.tileArt} src={backdropUrl} alt="" loading="lazy" />}
			<div className={css.shortcutShade} />
			<div className={css.shortcutLabel}>
				{iconPath ? (
					<svg className={css.shortcutIcon} viewBox="0 0 24 24" aria-hidden="true"><path d={iconPath} /></svg>
				) : (
					<MaterialIcon name="playlistAddCheck" className={css.shortcutIcon} />
				)}
				<span className={css.shortcutName}>{shortcut.name}</span>
			</div>
			<div className={css.tileRing} />
		</SpottableDiv>
	);
});

// A genre's name across its duotone still, shrunk to fit the way Core fits it on one line.
const GenreTile = memo(function GenreTile({genre, mediaType, sizes, first, onSelect}) {
	const labelRef = useRef(null);
	const art = seerrGenreBackdrop(genre.id, genre.backdrops);
	const backdropUrl = art ? seerrApi.getImageUrl(art.path, art.size) : '';

	useLayoutEffect(() => {
		const label = labelRef.current;
		const room = label.parentNode.clientWidth - 40;
		const scale = label.offsetWidth > room ? `scale(${room / label.offsetWidth})` : '';
		label.style.webkitTransform = scale;
		label.style.transform = scale;
	}, [genre.name, sizes.tileWidth]);

	const handleClick = useCallback(() => {
		onSelect?.(genre.id, genre.name, mediaType);
	}, [genre.id, genre.name, mediaType, onSelect]);

	return (
		<SpottableDiv className={css.tile} style={tileStyle(sizes, first)} onClick={handleClick}>
			{backdropUrl && <img className={css.tileArt} src={backdropUrl} alt="" loading="lazy" />}
			<div className={css.genreVeil}>
				<span ref={labelRef} className={css.genreName}>{genre.name}</span>
			</div>
			<div className={css.tileRing} />
		</SpottableDiv>
	);
});

const LogoTile = memo(function LogoTile({entry, sizes, first, onSelect}) {
	const logoUrl = seerrApi.getImageUrl('/' + entry.logo, 'w780_filter(duotone,ffffff,bababa)');

	const handleClick = useCallback(() => {
		onSelect?.(entry.id, entry.name);
	}, [entry.id, entry.name, onSelect]);

	return (
		<SpottableDiv className={`${css.tile} ${css.logoTile}`} style={tileStyle(sizes, first)} onClick={handleClick}>
			<img
				className={css.logo}
				src={logoUrl}
				alt={entry.name}
				loading="lazy"
				style={{
					top: `${sizes.logoInset}px`,
					left: `${sizes.logoInset}px`,
					width: `${sizes.tileWidth - 2 * sizes.logoInset}px`,
					height: `${sizes.tileHeight - 2 * sizes.logoInset}px`
				}}
			/>
			<div className={css.tileRing} />
		</SpottableDiv>
	);
});

// The tile rows, and the classic style's poster rows.
const DiscoverRow = memo(function DiscoverRow({
	config,
	items,
	rowIndex,
	isLoading,
	inset,
	sidebar,
	sizes,
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
		} else if (e.keyCode === KEYS.LEFT || e.keyCode === KEYS.RIGHT) {
			// Like Home's rows, focus wraps around the ends of a row rather than wandering into
			// another one, and Left from the first card opens the sidebar.
			const left = e.keyCode === KEYS.LEFT;
			const cards = e.currentTarget.querySelectorAll('.spottable');
			const edge = cards[left ? 0 : cards.length - 1];
			if (edge && edge.contains(e.target)) {
				e.preventDefault();
				e.stopPropagation();
				Spotlight.focus(left && sidebar ? 'navbar' : cards[left ? cards.length - 1 : 0]);
			}
		}
	}, [rowIndex, sidebar, onNavigateUp, onNavigateDown]);

	// Like Core, the focused tile parks at the leading edge and the row slides under it.
	const handleFocus = useCallback((e) => {
		onRowFocus?.(rowIndex);
		const scroller = scrollerRef.current;
		const card = e.target.closest('.spottable');
		if (!card || !scroller) return;
		const cards = Array.prototype.filter.call(card.parentNode.children, (el) => el.classList.contains('spottable'));
		if (!pointerHover() && cards.length) scroller.scrollLeft = card.offsetLeft - cards[0].offsetLeft;
		if (cards.indexOf(card) >= cards.length - 3) onLoadMore?.(config.id);
	}, [config.id, onLoadMore, rowIndex, onRowFocus]);

	const renderCards = useMemo(() => {
		switch (config.type) {
			case 'shortcut':
				return items.map((item, index) => (
					<ShortcutTile key={item.key} shortcut={item} sizes={sizes} first={index === 0} onSelect={onOpenShortcut} />
				));
			case 'genre':
				return items.map((item, index) => (
					<GenreTile key={item.id} genre={item} mediaType={config.mediaType} sizes={sizes} first={index === 0} onSelect={onSelectGenre} />
				));
			case 'network':
				return items.map((item, index) => (
					<LogoTile key={item.id} entry={item} sizes={sizes} first={index === 0} onSelect={onSelectNetwork} />
				));
			case 'studio':
				return items.map((item, index) => (
					<LogoTile key={item.id} entry={item} sizes={sizes} first={index === 0} onSelect={onSelectStudio} />
				));
			default:
				return items.map((item, index) => (
					<MediaCard
						key={item._requestId != null ? `request-${item._requestId}` : `${item.mediaType || item.media_type}-${item.id}`}
						item={item}
						mediaType={config.mediaType}
						sizes={sizes}
						first={index === 0}
						onSelect={onSelectItem}
						onFocus={onFocusItem}
					/>
				));
		}
	}, [config.type, config.mediaType, items, sizes, onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio, onOpenShortcut, onFocusItem]);

	const tiles = config.type !== 'media';
	// Tiles sit 5 points down with 5 under them, posters under their growth room.
	const scrollerHeight = tiles ? sizes.tileHeight + 17 : sizes.rowHeight;

	return (
		<div data-row-index={rowIndex}>
			<h2 className={css.rowTitle} style={{paddingLeft: `${inset}px`}}>{config.title}</h2>
			<div className={tiles ? css.tileScroller : css.rowScroller} ref={scrollerRef} style={{paddingLeft: `${inset + 6}px`, height: `${scrollerHeight}px`}}>
				<RowContainer
					className={tiles ? css.tileItems : css.rowItems}
					style={tiles ? undefined : {paddingTop: `${sizes.rowTop}px`}}
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

// Core's Classic info panel for the focused title, above the rows. It holds a fixed 120 point
// space until a poster is focused.
const InfoPanel = ({item, top, left}) => {
	if (!item || !(item.title || item.name)) return <div className={css.infoSpacer} />;
	const year = yearOf(item);
	const rating = item.vote_average ?? item.voteAverage;
	const type = item.media_type || item.mediaType;
	return (
		<div className={css.infoPanel} style={{paddingTop: `${top}px`, paddingLeft: `${left}px`}}>
			<div className={css.infoTitle}>{item.title || item.name}</div>
			<div className={css.infoMeta}>
				{year && <span>{year}</span>}
				{rating > 0 && (
					<span className={css.infoRating}>
						<svg className={css.infoStar} viewBox="0 0 24 24" aria-hidden="true"><path d={CORE_ICON_PATHS.star} /></svg>
						{rating.toFixed(1)}
					</span>
				)}
				<span className={css.infoType}>{type === 'tv' ? $L('Series') : $L('Movie')}</span>
			</div>
			<div className={css.infoOverview}>{item.overview}</div>
		</div>
	);
};

const Pill = ({spotlightId, iconPath, iconName, label, badge, onClick, onKeyDown, onFocus}) => (
	<SpottableDiv className={css.pill} spotlightId={spotlightId} onClick={onClick} onKeyDown={onKeyDown} onFocus={onFocus}>
		{iconPath ? (
			<svg className={css.pillIcon} viewBox="0 0 24 24" aria-hidden="true"><path d={iconPath} /></svg>
		) : (
			<MaterialIcon name={iconName} className={css.pillIcon} />
		)}
		<span className={css.pillLabel}>{label}</span>
		{badge > 0 && <span className={css.pillBadge}>{badge}</span>}
	</SpottableDiv>
);

// Where focus was left, the way Home keeps it: the row by id since a row that comes back empty
// shifts the ones below it, the card by its place in the row, and its spotlight id when it has one.
let lastFocused = {rowId: null, cardIndex: -1, cardId: null};

// Badge count survives panel switches for a short while so revisiting
// discover doesn't refetch the counts every time.
let cachedBadge = {count: 0, at: 0};
const BADGE_TTL_MS = 60000;

const fetchPage = (config, page) => {
	switch (config.fetchFn) {
		case 'trending': return seerrApi.trending(page);
		case 'trendingMovies': return seerrApi.trendingMovies(page);
		case 'trendingTv': return seerrApi.trendingTv(page);
		case 'upcomingMovies': return seerrApi.upcomingMovies(page);
		case 'upcomingTv': return seerrApi.upcomingTv(page);
		case 'watchlist': return seerrApi.getWatchlist(page);
		case 'slider': return loadSliderPage(config.slider, page);
		default: return Promise.resolve(null);
	}
};

// The watchlist comes back bare and is filled in from each title's details, while the
// discover lists drop what Core drops.
const pageItems = async (config, results = []) => (
	config.fetchFn === 'watchlist' ? hydrateWatchlistItems(results) : filterDiscoverItems(results)
);

const SeerrDiscover = ({onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio, onOpenRequests, onOpenSearch, onOpenShortcut, backHandlerRef}) => {
	const {isAuthenticated, isEnabled, user: contextUser} = useSeerr();
	// The context hands over a new user object whenever it checks in with the plugin, so the rows
	// only reload when the Seerr account itself changes.
	const contextSeerrUserId = contextUser?.seerrUserId;
	const {settings} = useSettings();
	const {serverUrl} = useAuth();
	// Discover follows the Home rows style. Modern cards carry their own details, so the
	// info header goes with it, the way Home drops its top info area.
	const useModernRows = settings.homeRowsStyle !== 'v1';
	const sidebar = settings.navbarPosition === 'left';
	const layout = sidebar ? SIDEBAR_LAYOUT : TOP_NAV_LAYOUT;
	const zoom = settings.cardFocusZoom !== false;
	const sizes = useMemo(() => discoverSizes(settings.homeRowsPosterSize, zoom), [settings.homeRowsPosterSize, zoom]);
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

	// Only the first load shows the spinner. A reload swaps the rows in place, so the card that
	// holds focus stays where it is.
	const loadedRef = useRef(false);
	useEffect(() => {
		const loadInitialData = async () => {
			if (!isAuthenticated) return;
			if (!loadedRef.current) setIsLoading(true);
			try {
				// Prefer context user (Moonfin) or fall back to API user
				const apiUser = await seerrApi.getUser().catch(() => null);
				const currentUser = contextSeerrUserId
					? {id: contextSeerrUserId, ...apiUser}
					: apiUser;
				const perms = currentUser?.permissions;
				const {PERMISSIONS, hasPermission} = seerrApi;
				const canViewAllRequests = hasPermission(perms, PERMISSIONS.MANAGE_REQUESTS) || hasPermission(perms, PERMISSIONS.REQUEST_VIEW);
				// Seerr leaves this permission to its own pages, so Core checks it the same way.
				const canViewRecentlyAdded = perms == null || hasPermission(perms, PERMISSIONS.RECENT_VIEW);

				const emptyPage = {results: []};
				const [
					requestsData,
					watchlistData,
					recentlyAddedData,
					trendingData,
					moviesData,
					tvData,
					genreMovies,
					genreTv,
					upcomingMoviesData,
					upcomingTvData
				] = await Promise.all([
					currentUser?.id || canViewAllRequests
						? seerrApi.getRecentRequests(canViewAllRequests ? null : currentUser.id, LOCAL_ROW_LIMIT).catch(() => emptyPage)
						: emptyPage,
					seerrApi.getWatchlist(1).catch(() => emptyPage),
					canViewRecentlyAdded ? seerrApi.getRecentlyAdded(LOCAL_ROW_LIMIT).catch(() => emptyPage) : emptyPage,
					seerrApi.trending(1).catch(() => emptyPage),
					seerrApi.trendingMovies(1).catch(() => emptyPage),
					seerrApi.trendingTv(1).catch(() => emptyPage),
					seerrApi.getGenreSliderMovies().catch(() => []),
					seerrApi.getGenreSliderTv().catch(() => []),
					seerrApi.upcomingMovies(1).catch(() => emptyPage),
					seerrApi.upcomingTv(1).catch(() => emptyPage)
				]);

				const [requests, watchlist, recentlyAdded] = await Promise.all([
					hydrateRequestMediaItems((requestsData.results || []).filter((request) => request?.media?.tmdbId)),
					hydrateWatchlistItems(watchlistData.results || []),
					hydrateRecentlyAddedItems(recentlyAddedData.results || [])
				]);

				const trending = filterDiscoverItems(trendingData.results);
				// Shuffled once per load, so the tiles keep their stills until the next one.
				const shortcuts = seerrShortcuts().filter((shortcut) => shortcut.key !== 'discover');
				const backdrops = pickShortcutBackdrops(shortcuts, trending.slice().sort(() => Math.random() - 0.5));

				setRows((prev) => ({
					...prev,
					shortcuts: shortcuts.map((shortcut) => ({key: shortcut.key, name: shortcut.name(), backdrop: backdrops[shortcut.key]})),
					recentRequests: requests.map(requestToItem),
					yourWatchlist: watchlist,
					recentlyAdded,
					trending,
					popularMovies: filterDiscoverItems(moviesData.results),
					genreMovies: genreMovies || [],
					upcomingMovies: filterDiscoverItems(upcomingMoviesData.results),
					studios: MOVIE_STUDIOS,
					popularTv: filterDiscoverItems(tvData.results),
					genreTv: genreTv || [],
					upcomingTv: filterDiscoverItems(upcomingTvData.results),
					networks: STREAMING_NETWORKS
				}));

				const paged = {yourWatchlist: watchlistData, trending: trendingData, popularMovies: moviesData, popularTv: tvData, upcomingMovies: upcomingMoviesData, upcomingTv: upcomingTvData};
				setRowPages(Object.fromEntries(Object.keys(paged).map((id) => [id, 1])));
				setRowHasMore(Object.fromEntries(Object.entries(paged).map(([id, data]) => [id, (data.totalPages || 1) > 1])));
			} catch (err) {
				console.error('Failed to load Seerr data:', err);
			} finally {
				loadedRef.current = true;
				setIsLoading(false);
			}
		};

		if (isAuthenticated) {
			loadInitialData();
		} else {
			setIsLoading(false);
		}
	}, [isAuthenticated, contextSeerrUserId]);

	// The sliders load after this screen's own rows, two rows at a time. A missing or failing
	// endpoint just leaves them out.
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
					setRows((prev) => ({...prev, [id]: filterDiscoverItems(page.results)}));
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
			const nextPage = (rowPages[rowId] || 1) + 1;
			const data = await fetchPage(config, nextPage);
			if (!data) return;
			const newItems = await pageItems(config, data.results || []);
			setRows(prev => {
				const existingIds = new Set(prev[rowId].map(item => `${item.mediaType}-${item.id}`));
				const uniqueNew = newItems.filter(item => !existingIds.has(`${item.mediaType}-${item.id}`));
				return {...prev, [rowId]: [...prev[rowId], ...uniqueNew]};
			});
			setRowPages(prev => ({...prev, [rowId]: nextPage}));
			setRowHasMore(prev => ({...prev, [rowId]: nextPage < (data.totalPages || 1)}));
		} catch (err) {
			console.error(`Failed to load more for ${rowId}:`, err);
		} finally {
			setRowLoading(prev => ({...prev, [rowId]: false}));
		}
	}, [rowConfigs, rowLoading, rowHasMore, rowPages]);

	// A callback that never changes but always reaches the current paging state, since the Modern
	// rows only redraw for their items and a page landing in one row shouldn't redraw the others.
	const loadMoreRef = useRef(loadMoreForRow);
	loadMoreRef.current = loadMoreForRow;
	const handleLoadMore = useCallback((rowId) => loadMoreRef.current(rowId), []);

	const handleItemFocus = useCallback((item) => {
		// Only the Classic info panel shows the focused title.
		if (!useModernRows) setFocusedItem(item);
		if (backdropTimeoutRef.current) {
			clearTimeout(backdropTimeoutRef.current);
		}
		backdropTimeoutRef.current = setTimeout(() => {
			// A Modern card hands over the normalized item, which carries its backdrop
			// ready made. The page keeps the plain backdrop, never the titled thumb.
			if (item?._externalBackdropUrl) {
				setBackdropUrl(item._externalBackdropUrl);
			} else if (item?.backdrop_path || item?.backdropPath) {
				setBackdropUrl(seerrApi.getImageUrl(item.backdrop_path || item.backdropPath, 'w1280'));
			}
		}, 150);
	}, [useModernRows]);

	const handleSelectItem = useCallback((item, mediaType) => {
		const type = mediaType || item.media_type || item.mediaType || (item.title ? 'movie' : 'tv');
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
			items[config.id] = raw && useModernRows && config.type === 'media' ? raw.map(toModernItem) : raw;
		});
		return items;
	}, [rowConfigs, rows, useModernRows]);

	const visibleRows = useMemo(() => {
		return rowConfigs.filter(r => rowItems[r.id]?.length > 0);
	}, [rowConfigs, rowItems]);
	const visibleRowsRef = useRef(visibleRows);
	visibleRowsRef.current = visibleRows;

	const handlePillKeyDown = useCallback((e) => {
		const first = e.currentTarget === e.currentTarget.parentNode.querySelector('.spottable');
		if (e.keyCode === KEYS.UP || (e.keyCode === KEYS.LEFT && first && sidebar)) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('discover-row-0');
		}
	}, [sidebar]);

	// Core lines a focused row's top up with the top of the list in both styles, and the first
	// row sends the list back to the start. Only the list scrolls, so nothing above it moves.
	// It's pinned again over the next frames because the row focus just left shrinks back
	// after this runs.
	const scrollRowIntoView = useCallback((index) => {
		const container = rowsContainerRef.current;
		const row = container?.querySelector(`[data-row-index="${index}"]`);
		if (!row) return;
		const pin = () => {
			if (index === 0) {
				container.scrollTop = 0;
				return;
			}
			const offset = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
			if (Math.abs(offset) > 1) container.scrollTop += offset;
		};
		pin();
		window.requestAnimationFrame(pin);
		window.requestAnimationFrame(() => window.requestAnimationFrame(pin));
	}, []);

	// The row comes into view before it takes focus, so a row the list had scrolled away from
	// is never passed over.
	const moveToRow = useCallback((index) => {
		scrollRowIntoView(index);
		const target = `discover-row-${index}`;
		if (!Spotlight.focus(target)) window.requestAnimationFrame(() => Spotlight.focus(target));
	}, [scrollRowIntoView]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			// The pills sit between the rows and the navbar.
			if (Spotlight.focus('discover-requests-pill') || Spotlight.focus('discover-search-pill')) {
				return;
			}
			Spotlight.focus('navbar');
			return;
		}
		moveToRow(fromRowIndex - 1);
	}, [moveToRow]);

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= visibleRowsRef.current.length) return;
		moveToRow(targetIndex);
	}, [moveToRow]);

	const handleRowFocus = useCallback((rowIndex) => {
		if (typeof rowIndex !== 'number') return;
		const active = document.activeElement;
		lastFocused = {
			rowId: visibleRowsRef.current[rowIndex]?.id || null,
			cardIndex: focusedCardIndex(`discover-row-${rowIndex}`, active),
			cardId: active?.getAttribute('data-spotlight-id') || null
		};
		if (!pointerHover()) scrollRowIntoView(rowIndex);
	}, [scrollRowIntoView]);

	const handlePillFocus = useCallback((ev) => {
		lastFocused = {rowId: null, cardIndex: -1, cardId: ev.currentTarget.getAttribute('data-spotlight-id')};
	}, []);

	// Puts focus back where it was left, the way Home's focusRow does: the card by its id, then by
	// its place in the row, then the row. The row is lined up first, then the list is lined up
	// with wherever focus actually landed, so the scroll can't disagree with the focus.
	const restoreFocus = useCallback(() => {
		const {rowId, cardIndex, cardId} = lastFocused;
		const remembered = rowId ? visibleRowsRef.current.findIndex((row) => row.id === rowId) : -1;
		const index = Math.max(remembered, 0);
		scrollRowIntoView(index);
		const card = remembered >= 0 ? cardToRestore(`discover-row-${index}`, cardIndex) : null;
		if (!(cardId && Spotlight.focus(cardId)) && !(card && Spotlight.focus(card))) {
			Spotlight.focus(`discover-row-${index}`);
		}
		scrollRowIntoView(focusedRowIndex(document.activeElement));
	}, [scrollRowIntoView]);

	// Run before paint once the rows are in, on arrival and whenever focus has fallen out of the
	// screen, so no key press is spent finding focus again. Rows that arrive later leave a viewer
	// who has moved on alone.
	const restorePendingRef = useRef(true);
	useLayoutEffect(() => {
		if (isLoading || visibleRows.length === 0) return;
		const active = document.activeElement;
		const lost = !active || active === document.body || !document.body.contains(active);
		if (!restorePendingRef.current && !lost) return;
		if (active?.closest?.(`[data-row-index], .${css.pills}`)) {
			restorePendingRef.current = false;
			return;
		}
		restorePendingRef.current = false;
		restoreFocus();
	}, [isLoading, visibleRows, restoreFocus]);

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

	const renderRow = (config, index) => (useModernRows && config.type === 'media' ? (
		<ModernMediaRow
			key={config.id}
			rowId={config.id}
			title={config.title}
			items={rowItems[config.id]}
			serverUrl={serverUrl}
			rowIndex={index}
			spotlightId={`discover-row-${index}`}
			onSelectItem={handleSelectModernItem}
			onFocus={handleRowFocus}
			onFocusItem={handleItemFocus}
			onNavigateUp={handleNavigateUp}
			onNavigateDown={handleNavigateDown}
			onLoadMore={handleLoadMore}
			coreLook
			leadingInset={layout.inset}
		/>
	) : (
		<DiscoverRow
			key={config.id}
			config={config}
			items={rowItems[config.id] || []}
			rowIndex={index}
			isLoading={rowLoading[config.id]}
			inset={layout.inset}
			sidebar={sidebar}
			sizes={sizes}
			onSelectItem={handleSelectItem}
			onSelectGenre={onSelectGenre}
			onSelectNetwork={onSelectNetwork}
			onSelectStudio={onSelectStudio}
			onOpenShortcut={onOpenShortcut}
			onFocusItem={handleItemFocus}
			onNavigateUp={handleNavigateUp}
			onNavigateDown={handleNavigateDown}
			onLoadMore={handleLoadMore}
			onRowFocus={handleRowFocus}
		/>
	));

	return (
		<div className={css.container}>
			{settings.showHomeBackdrop !== false && (
				<BackdropLayer targetUrl={backdropUrl} blurAmount={0} overlayOpacity={0} fadeMs={600} />
			)}
			<div className={css.scrim} style={scrimStyle(SCRIM)} />
			{!isLoading && (onOpenSearch || onOpenRequests) && (
				<div className={css.pills} style={{top: `${layout.pillsTop}px`}}>
					{onOpenSearch && (
						<Pill
							spotlightId="discover-search-pill"
							iconPath={CORE_ICON_PATHS.search}
							label={$L('Search')}
							onClick={onOpenSearch}
							onKeyDown={handlePillKeyDown}
							onFocus={handlePillFocus}
						/>
					)}
					{onOpenRequests && (
						<Pill
							spotlightId="discover-requests-pill"
							iconName="moveToInboxOutlined"
							label={$L('Requests')}
							badge={requestsBadge}
							onClick={onOpenRequests}
							onKeyDown={handlePillKeyDown}
							onFocus={handlePillFocus}
						/>
					)}
				</div>
			)}
			{isLoading ? (
				<LoadingSpinner />
			) : useModernRows ? (
				<div className={css.modernRows} style={{top: `${layout.rowsTop}px`}} ref={rowsContainerRef}>
					{visibleRows.map(renderRow)}
				</div>
			) : (
				<div className={css.classicContent}>
					<InfoPanel item={focusedItem} top={layout.pillsTop} left={layout.infoLeft} />
					<div className={css.rowsContainer} ref={rowsContainerRef}>
						{visibleRows.map(renderRow)}
					</div>
				</div>
			)}
		</div>
	);
};

export default SeerrDiscover;
