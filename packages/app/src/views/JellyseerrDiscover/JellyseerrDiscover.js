import {useState, useEffect, useCallback, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useJellyseerr} from '../../context/JellyseerrContext';
import {useSettings} from '../../context/SettingsContext';
import jellyseerrApi from '../../services/jellyseerrApi';
import LoadingSpinner from '../../components/LoadingSpinner';

import css from './JellyseerrDiscover.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-first'
}, 'div');

const ITEMS_PER_PAGE = 9;

// Hardcoded streaming networks
const STREAMING_NETWORKS = [
	{id: 213, name: 'Netflix', logo: 'wwemzKWzjKYJFfCeiB57q3r4Bcm.png'},
	{id: 2739, name: 'Disney+', logo: 'gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png'},
	{id: 1024, name: 'Prime Video', logo: 'ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png'},
	{id: 2552, name: 'Apple TV+', logo: '4KAy34EHvRM25Ih8wb82AuGU7zJ.png'},
	{id: 453, name: 'Hulu', logo: 'pqUTCleNUiTLAVlelGxUgWn1ELh.png'},
	{id: 49, name: 'HBO', logo: 'tuomPhY2UtuPTqqFnKMVHvSb724.png'},
	{id: 4330, name: 'Paramount+', logo: 'fi83B1oztoS47xxcemFdPMhIzK.png'},
	{id: 3353, name: 'Peacock', logo: 'gIAcGTjKKr0KOHL5s4O36roJ8p7.png'}
];

// Hardcoded movie studios
const MOVIE_STUDIOS = [
	{id: 2, name: 'Disney', logo: 'wdrCwmRnLFJhEoH8GSfymY85KHT.png'},
	{id: 127928, name: '20th Century', logo: 'h0rjX5vjW5r8yEnUBStFarjcLT4.png'},
	{id: 34, name: 'Sony Pictures', logo: 'GagSvqWlyPdkFHMfQ3pNq6ix9P.png'},
	{id: 174, name: 'Warner Bros.', logo: 'ky0xOc5OrhzkZ1N6KyUxacfQsCk.png'},
	{id: 33, name: 'Universal', logo: '8lvHyhjr8oUKOOy2dKXoALWKdp0.png'},
	{id: 4, name: 'Paramount', logo: 'fycMZt242LVjagMByZOLUGbCvv3.png'},
	{id: 420, name: 'Marvel', logo: 'hUzeosd33nzE5MCNsZxCGEKTXaQ.png'},
	{id: 9993, name: 'DC', logo: '2Tc1P3Ac8M479naPp1kYT3izLS5.png'},
	{id: 41077, name: 'A24', logo: '1ZXsGaFPgrgS6ZZGS37AqD5uU12.png'}
];

const ROW_CONFIGS = [
	{id: 'myRequests', title: 'My Requests', type: 'request'},
	{id: 'trending', title: 'Trending Now', type: 'media', fetchFn: 'trending'},
	{id: 'popularMovies', title: 'Popular Movies', type: 'media', fetchFn: 'trendingMovies'},
	{id: 'popularTv', title: 'Popular TV Shows', type: 'media', fetchFn: 'trendingTv'},
	{id: 'genreMovies', title: 'Browse Movies by Genre', type: 'genre', mediaType: 'movie'},
	{id: 'genreTv', title: 'Browse TV by Genre', type: 'genre', mediaType: 'tv'},
	{id: 'studios', title: 'Browse by Studio', type: 'studio'},
	{id: 'networks', title: 'Browse by Network', type: 'network'},
	{id: 'upcomingMovies', title: 'Upcoming Movies', type: 'media', fetchFn: 'upcomingMovies'},
	{id: 'upcomingTv', title: 'Upcoming TV Shows', type: 'media', fetchFn: 'upcomingTv'}
];

let lastFocusedRowIndex = null;

// Memoized card components for performance
const MediaCard = memo(function MediaCard({item, mediaType, onSelect, onFocus}) {
	const posterUrl = jellyseerrApi.getImageUrl(item.poster_path || item.posterPath, 'w342');
	const title = item.title || item.name;
	const status = item.mediaInfo?.status;
	const itemMediaType = item.media_type || item.mediaType || mediaType;

	const handleClick = useCallback(() => {
		onSelect?.(item, mediaType);
	}, [item, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.(item);
	}, [item, onFocus]);

	return (
		<SpottableDiv className={css.mediaCard} onClick={handleClick} onFocus={handleFocus}>
			<div className={css.posterContainer}>
				{posterUrl ? (
					<img className={css.poster} src={posterUrl} alt={title} loading="lazy" />
				) : (
					<div className={css.noPoster}>{title?.[0]}</div>
				)}
				{itemMediaType && (
					<div className={`${css.mediaTypeBadge} ${itemMediaType === 'movie' ? css.movieBadge : css.seriesBadge}`}>
						{itemMediaType === 'movie' ? 'MOVIE' : 'SERIES'}
					</div>
				)}
				{status && [3, 4, 5].includes(status) && (
					<div className={`${css.availabilityBadge} ${css[`availability${status}`]}`} />
				)}
			</div>
		</SpottableDiv>
	);
});

const GenreCard = memo(function GenreCard({genre, mediaType, onSelect, onFocus}) {
	const backdropPath = genre.backdrops?.[0] || '';
	const backdropUrl = backdropPath ? jellyseerrApi.getImageUrl(backdropPath, 'w780') : '';

	const handleClick = useCallback(() => {
		onSelect?.(genre.id, genre.name, mediaType);
	}, [genre.id, genre.name, mediaType, onSelect]);

	const handleFocus = useCallback(() => {
		onFocus?.({backdrops: genre.backdrops});
	}, [genre.backdrops, onFocus]);

	return (
		<SpottableDiv className={css.genreCard} onClick={handleClick} onFocus={handleFocus}>
			{backdropUrl && <img className={css.genreBackdrop} src={backdropUrl} alt={genre.name} loading="lazy" />}
			<div className={css.genreOverlay}>
				<span className={css.genreTitle}>{genre.name}</span>
			</div>
		</SpottableDiv>
	);
});

const NetworkCard = memo(function NetworkCard({network, onSelect}) {
	const logoUrl = `http://image.tmdb.org/t/p/w185/${network.logo}`;

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
	const logoUrl = `http://image.tmdb.org/t/p/w185/${studio.logo}`;

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
	const posterUrl = media?.posterPath ? jellyseerrApi.getImageUrl(media.posterPath, 'w342') : null;
	const title = media?.title || media?.name || 'Unknown';
	const status = request.status;
	const mediaType = request.type;

	const getStatusClass = () => {
		switch (status) {
			case 1: return css.requestStatusPending;
			case 2: return css.requestStatusApproved;
			case 3: return css.requestStatusDeclined;
			case 4: return css.requestStatusAvailable;
			default: return css.requestStatusPending;
		}
	};

	const getStatusText = () => {
		switch (status) {
			case 1: return '⏳ Pending';
			case 2: return '✓ Approved';
			case 3: return '✗ Declined';
			case 4: return '✓ Available';
			default: return 'Unknown';
		}
	};

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
			mediaType: mediaType
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
						{mediaType === 'movie' ? 'MOVIE' : 'SERIES'}
					</div>
				)}
				<div className={`${css.requestStatusBadge} ${getStatusClass()}`}>
					{getStatusText()}
				</div>
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
	onFocusItem,
	onNavigateUp,
	onNavigateDown,
	onLoadMore,
	onRowFocus
}) {
	const scrollerRef = useRef(null);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === 38) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp?.(rowIndex);
		} else if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown?.(rowIndex);
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	const handleFocus = useCallback((e) => {
		// Track focused row for restoration
		onRowFocus?.(rowIndex);

		const card = e.target.closest(`.${css.mediaCard}, .${css.genreCard}, .${css.networkCard}, .${css.requestCard}`);
		const scroller = scrollerRef.current;
		if (card && scroller) {
			const cardRect = card.getBoundingClientRect();
			const scrollerRect = scroller.getBoundingClientRect();

			if (cardRect.left < scrollerRect.left) {
				scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
			} else if (cardRect.right > scrollerRect.right) {
				scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
			}

			// Check if near end to load more
			const cards = scroller.querySelectorAll(`.${css.mediaCard}, .${css.genreCard}, .${css.networkCard}, .${css.requestCard}`);
			const cardIndex = Array.from(cards).indexOf(card);
			if (cardIndex >= cards.length - 3) {
				onLoadMore?.(config.id);
			}
		}

		// Scroll row into view
		const row = e.target.closest(`.${css.contentRow}`);
		if (row) {
			row.scrollIntoView({behavior: 'smooth', block: 'center'});
		}
	}, [config.id, onLoadMore, rowIndex, onRowFocus]);

	const renderCards = useMemo(() => {
		switch (config.type) {
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
	}, [config.type, config.mediaType, items, onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio, onFocusItem]);

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
							<span>Loading...</span>
						</div>
					)}
				</RowContainer>
			</div>
		</div>
	);
});

const JellyseerrDiscover = ({onSelectItem, onSelectGenre, onSelectNetwork, onSelectStudio}) => {
	const {isAuthenticated, isEnabled, user: contextUser} = useJellyseerr();
	const {settings} = useSettings();
	const [rows, setRows] = useState({});
	const [rowPages, setRowPages] = useState({});
	const [rowHasMore, setRowHasMore] = useState({});
	const [rowLoading, setRowLoading] = useState({});
	const [isLoading, setIsLoading] = useState(true);
	const [backdropUrl, setBackdropUrl] = useState('');
	const [focusedItem, setFocusedItem] = useState(null);
	const backdropTimeoutRef = useRef(null);

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
				const apiUser = await jellyseerrApi.getUser().catch(() => null);
				const currentUser = contextUser?.jellyseerrUserId
					? {id: contextUser.jellyseerrUserId, ...apiUser}
					: apiUser;
				console.log('[JellyseerrDiscover] Current user:', currentUser?.id, currentUser?.username);

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
					currentUser?.id ? jellyseerrApi.getMyRequests(currentUser.id, 50).catch((e) => { console.error('[JellyseerrDiscover] myRequests error:', e); return {results: []}; }) : {results: []},
					jellyseerrApi.trending().catch(() => ({results: []})),
					jellyseerrApi.trendingMovies(1).catch(() => ({results: []})),
					jellyseerrApi.trendingTv(1).catch(() => ({results: []})),
					jellyseerrApi.getGenreSliderMovies().catch(() => []),
					jellyseerrApi.getGenreSliderTv().catch(() => []),
					jellyseerrApi.upcomingMovies(1).catch(() => ({results: []})),
					jellyseerrApi.upcomingTv(1).catch(() => ({results: []}))
				]);

				console.log('[JellyseerrDiscover] My requests loaded:', myRequestsData.results?.length || 0);

				setRows({
					myRequests: myRequestsData.results || [],
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
				console.error('Failed to load Jellyseerr data:', err);
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

	// Load more items for a specific row
	const loadMoreForRow = useCallback(async (rowId) => {
		if (rowLoading[rowId] || !rowHasMore[rowId]) return;

		const config = ROW_CONFIGS.find(r => r.id === rowId);
		if (!config || !config.fetchFn) return;

		setRowLoading(prev => ({...prev, [rowId]: true}));

		try {
			const currentPage = rowPages[rowId] || 1;
			const nextPage = currentPage + 1;

			let data;
			switch (config.fetchFn) {
				case 'trending':
					data = await jellyseerrApi.trending(nextPage);
					break;
				case 'trendingMovies':
					data = await jellyseerrApi.trendingMovies(nextPage);
					break;
				case 'trendingTv':
					data = await jellyseerrApi.trendingTv(nextPage);
					break;
				case 'upcomingMovies':
					data = await jellyseerrApi.upcomingMovies(nextPage);
					break;
				case 'upcomingTv':
					data = await jellyseerrApi.upcomingTv(nextPage);
					break;
				default:
					return;
			}

			const newItems = data.results || [];
			if (newItems.length > 0) {
				setRows(prev => ({
					...prev,
					[rowId]: [...prev[rowId], ...newItems.slice(0, ITEMS_PER_PAGE)]
				}));
				setRowPages(prev => ({...prev, [rowId]: nextPage}));
				setRowHasMore(prev => ({...prev, [rowId]: newItems.length >= 20}));
			} else {
				setRowHasMore(prev => ({...prev, [rowId]: false}));
			}
		} catch (err) {
			console.error(`Failed to load more for ${rowId}:`, err);
		} finally {
			setRowLoading(prev => ({...prev, [rowId]: false}));
		}
	}, [rowLoading, rowHasMore, rowPages]);

	const handleItemFocus = useCallback((item) => {
		setFocusedItem(item);
		if (backdropTimeoutRef.current) {
			clearTimeout(backdropTimeoutRef.current);
		}
		backdropTimeoutRef.current = setTimeout(() => {
			if (item?.backdrop_path || item?.backdropPath) {
				const path = item.backdrop_path || item.backdropPath;
				setBackdropUrl(jellyseerrApi.getImageUrl(path, 'original'));
			} else if (item?.backdrops?.length > 0) {
				setBackdropUrl(jellyseerrApi.getImageUrl(item.backdrops[0], 'original'));
			}
		}, 150);
	}, []);

	const handleSelectItem = useCallback((item, mediaType) => {
		const type = mediaType || item.media_type || item.mediaType || (item.title ? 'movie' : 'tv');
		onSelectItem?.({
			mediaId: item.id,
			mediaType: type
		});
	}, [onSelectItem]);

	const visibleRows = useMemo(() => {
		return ROW_CONFIGS.filter(r => rows[r.id]?.length > 0);
	}, [rows]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			Spotlight.focus('navbar');
			return;
		}
		const targetIndex = fromRowIndex - 1;
		Spotlight.focus(`discover-row-${targetIndex}`);
		const targetRow = document.querySelector(`[data-row-index="${targetIndex}"]`);
		if (targetRow) {
			targetRow.scrollIntoView({behavior: 'smooth', block: 'start'});
		}
	}, []);

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= visibleRows.length) return;
		Spotlight.focus(`discover-row-${targetIndex}`);
		const targetRow = document.querySelector(`[data-row-index="${targetIndex}"]`);
		if (targetRow) {
			targetRow.scrollIntoView({behavior: 'smooth', block: 'center'});
		}
	}, [visibleRows.length]);

	const handleRowFocus = useCallback((rowIndex) => {
		if (typeof rowIndex === 'number') {
			lastFocusedRowIndex = rowIndex;
		}
	}, []);

	useEffect(() => {
		if (!isLoading && visibleRows.length > 0) {
			setTimeout(() => {
				if (lastFocusedRowIndex !== null && lastFocusedRowIndex < visibleRows.length) {
					Spotlight.focus(`discover-row-${lastFocusedRowIndex}`);
					const targetRow = document.querySelector(`[data-row-index="${lastFocusedRowIndex}"]`);
					if (targetRow) {
						targetRow.scrollIntoView({block: 'center'});
					}
				} else {
					Spotlight.focus('discover-row-0');
				}
			}, 100);
		}
	}, [isLoading, visibleRows.length]);

	if (!isEnabled) {
		return (
			<div className={css.container}>
				<div className={css.notConfigured}>
					<p>Jellyseerr is not enabled.</p>
					<p>Go to Settings to configure Jellyseerr.</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<div className={css.container}>
				<div className={css.notConfigured}>
					<p>Jellyseerr is not authenticated.</p>
					<p>Go to Settings to log in to Jellyseerr.</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.container}>
			<div className={css.backdrop}>
				{backdropUrl && (
					<img
						className={css.backdropImage}
						src={backdropUrl}
						alt=""
						style={{filter: settings.backdropBlurHome > 0 ? `blur(${settings.backdropBlurHome}px)` : 'none'}}
					/>
				)}
				<div className={css.backdropOverlay} />
			</div>
			{isLoading ? (
				<LoadingSpinner />
			) : (
				<div className={`${css.mainContent} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`}>
					{/* Detail section for focused item - always present for consistent split view */}
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
							<h2 className={css.detailTitle}>Discover</h2>
						)}
					</div>
					<div className={css.rowsContainer}>
						{visibleRows.map((config, index) => (
							<DiscoverRow
								key={config.id}
								config={config}
								items={rows[config.id] || []}
								rowIndex={index}
								isLoading={rowLoading[config.id]}
								onSelectItem={handleSelectItem}
								onSelectGenre={onSelectGenre}
								onSelectNetwork={onSelectNetwork}
								onSelectStudio={onSelectStudio}
								onFocusItem={handleItemFocus}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								onLoadMore={loadMoreForRow}
								onRowFocus={handleRowFocus}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export default JellyseerrDiscover;
