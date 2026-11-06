// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {buildBrowseRows, sameRowList} from './buildBrowseRows';
import {FAVORITE_ROW_CONFIGS} from './browseFilters';
import {FAVORITE_ROW_IDS} from '../../utils/homeRowGates';
import {parentalFilterFromRatings} from '../../utils/parentalFilter';

const row = (id, items = [], extra = {}) => ({id, items, title: id, ...extra});
const item = (Id, extra = {}) => ({Id, ...extra});

const settings = (over = {}) => ({
	mergeContinueWatchingNextUp: false,
	hiddenContinueWatchingItems: null,
	hiddenNextUpSeries: null,
	displayFavoritesRows: true,
	displayCollectionsRows: true,
	displayGenresRows: true,
	displayPlaylistsRows: true,
	imdbTop250MoviesEnabled: true,
	...over
});

const build = (over = {}) => buildBrowseRows({
	allRowData: [],
	seerrRows: [],
	externalRows: [],
	homeRowsConfig: [],
	pluginSectionsConfig: [],
	settings: settings(),
	...over
});

describe('row selection', () => {
	test('a row the viewer has not enabled is left out', () => {
		const rows = build({
			allRowData: [row('collections'), row('genres')],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 0}, {id: 'genres', enabled: false, order: 1}]
		});

		expect(rows.map((r) => r.id)).toEqual(['collections']);
	});

	test('a row switched off by its own setting is left out even when enabled', () => {
		const gated = (id, over) => build({
			allRowData: [row(id)],
			homeRowsConfig: [{id, enabled: true, order: 0}],
			settings: settings(over)
		});

		expect(gated('collections', {displayCollectionsRows: false})).toEqual([]);
		expect(gated('favoriteMovies', {displayFavoritesRows: false})).toEqual([]);
		expect(gated('imdb-top250-movies', {imdbTop250MoviesEnabled: false})).toEqual([]);
		expect(gated('imdb-top250-movies', {}).map((r) => r.id)).toEqual(['imdb-top250-movies']);
	});

	test('plugin rows answer to the plugin list rather than the row list', () => {
		const rows = build({
			allRowData: [row('plugin:a', [], {isPluginRow: true}), row('plugin:b', [], {isPluginRow: true})],
			pluginSectionsConfig: [{id: 'plugin:a', enabled: true, order: 0}, {id: 'plugin:b', enabled: false, order: 1}]
		});

		expect(rows.map((r) => r.id)).toEqual(['plugin:a']);
	});

	test('a picked row sits where the layout puts it', () => {
		const picked = {id: 'pluginDynamic:collections:http://server:collection:c1', name: 'Alien', enabled: true, order: 0, source: 'collections', itemId: 'c1', serverUrl: 'http://server'};
		const rows = build({
			allRowData: [row('collections'), row(picked.id, undefined, {isPluginRow: true})],
			homeRowsConfig: [picked, {id: 'collections', enabled: true, order: 1}],
			pluginSectionsConfig: [picked]
		});

		expect(rows.map((r) => r.id)).toEqual([picked.id, 'collections']);
	});

	test('an empty resume row is dropped rather than shown empty', () => {
		const rows = build({
			allRowData: [row('resume', [])],
			homeRowsConfig: [{id: 'resume', enabled: true, order: 0}]
		});

		expect(rows).toEqual([]);
	});

	test('next up drops anything already in continue watching', () => {
		const rows = build({
			allRowData: [row('resume', [item('1')]), row('nextup', [item('1'), item('2')])],
			homeRowsConfig: [{id: 'resume', enabled: true, order: 0}, {id: 'nextup', enabled: true, order: 1}]
		});

		expect(rows.find((r) => r.id === 'nextup').items.map((i) => i.Id)).toEqual(['2']);
	});
});

describe('merged continue watching', () => {
	const merged = (over) => build({
		settings: settings({mergeContinueWatchingNextUp: true}),
		homeRowsConfig: [{id: 'resume', enabled: true, order: 0}, {id: 'nextup', enabled: true, order: 1}],
		...over
	});

	test('resume and next up become one row ordered by what was played last', () => {
		const rows = merged({
			allRowData: [
				row('resume', [item('a', {UserData: {LastPlayedDate: '2026-01-01'}})]),
				row('nextup', [item('b', {UserData: {LastPlayedDate: '2026-02-01'}})])
			]
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('continue-nextup');
		expect(rows[0].items.map((i) => i.Id)).toEqual(['b', 'a']);
	});

	test('a next up episode borrows the date its series was last played', () => {
		const rows = merged({
			allRowData: [
				row('resume', [item('watched', {SeriesId: 's1', UserData: {LastPlayedDate: '2026-03-01'}})]),
				row('nextup', [item('queued', {SeriesId: 's1'})]),
				row('other', [item('old', {UserData: {LastPlayedDate: '2026-01-01'}})])
			]
		});

		const combined = rows.find((r) => r.id === 'continue-nextup');
		expect(combined.items.find((i) => i.Id === 'queued').UserData.LastPlayedDate).toBe('2026-03-01');
	});

	test('cards paged in later go after the ones already drawn, even when played more recently', () => {
		const played = (Id, date) => item(Id, {UserData: {LastPlayedDate: date}});
		const rows = merged({
			allRowData: [
				row('resume', [played('a', '2026-01-02'), played('late', '2026-01-01'), played('paged', '2026-03-01')], {pagedFrom: 2}),
				row('nextup', [played('b', '2026-01-03'), played('new', '2026-04-01'), item('a')], {pagedFrom: 1})
			]
		});
		expect(rows[0].items.map((i) => i.Id)).toEqual(['b', 'a', 'late', 'paged', 'new']);
	});

	test('nothing to continue means no row at all', () => {
		expect(merged({allRowData: [row('resume', []), row('nextup', [])]})).toEqual([]);
	});

	test('the merged row stops at 100 cards and asks for no more', () => {
		const many = (prefix, count) => Array.from({length: count}, (_, i) => item(`${prefix}${i}`));
		const rows = merged({
			allRowData: [row('resume', many('r', 70), {hasMore: true}), row('nextup', many('n', 60), {hasMore: true})]
		});
		expect(rows[0].items).toHaveLength(100);
		expect(rows[0].hasMore).toBe(false);
		const short = merged({allRowData: [row('resume', many('r', 20), {hasMore: true}), row('nextup', many('n', 10))]});
		expect(short[0].hasMore).toBe(true);
	});
});

describe('ordering', () => {
	test('rows follow the stored order rather than the order they loaded in', () => {
		const rows = build({
			allRowData: [row('genres'), row('collections')],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 0}, {id: 'genres', enabled: true, order: 1}]
		});

		expect(rows.map((r) => r.id)).toEqual(['collections', 'genres']);
	});

	test('a row with no stored place goes after the ones that have one', () => {
		const rows = build({
			allRowData: [row('collections')],
			seerrRows: [row('seerr_trending')],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 5}]
		});

		expect(rows.map((r) => r.id)).toEqual(['collections', 'seerr_trending']);
	});
});

describe('titles', () => {
	test('a cached row is renamed for the language being read now', () => {
		const rows = build({
			allRowData: [row('collections', [], {title: 'Sammlungen'})],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 0}]
		});

		expect(rows[0].title).toBe('Collections');
	});

	test('a row whose title already matches keeps its identity', () => {
		const original = row('collections', [], {title: 'Collections'});
		const rows = build({
			allRowData: [original],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 0}]
		});

		expect(rows[0]).toBe(original);
	});
});

describe('sameRowList', () => {
	test('sees no change when the drawn parts match', () => {
		expect(sameRowList([row('a', [item('1'), item('2')])], [row('a', [item('1'), item('2')])])).toBe(true);
	});

	test('sees a change in length, title, or the first or last item', () => {
		expect(sameRowList([row('a', [item('1')])], [row('a', [item('1')]), row('b')])).toBe(false);
		expect(sameRowList([row('a', [item('1')])], [row('a', [item('2')])])).toBe(false);
		expect(sameRowList([row('a', [item('1'), item('9')])], [row('a', [item('1'), item('8')])])).toBe(false);
		expect(sameRowList([{...row('a'), title: 'X'}], [{...row('a'), title: 'Y'}])).toBe(false);
	});

	test('detects changes in watching now subtitle or item details', () => {
		const watchingRow1 = {
			id: 'mdblist_watching_now',
			title: 'Watching on MDBList',
			subtitle: '10 watching now',
			isWatchingNowRow: true,
			items: [{Id: '1', Name: 'Movie 1', Rank: 1, Watchers: 10}]
		};
		const watchingRow2 = {
			...watchingRow1,
			subtitle: '15 watching now'
		};
		const watchingRow3 = {
			...watchingRow1,
			items: [{Id: '1', Name: 'Movie 1', Rank: 1, Watchers: 15}]
		};
		expect(sameRowList([watchingRow1], [watchingRow1])).toBe(true);
		expect(sameRowList([watchingRow1], [watchingRow2])).toBe(false);
		expect(sameRowList([watchingRow1], [watchingRow3])).toBe(false);
	});
});

// The rows are built from one list and gated by another, so a favourite row added to only
// one of them would either never appear or never be gated.
describe('favourite rows', () => {
	test('the rows that get built are exactly the ones the gate knows about', () => {
		expect(FAVORITE_ROW_CONFIGS.map((config) => config.id)).toEqual(FAVORITE_ROW_IDS);
	});
});

describe('blocked ratings', () => {
	const rowsWithRatings = () => [
		row('collections', [
			item('1', {OfficialRating: 'R'}),
			item('2', {OfficialRating: 'PG'}),
			item('3')
		])
	];
	const config = [{id: 'collections', enabled: true, order: 0}];

	test('items carrying a blocked rating drop out and unrated ones stay', () => {
		const rows = build({
			allRowData: rowsWithRatings(),
			homeRowsConfig: config,
			settings: settings({parentalFilter: parentalFilterFromRatings(['R'])})
		});

		expect(rows[0].items.map((i) => i.Id)).toEqual(['2', '3']);
	});

	test('a rating matches whatever case and spacing it was stored with', () => {
		const rows = build({
			allRowData: [row('collections', [item('1', {OfficialRating: ' r '})])],
			homeRowsConfig: config,
			settings: settings({parentalFilter: parentalFilterFromRatings(['R'])})
		});

		expect(rows).toEqual([]);
	});

	test('an empty block list leaves every row alone', () => {
		const rows = build({
			allRowData: rowsWithRatings(),
			homeRowsConfig: config,
			settings: settings({parentalFilter: parentalFilterFromRatings([])})
		});

		expect(rows[0].items).toHaveLength(3);
	});

	test('blocking a rating also drops everything stronger than it', () => {
		const rows = build({
			allRowData: [row('collections', [
				item('1', {OfficialRating: 'NC-17'}),
				item('2', {OfficialRating: 'TV-MA'}),
				item('3', {OfficialRating: 'PG-13'})
			])],
			homeRowsConfig: config,
			settings: settings({parentalFilter: parentalFilterFromRatings(['R'])})
		});

		expect(rows[0].items.map((i) => i.Id)).toEqual(['3']);
	});
});

describe('row group toggles', () => {
	test('audio, studios, and rewatch rows answer to their display settings', () => {
		const data = [
			row('audioalbums', [item('1')]),
			row('studios', [item('2')]),
			row('rewatch', [item('3')])
		];
		const config = [
			{id: 'audioalbums', enabled: true, order: 0},
			{id: 'studios', enabled: true, order: 1},
			{id: 'rewatch', enabled: true, order: 2}
		];

		const off = build({allRowData: data, homeRowsConfig: config,
			settings: settings({displayAudioRows: false, displayStudiosRows: false, displayRewatchRow: false})});
		expect(off).toEqual([]);

		const on = build({allRowData: data, homeRowsConfig: config,
			settings: settings({displayAudioRows: true, displayStudiosRows: true, displayRewatchRow: true})});
		expect(on.map((r) => r.id)).toEqual(['audioalbums', 'studios', 'rewatch']);
	});
});

describe('row subtitles', () => {
	test('external rows carry the source label the other clients print', () => {
		const rows = build({
			externalRows: [
				{id: 'imdb-top250-movies', title: 'IMDb Top 250 Movies', items: [item('1')]},
				{id: 'tmdb_popular_movies', title: 'Popular Movies', items: [item('2')]},
				{id: 'radarr_calendar', title: 'Radarr Upcoming', items: [item('3')]},
				{id: 'sonarr_calendar', title: 'Sonarr Upcoming', items: [item('4')]}
			],
			settings: settings({imdbTop250MoviesEnabled: true})
		});

		const byId = Object.fromEntries(rows.map((r) => [r.id, r.subtitle]));
		expect(byId['imdb-top250-movies']).toBe('IMDb List');
		expect(byId['tmdb_popular_movies']).toBe('TMDB Lists');
		expect(byId['radarr_calendar']).toBe('Radarr Calendar');
		expect(byId['sonarr_calendar']).toBe('Sonarr Calendar');
	});

	test('the merged calendar row names both calendars', () => {
		const rows = build({
			externalRows: [{id: 'radarr_calendar', title: 'Upcoming Releases', items: [item('1')], isCalendarMerged: true}]
		});

		expect(rows[0].subtitle).toBe('Radarr and Sonarr Calendars');
	});

	test('library rows stay without one', () => {
		const rows = build({
			allRowData: [row('collections', [item('1')])],
			homeRowsConfig: [{id: 'collections', enabled: true, order: 0}]
		});

		expect(rows[0].subtitle).toBeUndefined();
	});
});

describe('loading placeholders', () => {
	const config = [
		{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
		{id: 'latest-media', name: 'Recently Added Media', enabled: true, order: 1},
		{id: 'collections', name: 'Collections', enabled: true, order: 2},
		{id: 'audioalbums', name: 'Music Albums', enabled: true, order: 3},
		{id: 'sinceyouwatched1', name: 'Since You Watched Row 1', enabled: true, order: 4},
		{id: 'genres', name: 'Genres', enabled: false, order: 5}
	];

	test('a section still loading holds its place under its own title', () => {
		const rows = build({
			allRowData: [row('resume', [item('a')])],
			homeRowsConfig: config,
			settings: settings({displayAudioRows: true}),
			pendingSections: ['latest-media', 'collections', 'audioalbums', 'sinceyouwatched1']
		});

		expect(rows.map((r) => [r.id, r.title, Boolean(r.isPlaceholder)])).toEqual([
			['resume', 'Continue Watching', false],
			['latest-media', 'Recently Added Media', true],
			['collections', 'Collections', true],
			['audioalbums', 'Music Albums', true],
			['sinceyouwatched1', 'Since you watched', true]
		]);
		expect(rows[3].type).toBe('square');
		expect(rows[2].type).toBe('portrait');
	});

	test('a section the viewer has switched off gets no placeholder', () => {
		const rows = build({
			homeRowsConfig: config,
			settings: settings({displayCollectionsRows: false}),
			pendingSections: ['collections', 'genres']
		});

		expect(rows).toEqual([]);
	});

	test('a placeholder gives way to the row it was holding a place for', () => {
		const rows = build({
			allRowData: [row('collections', [item('a')])],
			homeRowsConfig: config,
			pendingSections: ['collections']
		});

		expect(rows.map((r) => [r.id, Boolean(r.isPlaceholder)])).toEqual([['collections', false]]);
	});

	test('a section known to come back empty holds no place while it loads', () => {
		const rows = build({
			homeRowsConfig: [...config, {id: 'imdb-top250-movies', enabled: true, order: 6}],
			pendingSections: ['collections', 'sinceyouwatched1'],
			pendingRows: [{id: 'imdb-top250-movies', title: 'IMDb Top 250 Movies'}],
			emptySections: new Set(['sinceyouwatched1', 'imdb-top250-movies'])
		});

		expect(rows.map((r) => r.id)).toEqual(['collections']);
	});

	test('a plugin section is titled and gated by the plugin list', () => {
		const rows = build({
			pluginSectionsConfig: [{id: 'plugin:a', name: 'Plugin A', enabled: true, order: 0}, {id: 'plugin:b', name: 'Plugin B', enabled: false, order: 1}],
			pendingSections: ['plugin:a', 'plugin:b']
		});

		expect(rows.map((r) => [r.id, r.title])).toEqual([['plugin:a', 'Plugin A']]);
	});

	test('rows reported by the other sources keep their titles and pick up their source label', () => {
		const rows = build({
			homeRowsConfig: [{id: 'imdb-top250-movies', enabled: true, order: 0}],
			pendingRows: [{id: 'imdb-top250-movies', title: 'IMDb Top 250 Movies'}]
		});

		expect(rows.map((r) => [r.title, r.subtitle, Boolean(r.isPlaceholder)])).toEqual([['IMDb Top 250 Movies', 'IMDb List', true]]);
	});
});

describe('ratings on rows from outside lists', () => {
	const filter = parentalFilterFromRatings(['R']);
	const external = (id, items, extra = {}) => row(id, items, {isExternalRow: true, ...extra});

	test('an unrated title in a chart row drops out once anything is blocked', () => {
		const rows = build({
			externalRows: [external('imdb-top250-movies', [
				item('pg', {OfficialRating: 'PG'}),
				item('unrated'),
				item('r', {OfficialRating: 'R'})
			])],
			settings: settings({parentalFilter: filter})
		});

		expect(rows[0].items.map((i) => i.Id)).toEqual(['pg']);
	});

	test('calendar rows keep their unrated items, since they never carry ratings', () => {
		const rows = build({
			externalRows: [
				external('radarr_calendar', [item('1')], {isCalendarRow: true}),
				external('radarr_calendar', [item('2')], {isCalendarMerged: true})
			],
			settings: settings({parentalFilter: filter})
		});

		expect(rows.map((r) => r.items.length)).toEqual([1, 1]);
	});

	test('the seasonal row judges owned titles by the library rule and suggestions strictly', () => {
		const rows = build({
			externalRows: [external('seasonal', [
				item('owned-unrated'),
				item('owned-r', {OfficialRating: 'R'}),
				item('suggested-unrated', {_strictRating: true}),
				item('suggested-pg', {OfficialRating: 'PG', _strictRating: true})
			], {isSeasonalRow: true, holiday: 'christmas'})],
			settings: settings({parentalFilter: filter})
		});

		expect(rows[0].items.map((i) => i.Id)).toEqual(['owned-unrated', 'suggested-pg']);
	});

	test('with nothing blocked every outside title stays', () => {
		const rows = build({
			externalRows: [external('imdb-top250-movies', [item('pg', {OfficialRating: 'PG'}), item('unrated')])],
			settings: settings({parentalFilter: parentalFilterFromRatings([])})
		});

		expect(rows[0].items).toHaveLength(2);
	});

	test('the seasonal row is labelled as seasonal under its title', () => {
		const rows = build({externalRows: [external('seasonal', [item('1')], {isSeasonalRow: true, title: 'Halloween'})]});

		expect(rows[0].title).toBe('Halloween');
		expect(rows[0].subtitle).toBe('Seasonal');
	});
});
