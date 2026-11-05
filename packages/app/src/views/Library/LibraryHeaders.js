// The pieces of the library header that the Classic, Modern and Docked styles share or
// swap in. Each one is memoized, since the screen around them redraws on every focus move
// to show the focused item and none of this changes with it.

import {memo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {keepFocusInView} from '../../utils/focusScroll';
import {LETTERS, createPanelKeyDown, createToolbarKeyDown} from '../../utils/gridChrome';

import css from './Library.module.less';

const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

// Material Icons glyph paths on a 24 point grid.
export const SEARCH_ICON = 'M15.52 14.02H14.72L14.44 13.73C15.42 12.61 15.98 11.11 15.98 9.52C15.98 5.91 13.08 3 9.52 3C5.91 3 3 5.91 3 9.52C3 13.08 5.91 15.98 9.52 15.98C11.11 15.98 12.61 15.42 13.73 14.44L14.02 14.72V15.52L18.98 20.48L20.48 18.98L15.52 14.02ZM9.52 14.02C7.03 14.02 5.02 12 5.02 9.52C5.02 7.03 7.03 5.02 9.52 5.02C12 5.02 14.02 7.03 14.02 9.52C14.02 12 12 14.02 9.52 14.02Z';
export const HOME_ICON = 'M9.98 20.02V14.02H14.02V20.02H18.98V12H21.98L12 3L2.02 12H5.02V20.02H9.98Z';
export const SORT_ICON = 'M3 18H9V15.98H3V18ZM3 6V8.02H21V6H3ZM3 12.98H15V11.02H3V12.98Z';
export const SETTINGS_ICON = 'M19.12 12.94C19.17 12.66 19.22 12.33 19.22 12C19.22 11.67 19.17 11.34 19.12 11.06L21.14 9.47C21.33 9.33 21.38 9.05 21.28 8.86L19.36 5.53C19.22 5.34 18.98 5.25 18.75 5.34L16.36 6.28C15.89 5.91 15.33 5.58 14.77 5.34L14.39 2.81C14.34 2.58 14.16 2.39 13.92 2.39H10.08C9.84 2.39 9.66 2.58 9.61 2.81L9.23 5.34C8.67 5.58 8.11 5.91 7.64 6.28L5.25 5.34C5.02 5.25 4.78 5.34 4.64 5.53L2.72 8.86C2.62 9.09 2.67 9.33 2.86 9.47L4.88 11.06C4.83 11.34 4.78 11.67 4.78 12C4.78 12.33 4.83 12.66 4.88 12.94L2.86 14.53C2.67 14.67 2.62 14.95 2.72 15.14L4.64 18.47C4.78 18.66 5.02 18.75 5.25 18.66L7.64 17.72C8.11 18.09 8.67 18.42 9.23 18.66L9.61 21.19C9.66 21.42 9.84 21.61 10.08 21.61H13.92C14.16 21.61 14.34 21.42 14.39 21.19L14.77 18.66C15.33 18.42 15.89 18.09 16.36 17.72L18.75 18.66C18.98 18.75 19.22 18.66 19.36 18.47L21.28 15.14C21.38 14.91 21.33 14.67 21.14 14.53L19.12 12.94ZM12 15.61C10.03 15.61 8.39 13.97 8.39 12C8.39 10.03 10.03 8.39 12 8.39C13.97 8.39 15.61 10.03 15.61 12C15.61 13.97 13.97 15.61 12 15.61Z';
export const GROUP_ICON = 'M12 2.02 6.52 11.02H17.48L12 2.02ZM12 5.86 13.92 9H10.08L12 5.86ZM17.48 12.98C15 12.98 12.98 15 12.98 17.48C12.98 19.97 15 21.98 17.48 21.98C19.97 21.98 21.98 19.97 21.98 17.48C21.98 15 19.97 12.98 17.48 12.98ZM17.48 20.02C16.12 20.02 15 18.89 15 17.48C15 16.12 16.12 15 17.48 15C18.89 15 20.02 16.12 20.02 17.48C20.02 18.89 18.89 20.02 17.48 20.02ZM3 21.52H11.02V13.5H3V21.52ZM5.02 15.52H9V19.5H5.02V15.52Z';
export const SHUFFLE_ICON = 'M10.59 9.19 5.39 3.98 3.98 5.39 9.19 10.59 10.59 9.19ZM14.48 3.98 16.55 6.05 3.98 18.61 5.39 20.02 17.95 7.45 20.02 9.52V3.98H14.48ZM14.81 13.41 13.41 14.81 16.55 17.95 14.48 20.02H20.02V14.48L17.95 16.55L14.81 13.41Z';
export const ARROW_UP_ICON = 'M3.98 12 5.39 13.41 11.02 7.83V20.02H12.98V7.83L18.56 13.41L20.02 12L12 3.98L3.98 12Z';
export const ARROW_DOWN_ICON = 'M20.02 12 18.61 10.59 12.98 16.17V3.98H11.02V16.17L5.44 10.59L3.98 12L12 20.02L20.02 12Z';
export const EXPAND_MORE_ICON = 'M16.59 8.58 12 13.17 7.41 8.58 6 9.98 12 15.98 18 9.98 16.59 8.58Z';
export const EXPAND_LESS_ICON = 'M12 8.02 6 14.02 7.41 15.42 12 10.83 16.59 15.42 18 14.02 12 8.02Z';
export const CLEAR_FILTERS_ICON = 'M19.78 5.62C20.3 4.97 19.83 3.98 18.98 3.98H6.84L14.81 11.95L19.78 5.62ZM2.81 2.81 1.41 4.22 9.98 12.98V18.98C9.98 19.55 10.45 20.02 11.02 20.02H12.98C13.55 20.02 14.02 19.55 14.02 18.98V16.83L19.78 22.59L21.19 21.19L2.81 2.81Z';
const SHOW_ICON = 'M9.98 18H14.02V15.98H9.98V18ZM3 6V8.02H21V6H3ZM6 12.98H18V11.02H6V12.98Z';
const DISPLAY_ICON = 'M3 3V11.02H11.02V3H3ZM9 9H5.02V5.02H9V9ZM3 12.98V21H11.02V12.98H3ZM9 18.98H5.02V15H9V18.98ZM12.98 3V11.02H21V3H12.98ZM18.98 9H15V5.02H18.98V9ZM12.98 12.98V21H21V12.98H12.98ZM18.98 18.98H15V15H18.98V18.98Z';
const CHEVRON_RIGHT_ICON = 'M9.98 6 8.58 7.41 13.17 12 8.58 16.59 9.98 18 15.98 12 9.98 6Z';

// The Modern letter row sits under the bar, so Up goes back to it rather than to
// whichever bar control happens to be above the letter.
const handleLetterRowKeyDown = createToolbarKeyDown('library-grid', 'library-bar');

// The five-way would take Home on to the search under it rather than over to the grid.
const handleDockKeyDown = createPanelKeyDown('library-grid-area');

export const Icon = ({path, className = css.pillIcon}) => (
	<svg className={className} viewBox="0 0 24 24">
		<path d={path} />
	</svg>
);

const ItemCount = ({count}) => count > 0 && (
	<div className={css.itemCount}>{$L('{count} items').replace('{count}', count)}</div>
);

export const LibraryTitle = memo(({isFolderView, folderStack, rootName, displayName, shownCount, onBreadcrumb}) => (
	isFolderView && folderStack.length > 0 ? (
		<div className={css.breadcrumb}>
			<SpottableButton
				className={css.breadcrumbItem}
				onClick={onBreadcrumb}
				data-depth={0}
				spotlightId="breadcrumb-root"
			>
				{rootName}
			</SpottableButton>
			{folderStack.map((f, i) => (
				<span key={f.id} className={css.breadcrumbSegment}>
					<span className={css.breadcrumbSep}>›</span>
					{i < folderStack.length - 1 ? (
						<SpottableButton
							className={css.breadcrumbItem}
							onClick={onBreadcrumb}
							data-depth={i + 1}
						>
							{f.name}
						</SpottableButton>
					) : (
						<span className={css.breadcrumbCurrent}>{f.name}</span>
					)}
				</span>
			))}
			<ItemCount count={shownCount} />
		</div>
	) : (
		<>
			<div className={css.libraryTitle}>{displayName}</div>
			<ItemCount count={shownCount} />
		</>
	)
));

// A letter jumps the grid to the first item under it, so none of them stays picked.
export const Letters = memo(({onSelect}) => LETTERS.map((letter, index) => (
	<SpottableButton
		key={letter}
		className={css.letterButton}
		onClick={onSelect}
		data-letter={letter}
		spotlightId={index === 0 ? 'library-letter-hash' : undefined}
	>
		{letter}
	</SpottableButton>
)));

const SortArrow = ({ascending}) => <Icon path={ascending ? ARROW_UP_ICON : ARROW_DOWN_ICON} className={css.pillArrow} />;

const Search = ({className, value, onChange}) => (
	<div className={`${css.searchWrap} ${className}`}>
		<Icon path={SEARCH_ICON} className={css.searchIcon} />
		<SpottableInput
			type="text"
			className={css.searchField}
			placeholder={$L('Search this library...')}
			value={value}
			onChange={onChange}
			spotlightId="library-search"
			autoComplete="off"
		/>
	</div>
);

const IconButton = ({path, onClick, spotlightId}) => (
	<SpottableButton className={css.barButton} onClick={onClick} spotlightId={spotlightId}>
		<Icon path={path} className={css.toolbarIcon} />
	</SpottableButton>
);

const Pill = ({path, label, value, onClick, spotlightId, children}) => (
	<SpottableButton className={css.barPill} onClick={onClick} spotlightId={spotlightId}>
		<Icon path={path} />
		<span className={css.pillLabel}>{label}</span>
		<span className={css.pillValue}>{value}</span>
		{children}
	</SpottableButton>
);

// One bar with every control in it, each labeled with what it's set to. A control the
// library has no use for comes in without a handler and stays out of the bar.
export const ModernBar = memo(({
	sortLabel, sortAscending, groupLabel, showLabel, searchQuery,
	onSearchChange, onHome, onSort, onGroup, onShow, onShuffle, onSettings, onKeyDown
}) => (
	<ToolbarContainer className={css.modernBar} spotlightId="library-bar" onKeyDown={onKeyDown}>
		<IconButton path={HOME_ICON} onClick={onHome} spotlightId="library-home-btn" />
		<span className={css.barDivider} />
		<Search className={css.barSearch} value={searchQuery} onChange={onSearchChange} />
		<span className={css.barDivider} />
		{/* The controls keep their natural width and scroll once they run out of room beside the search. */}
		<div className={css.barControls} onFocus={keepFocusInView}>
			<Pill path={SORT_ICON} label={$L('Sort By')} value={sortLabel} onClick={onSort} spotlightId="library-sort-btn">
				<SortArrow ascending={sortAscending} />
			</Pill>
			{onGroup && <Pill path={GROUP_ICON} label={$L('Group By')} value={groupLabel} onClick={onGroup} spotlightId="library-group-btn" />}
			{onShow && <Pill path={SHOW_ICON} label={$L('Show')} value={showLabel} onClick={onShow} spotlightId="library-show-btn" />}
			{onShuffle && <IconButton path={SHUFFLE_ICON} onClick={onShuffle} spotlightId="library-shuffle-btn" />}
			{onSettings && <IconButton path={SETTINGS_ICON} onClick={onSettings} spotlightId="library-settings-btn" />}
		</div>
	</ToolbarContainer>
));

export const ModernLetters = memo(({onSelect}) => (
	<ToolbarContainer className={css.letterRow} spotlightId="library-letters" onKeyDown={handleLetterRowKeyDown}>
		<Letters onSelect={onSelect} />
	</ToolbarContainer>
));

const DockRow = ({path, label, value, onClick, spotlightId, children}) => (
	<SpottableButton className={css.dockRow} onClick={onClick} spotlightId={spotlightId}>
		<Icon path={path} />
		<span className={css.dockRowLabel}>{label}</span>
		<span className={css.pillValue}>{value}</span>
		{children}
		<Icon path={CHEVRON_RIGHT_ICON} className={css.dockChevron} />
	</SpottableButton>
);

// The panel down the left side. Focus coming back to it lands on whichever control in it
// was used last.
export const LibraryDock = memo(({
	isFolderView, folderStack, rootName, displayName, shownCount, onBreadcrumb,
	sortLabel, sortAscending, groupLabel, showLabel, displayLabel, searchQuery,
	showLetters, onLetterSelect,
	onSearchChange, onHome, onSort, onGroup, onShow, onShuffle, onSettings
}) => (
	<ToolbarContainer className={css.dock} spotlightId="library-dock" onKeyDown={handleDockKeyDown}>
		<div className={css.dockHeader}>
			<IconButton path={HOME_ICON} onClick={onHome} spotlightId="library-home-btn" />
			<div className={css.dockTitle}>
				<LibraryTitle
					isFolderView={isFolderView}
					folderStack={folderStack}
					rootName={rootName}
					displayName={displayName}
					shownCount={shownCount}
					onBreadcrumb={onBreadcrumb}
				/>
			</div>
		</div>
		<Search className={css.dockSearch} value={searchQuery} onChange={onSearchChange} />
		<div className={css.dockRows}>
			<DockRow path={SORT_ICON} label={$L('Sort By')} value={sortLabel} onClick={onSort} spotlightId="library-sort-btn">
				<SortArrow ascending={sortAscending} />
			</DockRow>
			{onGroup && <DockRow path={GROUP_ICON} label={$L('Group By')} value={groupLabel} onClick={onGroup} spotlightId="library-group-btn" />}
			{onShow && <DockRow path={SHOW_ICON} label={$L('Show')} value={showLabel} onClick={onShow} spotlightId="library-show-btn" />}
			{onShuffle && <DockRow path={SHUFFLE_ICON} label={$L('Shuffle')} onClick={onShuffle} spotlightId="library-shuffle-btn" />}
			{onSettings && <DockRow path={DISPLAY_ICON} label={$L('Display')} value={displayLabel} onClick={onSettings} spotlightId="library-settings-btn" />}
		</div>
		{showLetters && (
			<div className={css.dockLetters}>
				<div className={css.dockCaption}>{$L('Jump to letter')}</div>
				<div className={css.letterGrid}>
					<Letters onSelect={onLetterSelect} />
				</div>
			</div>
		)}
	</ToolbarContainer>
));
