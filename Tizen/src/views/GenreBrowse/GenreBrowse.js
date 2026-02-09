import {useState, useEffect, useCallback, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId, getPrimaryImageId} from '../../utils/helpers';
import {isBackKey} from '../../utils/tizenKeys';

import css from './GenreBrowse.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const SORT_OPTIONS = [
	{key: 'SortName,Ascending', label: 'Name (A-Z)'},
	{key: 'SortName,Descending', label: 'Name (Z-A)'},
	{key: 'CommunityRating,Descending', label: 'Rating'},
	{key: 'DateCreated,Descending', label: 'Date Added'},
	{key: 'PremiereDate,Descending', label: 'Release Date'},
	{key: 'Random,Ascending', label: 'Random'}
];

const FILTER_OPTIONS = [
	{key: 'all', label: 'All'},
	{key: 'Movie', label: 'Movies'},
	{key: 'Series', label: 'TV Shows'}
];

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const BACKDROP_DEBOUNCE_MS = 300;

const GenreBrowse = ({genre, libraryId, onSelectItem, onBack}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [serverTotalCount, setServerTotalCount] = useState(0);
	const [sortBy, setSortBy] = useState('SortName,Ascending');
	const [filterType, setFilterType] = useState('all');
	const [startLetter, setStartLetter] = useState(null);
	const [backdropUrl, setBackdropUrl] = useState('');
	const [showSortModal, setShowSortModal] = useState(false);
	const [showFilterModal, setShowFilterModal] = useState(false);

	const backdropTimeoutRef = useRef(null);
	const backdropSetRef = useRef(false);
	const pendingBatchesRef = useRef(new Set());
	const itemsRef = useRef([]);
	const loadedRangesRef = useRef([]);
	const currentIndexRef = useRef(0);

	const isRangeLoaded = useCallback((start, end) => {
		return loadedRangesRef.current.some(range =>
			range.start <= start && range.end >= end
		);
	}, []);

	const unloadDistantItems = useCallback((currentIndex) => {
		if (pendingBatchesRef.current.size > 0) return;

		const bufferSize = 300;
		const windowStart = Math.max(0, currentIndex - bufferSize);
		const windowEnd = Math.min(itemsRef.current.length - 1, currentIndex + bufferSize);

		const loadedCount = itemsRef.current.filter(item => item !== null).length;
		if (loadedCount < 600) return;

		let unloadedCount = 0;
		itemsRef.current.forEach((item, index) => {
			if (item && (index < windowStart || index > windowEnd)) {
				itemsRef.current[index] = null;
				unloadedCount++;
			}
		});

		if (unloadedCount > 0) {
			loadedRangesRef.current = loadedRangesRef.current.filter(range =>
				!(range.end < windowStart || range.start > windowEnd)
			).map(range => ({
				start: Math.max(range.start, windowStart),
				end: Math.min(range.end, windowEnd)
			}));
		}
	}, []);

	const loadItems = useCallback(async (startIndex = 0, isReset = false) => {
		if (!genre) return;

		if (!isReset) {
			if (isRangeLoaded(startIndex, startIndex + 99)) {
				return;
			}
			if (pendingBatchesRef.current.has(startIndex)) {
				return;
			}
			pendingBatchesRef.current.add(startIndex);
		}

		try {
			const [sortField, sortOrder] = sortBy.split(',');
			const params = {
				StartIndex: startIndex,
				Limit: 100,
				SortBy: sortField,
				SortOrder: sortOrder,
				Recursive: true,
				Genres: genre.name,
				EnableTotalRecordCount: true,
				CollapseBoxSetItems: false,
				Fields: 'PrimaryImageAspectRatio,ProductionYear,ImageTags,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,SeriesId,SeriesPrimaryImageTag'
			};

			if (libraryId) {
				params.ParentId = libraryId;
			}

			if (filterType !== 'all') {
				params.IncludeItemTypes = filterType;
			} else {
				params.IncludeItemTypes = 'Movie,Series';
			}

			if (startLetter && startLetter !== '#') {
				params.NameStartsWith = startLetter;
			} else if (startLetter === '#') {
				params.NameLessThan = 'A';
			}

			let result;
			let newItems;

			// Check if this is a unified genre (from all servers) or a single-server genre
			if (genre._unifiedGenre) {
				// Query all servers for this genre
				result = await connectionPool.getGenreItemsFromAllServers(params);
				newItems = result.Items || [];
			} else if (genre._serverUrl) {
				// Single cross-server genre
				const effectiveApi = connectionPool.getApiForItem(genre);
				result = await effectiveApi.getItems(params);
				newItems = (result.Items || []).map(item => ({
					...item,
					_serverUrl: genre._serverUrl,
					_serverAccessToken: genre._serverAccessToken,
					_serverUserId: genre._serverUserId,
					_serverName: genre._serverName,
					_serverId: genre._serverId
				}));
			} else {
				// Normal single-server genre
				result = await api.getItems(params);
				newItems = result.Items || [];
			}

			setServerTotalCount(result.TotalRecordCount || 0);

			if (isReset) {
				const sparseArray = new Array(result.TotalRecordCount || 0).fill(null);
				newItems.forEach((item, i) => {
					sparseArray[startIndex + i] = item;
				});
				itemsRef.current = sparseArray;
				loadedRangesRef.current = [{start: startIndex, end: startIndex + newItems.length - 1}];
				setItems([...sparseArray]);
			} else {
				newItems.forEach((item, i) => {
					itemsRef.current[startIndex + i] = item;
				});
				loadedRangesRef.current.push({start: startIndex, end: startIndex + newItems.length - 1});
				loadedRangesRef.current.sort((a, b) => a.start - b.start);
				setItems([...itemsRef.current]);
			}

			if (isReset && newItems.length > 0 && !backdropSetRef.current) {
				const firstItemWithBackdrop = newItems.find(item => getBackdropId(item));
				if (firstItemWithBackdrop) {
					const itemServerUrl = firstItemWithBackdrop._serverUrl || serverUrl;
					const url = getImageUrl(itemServerUrl, getBackdropId(firstItemWithBackdrop), 'Backdrop', {maxWidth: 1920, quality: 100});
					setBackdropUrl(url);
					backdropSetRef.current = true;
				}
			}
		} catch (err) {
			console.error('Failed to load genre items:', err);
		} finally {
			pendingBatchesRef.current.delete(startIndex);
			if (isReset) {
				setIsLoading(false);
			}
		}
	}, [api, genre, libraryId, sortBy, filterType, startLetter, serverUrl, isRangeLoaded]);

	useEffect(() => {
		if (genre) {
			setIsLoading(true);
			setItems([]);
			setServerTotalCount(0);
			itemsRef.current = [];
			loadedRangesRef.current = [];
			pendingBatchesRef.current = new Set();
			currentIndexRef.current = 0;
			backdropSetRef.current = false;
			loadItems(0, true);
		}
	}, [genre, sortBy, filterType, startLetter, loadItems]);

	const updateBackdrop = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const item = itemsRef.current[parseInt(itemIndex, 10)];
		if (!item) return;

		const backdropId = getBackdropId(item);
		if (backdropId) {
			const itemServerUrl = item._serverUrl || serverUrl;
			const url = getImageUrl(itemServerUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});

			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
			backdropTimeoutRef.current = setTimeout(() => {
				setBackdropUrl(url);
			}, BACKDROP_DEBOUNCE_MS);
		}
	}, [serverUrl]);

	const handleItemClick = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const item = itemsRef.current[parseInt(itemIndex, 10)];
		if (item) {
			onSelectItem?.(item);
		}
	}, [onSelectItem]);

	const handleLetterSelect = useCallback((ev) => {
		const letter = ev.currentTarget?.dataset?.letter;
		if (letter) {
			setStartLetter(letter === startLetter ? null : letter);
		}
	}, [startLetter]);

	const handleOpenSortModal = useCallback(() => {
		setShowSortModal(true);
	}, []);

	const handleOpenFilterModal = useCallback(() => {
		setShowFilterModal(true);
	}, []);

	const handleCloseModal = useCallback(() => {
		setShowSortModal(false);
		setShowFilterModal(false);
	}, []);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				if (showSortModal || showFilterModal) {
					setShowSortModal(false);
					setShowFilterModal(false);
				} else {
					onBack?.();
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
		};
	}, [showSortModal, showFilterModal, onBack]);

	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.sortKey;
		if (key) {
			setSortBy(key);
			setShowSortModal(false);
		}
	}, []);

	const handleFilterSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.filterKey;
		if (key) {
			setFilterType(key);
			setShowFilterModal(false);
		}
	}, []);

	const renderItem = useCallback(({index, ...rest}) => {
		const item = itemsRef.current[index];

		currentIndexRef.current = index;

		if (!item) {
			const batchStart = Math.floor(index / 100) * 100;
			if (!isRangeLoaded(batchStart, batchStart + 99) && !pendingBatchesRef.current.has(batchStart)) {
				loadItems(batchStart, false);
			}
		}

		// Periodically unload distant items to free memory (less frequently)
		if (index % 500 === 0 && pendingBatchesRef.current.size === 0) {
			unloadDistantItems(index);
		}

		if (!item) {
			return (
				<div {...rest} className={css.itemCard}>
					<div className={css.posterPlaceholder}>
						<div className={css.loadingPlaceholder} />
					</div>
				</div>
			);
		}

		const imageId = getPrimaryImageId(item);
		const itemServerUrl = item._serverUrl || serverUrl;
		const imageUrl = imageId ? getImageUrl(itemServerUrl, imageId, 'Primary', {maxHeight: 300, quality: 80}) : null;

		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				onClick={handleItemClick}
				onFocus={updateBackdrop}
				data-index={index}
			>
				{imageUrl ? (
					<img
						className={css.poster}
						src={imageUrl}
						alt={item.Name}
						loading="lazy"
					/>
				) : (
					<div className={css.posterPlaceholder}>
						<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
							<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
						</svg>
					</div>
				)}
				<div className={css.itemInfo}>
					<div className={css.itemName}>{item.Name}</div>
					{item.ProductionYear && (
						<div className={css.itemYear}>{item.ProductionYear}</div>
					)}
				</div>
			</SpottableDiv>
		);
	}, [serverUrl, handleItemClick, updateBackdrop, loadItems, isRangeLoaded, unloadDistantItems]);

	const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);
	const currentFilter = FILTER_OPTIONS.find(o => o.key === filterType);

	if (!genre) {
		return (
			<div className={css.page}>
				<div className={css.empty}>No genre selected</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.backdrop}>
				{backdropUrl && (
					<img
						className={css.backdropImage}
						src={backdropUrl}
						alt=""
						style={{
							filter: settings.backdropBlurHome > 0 ? `blur(${settings.backdropBlurHome}px)` : 'none',
							WebkitFilter: settings.backdropBlurHome > 0 ? `blur(${settings.backdropBlurHome}px)` : 'none'
						}}
					/>
				)}
				<div className={css.backdropOverlay} />
			</div>

			<div className={css.content}>
				<div className={css.header}>
					<div className={css.titleSection}>
						<div className={css.title}>{genre.name}</div>
						<div className={css.subtitle}>
							{currentSort?.label} • {currentFilter?.label}
							{startLetter && ` • Starting with "${startLetter}"`}
						</div>
					</div>
					<div className={css.counter}>{serverTotalCount} items</div>
				</div>

				<ToolbarContainer className={css.toolbar} spotlightId="genre-toolbar">
					<SpottableButton
						className={css.sortButton}
						onClick={handleOpenSortModal}
					>
						<svg viewBox="0 0 24 24">
							<path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
						</svg>
						{currentSort?.label}
					</SpottableButton>

					<SpottableButton
						className={css.filterButton}
						onClick={handleOpenFilterModal}
					>
						<svg viewBox="0 0 24 24">
							<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
						</svg>
						{currentFilter?.label}
					</SpottableButton>

					<div className={css.letterNav}>
						{LETTERS.map(letter => (
							<SpottableButton
								key={letter}
								className={`${css.letterButton} ${startLetter === letter ? css.active : ''}`}
								onClick={handleLetterSelect}
								data-letter={letter}
							>
								{letter}
							</SpottableButton>
						))}
					</div>
			</ToolbarContainer>

				<GridContainer className={css.gridContainer}>
					{isLoading && items.length === 0 ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : items.length === 0 ? (
						<div className={css.empty}>No items found</div>
					) : (
						<VirtualGridList
							className={css.grid}
							dataSize={serverTotalCount}
							itemRenderer={renderItem}
							itemSize={{minWidth: 180, minHeight: 340}}
							spacing={20}
							spotlightId="genre-browse-grid"
						/>
					)}
				</GridContainer>
			</div>

			<Popup
				open={showSortModal}
				onClose={handleCloseModal}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.popupContent}>
					<div className={css.modalTitle}>Sort By</div>
					{SORT_OPTIONS.map((option) => (
						<Button
							key={option.key}
							className={css.popupOption}
							selected={sortBy === option.key}
							onClick={handleSortSelect}
							data-sort-key={option.key}
						>
							{option.label}
						</Button>
					))}
				</div>
			</Popup>

			<Popup
				open={showFilterModal}
				onClose={handleCloseModal}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.popupContent}>
					<div className={css.modalTitle}>Filter</div>
					{FILTER_OPTIONS.map((option) => (
						<Button
							key={option.key}
							className={css.popupOption}
							selected={filterType === option.key}
							onClick={handleFilterSelect}
							data-filter-key={option.key}
						>
							{option.label}
						</Button>
					))}
				</div>
			</Popup>
		</div>
	);
};

export default GenreBrowse;
