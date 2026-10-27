/* eslint-disable react/jsx-no-bind */
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {TMDB_PRESETS} from '../../utils/externalHomeRows';
import {withSeasonalRow} from '../../utils/homeLayout';
import {SEASONAL_COUNTRY_OPTIONS, SEASONAL_HOLIDAYS} from '../../utils/seasonalRow';
import {seasonalCountryLabel, seasonalTitle} from '../../utils/seasonalTitles';
import {renderCheck, renderSettingsIcon, renderToggle} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';
import {SectionTitle, ToggleRow} from './settingsRows';
import {ExternalRowSortRows} from './HomeRowToggleViews';
import SettingsView from './SettingsView';

import css from './Settings.module.less';

// Home rows that come from somewhere other than the Jellyfin library: TMDB charts, the
// Radarr and Sonarr calendars, and lists the viewer pastes a URL for.

export const ExternalTmdbListsView = ({enabledMap, onToggleRow, settings, onOpenOptions}) => (
	<SettingsView spotlightId='external-tmdb-lists-view' title={$L('TMDB Lists')} clean>
		<div className={css.viewDescription}>
			{$L('Choose which TMDB chart rows appear on the home screen.')}
		</div>
		<ExternalRowSortRows
			settings={settings}
			sortByKey='tmdbRowsSortBy'
			sortOrderKey='tmdbRowsSortOrder'
			title={$L('TMDB Row Sorting')}
			desc={$L('Sort TMDB rows by name, release date, rating, and more.')}
			orderDesc={$L('Sort TMDB rows in ascending or descending order.')}
			onOpenOptions={onOpenOptions}
		/>
		<SectionTitle>{$L('TMDB Lists')}</SectionTitle>
		{TMDB_PRESETS.map((cfg) => (
			<SpottableDiv
				key={cfg.id}
				className={css.listItem}
				onClick={() => onToggleRow(cfg.id)}
				spotlightId={`tmdbrow-${cfg.id}`}
			>
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{cfg.title}</div>
				</div>
				<div className={css.listItemTrailing}>{renderToggle(enabledMap.get(cfg.id) === true)}</div>
			</SpottableDiv>
		))}
	</SettingsView>
);

export const ExternalCalendarsView = ({enabledMap, settings, onToggleRow, onToggleSetting}) => {
	const radarrOn = enabledMap.get('radarr_calendar') === true;
	const sonarrOn = enabledMap.get('sonarr_calendar') === true;
	const toggleRow = (settingKey, title, desc, icon) => (
		<ToggleRow
			settingKey={settingKey}
			title={title}
			desc={desc}
			icon={icon}
			checked={settings[settingKey]}
			onToggle={() => onToggleSetting(settingKey)}
		/>
	);

	return (
		<SettingsView spotlightId='external-calendars-view' title={$L('Upcoming Calendars')} clean>
			<div className={css.viewDescription}>
				{$L('Show upcoming releases from Radarr and Sonarr. Requires the servers to be configured in Seerr.')}
			</div>
			<SpottableDiv className={css.listItem} onClick={() => onToggleRow('radarr_calendar')} spotlightId='calendar-radarr'>
				{renderSettingsIcon('movie')}
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{$L('Radarr Upcoming')}</div>
					<div className={css.listItemCaption}>{$L('Upcoming movie releases')}</div>
				</div>
				<div className={css.listItemTrailing}>{renderToggle(radarrOn)}</div>
			</SpottableDiv>
			{radarrOn && toggleRow('radarrCalendarShowCinema', $L('Show Cinema Releases'), '', 'movie')}
			{radarrOn && toggleRow('radarrCalendarShowDigital', $L('Show Digital Releases'), '', 'movie')}
			{radarrOn && toggleRow('radarrCalendarShowPhysical', $L('Show Physical Releases'), '', 'movie')}
			{radarrOn && toggleRow('radarrCalendarShowDate', $L('Show Release Date'), '', 'movie')}
			<SpottableDiv className={css.listItem} onClick={() => onToggleRow('sonarr_calendar')} spotlightId='calendar-sonarr'>
				{renderSettingsIcon('tv')}
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{$L('Sonarr Upcoming')}</div>
					<div className={css.listItemCaption}>{$L('Upcoming episode releases')}</div>
				</div>
				<div className={css.listItemTrailing}>{renderToggle(sonarrOn)}</div>
			</SpottableDiv>
			{sonarrOn && toggleRow('sonarrCalendarShowEpisodeInfo', $L('Show Episode Information'), '', 'tv')}
			{sonarrOn && toggleRow('sonarrCalendarShowDate', $L('Show Release Date'), '', 'tv')}
			{radarrOn && sonarrOn &&
				toggleRow('mergeRadarrSonarrCalendars', $L('Merge Into One Row'), $L('Combine Radarr and Sonarr into a single upcoming row'), 'list')}
		</SettingsView>
	);
};

// The seasonal row is stored twice, as its own synced toggle and as a home row, so switching it
// writes both. Holidays are stored as the hidden ones, so a ticked box is a holiday not in the list.
export const SeasonalRowView = ({settings, onUpdateSettings}) => {
	const enabled = settings.seasonalRowEnabled === true;
	const country = settings.seasonalRowCountry || 'auto';
	const hidden = Array.isArray(settings.seasonalRowHiddenHolidays) ? settings.seasonalRowHiddenHolidays : [];
	const toggleRow = () => onUpdateSettings({
		seasonalRowEnabled: !enabled,
		homeRows: withSeasonalRow(settings.homeRows, !enabled)
	});
	const toggleHoliday = (id) => onUpdateSettings({
		seasonalRowHiddenHolidays: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
	});

	return (
		<SettingsView spotlightId='seasonal-row-view' title={$L('Seasonal Row')} clean>
			<div className={css.viewDescription}>
				{$L('Show a row of holiday movies from your library, with Seerr suggestions when available.')}
			</div>
			<ToggleRow settingKey='seasonalRowEnabled' title={$L('Seasonal Row')} icon='star_shine' checked={enabled} onToggle={toggleRow} />
			<SectionTitle>{$L('Country')}</SectionTitle>
			{SEASONAL_COUNTRY_OPTIONS.map((code) => (
				<SpottableDiv
					key={code}
					className={`${css.listItem} ${code === country ? css.listItemSelected : ''}`}
					onClick={() => onUpdateSettings({seasonalRowCountry: code})}
					spotlightId={`seasonal-country-${code}`}
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{seasonalCountryLabel(code)}</div>
					</div>
					<div className={css.listItemTrailing}>{renderCheck(code === country)}</div>
				</SpottableDiv>
			))}
			<SectionTitle>{$L('Holidays')}</SectionTitle>
			<div className={css.viewCaption}>{$L('Untick a holiday to hide its row.')}</div>
			{SEASONAL_HOLIDAYS.map((id) => (
				<SpottableDiv
					key={id}
					className={css.listItem}
					onClick={() => toggleHoliday(id)}
					spotlightId={`seasonal-holiday-${id}`}
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{seasonalTitle(id)}</div>
					</div>
					<div className={css.listItemTrailing}>{renderToggle(!hidden.includes(id))}</div>
				</SpottableDiv>
			))}
		</SettingsView>
	);
};

const getSourceLabel = (source) => {
	if (source === 'tmdb') return $L('TMDB');
	if (source === 'mdblist') return $L('MDBList');
	if (source === 'letterboxd') return $L('Letterboxd');
	if (source === 'imdb') return $L('IMDb');
	return source;
};

// The manual builder's sources and the fields each one asks for.
const getBuilderSources = () => ([
	{key: 'tmdb_list', label: $L('TMDB List'), fieldA: $L('List ID'), fieldB: null},
	{key: 'tmdb_collection', label: $L('TMDB Collection'), fieldA: $L('Collection ID'), fieldB: null},
	{key: 'mdblist', label: $L('MDBList'), fieldA: $L('Username'), fieldB: $L('List name')},
	{key: 'letterboxd', label: $L('Letterboxd'), fieldA: $L('Username'), fieldB: null}
]);

const getBuilderSortOptions = () => ([
	{value: 'none', label: $L('Default (When Added)')},
	{value: 'title', label: $L('Film Name')},
	{value: 'popularity', label: $L('Popularity')},
	{value: 'year', label: $L('Release Date')},
	{value: 'rating', label: $L('Average Rating')},
	{value: 'shuffle', label: $L('Shuffle')}
]);

const CycleRow = ({label, valueLabel, onCycle, spotlightId}) => (
	<SpottableDiv className={css.listItem} onClick={onCycle} spotlightId={spotlightId}>
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{label}</div>
			<div className={css.listItemCaption}>{valueLabel}</div>
		</div>
	</SpottableDiv>
);

export const ExternalCustomRowsView = ({
	rows,
	url,
	name,
	error,
	saving,
	refreshing,
	refreshMessage,
	mode,
	sourceKey,
	paramA,
	paramB,
	sortBy,
	sortOrder,
	showUserRatings,
	editingId,
	onRefreshAll,
	onUrlChange,
	onNameChange,
	onModeChange,
	onSourceKeyChange,
	onParamAChange,
	onParamBChange,
	onSortByChange,
	onSortOrderChange,
	onToggleUserRatings,
	onToggleRow,
	onDeleteRow,
	onEditRow,
	onCancelEdit,
	onAddRow
}) => {
	const sources = getBuilderSources();
	const sortOptions = getBuilderSortOptions();
	const activeSource = sources.find((s) => s.key === sourceKey) || sources[0];
	const activeSort = sortOptions.find((s) => s.value === sortBy) || sortOptions[0];
	const cycleSource = () => {
		const index = sources.findIndex((s) => s.key === sourceKey);
		onSourceKeyChange(sources[(index + 1) % sources.length].key);
	};
	const cycleSort = () => {
		const index = sortOptions.findIndex((s) => s.value === sortBy);
		onSortByChange(sortOptions[(index + 1) % sortOptions.length].value);
	};
	const sortOrderApplies = sortBy !== 'none' && sortBy !== 'shuffle';
	return (
		<SettingsView spotlightId='external-custom-rows-view' title={$L('Custom Home Rows')} clean>
			<div className={css.viewDescription}>
				{$L('Add a home row from a TMDB list or collection, an MDBList list, or a Letterboxd profile.')}
			</div>
			{rows.some((row) => row.enabled) && (
				<SpottableDiv
					className={css.listItem}
					onClick={refreshing ? undefined : onRefreshAll}
					spotlightId='custom-rows-refresh-all'
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>
							{refreshing ? $L('Refreshing...') : $L('Refresh All Enabled Lists')}
						</div>
						<div className={css.listItemCaption}>
							{refreshMessage || $L('Fetch fresh items for every enabled list')}
						</div>
					</div>
				</SpottableDiv>
			)}
			{rows.map((row) => (
				<div key={row.id} className={css.listItem}>
					<SpottableDiv
						className={css.listItemBody}
						onClick={() => onToggleRow(row.id)}
						spotlightId={`customrow-${row.id}`}
					>
						<div className={css.listItemHeading}>{row.name}</div>
						<div className={css.listItemCaption}>{getSourceLabel(row.source)}</div>
					</SpottableDiv>
					<div className={css.listItemTrailing}>{renderToggle(row.enabled === true)}</div>
					<SpottableDiv
						className={css.listItem}
						onClick={() => onEditRow(row.id)}
						spotlightId={`customrow-edit-${row.id}`}
					>
						<div className={css.listItemHeading}>{editingId === row.id ? $L('Editing') : $L('Edit')}</div>
					</SpottableDiv>
					<SpottableDiv
						className={css.listItem}
						onClick={() => onDeleteRow(row.id)}
						spotlightId={`customrow-del-${row.id}`}
					>
						<div className={css.listItemHeading}>{$L('Delete')}</div>
					</SpottableDiv>
				</div>
			))}
			<CycleRow
				label={editingId ? $L('Editing Saved Row') : $L('Add By')}
				valueLabel={editingId ? $L('Changes apply to the row being edited') : (mode === 'url' ? $L('Pasted URL') : $L('Source and IDs'))}
				onCycle={editingId ? undefined : () => onModeChange(mode === 'url' ? 'manual' : 'url')}
				spotlightId='custom-row-mode'
			/>
			{mode === 'url' && !editingId && (
				<div className={css.inputGroup}>
					<label>{$L('List URL')}</label>
					<SpottableInput
						className={css.input}
						type='text'
						purpose='url'
						value={url}
						onChange={(e) => onUrlChange(e.target.value)}
						placeholder={$L('Paste a TMDB, MDBList, or Letterboxd URL')}
						spotlightId='custom-row-url-input'
					/>
				</div>
			)}
			{(mode === 'manual' || editingId) && (
				<>
					<CycleRow
						label={$L('Source')}
						valueLabel={activeSource.label}
						onCycle={cycleSource}
						spotlightId='custom-row-source'
					/>
					<div className={css.inputGroup}>
						<label>{activeSource.fieldA}</label>
						<SpottableInput
							className={css.input}
							type='text'
							value={paramA}
							onChange={(e) => onParamAChange(e.target.value)}
							spotlightId='custom-row-param-a'
						/>
					</div>
					{activeSource.fieldB && (
						<div className={css.inputGroup}>
							<label>{activeSource.fieldB}</label>
							<SpottableInput
								className={css.input}
								type='text'
								value={paramB}
								onChange={(e) => onParamBChange(e.target.value)}
								spotlightId='custom-row-param-b'
							/>
						</div>
					)}
				</>
			)}
			<div className={css.inputGroup}>
				<label>{$L('Row Name (optional)')}</label>
				<SpottableInput
					className={css.input}
					type='text'
					value={name}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder={$L('Home row title')}
					spotlightId='custom-row-name-input'
				/>
			</div>
			<CycleRow
				label={$L('Sort By')}
				valueLabel={activeSort.label}
				onCycle={cycleSort}
				spotlightId='custom-row-sort-by'
			/>
			{sortOrderApplies && (
				<CycleRow
					label={$L('Sort Order')}
					valueLabel={sortOrder === 'asc' ? $L('Ascending') : $L('Descending')}
					onCycle={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
					spotlightId='custom-row-sort-order'
				/>
			)}
			{sourceKey === 'letterboxd' && (mode === 'manual' || editingId) && (
				<SpottableDiv
					className={css.listItem}
					onClick={onToggleUserRatings}
					spotlightId='custom-row-user-ratings'
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{$L('Show User Ratings')}</div>
						<div className={css.listItemCaption}>{$L('Show the profile owner\'s star ratings on cards')}</div>
					</div>
					<div className={css.listItemTrailing}>{renderToggle(showUserRatings)}</div>
				</SpottableDiv>
			)}
			{error && <div className={css.viewDescription}>{error}</div>}
			<SpottableDiv
				className={css.listItem}
				onClick={saving ? undefined : onAddRow}
				spotlightId='custom-row-add'
			>
				<div className={css.listItemHeading}>
					{saving ? $L('Checking...') : (editingId ? $L('Save Changes') : $L('Add Row'))}
				</div>
			</SpottableDiv>
			{editingId && (
				<SpottableDiv
					className={css.listItem}
					onClick={onCancelEdit}
					spotlightId='custom-row-cancel-edit'
				>
					<div className={css.listItemHeading}>{$L('Cancel Edit')}</div>
				</SpottableDiv>
			)}
		</SettingsView>
	);
};
