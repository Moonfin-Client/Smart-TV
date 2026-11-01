/* eslint-disable react/jsx-no-bind */
import {Fragment, useLayoutEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {IconSearch, renderSettingsIcon, renderChevron, renderCheck} from './settingsIcons';
import {SpottableDiv, ViewContainer} from './settingsSpottables';
import {NavRow, SectionTitle} from './settingsRows';
import SettingsView, {TitleAction, followFocus} from './SettingsView';
import {resultSpotlightId} from './settingsSearch';

import css from './Settings.module.less';

// The screens you move through to reach a setting, from the category list down to the
// option picker a row opens.

const ResultItem = ({entry, index, onOpen, onKeyDown}) => (
	<SpottableDiv
		className={css.listItem}
		data-result-index={index}
		onClick={() => onOpen(entry)}
		onKeyDown={onKeyDown}
		spotlightId={resultSpotlightId(entry)}
	>
		{renderSettingsIcon(entry.icon)}
		<div className={`${css.listItemBody} ${css.bodyTwoLine}`}>
			<div className={css.listItemHeading}>{entry.title}</div>
			<div className={css.listItemCaption}>{entry.breadcrumb}</div>
		</div>
		<div className={css.listItemTrailing}>{renderChevron()}</div>
	</SpottableDiv>
);

export const SearchBar = ({value, onChange, onKeyDown}) => (
	<div className={css.searchBar}>
		<div className={css.searchWrap}>
			<SpottableInput
				className={css.searchInput}
				type='text'
				value={value}
				onChange={onChange}
				onKeyDown={onKeyDown}
				placeholder={$L('Search settings')}
				spotlightId='settings-search-input'
				autoComplete='off'
			/>
			<div className={css.searchIcon}><IconSearch /></div>
		</div>
	</div>
);

export const CategoriesView = ({
	categories,
	searchQuery,
	onSearchChange,
	onSearchKeyDown,
	showSearchResults,
	searchResults,
	onOpenResult,
	onResultKeyDown,
	onOpenCategory,
	hideSearch
}) => (
	<SettingsView
		spotlightId='categories-view'
		title={$L('Settings')}
		root
		header={!hideSearch && <SearchBar value={searchQuery} onChange={onSearchChange} onKeyDown={onSearchKeyDown} />}
	>
		{showSearchResults
			? (searchResults.length > 0
				? searchResults.map((entry, index) => (
					<ResultItem
						key={entry.id}
						entry={entry}
						index={index}
						onOpen={onOpenResult}
						onKeyDown={onResultKeyDown}
					/>
				))
				: <div className={css.viewDescription}>{$L('No settings found')}</div>)
			: categories.map((cat) => (
				<NavRow
					key={cat.id}
					id={cat.id}
					spotlightId={`cat-${cat.id}`}
					title={cat.label}
					desc={cat.description}
					icon={cat.icon}
					onClick={() => onOpenCategory(cat.id)}
				/>
			))}
	</SettingsView>
);

export const CategoryView = ({title, subcategories, onOpenSubcategory, clean}) => (
	<SettingsView spotlightId='category-view' title={title} clean={clean}>
		{subcategories.map((sub, index) => (
			<Fragment key={sub.id}>
				{sub.section && sub.section !== subcategories[index - 1]?.section && (
					<SectionTitle>{sub.section}</SectionTitle>
				)}
				<NavRow
					id={sub.id}
					spotlightId={`subcat-${sub.id}`}
					title={sub.label}
					desc={sub.description}
					icon={sub.icon}
					onClick={() => onOpenSubcategory(sub)}
				/>
			</Fragment>
		))}
	</SettingsView>
);

export const SubcategoryView = ({title, clean, action, ctx, children}) => (
	<SettingsView
		spotlightId='subcategory-view'
		title={title}
		clean={clean}
		action={action && <TitleAction icon={action.icon} label={action.label()} onClick={() => action.action(ctx)} />}
	>
		{children}
	</SettingsView>
);

// The dialog grows in steps of 56 units, between 280 and the width the panel leaves it
const DP = 1920 / 1150;
const DIALOG_STEP = 56 * DP;
const DIALOG_MIN = 280 * DP;
const DIALOG_MAX = 340 * DP;

// A picker opens as a dialog over the screen it was chosen from, which stays where it was
export const OptionsDialog = ({title, options, currentValue, onSelect}) => {
	const dialogRef = useRef(null);
	useLayoutEffect(() => {
		const node = dialogRef.current;
		if (!node) return;
		const scale = parseFloat(window.getComputedStyle(document.documentElement).fontSize) / 24 || 1;
		node.style.width = 'auto';
		const natural = node.scrollWidth / scale;
		const stepped = Math.ceil(natural / DIALOG_STEP) * DIALOG_STEP;
		node.style.width = `${Math.min(DIALOG_MAX, Math.max(DIALOG_MIN, stepped)) * scale}px`;
	}, [title, options]);

	return (
		<div className={css.dialogBarrier}>
			<div ref={dialogRef} className={css.dialog}>
				<div className={css.dialogTitle}>{title}</div>
				<ViewContainer className={css.dialogList} spotlightId='options-view' onFocus={followFocus}>
					{options.map((opt, idx) => (
						<SpottableDiv
							key={String(opt.value)}
							className={css.listItem}
							onClick={() => onSelect(opt.value)}
							spotlightId={`opt-${idx}`}
						>
							<div className={css.listItemBody}>
								<div className={css.listItemHeading}>{opt.label}</div>
							</div>
							<div className={css.listItemTrailing}>{renderCheck(opt.value === currentValue)}</div>
						</SpottableDiv>
					))}
				</ViewContainer>
			</div>
		</div>
	);
};
