/* eslint-disable react/jsx-no-bind */
import {Fragment, useLayoutEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {IconSearch, renderSettingsIcon, renderChevron} from './settingsIcons';
import {SpottableDiv, ViewContainer} from './settingsSpottables';
import {NavRow, SectionTitle, swatchEdgeClass} from './settingsRows';
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

// Core's picker is a SimpleDialog, which grows in steps of 56 units from 280 until the column
// stops it
const DP = 1920 / 1150;
const DIALOG_STEP = 56 * DP;
const DIALOG_MIN = 280 * DP;

// A picker opens as a dialog over the screen it was chosen from, which stays where it was
export const OptionsDialog = ({title, options, currentValue, swatchOf, swatchEdge, subtitleOf, onSelect}) => {
	const dialogRef = useRef(null);
	useLayoutEffect(() => {
		const node = dialogRef.current;
		if (!node) return;
		const scale = parseFloat(window.getComputedStyle(document.documentElement).fontSize) / 24 || 1;
		node.style.width = 'auto';
		// One pixel less, since a dialog at the 280 floor can measure a hair over it and jump a step
		const natural = (node.scrollWidth - 1) / scale;
		node.style.width = `${Math.max(DIALOG_MIN, Math.ceil(natural / DIALOG_STEP) * DIALOG_STEP) * scale}px`;
	}, [title, options]);

	return (
		<div className={css.dialogBarrier}>
			<div ref={dialogRef} className={css.dialog}>
				<div className={css.dialogTitle}>{title}</div>
				<ViewContainer className={css.dialogList} spotlightId='options-view' onFocus={followFocus}>
					{options.map((opt, idx) => {
						const subtitle = subtitleOf && subtitleOf(opt.value);
						const swatch = swatchOf && swatchOf(opt.value);
						return (
							<SpottableDiv
								key={String(opt.value)}
								className={`${css.dialogOption}${subtitle ? ` ${css.dialogOptionTwoLine}` : ''}`}
								onClick={() => onSelect(opt.value)}
								spotlightId={`opt-${idx}`}
							>
								<span className={`${css.dialogRadio}${opt.value === currentValue ? ` ${css.dialogRadioOn}` : ''}`} />
								{swatch && (
									<span
										className={`${css.colorCircle} ${css.dialogSwatch}${swatchEdge ? ` ${swatchEdgeClass(swatch)}` : ''}`}
										style={{background: swatch}}
									/>
								)}
								<div className={css.dialogLabel}>
									{opt.label}
									{subtitle && <div className={css.dialogHint}>{subtitle}</div>}
								</div>
							</SpottableDiv>
						);
					})}
				</ViewContainer>
			</div>
		</div>
	);
};

const byLabel = (a, b) => {
	const left = a.label.toLowerCase();
	const right = b.label.toLowerCase();
	return left < right ? -1 : (left > right ? 1 : 0);
};

// Core's checklist. The ticked rows lead, ordered once on open so a tick never moves the row
// under focus, and picks stay in the order they were made. At [max] the unticked rows dim and
// ignore a tick but can still take focus.
export const ChecklistDialog = ({title, options, picked, max, sortByLabel, onSave, onCancel}) => {
	const [rows] = useState(() => {
		const sorted = sortByLabel ? [...options].sort(byLabel) : options;
		return [
			...sorted.filter(({value}) => picked.includes(value)),
			...sorted.filter(({value}) => !picked.includes(value))
		];
	});
	// Picks the list doesn't show stay in, as Core's working set keeps them, until Clear
	const [working, setWorking] = useState(picked);
	const capped = max != null;
	const full = capped && working.length >= max;

	const toggle = (value) => setWorking((prev) => {
		if (prev.includes(value)) return prev.filter((entry) => entry !== value);
		return capped && prev.length >= max ? prev : [...prev, value];
	});
	const selectAll = () => setWorking((prev) => [...prev, ...options.map(({value}) => value).filter((value) => !prev.includes(value))]);
	const save = () => onSave(working);

	return (
		<div className={css.dialogBarrier}>
			<ViewContainer className={`${css.dialog} ${css.checklist}`} spotlightId='options-view'>
				<div className={css.checklistTitle}>{title}</div>
				<div className={css.checklistButtons}>
					{!capped && (
						<SpottableDiv className={css.dialogButton} onClick={selectAll} spotlightId='chk-select-all'>{$L('Select All')}</SpottableDiv>
					)}
					<SpottableDiv className={css.dialogButton} onClick={() => setWorking([])} spotlightId='chk-clear'>{$L('Clear')}</SpottableDiv>
					<SpottableDiv className={`${css.dialogButton} ${css.dialogFilledButton}`} onClick={save} spotlightId='chk-save'>{$L('Save')}</SpottableDiv>
				</div>
				<div className={css.checklistList} onFocus={followFocus}>
					{rows.map(({value, label}, idx) => {
						const ticked = working.includes(value);
						return (
							<SpottableDiv
								key={String(value)}
								className={css.checkRow}
								onClick={() => toggle(value)}
								spotlightId={`chk-${idx}`}
							>
								<span className={`${css.checkBox}${ticked ? ` ${css.checkBoxOn}` : ''}`} />
								<div className={css.checkLabel} style={full && !ticked ? {opacity: 0.4} : undefined}>{label}</div>
							</SpottableDiv>
						);
					})}
				</div>
				<div className={css.checklistActions}>
					<SpottableDiv className={css.dialogButton} onClick={onCancel} spotlightId='chk-cancel'>{$L('Cancel')}</SpottableDiv>
				</div>
			</ViewContainer>
		</div>
	);
};
