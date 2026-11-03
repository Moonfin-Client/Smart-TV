import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import $L from '@enact/i18n/$L';
import {useSeerr} from '../../context/SeerrContext';
import {useSettings} from '../../context/SettingsContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle} from '../../components/seerr/SeerrStatusBanner';
import * as seerrApi from '../../services/seerrApi';
import {POSTER_HEIGHTS, POSTER_SIZE_OPTIONS, seerrPosterSize} from '../../utils/gridChrome';
import {CORE_ICON_PATHS} from '../Settings/settingsCoreIcons';
import {buildSeerrDiscoverParams, getSeerrSortOptions, getSeerrTvStatusOptions, getSeerrMinRatingOptions, getSeerrMinVoteOptions, getSeerrRuntimeOptions, getSeerrReleaseOptions, hasSeerrDiscoverFilters} from '../../utils/seerrBrowseFilters';
import {browseStateKey, readBrowseState, writeBrowseState} from './seerrBrowseState';
import {BrowseDialog, CheckTile, ClearFiltersTile, DialogDivider, DialogSubtitle, DialogTitle, ExpanderTile, RadioTile, SectionHeader, SortArrow} from './SeerrBrowseDialogs';

import css from './SeerrBrowse.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

let _filterOptions;
const getFilterOptions = () => (_filterOptions ??= [
	{key: 'movie', label: $L('Movies')},
	{key: 'tv', label: $L('TV Shows')}
]);

const BACKDROP_DEBOUNCE_MS = 300;
const MAX_PAGES = 25;

/**
 * SeerrBrowse - Browse Seerr content by genre, studio, or keyword
 *
 * @param {Object} props
 * @param {string} props.browseType - 'genre', 'studio', 'network', or 'keyword'
 * @param {Object} props.item - The item to browse (must have id and name)
 * @param {string} props.mediaType - 'movie' or 'tv' (default determined by browseType)
 * @param {Function} props.onSelectItem - Callback when an item is selected
 * @param {Function} props.onBack - Callback to go back
 */
const SeerrBrowse = ({browseType, item, mediaType: initialMediaType, onSelectItem, backHandlerRef}) => {
	const {isEnabled} = useSeerr();
	const {settings, updateSetting} = useSettings();
	const badgeStyle = seerrBadgeStyle(settings);
	const posterSize = seerrPosterSize(settings);
	const posterHeight = POSTER_HEIGHTS[posterSize];
	// The card's margin and the title and year under the poster ride on top of the poster size.
	const gridItemSize = useMemo(() => (
		{minWidth: Math.round(posterHeight * 2 / 3) + 20, minHeight: posterHeight + 70}
	), [posterHeight]);
	const stateKey = useMemo(
		() => browseStateKey(browseType, item, initialMediaType),
		[browseType, item, initialMediaType]
	);
	// Read once on mount. Later writes must not feed back into what seeded them.
	const savedRef = useRef(readBrowseState(stateKey));
	const saved = savedRef.current;
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [totalCount, setTotalCount] = useState(0);
	const [mediaType, setMediaType] = useState(() => {
		if (saved?.mediaType) return saved.mediaType;
		// Studios are movies only, networks are TV only
		if (browseType === 'studio') return 'movie';
		if (browseType === 'network') return 'tv';
		return initialMediaType || 'movie';
	});
	const [initialLoadDone, setInitialLoadDone] = useState(false);
	const [backdropUrl, setBackdropUrl] = useState('');
	const [showFilterModal, setShowFilterModal] = useState(false);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [sortBy, setSortBy] = useState(saved?.sortBy || 'popularity.desc');
	const [genreIds, setGenreIds] = useState(saved?.genreIds || []);
	const [tvStatuses, setTvStatuses] = useState(saved?.tvStatuses || []);
	const [language, setLanguage] = useState(saved?.language || '');
	const [minRating, setMinRating] = useState(saved?.minRating || '');
	const [minVotes, setMinVotes] = useState(saved?.minVotes || '');
	const [runtime, setRuntime] = useState(saved?.runtime || '');
	const [released, setReleased] = useState(saved?.released || '');
	const [filterGenres, setFilterGenres] = useState([]);
	const [filterLanguages, setFilterLanguages] = useState([]);
	const [genresExpanded, setGenresExpanded] = useState(false);
	const [languagesExpanded, setLanguagesExpanded] = useState(false);
	const filterOptionsRequestedRef = useRef(false);

	const backdropTimeoutRef = useRef(null);
	const backdropSetRef = useRef(false);
	const loadingMoreRef = useRef(false);
	const loadCooldownRef = useRef(false);
	const itemsRef = useRef([]);
	const totalPagesRef = useRef(1);
	const currentPageRef = useRef(1);
	const scrollToRef = useRef(null);
	const restoredRef = useRef(false);
	const getScrollTo = useCallback((fn) => {
		scrollToRef.current = fn;
	}, []);

	const loadItems = useCallback(async (page = 1, append = false) => {
		if (!item || !isEnabled) return;

		if (append && loadingMoreRef.current) return;

		if (append) {
			loadingMoreRef.current = true;
		}

		try {
			const params = {
				page,
				sortBy,
				...buildSeerrDiscoverParams({
					routeGenreId: browseType === 'genre' ? item.id : undefined,
					genreIds,
					tvStatuses,
					language,
					minRating,
					minVotes,
					runtime,
					released
				})
			};
			if (browseType === 'studio') params.studio = item.id;
			if (browseType === 'network') params.network = item.id;
			if (browseType === 'keyword') params.keywords = item.id;
			const result = await seerrApi.discoverFiltered(mediaType, params);

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
					const url = seerrApi.getImageUrl(firstItemWithBackdrop.backdropPath, 'w1280');
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
				setTimeout(() => { loadCooldownRef.current = false; }, 500);
			}
		}
	}, [item, isEnabled, browseType, mediaType, sortBy, genreIds, tvStatuses, language, minRating, minVotes, runtime, released]);

	useEffect(() => {
		writeBrowseState(stateKey, {
			mediaType, sortBy, genreIds, tvStatuses, language, minRating, minVotes, runtime, released
		});
	}, [stateKey, mediaType, sortBy, genreIds, tvStatuses, language, minRating, minVotes, runtime, released]);

	useEffect(() => {
		if (item && isEnabled) {
			setIsLoading(true);
			setItems([]);
			itemsRef.current = [];
			backdropSetRef.current = false;
			loadingMoreRef.current = false;
			currentPageRef.current = 1;

			// Coming back to a screen that had been paged through reloads as far as
			// it had reached, otherwise the item it was left on is not there to
			// return to.
			const lastPage = restoredRef.current ? 3 : Math.min(savedRef.current?.pagesLoaded || 3, MAX_PAGES);

			const loadInitialPages = async () => {
				for (let page = 1; page <= lastPage; page++) {
					await loadItems(page, page > 1);
					if (page >= totalPagesRef.current) break;
				}
				setInitialLoadDone(true);
			};
			setInitialLoadDone(false);
			loadInitialPages();
		}
	}, [item, isEnabled, mediaType, loadItems]);

	// Once the list is back, put focus on the item that was opened. Scrolling to
	// it is what brings the grid back to where it was left.
	useEffect(() => {
		if (restoredRef.current || !initialLoadDone) return;
		restoredRef.current = true;
		const focusedId = savedRef.current?.focusedId;
		if (!focusedId) return;
		const index = itemsRef.current.findIndex((i) => i.id === focusedId);
		if (index < 0 || !scrollToRef.current) return;
		scrollToRef.current({index, animate: false, focus: true});
	}, [initialLoadDone]);

	const updateBackdrop = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const mediaItem = itemsRef.current[parseInt(itemIndex, 10)];
		if (!mediaItem) return;

		if (mediaItem.backdropPath) {
			const url = seerrApi.getImageUrl(mediaItem.backdropPath, 'w1280');

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
			const type = mediaItem.media_type || mediaItem.mediaType || (mediaItem.title ? 'movie' : 'tv');
			writeBrowseState(stateKey, {
				focusedId: mediaItem.id,
				pagesLoaded: currentPageRef.current
			});
			onSelectItem?.({
				mediaId: mediaItem.id,
				mediaType: type
			});
		}
	}, [onSelectItem, stateKey]);

	const handleCloseModal = useCallback(() => {
		setShowFilterModal(false);
	}, []);

	// The genre and language lists are only read once the panel opens, so a
	// browse that never opens it costs nothing extra.
	const loadFilterOptions = useCallback(async () => {
		if (filterOptionsRequestedRef.current) return;
		filterOptionsRequestedRef.current = true;
		const [genres, languages] = await Promise.all([
			(mediaType === 'tv' ? seerrApi.getGenreSliderTv() : seerrApi.getGenreSliderMovies()).catch(() => []),
			seerrApi.getLanguages().catch(() => [])
		]);
		setFilterGenres(genres || []);
		setFilterLanguages((languages || [])
			.filter((l) => l.iso_639_1)
			.map((l) => ({code: l.iso_639_1, name: l.english_name || l.name || l.iso_639_1}))
			.sort((a, b) => a.name.localeCompare(b.name)));
	}, [mediaType]);

	const handleOpenFilterModal = useCallback(() => {
		loadFilterOptions();
		setGenresExpanded(false);
		setLanguagesExpanded(false);
		setShowFilterModal(true);
	}, [loadFilterOptions]);

	const handleOpenSettingsModal = useCallback(() => setShowSettingsModal(true), []);
	const handleCloseSettingsModal = useCallback(() => setShowSettingsModal(false), []);

	const handlePosterSizeSelect = useCallback((ev) => {
		updateSetting('seerrPosterSize', ev.currentTarget.dataset.size);
		setShowSettingsModal(false);
	}, [updateSetting]);

	useEffect(() => {
		if (!backHandlerRef) return;
		const handler = () => {
			if (showFilterModal) {
				setShowFilterModal(false);
				return true;
			}
			if (showSettingsModal) {
				setShowSettingsModal(false);
				return true;
			}
			return false;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, showFilterModal, showSettingsModal]);

	useEffect(() => {
		return () => {
			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
		};
	}, []);

	const handleFilterSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.filterKey;
		if (key) {
			setMediaType(key);
			setShowFilterModal(false);
		}
	}, []);

	// Genres and statuses belong to one media type, so switching type drops
	// them and refetches the genre list on the next panel open.
	useEffect(() => {
		filterOptionsRequestedRef.current = false;
		setFilterGenres([]);
		setGenreIds([]);
		setTvStatuses([]);
	}, [mediaType]);

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
			? seerrApi.getImageUrl(mediaItem.posterPath, 'w300')
			: null;

		const title = mediaItem.title || mediaItem.name;
		const year = mediaItem.releaseDate?.substring(0, 4) || mediaItem.firstAirDate?.substring(0, 4);
		const itemMediaType = mediaItem.media_type || mediaItem.mediaType || mediaType;
		const status = mediaItem.mediaInfo?.status;
		const banner = badgeStyle === 'banner' && hasSeerrDot(status);

		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				onClick={handleItemClick}
				onFocus={updateBackdrop}
				data-index={index}
			>
				<div className={`${css.posterWrapper}${banner ? ' ' + css.underSeerrBanner : ''}`} style={{height: posterHeight}}>
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
					{banner && <SeerrStatusBanner status={status} className={css.seerrBanner} />}
					{/* Media type badge - top left */}
					{itemMediaType && (
						<div className={`${css.mediaTypeBadge} ${itemMediaType === 'movie' ? css.movieBadge : css.seriesBadge}`}>
							{itemMediaType === 'movie' ? $L('Movie') : $L('Series')}
						</div>
					)}
					{/* Availability badge - top right */}
					{badgeStyle === 'badge' && [3, 4, 5].includes(status) && (
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
	}, [handleItemClick, updateBackdrop, loadItems, mediaType, posterHeight, badgeStyle]);

	const currentFilter = getFilterOptions().find(o => o.key === mediaType);

	// Check if we should show the filter (not for studio/network which are media-type specific)
	const showMediaTypeFilter = browseType === 'genre' || browseType === 'keyword' || browseType === 'all';

	const getBrowseTypeLabel = () => {
		switch (browseType) {
			case 'genre': return $L('Genre');
			case 'studio': return $L('Studio');
			case 'network': return $L('Network');
			case 'keyword': return $L('Keyword');
			default: return $L('Browse');
		}
	};

	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.sortKey;
		if (!key) return;
		const option = getSeerrSortOptions(mediaType).find((o) => o.key === key);
		if (!option) return;
		// Reselecting the active axis flips its direction.
		if (sortBy.startsWith(key + '.')) {
			const flipped = sortBy.endsWith('.asc') ? `${key}.desc` : `${key}.asc`;
			setSortBy(flipped);
		} else {
			setSortBy(option.defaultValue);
		}
		setShowFilterModal(false);
	}, [mediaType, sortBy]);

	const handleGenreToggle = useCallback((ev) => {
		const id = parseInt(ev.currentTarget?.dataset?.genreId, 10);
		if (!Number.isFinite(id)) return;
		setGenreIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
	}, []);

	const handleTvStatusToggle = useCallback((ev) => {
		const key = parseInt(ev.currentTarget?.dataset?.statusKey, 10);
		if (!Number.isFinite(key)) return;
		setTvStatuses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
	}, []);

	const handleLanguageSelect = useCallback((ev) => {
		setLanguage(ev.currentTarget?.dataset?.languageCode || '');
	}, []);

	const handleMinRatingSelect = useCallback((ev) => {
		setMinRating(ev.currentTarget?.dataset?.optionKey || '');
	}, []);

	const handleMinVotesSelect = useCallback((ev) => {
		setMinVotes(ev.currentTarget?.dataset?.optionKey || '');
	}, []);

	const handleRuntimeSelect = useCallback((ev) => {
		setRuntime(ev.currentTarget?.dataset?.optionKey || '');
	}, []);

	const handleReleasedSelect = useCallback((ev) => {
		setReleased(ev.currentTarget?.dataset?.optionKey || '');
	}, []);

	const handleToggleGenres = useCallback(() => {
		setGenresExpanded((prev) => !prev);
	}, []);

	const handleToggleLanguages = useCallback(() => {
		setLanguagesExpanded((prev) => !prev);
	}, []);

	const handleClearFilters = useCallback(() => {
		setGenreIds([]);
		setTvStatuses([]);
		setLanguage('');
		setMinRating('');
		setMinVotes('');
		setRuntime('');
		setReleased('');
		setShowFilterModal(false);
	}, []);

	const filterState = {genreIds, tvStatuses, language, minRating, minVotes, runtime, released};

	if (!item) {
		return (
			<div className={css.page}>
				<div className={css.empty}>{$L('Nothing selected')}</div>
			</div>
		);
	}

	if (!isEnabled) {
		return (
			<div className={css.page}>
				<div className={css.empty}>{$L('Seerr is not configured')}</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			{settings.showHomeBackdrop !== false && (
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
			)}

			<div className={css.content}>
				<div className={css.header}>
					<div className={css.titleSection}>
						<div className={css.browseTypeLabel}>{getBrowseTypeLabel()}</div>
						<div className={css.title}>{item.name}</div>
						<div className={css.subtitle}>
							{currentFilter?.label}
							{totalCount > 0 && ` • ${totalCount} ${$L('items')}`}
						</div>
					</div>
				</div>

				<div className={css.toolbar}>
					<SpottableButton
						className={css.filterButton}
						onClick={handleOpenFilterModal}
					>
						<svg viewBox="0 0 24 24">
							<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
						</svg>
						{$L('Sort & Filter')}
					</SpottableButton>
					<SpottableButton
						className={css.filterButton}
						onClick={handleOpenSettingsModal}
						aria-label={$L('Seerr Settings')}
					>
						<svg viewBox="0 0 24 24">
							<path d={CORE_ICON_PATHS.settings} />
						</svg>
					</SpottableButton>
				</div>

				<div className={css.gridContainer}>
					{isLoading && items.length === 0 ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : items.length === 0 ? (
						<div className={css.empty}>{$L('No items found')}</div>
					) : (
						<div className={css.gridWrapper}>
						<VirtualGridList
							className={css.grid}
							cbScrollTo={getScrollTo}
							dataSize={items.length}
							itemRenderer={renderItem}
							itemSize={gridItemSize}
							spacing={20}
							spotlightId="seerr-browse-grid"
						/>
						</div>
					)}
				</div>
			</div>

			<BrowseDialog open={showFilterModal} onClose={handleCloseModal} spotlightId="seerr-browse-sort">
				<DialogTitle>{$L('Sort & Filter')}</DialogTitle>
				<DialogDivider />
				{getSeerrSortOptions(mediaType).map((option) => {
					const active = sortBy.startsWith(option.key + '.');
					return (
						<RadioTile
							key={option.key}
							label={option.label}
							selected={active}
							trailing={active && <SortArrow ascending={sortBy.endsWith('.asc')} />}
							onClick={handleSortSelect}
							data-sort-key={option.key}
						/>
					);
				})}
				{showMediaTypeFilter && (
					<>
						<DialogDivider />
						<SectionHeader>{$L('Media Type')}</SectionHeader>
						{getFilterOptions().map((option) => (
							<RadioTile
								key={option.key}
								label={option.label}
								selected={mediaType === option.key}
								onClick={handleFilterSelect}
								data-filter-key={option.key}
							/>
						))}
					</>
				)}
				{filterGenres.length > 0 && (
					<>
						<DialogDivider />
						<ExpanderTile
							label={$L('Genres')}
							count={genreIds.length}
							expanded={genresExpanded}
							onClick={handleToggleGenres}
						/>
						{genresExpanded && filterGenres.map((genre) => (
							<CheckTile
								key={genre.id}
								label={genre.name}
								checked={genreIds.includes(genre.id)}
								onClick={handleGenreToggle}
								data-genre-id={genre.id}
							/>
						))}
					</>
				)}
				{mediaType === 'tv' && (
					<>
						<DialogDivider />
						<SectionHeader>{$L('Series Status')}</SectionHeader>
						{getSeerrTvStatusOptions().map((option) => (
							<CheckTile
								key={option.key}
								label={option.label}
								checked={tvStatuses.includes(option.key)}
								onClick={handleTvStatusToggle}
								data-status-key={option.key}
							/>
						))}
					</>
				)}
				<DialogDivider />
				<SectionHeader>{$L('Released')}</SectionHeader>
				{getSeerrReleaseOptions().map((option) => (
					<RadioTile
						key={option.key || 'any'}
						label={option.label}
						selected={released === option.key}
						onClick={handleReleasedSelect}
						data-option-key={option.key}
					/>
				))}
				<DialogDivider />
				<SectionHeader>{$L('Minimum Rating')}</SectionHeader>
				{getSeerrMinRatingOptions().map((option) => (
					<RadioTile
						key={option.key || 'any'}
						label={option.label}
						selected={minRating === option.key}
						onClick={handleMinRatingSelect}
						data-option-key={option.key}
					/>
				))}
				<DialogDivider />
				<SectionHeader>{$L('Minimum Votes')}</SectionHeader>
				{getSeerrMinVoteOptions().map((option) => (
					<RadioTile
						key={option.key || 'any'}
						label={option.label}
						selected={minVotes === option.key}
						onClick={handleMinVotesSelect}
						data-option-key={option.key}
					/>
				))}
				<DialogDivider />
				<SectionHeader>{$L('Runtime')}</SectionHeader>
				{getSeerrRuntimeOptions().map((option) => (
					<RadioTile
						key={option.key || 'any'}
						label={option.label}
						selected={runtime === option.key}
						onClick={handleRuntimeSelect}
						data-option-key={option.key}
					/>
				))}
				{filterLanguages.length > 0 && (
					<>
						<DialogDivider />
						<ExpanderTile
							label={$L('Original Language')}
							count={language ? 1 : 0}
							expanded={languagesExpanded}
							onClick={handleToggleLanguages}
						/>
						{languagesExpanded && (
							<>
								<RadioTile
									label={$L('All')}
									selected={language === ''}
									onClick={handleLanguageSelect}
									data-language-code=""
								/>
								{filterLanguages.map((option) => (
									<RadioTile
										key={option.code}
										label={option.name}
										selected={language === option.code}
										onClick={handleLanguageSelect}
										data-language-code={option.code}
									/>
								))}
							</>
						)}
					</>
				)}
				{hasSeerrDiscoverFilters(filterState) && (
					<>
						<DialogDivider />
						<ClearFiltersTile label={$L('Clear Filters')} onClick={handleClearFilters} />
					</>
				)}
			</BrowseDialog>

			<BrowseDialog open={showSettingsModal} onClose={handleCloseSettingsModal} spotlightId="seerr-browse-settings">
				<DialogTitle>{$L('Seerr Settings')}</DialogTitle>
				<DialogSubtitle>{$L('Poster Size')}</DialogSubtitle>
				<DialogDivider />
				{POSTER_SIZE_OPTIONS.map((option) => (
					<RadioTile
						key={option.key}
						label={option.label()}
						selected={posterSize === option.key}
						onClick={handlePosterSizeSelect}
						data-size={option.key}
					/>
				))}
			</BrowseDialog>
		</div>
	);
};

export default SeerrBrowse;
