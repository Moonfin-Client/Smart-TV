/* eslint-disable react/jsx-no-bind */
import {useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {getSeerrHomeRowConfigs, SEERR_CONFIG_TO_SECTION} from '../../utils/seerrHomeRows';
import {isSupportedSlider, loadDiscoverSliders} from '../../utils/seerrSliders';
import {makeSeerrSliderRow} from '../../utils/pickedRows';
import {OptionRow, SectionTitle} from './settingsRows';
import {getChipLabel, getExternalRowSortByOptions, getExternalRowSortOrderOptions} from './settingsOptions';
import {renderToggle} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';
import SettingsView from './SettingsView';

import css from './Settings.module.less';

// Two lists of rows that are switched on and off one at a time, with no ordering to do.

const ToggleItem = ({spotlightId, title, checked, onClick}) => (
	<SpottableDiv className={css.listItem} onClick={onClick} spotlightId={spotlightId}>
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{title}</div>
		</div>
		<div className={css.listItemTrailing}>{renderToggle(checked)}</div>
	</SpottableDiv>
);

// The sort an IMDb, TMDB or Seerr list screen gives its rows. A direction means nothing for the
// list's own order or a shuffle, so it only shows for the others.
export const ExternalRowSortRows = ({settings, sortByKey, sortOrderKey, title, desc, orderDesc, onOpenOptions}) => {
	const sortBy = settings[sortByKey] || 'none';
	const open = (settingKey, heading, options) => onOpenOptions({
		title: heading,
		options,
		settingKey,
		value: settings[settingKey],
		returnFocusTo: `setting-${settingKey}`
	});
	return (
		<>
			<SectionTitle>{$L('Sorting')}</SectionTitle>
			<OptionRow
				settingKey={sortByKey}
				title={title}
				desc={desc}
				caption={getChipLabel(getExternalRowSortByOptions(), sortBy, $L('Default (List Order)'))}
				icon='sort'
				onOpen={() => open(sortByKey, title, getExternalRowSortByOptions())}
			/>
			{sortBy !== 'none' && sortBy !== 'shuffle' && (
				<OptionRow
					settingKey={sortOrderKey}
					title={$L('Sort Order')}
					desc={orderDesc}
					caption={getChipLabel(getExternalRowSortOrderOptions(), settings[sortOrderKey], $L('Ascending'))}
					icon='swap_vert'
					onOpen={() => open(sortOrderKey, $L('Sort Order'), getExternalRowSortOrderOptions())}
				/>
			)}
		</>
	);
};

// The custom sliders a Seerr admin set up come after the rows this app knows, read fresh each time
// the screen opens. A failed read just leaves them off the screen.
export const SeerrHomeRowsView = ({seerrLabel, enabledMap, onToggleRow, homeRows, serverUrl, onToggleSlider, settings, onOpenOptions}) => {
	const [sliders, setSliders] = useState([]);

	useEffect(() => {
		let cancelled = false;
		loadDiscoverSliders({force: true}).then((list) => {
			if (!cancelled) setSliders(list.filter(isSupportedSlider));
		}, () => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const isSliderShown = (slider) => {
		const id = makeSeerrSliderRow({serverUrl, sliderId: slider.id, sliderType: slider.type}).id;
		return (homeRows || []).some((row) => row.id === id && row.enabled);
	};

	return (
		<SettingsView spotlightId='seerr-home-rows-view' title={`${seerrLabel} ${$L('Home Rows')}`} clean>
			<div className={css.viewDescription}>
				{$L('Choose which Seerr discover rows appear on the home screen.')}
			</div>
			<ExternalRowSortRows
				settings={settings}
				sortByKey='seerrRowsSortBy'
				sortOrderKey='seerrRowsSortOrder'
				title={$L('Seerr Row Sorting')}
				desc={$L('Sort Seerr rows by name, release date, rating, and more.')}
				orderDesc={$L('Sort Seerr rows in ascending or descending order.')}
				onOpenOptions={onOpenOptions}
			/>
			<SectionTitle>{$L('Rows')}</SectionTitle>
			{getSeerrHomeRowConfigs().map((cfg) => (
				<ToggleItem
					key={cfg.id}
					spotlightId={`seerrrow-${cfg.id}`}
					title={cfg.title}
					checked={enabledMap.get(SEERR_CONFIG_TO_SECTION[cfg.id]) === true}
					onClick={() => onToggleRow(cfg.id)}
				/>
			))}
			{sliders.length > 0 && <SectionTitle>{$L('Seerr Discover Sliders')}</SectionTitle>}
			{sliders.map((slider) => (
				<ToggleItem
					key={`${slider.id}:${slider.type}`}
					spotlightId={`seerrslider-${slider.id}`}
					title={slider.title}
					checked={isSliderShown(slider)}
					onClick={() => onToggleSlider(slider)}
				/>
			))}
		</SettingsView>
	);
};

// Each list is stored twice, as its own setting and as a home row, so switching one writes
// both and the row appears in Home Sections straight away.
const IMDB_LISTS = [
	{ id: 'imdbTop250MoviesEnabled', rowId: 'imdb-top250-movies', title: () => $L('IMDb Top 250 Movies') },
	{ id: 'imdbTop250TvShowsEnabled', rowId: 'imdb-top250-tv', title: () => $L('IMDb Top 250 TV Shows') },
	{ id: 'imdbMostPopularMoviesEnabled', rowId: 'imdb-popular-movies', title: () => $L('IMDb Most Popular Movies') },
	{ id: 'imdbMostPopularTvShowsEnabled', rowId: 'imdb-popular-tv', title: () => $L('IMDb Most Popular TV Shows') },
	{ id: 'imdbLowestRatedMoviesEnabled', rowId: 'imdb-lowest-rated', title: () => $L('IMDb Lowest Rated Movies') },
	{ id: 'imdbTopEnglishMoviesEnabled', rowId: 'imdb-top-english', title: () => $L('IMDb Top Rated English Movies') }
];

export const ImdbListsView = ({settings, onUpdateSettings, onOpenOptions}) => {
	const toggleImdbList = (settingKey, rowId) => {
		const nextValue = !settings[settingKey];
		const updatedHomeRows = (settings.homeRows || []).map((row) =>
			row.id === rowId ? { ...row, enabled: nextValue } : row
		);
		onUpdateSettings({
			[settingKey]: nextValue,
			homeRows: updatedHomeRows
		});
	};

	return (
		<SettingsView spotlightId='imdb-lists-view' title={$L('IMDb Lists')} clean>
			<div className={css.viewDescription}>
				{$L('Choose which IMDb lists are active. Activating a list adds it to your Home Sections.')}
			</div>
			<ExternalRowSortRows
				settings={settings}
				sortByKey='imdbRowsSortBy'
				sortOrderKey='imdbRowsSortOrder'
				title={$L('IMDb Row Sorting')}
				desc={$L('Sort IMDb rows by name, release date, rating, and more.')}
				orderDesc={$L('Sort IMDb rows in ascending or descending order.')}
				onOpenOptions={onOpenOptions}
			/>
			<SectionTitle>{$L('IMDb Lists')}</SectionTitle>
			{IMDB_LISTS.map((cfg) => (
				<SpottableDiv
					key={cfg.id}
					className={css.listItem}
					onClick={() => toggleImdbList(cfg.id, cfg.rowId)}
					spotlightId={`imdblist-${cfg.id}`}
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{cfg.title()}</div>
					</div>
					<div className={css.listItemTrailing}>{renderToggle(settings[cfg.id] === true)}</div>
				</SpottableDiv>
			))}
		</SettingsView>
	);
};
