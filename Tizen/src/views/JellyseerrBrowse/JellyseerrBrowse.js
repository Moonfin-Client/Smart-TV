import {useState, useEffect, useCallback, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import {useJellyseerr} from '../../context/JellyseerrContext';
import {useSettings} from '../../context/SettingsContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import * as jellyseerrApi from '../../services/jellyseerrApi';
import {isBackKey} from '../../utils/tizenKeys';

import css from './JellyseerrBrowse.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const FILTER_OPTIONS = [
	{key: 'movie', label: 'Movies'},
	{key: 'tv', label: 'TV Shows'}
];

const BACKDROP_DEBOUNCE_MS = 300;
const MAX_PAGES = 25;

/**
 * JellyseerrBrowse - Browse Jellyseerr content by genre, studio, or keyword
 *
 * @param {Object} props
 * @param {string} props.browseType - 'genre', 'studio', 'network', or 'keyword'
 * @param {Object} props.item - The item to browse (must have id and name)
 * @param {string} props.mediaType - 'movie' or 'tv' (default determined by browseType)
 * @param {Function} props.onSelectItem - Callback when an item is selected
 * @param {Function} props.onBack - Callback to go back
 */
const JellyseerrBrowse = ({browseType, item, mediaType: initialMediaType, onSelectItem, onBack}) => {
	const {isEnabled} = useJellyseerr();
	const {settings} = useSettings();
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [totalCount, setTotalCount] = useState(0);
	const [mediaType, setMediaType] = useState(() => {
		// Studios are movies only, networks are TV only
		if (browseType === 'studio') return 'movie';
		if (browseType === 'network') return 'tv';
		return initialMediaType || 'movie';
	});
	const [backdropUrl, setBackdropUrl] = useState('');
	const [showFilterModal, setShowFilterModal] = useState(false);

	const backdropTimeoutRef = useRef(null);
	const backdropSetRef = useRef(false);
	const loadingMoreRef = useRef(false);
	const loadCooldownRef = useRef(false);
	const itemsRef = useRef([]);
	const totalPagesRef = useRef(1);
	const currentPageRef = useRef(1);

	const loadItems = useCallback(async (page = 1, append = false) => {
		if (!item || !isEnabled) return;

		if (append && loadingMoreRef.current) return;

		if (append) {
			loadingMoreRef.current = true;
		}

		try {
			let result;

			switch (browseType) {
				case 'genre':
					result = await jellyseerrApi.discoverByGenre(mediaType, item.id, page);
					break;
				case 'studio':
					result = await jellyseerrApi.discoverByStudio(item.id, page);
					break;
				case 'network':
					result = await jellyseerrApi.discoverByNetwork(item.id, page);
					break;
				case 'keyword':
					result = await jellyseerrApi.discoverByKeyword(mediaType, item.id, page);
					break;
				default:
					console.error('Unknown browse type:', browseType);
					return;
			}

			const newItems = result.results || [];
			totalPagesRef.current = result.totalPages || 1;

			setItems(prev => {
				const updatedItems = append ? [...prev, ...newItems] : newItems;
				itemsRef.current = updatedItems;
				return updatedItems;
			});
			setTotalCount(result.totalResults || 0);
			currentPageRef.current = page;

			if (!append && newItems.length > 0 && !backdropSetRef.current) {
				const firstItemWithBackdrop = newItems.find(i => i.backdropPath);
				if (firstItemWithBackdrop) {
					const url = jellyseerrApi.getImageUrl(firstItemWithBackdrop.backdropPath, 'w1280');
					setBackdropUrl(url);
					backdropSetRef.current = true;
				}
			}
		} catch (err) {
			console.error('Failed to load items:', err);
		} finally {
			setIsLoading(false);
			loadingMoreRef.current = false;
			if (append) {
				loadCooldownRef.current = true;
				setTimeout(() => {
					loadCooldownRef.current = false;
				}, 500);
			}
		}
	}, [item, isEnabled, browseType, mediaType]);

	useEffect(() => {
		if (item && isEnabled) {
			setIsLoading(true);
			setItems([]);
			itemsRef.current = [];
			backdropSetRef.current = false;
			loadingMoreRef.current = false;
			currentPageRef.current = 1;

			const loadInitialPages = async () => {
				for (let page = 1; page <= 3; page++) {
					await loadItems(page, page > 1);
					if (page >= totalPagesRef.current) break;
				}
			};
			loadInitialPages();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item, isEnabled, mediaType]);

	const updateBackdrop = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const mediaItem = itemsRef.current[parseInt(itemIndex, 10)];
		if (!mediaItem) return;

		if (mediaItem.backdropPath) {
			const url = jellyseerrApi.getImageUrl(mediaItem.backdropPath, 'w1280');

			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
			backdropTimeoutRef.current = setTimeout(() => {
				setBackdropUrl(url);
			}, BACKDROP_DEBOUNCE_MS);
		}
	}, []);

	const handleItemClick = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const mediaItem = itemsRef.current[parseInt(itemIndex, 10)];
		if (mediaItem) {
			// Format like JellyseerrDiscover does - determine type from item properties
			const type = mediaItem.media_type || mediaItem.mediaType || (mediaItem.title ? 'movie' : 'tv');
			onSelectItem?.({
				mediaId: mediaItem.id,
				mediaType: type
			});
		}
	}, [onSelectItem]);

	const handleCloseModal = useCallback(() => {
		setShowFilterModal(false);
	}, []);

	const handleOpenFilterModal = useCallback(() => {
		setShowFilterModal(true);
	}, []);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				if (showFilterModal) {
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
	}, [showFilterModal, onBack]);

	const handleFilterSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.filterKey;
		if (key) {
			setMediaType(key);
			setShowFilterModal(false);
		}
	}, []);

	const renderItem = useCallback(({index, ...rest}) => {
		const mediaItem = itemsRef.current[index];

		const itemsLoaded = itemsRef.current.length;
		const nearEnd = index >= itemsLoaded - 10;
		const hasMorePages = currentPageRef.current < totalPagesRef.current;
		const underMaxPages = currentPageRef.current < MAX_PAGES;

		if (nearEnd && hasMorePages && underMaxPages && !loadingMoreRef.current && !loadCooldownRef.current) {
			loadItems(currentPageRef.current + 1, true);
		}

		if (!mediaItem) return null;

		const imageUrl = mediaItem.posterPath
			? jellyseerrApi.getImageUrl(mediaItem.posterPath, 'w300')
			: null;

		const title = mediaItem.title || mediaItem.name;
		const year = mediaItem.releaseDate?.substring(0, 4) || mediaItem.firstAirDate?.substring(0, 4);
		const itemMediaType = mediaItem.media_type || mediaItem.mediaType || mediaType;
		const status = mediaItem.mediaInfo?.status;

		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				onClick={handleItemClick}
				onFocus={updateBackdrop}
				data-index={index}
			>
				<div className={css.posterWrapper}>
					{imageUrl ? (
						<img
							className={css.poster}
							src={imageUrl}
							alt={title}
							loading="lazy"
						/>
					) : (
						<div className={css.posterPlaceholder}>
							<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
								<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
							</svg>
						</div>
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
				<div className={css.itemInfo}>
					<div className={css.itemName}>{title}</div>
					{year && (
						<div className={css.itemYear}>{year}</div>
					)}
				</div>
			</SpottableDiv>
		);
	}, [handleItemClick, updateBackdrop, loadItems, mediaType]);

	const currentFilter = FILTER_OPTIONS.find(o => o.key === mediaType);

	// Check if we should show the filter (not for studio/network which are media-type specific)
	const showMediaTypeFilter = browseType === 'genre' || browseType === 'keyword';

	const getBrowseTypeLabel = () => {
		switch (browseType) {
			case 'genre': return 'Genre';
			case 'studio': return 'Studio';
			case 'network': return 'Network';
			case 'keyword': return 'Keyword';
			default: return 'Browse';
		}
	};

	if (!item) {
		return (
			<div className={css.page}>
				<div className={css.empty}>No {getBrowseTypeLabel().toLowerCase()} selected</div>
			</div>
		);
	}

	if (!isEnabled) {
		return (
			<div className={css.page}>
				<div className={css.empty}>Jellyseerr is not configured</div>
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
						<div className={css.browseTypeLabel}>{getBrowseTypeLabel()}</div>
						<div className={css.title}>{item.name}</div>
						<div className={css.subtitle}>
							{currentFilter?.label}
							{totalCount > 0 && ` • ${totalCount} items`}
						</div>
					</div>
				</div>

				{showMediaTypeFilter && (
					<div className={css.toolbar}>
						<SpottableButton
							className={css.filterButton}
							onClick={handleOpenFilterModal}
						>
							<svg viewBox="0 0 24 24">
								<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
							</svg>
							{currentFilter?.label}
						</SpottableButton>
					</div>
				)}

				<div className={css.gridContainer}>
					{isLoading && items.length === 0 ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : items.length === 0 ? (
						<div className={css.empty}>No items found</div>
					) : (
						<VirtualGridList
							className={css.grid}
							dataSize={items.length}
							itemRenderer={renderItem}
							itemSize={{minWidth: 180, minHeight: 340}}
							spacing={20}
							spotlightId="jellyseerr-browse-grid"
						/>
					)}
				</div>
			</div>

			<Popup
				open={showFilterModal}
				onClose={handleCloseModal}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.popupContent}>
					<div className={css.modalTitle}>Media Type</div>
					{FILTER_OPTIONS.map((option) => (
						<Button
							key={option.key}
							className={css.popupOption}
							selected={mediaType === option.key}
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

export default JellyseerrBrowse;
