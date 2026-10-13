import {useState, useCallback, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {ModalContainer} from '../../utils/spotlightContainers';
import TrackOptionRow, {TrackDivider} from '../TrackOptionRow';
import {
	PLAYLIST_SORT_ORDER,
	PLAYLIST_SORT_RANDOM,
	SORT_DIR_ASC,
	SORT_DIR_DESC,
	PLAYED_ALL,
	sortLabel,
	playlistSortOptions,
	playedFilterOptions
} from '../../utils/playlistSortFilter';

import css from './PlaylistSortFilterBar.module.less';

const SpottableButton = Spottable('button');
const HorizontalBar = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-first'
}, 'div');

const stopPropagation = (ev) => ev.stopPropagation();

export const PlaylistSortDialog = ({
	sortBy,
	sortDirection,
	onSelectSort,
	onToggleDirection,
	onClose
}) => {
	const handleAscending = useCallback(() => onToggleDirection(SORT_DIR_ASC), [onToggleDirection]);
	const handleDescending = useCallback(() => onToggleDirection(SORT_DIR_DESC), [onToggleDirection]);
	const handleSelectSort = useCallback((ev) => {
		const sortId = ev.currentTarget.dataset.sortId;
		if (sortId) onSelectSort(sortId);
	}, [onSelectSort]);

	const options = playlistSortOptions();
	const showDirection = sortBy !== PLAYLIST_SORT_RANDOM;

	return (
		<div className={css.modalOverlay} onClick={onClose}>
			<ModalContainer
				className={css.modalPanel}
				onClick={stopPropagation}
				spotlightId="playlist-sort-modal"
			>
				<h2 className={css.modalTitle}>{$L('Sort By')}</h2>
				{showDirection && (
					<>
						<div className={css.sectionHeader}>{$L('Order')}</div>
						<div className={css.modalList}>
							<TrackOptionRow
								label={$L('Ascending')}
								selected={sortDirection === SORT_DIR_ASC}
								data-direction={SORT_DIR_ASC}
								onClick={handleAscending}
							/>
							<TrackOptionRow
								label={$L('Descending')}
								selected={sortDirection === SORT_DIR_DESC}
								data-direction={SORT_DIR_DESC}
								onClick={handleDescending}
							/>
						</div>
						<TrackDivider />
					</>
				)}
				<div className={css.sectionHeader}>{$L('Field')}</div>
				<div className={css.modalList}>
					{options.map((opt) => (
						<TrackOptionRow
							key={opt.id}
							label={opt.label}
							selected={opt.id === sortBy}
							data-sort-id={opt.id}
							onClick={handleSelectSort}
						/>
					))}
				</div>
			</ModalContainer>
		</div>
	);
};

PlaylistSortDialog.propTypes = {
	onClose: PropTypes.func.isRequired,
	onSelectSort: PropTypes.func.isRequired,
	onToggleDirection: PropTypes.func.isRequired,
	sortBy: PropTypes.string.isRequired,
	sortDirection: PropTypes.string.isRequired
};

export const PlaylistFilterDialog = ({
	playedFilter,
	favoriteOnly,
	mediaTypeFilter,
	availableMediaTypes = [],
	onUpdateFilter,
	onClose
}) => {
	const handleToggleFavorite = useCallback(() => {
		onUpdateFilter({favoriteOnly: !favoriteOnly});
	}, [favoriteOnly, onUpdateFilter]);

	const handleSelectPlayed = useCallback((ev) => {
		const playedId = ev.currentTarget.dataset.playedId;
		if (playedId) onUpdateFilter({playedFilter: playedId});
	}, [onUpdateFilter]);

	const handleSelectMediaType = useCallback((ev) => {
		const type = ev.currentTarget.dataset.mediaType;
		if (type) onUpdateFilter({mediaTypeFilter: type});
	}, [onUpdateFilter]);

	const playedChoices = playedFilterOptions();

	return (
		<div className={css.modalOverlay} onClick={onClose}>
			<ModalContainer
				className={css.modalPanel}
				onClick={stopPropagation}
				spotlightId="playlist-filter-modal"
			>
				<h2 className={css.modalTitle}>{$L('Filter Tracks')}</h2>

				<div className={css.sectionHeader}>{$L('Favorites')}</div>
				<div className={css.modalList}>
					<TrackOptionRow
						label={$L('Favorites Only')}
						selected={favoriteOnly}
						onClick={handleToggleFavorite}
					/>
				</div>

				<TrackDivider />
				<div className={css.sectionHeader}>{$L('Status')}</div>
				<div className={css.modalList}>
					{playedChoices.map((choice) => (
						<TrackOptionRow
							key={choice.id}
							label={choice.label}
							selected={playedFilter === choice.id}
							data-played-id={choice.id}
							onClick={handleSelectPlayed}
						/>
					))}
				</div>

				{availableMediaTypes.length > 1 && (
					<>
						<TrackDivider />
						<div className={css.sectionHeader}>{$L('Media Type')}</div>
						<div className={css.modalList}>
							<TrackOptionRow
								label={$L('All Types')}
								selected={!mediaTypeFilter || mediaTypeFilter === 'all'}
								data-media-type="all"
								onClick={handleSelectMediaType}
							/>
							{availableMediaTypes.map((type) => (
								<TrackOptionRow
									key={type}
									label={type === 'Audio' ? $L('Audio') : type === 'Video' ? $L('Video') : type}
									selected={mediaTypeFilter === type}
									data-media-type={type}
									onClick={handleSelectMediaType}
								/>
							))}
						</div>
					</>
				)}
			</ModalContainer>
		</div>
	);
};

PlaylistFilterDialog.propTypes = {
	availableMediaTypes: PropTypes.arrayOf(PropTypes.string),
	favoriteOnly: PropTypes.bool.isRequired,
	mediaTypeFilter: PropTypes.string,
	onClose: PropTypes.func.isRequired,
	onUpdateFilter: PropTypes.func.isRequired,
	playedFilter: PropTypes.string.isRequired
};

export const EmptyPlaylistFilterState = ({onReset, spotlightId = 'playlist-clear-filters-btn'}) => (
	<div className={css.emptyState}>
		<div className={css.emptyIcon}>⊘</div>
		<p className={css.emptyText}>{$L('No tracks match the active filters')}</p>
		<SpottableButton
			className={css.clearFiltersBtn}
			onClick={onReset}
			spotlightId={spotlightId}
		>
			{$L('Clear Filters')}
		</SpottableButton>
	</div>
);

EmptyPlaylistFilterState.propTypes = {
	onReset: PropTypes.func.isRequired,
	spotlightId: PropTypes.string
};

export const EmptyPlaylistState = () => (
	<div className={css.emptyState}>
		<div className={css.emptyIcon}>🎵</div>
		<p className={css.emptyText}>{$L('This playlist is empty')}</p>
	</div>
);

const PlaylistSortFilterBar = ({
	sortBy = PLAYLIST_SORT_ORDER,
	sortDirection = SORT_DIR_ASC,
	onSortChange,
	playedFilter = PLAYED_ALL,
	favoriteOnly = false,
	mediaTypeFilter = null,
	availableMediaTypes = [],
	onFilterChange,
	onReset,
	spotlightId = 'playlist-sort-filter-bar',
	onKeyDown,
	backHandlerRef
}) => {
	const [sortModalOpen, setSortModalOpen] = useState(false);
	const [filterModalOpen, setFilterModalOpen] = useState(false);
	const focusTimerRef = useRef(null);

	const scheduleFocus = useCallback((target) => {
		if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
		focusTimerRef.current = setTimeout(() => {
			Spotlight.focus(target);
		}, 50);
	}, []);

	useEffect(() => () => {
		if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
	}, []);

	const isSortNonDefault = sortBy !== PLAYLIST_SORT_ORDER || sortDirection !== SORT_DIR_ASC;

	let activeFilterCount = 0;
	if (favoriteOnly) activeFilterCount++;
	if (playedFilter !== PLAYED_ALL) activeFilterCount++;
	if (mediaTypeFilter && mediaTypeFilter !== 'all') activeFilterCount++;

	const isFilteringActive = activeFilterCount > 0;
	const isModified = isSortNonDefault || isFilteringActive;

	const handleOpenSort = useCallback(() => {
		setSortModalOpen(true);
		scheduleFocus('playlist-sort-modal');
	}, [scheduleFocus]);

	const handleCloseSort = useCallback(() => {
		setSortModalOpen(false);
		scheduleFocus('playlist-sort-pill');
	}, [scheduleFocus]);

	const handleSelectSort = useCallback((id) => {
		onSortChange?.(id, sortDirection);
		handleCloseSort();
	}, [onSortChange, sortDirection, handleCloseSort]);

	const handleToggleDirection = useCallback((direction) => {
		onSortChange?.(sortBy, direction);
	}, [onSortChange, sortBy]);

	const handleOpenFilter = useCallback(() => {
		setFilterModalOpen(true);
		scheduleFocus('playlist-filter-modal');
	}, [scheduleFocus]);

	const handleCloseFilter = useCallback(() => {
		setFilterModalOpen(false);
		scheduleFocus('playlist-filter-pill');
	}, [scheduleFocus]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		if (!sortModalOpen && !filterModalOpen) return undefined;
		const handler = () => {
			if (sortModalOpen) {
				handleCloseSort();
				return true;
			}
			if (filterModalOpen) {
				handleCloseFilter();
				return true;
			}
			return false;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, sortModalOpen, filterModalOpen, handleCloseSort, handleCloseFilter]);

	const handleUpdateFilter = useCallback((updates) => {
		onFilterChange?.({
			playedFilter,
			favoriteOnly,
			mediaTypeFilter,
			...updates
		});
	}, [onFilterChange, playedFilter, favoriteOnly, mediaTypeFilter]);

	return (
		<>
			<HorizontalBar
				className={css.bar}
				spotlightId={spotlightId}
				onKeyDown={onKeyDown}
			>
				<SpottableButton
					className={`${css.pill} ${isSortNonDefault ? css.pillActive : ''}`}
					onClick={handleOpenSort}
					spotlightId="playlist-sort-pill"
				>
					<span>{sortLabel(sortBy)}</span>
					{sortBy !== PLAYLIST_SORT_RANDOM && sortBy !== PLAYLIST_SORT_ORDER && (
						<span className={css.arrow}>{sortDirection === SORT_DIR_ASC ? '▲' : '▼'}</span>
					)}
				</SpottableButton>

				<SpottableButton
					className={`${css.pill} ${isFilteringActive ? css.pillActive : ''}`}
					onClick={handleOpenFilter}
					spotlightId="playlist-filter-pill"
				>
					<span>{$L('Filter')}</span>
					{isFilteringActive && (
						<span className={css.badge}>{activeFilterCount}</span>
					)}
				</SpottableButton>

				{isModified && (
					<SpottableButton
						className={css.pill}
						onClick={onReset}
						spotlightId="playlist-reset-pill"
					>
						<span>{$L('Reset')}</span>
					</SpottableButton>
				)}
			</HorizontalBar>

			{sortModalOpen && (
				<PlaylistSortDialog
					sortBy={sortBy}
					sortDirection={sortDirection}
					onSelectSort={handleSelectSort}
					onToggleDirection={handleToggleDirection}
					onClose={handleCloseSort}
				/>
			)}

			{filterModalOpen && (
				<PlaylistFilterDialog
					playedFilter={playedFilter}
					favoriteOnly={favoriteOnly}
					mediaTypeFilter={mediaTypeFilter}
					availableMediaTypes={availableMediaTypes}
					onUpdateFilter={handleUpdateFilter}
					onClose={handleCloseFilter}
				/>
			)}
		</>
	);
};

PlaylistSortFilterBar.propTypes = {
	availableMediaTypes: PropTypes.arrayOf(PropTypes.string),
	favoriteOnly: PropTypes.bool,
	mediaTypeFilter: PropTypes.string,
	onFilterChange: PropTypes.func,
	onKeyDown: PropTypes.func,
	onReset: PropTypes.func,
	onSortChange: PropTypes.func,
	playedFilter: PropTypes.string,
	sortBy: PropTypes.string,
	sortDirection: PropTypes.string,
	spotlightId: PropTypes.string,
	backHandlerRef: PropTypes.oneOfType([
		PropTypes.func,
		PropTypes.shape({current: PropTypes.any})
	])
};

export default PlaylistSortFilterBar;
