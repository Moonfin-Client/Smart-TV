/* eslint-disable react/jsx-no-bind */
import {Fragment} from 'react';
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {renderSettingsIcon, renderChevron, renderRadio} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';
import {SectionTitle, Swatch} from './settingsRows';
import SettingsView from './SettingsView';
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
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{entry.title}</div>
			<div className={css.listItemCaption}>{entry.breadcrumb}</div>
		</div>
		<div className={css.listItemTrailing}>{renderChevron()}</div>
	</SpottableDiv>
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
	<SettingsView spotlightId='categories-view'>
		<SectionTitle>{$L('Settings')}</SectionTitle>
		{!hideSearch && (
			<SpottableInput
				className={css.searchInput}
				type='text'
				value={searchQuery}
				onChange={onSearchChange}
				onKeyDown={onSearchKeyDown}
				placeholder={$L('Search settings')}
				spotlightId='settings-search-input'
				autoComplete='off'
			/>
		)}
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
				<SpottableDiv
					key={cat.id}
					className={css.listItem}
					onClick={() => onOpenCategory(cat.id)}
					spotlightId={`cat-${cat.id}`}
				>
					{renderSettingsIcon(cat.icon)}
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{cat.label}</div>
						<div className={css.listItemCaption}>{cat.description}</div>
					</div>
					<div className={css.listItemTrailing}>{renderChevron()}</div>
				</SpottableDiv>
			))}
	</SettingsView>
);

export const CategoryView = ({title, subcategories, onOpenSubcategory}) => (
	<SettingsView spotlightId='category-view'>
		<SectionTitle>{title}</SectionTitle>
		{subcategories.map((sub, index) => (
			<Fragment key={sub.id}>
				{sub.section && sub.section !== subcategories[index - 1]?.section && (
					<SectionTitle>{sub.section}</SectionTitle>
				)}
				<SpottableDiv
					className={css.listItem}
					onClick={() => onOpenSubcategory(sub)}
					spotlightId={`subcat-${sub.id}`}
				>
					{renderSettingsIcon(sub.icon)}
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{sub.label}</div>
						{sub.description && <div className={css.listItemCaption}>{sub.description}</div>}
					</div>
					<div className={css.listItemTrailing}>{renderChevron()}</div>
				</SpottableDiv>
			</Fragment>
		))}
	</SettingsView>
);

export const SubcategoryView = ({title, children}) => (
	<SettingsView spotlightId='subcategory-view'>
		<SectionTitle>{title}</SectionTitle>
		{children}
	</SettingsView>
);

export const OptionsView = ({title, options, currentValue, onSelect}) => (
	<SettingsView spotlightId='options-view'>
		<SectionTitle>{title}</SectionTitle>
		{options.map((opt, idx) => (
			<SpottableDiv
				key={String(opt.value)}
				className={`${css.listItem} ${opt.value === currentValue ? css.listItemSelected : ''}`}
				onClick={() => onSelect(opt.value)}
				spotlightId={`opt-${idx}`}
			>
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{opt.label}</div>
				</div>
				<div className={css.listItemTrailing}>
					<Swatch color={opt.swatch} />
					{renderRadio(opt.value === currentValue)}
				</div>
			</SpottableDiv>
		))}
	</SettingsView>
);
