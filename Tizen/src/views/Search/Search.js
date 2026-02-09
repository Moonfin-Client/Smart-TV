import {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useJellyseerr} from '../../context/JellyseerrContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import ProxiedImage from '../../components/ProxiedImage';
import {getImageUrl} from '../../utils/helpers';
import {isBackKey, TIZEN_KEYS} from '../../utils/tizenKeys';

import css from './Search.module.less';

const SpottableInput = Spottable('input');
const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_LENGTH = 2;
const ITEMS_PER_PAGE = 12;
const MAX_SEARCH_RESULTS = 50;

const SearchIcon = () => (
	<svg viewBox="0 0 24 24" fill="currentColor" className={css.searchIcon}>
		<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
	</svg>
);

const Search = ({onSelectItem, onSelectPerson, onBack}) => {
	const {api, serverUrl, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const {isEnabled: jellyseerrEnabled, api: jellyseerrApi} = useJellyseerr();
	const [query, setQuery] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [results, setResults] = useState({
		movies: [],
		shows: [],
		episodes: [],
		people: [],
		jellyseerr: []
	});
	const [displayCounts, setDisplayCounts] = useState({
		movies: ITEMS_PER_PAGE,
		shows: ITEMS_PER_PAGE,
		episodes: ITEMS_PER_PAGE,
		people: ITEMS_PER_PAGE,
		jellyseerr: ITEMS_PER_PAGE
	});
	const debounceRef = useRef(null);
	const scrollerRefs = useRef({});

	const hasResults = useMemo(() => {
		return results.movies.length > 0 ||
			results.shows.length > 0 ||
			results.episodes.length > 0 ||
			results.people.length > 0 ||
			results.jellyseerr.length > 0;
	}, [results]);

	const getVisibleItems = useCallback((items, rowId) => {
		const count = displayCounts[rowId] || ITEMS_PER_PAGE;
		return items.slice(0, count);
	}, [displayCounts]);

	const visibleRows = useMemo(() => {
		const rows = [];
		if (results.movies.length > 0) rows.push({id: 'movies', title: 'Movies', items: getVisibleItems(results.movies, 'movies'), totalCount: results.movies.length, type: 'jellyfin'});
		if (results.shows.length > 0) rows.push({id: 'shows', title: 'TV Shows', items: getVisibleItems(results.shows, 'shows'), totalCount: results.shows.length, type: 'jellyfin'});
		if (results.episodes.length > 0) rows.push({id: 'episodes', title: 'Episodes', items: getVisibleItems(results.episodes, 'episodes'), totalCount: results.episodes.length, type: 'jellyfin'});
		if (results.people.length > 0) rows.push({id: 'people', title: 'People', items: getVisibleItems(results.people, 'people'), totalCount: results.people.length, type: 'jellyfin'});
		if (results.jellyseerr.length > 0) rows.push({id: 'jellyseerr', title: 'Jellyseerr', items: getVisibleItems(results.jellyseerr, 'jellyseerr'), totalCount: results.jellyseerr.length, type: 'jellyseerr'});
		return rows;
	}, [results, getVisibleItems]);

	const loadMoreItems = useCallback((rowId) => {
		setDisplayCounts(prev => ({
			...prev,
			[rowId]: (prev[rowId] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE
		}));
	}, []);

	const doSearch = useCallback(async (searchQuery) => {
		if (!searchQuery || searchQuery.length < MIN_SEARCH_LENGTH) {
			setResults({movies: [], shows: [], episodes: [], people: [], jellyseerr: []});
			setDisplayCounts({
				movies: ITEMS_PER_PAGE,
				shows: ITEMS_PER_PAGE,
				episodes: ITEMS_PER_PAGE,
				people: ITEMS_PER_PAGE,
				jellyseerr: ITEMS_PER_PAGE
			});
			return;
		}

		setIsLoading(true);
		setDisplayCounts({
			movies: ITEMS_PER_PAGE,
			shows: ITEMS_PER_PAGE,
			episodes: ITEMS_PER_PAGE,
			people: ITEMS_PER_PAGE,
			jellyseerr: ITEMS_PER_PAGE
		});

		try {
			let items;
			if (unifiedMode) {
				// Search all servers in unified mode
				items = await connectionPool.searchAllServers(searchQuery, MAX_SEARCH_RESULTS);
			} else {
				const result = await api.search(searchQuery, MAX_SEARCH_RESULTS);
				items = result.Items || [];
			}

			const categorized = {
				movies: items.filter(item => item.Type === 'Movie'),
				shows: items.filter(item => item.Type === 'Series'),
				episodes: items.filter(item => item.Type === 'Episode'),
				people: items.filter(item => item.Type === 'Person'),
				jellyseerr: []
			};

			setResults(categorized);

			if (jellyseerrEnabled && jellyseerrApi) {
				try {
					const jellyseerrResponse = await jellyseerrApi.search(searchQuery);
					const filteredResults = (jellyseerrResponse.results || [])
						.filter(item => item.mediaType !== 'person')
						.slice(0, 20);
					setResults(prev => ({...prev, jellyseerr: filteredResults}));
				} catch (err) {
					console.error('Jellyseerr search failed:', err);
				}
			}
		} catch (err) {
			console.error('Search failed:', err);
			setResults({movies: [], shows: [], episodes: [], people: [], jellyseerr: []});
		} finally {
			setIsLoading(false);
		}
	}, [api, jellyseerrEnabled, jellyseerrApi, unifiedMode]);

	const handleInputChange = useCallback((e) => {
		const value = e.target.value;
		setQuery(value);

		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		debounceRef.current = setTimeout(() => {
			doSearch(value);
		}, SEARCH_DEBOUNCE_MS);
	}, [doSearch]);

	const handleInputKeyDown = useCallback((e) => {
		if (e.keyCode === TIZEN_KEYS.DOWN) {
			e.preventDefault();
			if (visibleRows.length > 0) {
				Spotlight.focus('search-row-0');
			}
		} else if (e.keyCode === TIZEN_KEYS.UP) {
			e.preventDefault();
		} else if (isBackKey(e)) {
			if (!query) {
				e.preventDefault();
				onBack?.();
			}
		}
	}, [visibleRows.length, query, onBack]);

	const handleRowKeyDown = useCallback((e) => {
		const rowIndex = parseInt(e.currentTarget.dataset.rowIndex, 10);
		if (e.keyCode === TIZEN_KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex === 0) {
				Spotlight.focus('search-input');
			} else {
				Spotlight.focus(`search-row-${rowIndex - 1}`);
			}
		} else if (e.keyCode === TIZEN_KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex < visibleRows.length - 1) {
				Spotlight.focus(`search-row-${rowIndex + 1}`);
			}
		} else if (isBackKey(e)) {
			e.preventDefault();
			onBack?.();
		}
	}, [visibleRows.length, onBack]);

	const handleClearSearch = useCallback(() => {
		setQuery('');
		setResults({movies: [], shows: [], episodes: [], people: [], jellyseerr: []});
	}, []);

	const handleCardClick = useCallback((e) => {
		const card = e.currentTarget;
		const itemId = card.dataset.itemId;
		const itemType = card.dataset.itemType;
		const isJellyseerr = itemType === 'jellyseerr';

		if (isJellyseerr) {
			const jellyseerrItem = results.jellyseerr.find(item => String(item.id) === itemId);
			if (jellyseerrItem) {
				onSelectItem?.({
					...jellyseerrItem,
					isJellyseerr: true,
					Id: jellyseerrItem.id,
					Name: jellyseerrItem.title || jellyseerrItem.name,
					Type: jellyseerrItem.mediaType === 'movie' ? 'Movie' : 'Series'
				});
			}
		} else {
			const allItems = [...results.movies, ...results.shows, ...results.episodes, ...results.people];
			const item = allItems.find(i => i.Id === itemId);
			if (item) {
				if (item.Type === 'Person') {
					onSelectPerson?.(item);
				} else {
					onSelectItem?.(item);
				}
			}
		}
	}, [results, onSelectItem, onSelectPerson]);

	const handleRowFocus = useCallback((rowId, totalCount) => {
		return (e) => {
			const card = e.target.closest('[data-spotlight-id]');
			const scroller = scrollerRefs.current[rowId];
			if (card && scroller) {
				const cardRect = card.getBoundingClientRect();
				const scrollerRect = scroller.getBoundingClientRect();
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			}

			const spotlightId = card?.dataset?.spotlightId || '';
			const match = spotlightId.match(/item-(\d+)$/);
			if (match) {
				const itemIndex = parseInt(match[1], 10);
				const currentDisplayCount = displayCounts[rowId] || ITEMS_PER_PAGE;
				if (itemIndex >= currentDisplayCount - 3 && currentDisplayCount < totalCount) {
					loadMoreItems(rowId);
				}
			}
		};
	}, [displayCounts, loadMoreItems]);

	useEffect(() => {
		setTimeout(() => {
			Spotlight.focus('search-input');
		}, 100);
	}, []);

	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	const renderJellyseerrCard = useCallback((item, index, rowId) => {
		const imageUrl = item.posterPath
			? `https://image.tmdb.org/t/p/w300${item.posterPath}`
			: null;
		const year = item.releaseDate
			? new Date(item.releaseDate).getFullYear()
			: item.firstAirDate
				? new Date(item.firstAirDate).getFullYear()
				: '';

		return (
			<SpottableDiv
				key={`jellyseerr-${item.id}`}
				className={css.card}
				onClick={handleCardClick}
				data-item-id={String(item.id)}
				data-item-type="jellyseerr"
				spotlightId={`${rowId}-item-${index}`}
			>
				<div className={css.cardImageWrapper}>
					{imageUrl ? (
						<ProxiedImage className={css.cardImage} src={imageUrl} alt={item.title || item.name} />
					) : (
						<div className={css.cardPlaceholder}>
							{item.mediaType === 'movie' ? '🎬' : '📺'}
						</div>
					)}
				</div>
				<div className={css.cardInfo}>
					<div className={css.cardTitle}>{item.title || item.name}</div>
					<div className={css.cardSubtitle}>{year}</div>
				</div>
			</SpottableDiv>
		);
	}, [handleCardClick]);

	const renderJellyfinCard = useCallback((item, index, rowId) => {
		const isPerson = item.Type === 'Person';
		const isEpisode = item.Type === 'Episode';
		const hasImage = item.ImageTags?.Primary || item.PrimaryImageTag;
		// Support cross-server items with their own server URL
		const itemServerUrl = item._serverUrl || serverUrl;
		const imageUrl = hasImage ? getImageUrl(itemServerUrl, item.Id, 'Primary') : null;

		let subtitle = '';
		if (isEpisode) {
			subtitle = `${item.SeriesName || ''} S${item.ParentIndexNumber || '?'}E${item.IndexNumber || '?'}`;
		} else if (isPerson) {
			subtitle = 'Person';
		} else {
			subtitle = item.ProductionYear || '';
		}

		return (
			<SpottableDiv
				key={item.Id}
				className={`${css.card} ${isPerson ? css.personCard : ''} ${isEpisode ? css.episodeCard : ''}`}
				onClick={handleCardClick}
				data-item-id={item.Id}
				data-item-type="jellyfin"
				spotlightId={`${rowId}-item-${index}`}
			>
				<div className={`${css.cardImageWrapper} ${isPerson ? css.personImageWrapper : ''} ${isEpisode ? css.episodeImageWrapper : ''}`}>				{unifiedMode && item._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
				)}					{imageUrl ? (
						<img className={`${css.cardImage} ${isPerson ? css.personImage : ''}`} src={imageUrl} alt={item.Name} />
					) : (
						<div className={css.cardPlaceholder}>{isPerson ? '👤' : '🎬'}</div>
					)}
				</div>
				<div className={css.cardInfo}>
					<div className={css.cardTitle}>{item.Name}</div>
					<div className={css.cardSubtitle}>{subtitle}</div>
				</div>
			</SpottableDiv>
		);
	}, [serverUrl, handleCardClick, unifiedMode]);

	return (
		<div className={css.searchContainer}>
			<div className={css.searchInputSection}>
				<div className={css.searchInputWrapper}>
					<SearchIcon />
					<SpottableInput
						type="text"
						className={css.searchInput}
						placeholder="Search movies, shows, episodes, and people..."
						value={query}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						spotlightId="search-input"
						autoComplete="off"
					/>
					{query && (
						<button className={css.clearBtn} onClick={handleClearSearch}>
							×
						</button>
					)}
				</div>
			</div>

			<div className={css.searchResults}>
				{isLoading ? (
					<div className={css.loadingIndicator}>
						<LoadingSpinner />
						<p>Searching...</p>
					</div>
				) : !query || query.length < MIN_SEARCH_LENGTH ? (
					<div className={css.emptyState}>
						<SearchIcon />
						<h2>Search for content</h2>
						<p>Find movies, TV shows, episodes, and cast members</p>
					</div>
				) : !hasResults ? (
					<div className={css.noResults}>
						<h2>No results found</h2>
						<p>Try a different search term</p>
					</div>
				) : (
					<div className={css.resultsContainer}>
						{visibleRows.map((row, rowIndex) => {
							return (
								<RowContainer
									key={row.id}
									className={css.resultRow}
									spotlightId={`search-row-${rowIndex}`}
									data-row-index={rowIndex}
									onKeyDown={handleRowKeyDown}
								>
									<h2 className={css.rowTitle}>
										{row.title}
										{row.items.length < row.totalCount && (
											<span className={css.rowCount}> ({row.items.length}/{row.totalCount})</span>
										)}
									</h2>
									<div
										className={css.rowScroller}
										ref={(el) => {scrollerRefs.current[row.id] = el;}}
										onFocus={handleRowFocus(row.id, row.totalCount)}
									>
										<div className={css.resultItems}>
											{row.type === 'jellyseerr'
												? row.items.map((item, idx) => renderJellyseerrCard(item, idx, row.id))
												: row.items.map((item, idx) => renderJellyfinCard(item, idx, row.id))
											}
										</div>
									</div>
								</RowContainer>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

export default Search;
