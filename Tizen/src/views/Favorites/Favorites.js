import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import ProxiedImage from '../../components/ProxiedImage';
import {getImageUrl, getPrimaryImageId} from '../../utils/helpers';

import css from './Favorites.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const ITEMS_PER_PAGE = 12;

const Favorites = ({onSelectItem, onSelectPerson, onBack}) => {
	const {api, serverUrl, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [items, setItems] = useState({
		movies: [],
		shows: [],
		episodes: [],
		people: []
	});
	const [isLoading, setIsLoading] = useState(true);
	const [displayCounts, setDisplayCounts] = useState({
		movies: ITEMS_PER_PAGE,
		shows: ITEMS_PER_PAGE,
		episodes: ITEMS_PER_PAGE,
		people: ITEMS_PER_PAGE
	});
	const scrollerRefs = useRef({});

	const hasResults = useMemo(() => {
		return items.movies.length > 0 ||
			items.shows.length > 0 ||
			items.episodes.length > 0 ||
			items.people.length > 0;
	}, [items]);

	const getVisibleItems = useCallback((itemList, rowId) => {
		const count = displayCounts[rowId] || ITEMS_PER_PAGE;
		return itemList.slice(0, count);
	}, [displayCounts]);

	const visibleRows = useMemo(() => {
		const rows = [];
		if (items.movies.length > 0) rows.push({id: 'movies', title: 'Movies', items: getVisibleItems(items.movies, 'movies'), totalCount: items.movies.length});
		if (items.shows.length > 0) rows.push({id: 'shows', title: 'TV Shows', items: getVisibleItems(items.shows, 'shows'), totalCount: items.shows.length});
		if (items.episodes.length > 0) rows.push({id: 'episodes', title: 'Episodes', items: getVisibleItems(items.episodes, 'episodes'), totalCount: items.episodes.length});
		if (items.people.length > 0) rows.push({id: 'people', title: 'People', items: getVisibleItems(items.people, 'people'), totalCount: items.people.length});
		return rows;
	}, [items, getVisibleItems]);

	const loadMoreItems = useCallback((rowId) => {
		setDisplayCounts(prev => ({
			...prev,
			[rowId]: (prev[rowId] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE
		}));
	}, []);

	const loadItems = useCallback(async () => {
		setIsLoading(true);
		try {
			let allItems;
			if (unifiedMode) {
				allItems = await connectionPool.getFavoritesFromAllServers();
			} else {
				const result = await api.getItems({
					Recursive: true,
					Filters: 'IsFavorite',
					IncludeItemTypes: 'Movie,Series,Episode,Person',
					SortBy: 'SortName',
					SortOrder: 'Ascending',
					Fields: 'PrimaryImageAspectRatio,ProductionYear,ParentIndexNumber,IndexNumber,SeriesName'
				});
				allItems = result.Items || [];
			}

			const categorized = {
				movies: allItems.filter(item => item.Type === 'Movie'),
				shows: allItems.filter(item => item.Type === 'Series'),
				episodes: allItems.filter(item => item.Type === 'Episode'),
				people: allItems.filter(item => item.Type === 'Person')
			};

			setItems(categorized);
		} catch (err) {
			console.error('Failed to load favorites:', err);
		} finally {
			setIsLoading(false);
		}
	}, [api, unifiedMode]);

	useEffect(() => {
		loadItems();
	}, [loadItems]);

	const handleCardClick = useCallback((e) => {
		const card = e.currentTarget;
		const itemId = card.dataset.itemId;
		const itemType = card.dataset.itemType;

		const allItems = [...items.movies, ...items.shows, ...items.episodes, ...items.people];
		const item = allItems.find(i => i.Id === itemId);

		if (item) {
			if (itemType === 'Person') {
				onSelectPerson?.(item);
			} else {
				onSelectItem?.(item);
			}
		}
	}, [items, onSelectItem, onSelectPerson]);

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

	const handleRowKeyDown = useCallback((e) => {
		const rowIndex = parseInt(e.currentTarget.dataset.rowIndex, 10);
		if (e.keyCode === 38) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex === 0) {
				Spotlight.focus('nav-favorites');
			} else if (rowIndex > 0) {
				Spotlight.focus(`favorites-row-${rowIndex - 1}`);
			}
		} else if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex < visibleRows.length - 1) {
				Spotlight.focus(`favorites-row-${rowIndex + 1}`);
			}
		} else if (e.keyCode === 461 || e.keyCode === 8) {
			e.preventDefault();
			onBack?.();
		}
	}, [visibleRows.length, onBack]);

	const renderCard = useCallback((item, index, rowId) => {
		const isPerson = item.Type === 'Person';
		const isEpisode = item.Type === 'Episode';
		const imageId = getPrimaryImageId(item);
		// Support cross-server items with their own server URL
		const itemServerUrl = item._serverUrl || serverUrl;
		const imageUrl = imageId ? getImageUrl(itemServerUrl, imageId, 'Primary') : null;

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
				data-item-type={item.Type}
				spotlightId={`${rowId}-item-${index}`}
			>
				<div className={`${css.cardImageWrapper} ${isPerson ? css.personImageWrapper : ''} ${isEpisode ? css.episodeImageWrapper : ''}`}>
					{unifiedMode && item._serverName && (
						<div className={css.serverBadge}>{item._serverName}</div>
					)}
					{imageUrl ? (
						<ProxiedImage
							className={`${css.cardImage} ${isPerson ? css.personImage : ''}`}
							src={imageUrl}
							alt={item.Name}
						/>
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
		<div className={css.favoritesContainer}>
			<div className={css.header}>
				<h1 className={css.title}>Favorites</h1>
			</div>

			<div className={css.favoritesResults}>
				{isLoading ? (
					<div className={css.loadingIndicator}>
						<LoadingSpinner />
						<p>Loading favorites...</p>
					</div>
				) : !hasResults ? (
					<div className={css.emptyState}>
						<h2>No favorites yet</h2>
						<p>Items you favorite will appear here</p>
					</div>
				) : (
					<div className={css.resultsContainer}>
						{visibleRows.map((row, rowIndex) => (
							<RowContainer
								key={row.id}
								className={css.resultRow}
								spotlightId={`favorites-row-${rowIndex}`}
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
										{row.items.map((item, idx) => renderCard(item, idx, row.id))}
									</div>
								</div>
							</RowContainer>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default Favorites;
