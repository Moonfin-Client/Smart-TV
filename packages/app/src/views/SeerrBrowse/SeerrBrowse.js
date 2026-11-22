import {forwardRef, useState, useEffect, useCallback, useImperativeHandle, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import $L from '@enact/i18n/$L';
import {useSeerr} from '../../context/SeerrContext';
import {useSettings} from '../../context/SettingsContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import SeerrPosterCard from '../../components/seerr/SeerrPosterCard';
import * as seerrApi from '../../services/seerrApi';
import {POSTER_SIZE_OPTIONS, seerrPosterSize} from '../../utils/gridChrome';
import {registerThemeSheet} from '../../theme/themeOverrides';
import {CORE_ICON_PATHS} from '../Settings/settingsCoreIcons';
import {buildSeerrDiscoverParams, getSeerrSortOptions, getSeerrTvStatusOptions, getSeerrMinRatingOptions, getSeerrMinVoteOptions, getSeerrRuntimeOptions, getSeerrReleaseOptions, hasSeerrDiscoverFilters} from '../../utils/seerrBrowseFilters';
import {browseStateKey, readBrowseState, writeBrowseState} from './seerrBrowseState';
import {browseGridMetrics, cardSubtitle, matchesBrowseFilters, statusLabel, yearOf} from './seerrBrowseGrid';
import {BrowseDialog, CheckTile, ClearFiltersTile, DialogDivider, DialogSubtitle, DialogTitle, ExpanderTile, RadioTile, SectionHeader, SortArrow} from './SeerrBrowseDialogs';

import css from './SeerrBrowse.module.less';

registerThemeSheet('seerrBrowse', css);

const SpottableDiv = Spottable('div');

let _filterOptions;
const getFilterOptions = () => (_filterOptions ??= [
	{key: 'movie', label: $L('Movies')},
	{key: 'tv', label: $L('TV Shows')}
]);

const MAX_PAGES = 25;

// Core reads ahead until a load holds this many matches, but no more than six pages at a time,
// since a letter or status filter can turn down whole pages.
const MIN_MATCHES = 10;
const MAX_PAGES_PER_SCAN = 6;

const LETTERS = ['', '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const STATUS_FILTERS = [
	{key: 'all', label: () => $L('All')},
	{key: 'available', label: () => $L('Available')},
	{key: 'requested', label: () => $L('Requested')}
];

const ToolbarButton = ({icon, label, onClick, spotlightId}) => (
	<SpottableDiv className={css.toolButton} onClick={onClick} spotlightId={spotlightId} aria-label={label}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
	</SpottableDiv>
);

const POSTER_PLACEHOLDER = (
	<div className={css.posterPlaceholder}>
		<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
			<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
		</svg>
	</div>
);

// The line keeps the focused title itself, so a move across the grid redraws only this line
// rather than the whole page.
const FocusLine = forwardRef(function FocusLine(props, ref) {
	const [entry, setEntry] = useState(null);
	useImperativeHandle(ref, () => ({show: setEntry}), []);
	if (!entry) return <div className={css.focusLine} />;
	const year = yearOf(entry);
	const status = entry.mediaInfo?.status;
	const label = statusLabel(status);
	const available = status === 4 || status === 5;
	return (
		<div className={css.focusLine}>
			<div className={css.focusTitle}>{entry.title || entry.name}</div>
			<div className={css.focusMeta}>
				{year.length === 4 && <span className={css.metaText}>{year}</span>}
				{entry.voteAverage > 0 && (
					<span className={css.metaRating}>
						<svg className={css.star} viewBox="0 0 24 24" aria-hidden="true"><path d={CORE_ICON_PATHS.star} /></svg>
						<span className={css.metaText}>{entry.voteAverage.toFixed(1)}</span>
					</span>
				)}
				{label && (
					<span className={`${css.statusBadge} ${available ? css.statusAvailable : css.statusRequested}`}>{label}</span>
				)}
				{entry.mediaType && <span className={css.metaText}>{entry.mediaType === 'tv' ? $L('Series') : $L('Movie')}</span>}
			</div>
		</div>
	);
});

const SeerrBrowse = ({browseType, item, mediaType: initialMediaType, onSelectItem, onHome, backHandlerRef}) => {
	const {isEnabled} = useSeerr();
	const {settings, updateSetting} = useSettings();
	const posterSize = seerrPosterSize(settings);
	const zoom = settings.cardFocusZoom !== false;
	const metrics = useMemo(() => browseGridMetrics(posterSize, zoom), [posterSize, zoom]);
	// Sized a touch under the cell, so a grid a few pixels narrower than planned still keeps its
	// columns. The height is scaled to land on the cell's height once the width stretches back.
	const gridItemSize = useMemo(() => {
		const minWidth = metrics.cellWidth - 4;
		return {minWidth, minHeight: Math.ceil(metrics.cellHeight * minWidth / metrics.cellWidth)};
	}, [metrics]);
	const stateKey = useMemo(
		() => browseStateKey(browseType, item, initialMediaType),
		[browseType, item, initialMediaType]
	);
	// Read once on mount. Later writes must not feed back into what seeded them.
	const savedRef = useRef(readBrowseState(stateKey));
	const saved = savedRef.current;
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [mediaType, setMediaType] = useState(() => {
		if (saved?.mediaType) return saved.mediaType;
		// Studios are movies only, networks are TV only
		if (browseType === 'studio') return 'movie';
		if (browseType === 'network') return 'tv';
		return initialMediaType || 'movie';
	});
	const [initialLoadDone, setInitialLoadDone] = useState(false);
	const [showFilterModal, setShowFilterModal] = useState(false);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [sortBy, setSortBy] = useState(saved?.sortBy || 'popularity.desc');
	const [statusFilter, setStatusFilter] = useState(saved?.statusFilter || 'all');
	const [letter, setLetter] = useState(saved?.letter || '');
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

	const loadingMoreRef = useRef(false);
	// The grid asks for more as it draws, and moving focus doesn't redraw it, so a read it asked
	// for while another was loading or cooling down is asked for again on the next focus move.
	const loadMissedRef = useRef(false);
	// Bumped by every fresh load, so a read still in flight from the last one is dropped.
	const generationRef = useRef(0);
	const loadCooldownRef = useRef(false);
	const itemsRef = useRef([]);
	const totalPagesRef = useRef(1);
	const currentPageRef = useRef(1);
	const scrollToRef = useRef(null);
	const focusLineRef = useRef(null);
	const restoredRef = useRef(false);
	const getScrollTo = useCallback((fn) => {
		scrollToRef.current = fn;
	}, []);

	const fetchMatches = useCallback(async (page) => {
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
		return {
			matches: (result.results || []).filter((entry) => matchesBrowseFilters(entry, statusFilter, letter)),
			totalPages: result.totalPages || 1
		};
	}, [item, browseType, mediaType, sortBy, statusFilter, letter, genreIds, tvStatuses, language, minRating, minVotes, runtime, released]);

	const applyPage = useCallback((page, {matches, totalPages}, append) => {
		totalPagesRef.current = totalPages;
		currentPageRef.current = page;
		itemsRef.current = append ? [...itemsRef.current, ...matches] : matches;
		setItems(itemsRef.current);
		return matches.length;
	}, []);

	const loadMore = useCallback(async () => {
		if (loadingMoreRef.current || loadCooldownRef.current) {
			loadMissedRef.current = true;
			return;
		}
		loadMissedRef.current = false;
		const start = currentPageRef.current + 1;
		const last = Math.min(totalPagesRef.current, MAX_PAGES, start + MAX_PAGES_PER_SCAN - 1);
		if (start > last) return;
		const generation = generationRef.current;
		loadingMoreRef.current = true;
		try {
			let matched = 0;
			for (let page = start; page <= last && matched < MIN_MATCHES; page++) {
				const result = await fetchMatches(page);
				if (generation !== generationRef.current) return;
				matched += applyPage(page, result, true);
			}
		} catch (err) {
			console.error('Failed to load items:', err);
		} finally {
			if (generation === generationRef.current) {
				loadingMoreRef.current = false;
				loadMissedRef.current = false;
				loadCooldownRef.current = true;
				setTimeout(() => { loadCooldownRef.current = false; }, 500);
			}
		}
	}, [fetchMatches, applyPage]);

	useEffect(() => {
		writeBrowseState(stateKey, {
			mediaType, sortBy, statusFilter, letter, genreIds, tvStatuses, language, minRating, minVotes, runtime, released
		});
	}, [stateKey, mediaType, sortBy, statusFilter, letter, genreIds, tvStatuses, language, minRating, minVotes, runtime, released]);

	useEffect(() => {
		if (!item || !isEnabled) return;
		const generation = ++generationRef.current;
		setIsLoading(true);
		setItems([]);
		itemsRef.current = [];
		loadingMoreRef.current = true;
		currentPageRef.current = 1;
		setInitialLoadDone(false);

		// Coming back to a screen that had been paged through reloads as far as it had
		// reached, otherwise the item it was left on isn't there to return to.
		const lastPage = restoredRef.current ? 1 : Math.min(savedRef.current?.pagesLoaded || 1, MAX_PAGES);

		(async () => {
			try {
				let matched = 0;
				for (let page = 1; page <= MAX_PAGES; page++) {
					const result = await fetchMatches(page);
					if (generation !== generationRef.current) return;
					matched += applyPage(page, result, page > 1);
					if (page >= totalPagesRef.current) break;
					if (page >= lastPage && (matched >= MIN_MATCHES || page >= MAX_PAGES_PER_SCAN)) break;
				}
			} catch (err) {
				console.error('Failed to load items:', err);
			}
			if (generation === generationRef.current) {
				loadingMoreRef.current = false;
				loadMissedRef.current = false;
				setIsLoading(false);
				setInitialLoadDone(true);
			}
		})();
	}, [item, isEnabled, fetchMatches, applyPage]);

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

	const handleItemFocus = useCallback((ev) => {
		const index = ev.currentTarget?.dataset?.index;
		if (index !== undefined) focusLineRef.current?.show(itemsRef.current[parseInt(index, 10)] || null);
		if (loadMissedRef.current) loadMore();
	}, [loadMore]);

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

	const handleStatusSelect = useCallback((ev) => {
		setStatusFilter(ev.currentTarget.dataset.status);
	}, []);

	const handleLetterSelect = useCallback((ev) => {
		setLetter(ev.currentTarget.dataset.letter);
	}, []);

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

	// Back closes a dialog first. From the grid it climbs to the A to Z bar's All, the way Core
	// does on a TV, and the next Back leaves.
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
			const grid = document.querySelector('[data-spotlight-id="seerr-browse-grid"]');
			if (grid && grid.contains(document.activeElement)) {
				return Spotlight.focus('seerr-alpha-all');
			}
			return false;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, showFilterModal, showSettingsModal]);

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

	// Check if we should show the filter (not for studio/network which are media-type specific)
	const showMediaTypeFilter = browseType === 'genre' || browseType === 'keyword' || browseType === 'all';

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

	const renderItem = useCallback(({index, ...rest}) => {
		const mediaItem = itemsRef.current[index];
		if (index >= itemsRef.current.length - 8) loadMore();
		if (!mediaItem) return null;

		return (
			<SeerrPosterCard
				{...rest}
				style={{...rest.style, padding: `${metrics.headroom}px ${metrics.inset}px 0`}}
				item={mediaItem}
				mediaType={mediaType}
				imageHeight={metrics.imageHeight}
				subtitle={cardSubtitle(mediaItem)}
				placeholder={POSTER_PLACEHOLDER}
				onClick={handleItemClick}
				onFocus={handleItemFocus}
				data-index={index}
			/>
		);
	}, [handleItemClick, handleItemFocus, loadMore, mediaType, metrics]);

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

	const statusFilterLabel = STATUS_FILTERS.find((option) => option.key === statusFilter)?.label() || $L('All');

	return (
		<div className={css.page}>
			<div className={css.header}>
				<div className={css.title}>{item.name || $L('Browse')}</div>
				<FocusLine ref={focusLineRef} />
				<div className={css.toolbar}>
					<ToolbarButton icon={CORE_ICON_PATHS.home} label={$L('Home')} onClick={onHome} spotlightId="seerr-browse-home" />
					<ToolbarButton icon={CORE_ICON_PATHS.sort} label={$L('Sort & Filter')} onClick={handleOpenFilterModal} spotlightId="seerr-browse-sort-button" />
					<ToolbarButton icon={CORE_ICON_PATHS.settings} label={$L('Seerr Settings')} onClick={handleOpenSettingsModal} spotlightId="seerr-browse-settings-button" />
					<div className={css.chips}>
						{STATUS_FILTERS.map((option) => (
							<SpottableDiv
								key={option.key}
								className={`${css.chip} ${statusFilter === option.key ? css.chipSelected : ''}`}
								onClick={handleStatusSelect}
								data-status={option.key}
							>
								{option.label()}
							</SpottableDiv>
						))}
					</div>
				</div>
				<div className={css.alphaBar}>
					{LETTERS.map((entry) => (
						<SpottableDiv
							key={entry || 'all'}
							className={`${css.letter} ${letter === entry ? css.letterSelected : ''}`}
							onClick={handleLetterSelect}
							data-letter={entry}
							spotlightId={entry ? undefined : 'seerr-alpha-all'}
						>
							{entry || $L('All')}
						</SpottableDiv>
					))}
				</div>
			</div>

			<div className={css.gridContainer}>
				{isLoading && items.length === 0 ? (
					<div className={css.loading}>
						<LoadingSpinner />
					</div>
				) : items.length === 0 ? (
					<div className={css.empty}>{$L('No results')}</div>
				) : (
					<div className={css.gridWrapper} style={{top: `${metrics.gridTop}px`, left: `${metrics.edge}px`, right: `${metrics.edge}px`}}>
						<VirtualGridList
							className={css.grid}
							cbScrollTo={getScrollTo}
							dataSize={items.length}
							itemRenderer={renderItem}
							itemSize={gridItemSize}
							spacing={metrics.spacing}
							verticalScrollbar="hidden"
							spotlightId="seerr-browse-grid"
						/>
					</div>
				)}
			</div>

			<div className={css.footer}>
				<span className={css.footerFilter}>{statusFilterLabel}</span>
				<span className={css.footerCount}>{$L('{count} Items').replace('{count}', items.length)}</span>
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
