jest.mock('../services/externalRowsApi', () => ({
	fetchCustomRow: jest.fn(),
	constructSourceUrl: jest.fn()
}));
jest.mock('./fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('./uiLocale', () => ({uiLocale: () => 'en-US'}));

import {fetchCustomRow, constructSourceUrl} from '../services/externalRowsApi';
import seerrApi from '../services/seerrApi';
import {fetchWithTimeout} from './fetchTimeout';
import {buildSeasonalRow, fetchCalendarRows, fetchExternalPresetRow, formatWatchingNowSubtitle, normalizeWatchingNowItem, sortExternalItems, validateCustomRow} from './externalHomeRows';

const listUrl = 'https://mdblist.com/lists/user/list';
const row = {source: 'mdblist', type: 'user_list', params: {username: 'user', listname: 'list'}};

describe('validateCustomRow', () => {
	beforeEach(() => {
		constructSourceUrl.mockReturnValue(listUrl);
	});

	it('waits longer than a home row and reads the server cache', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Movie'}]);

		expect(await validateCustomRow(row)).toEqual({ok: true});
		expect(fetchCustomRow).toHaveBeenCalledWith(row, {timeoutMs: 45000});
	});

	it('names the list when it comes back empty', async () => {
		fetchCustomRow.mockResolvedValue([]);

		expect(await validateCustomRow(row)).toEqual({error: expect.stringContaining(listUrl)});
	});

	it('forwards language option when validating', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Movie'}]);

		expect(await validateCustomRow(row, {language: 'es-ES'})).toEqual({ok: true});
		expect(fetchCustomRow).toHaveBeenCalledWith(row, {timeoutMs: 45000, language: 'es-ES'});
	});
});

describe('fetchExternalPresetRow', () => {
	it('takes a TMDB chart item for what the chart holds, whatever it was labelled', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Dragon Tales', type: 'Movie', providerIds: {Tmdb: '1585'}}]);

		const [show] = await fetchExternalPresetRow('tmdb_popular_tv');
		expect(show.Type).toBe('Series');
		expect(show._seerrMediaType).toBe('tv');
		expect(show._seerrRaw).toEqual({mediaId: 1585, mediaType: 'tv'});
	});

	it('keeps the type each item came with on the chart that mixes movies and shows', async () => {
		fetchCustomRow.mockResolvedValue([
			{name: 'A movie', type: 'Movie', providerIds: {Tmdb: '1'}},
			{name: 'A show', type: 'Series', providerIds: {Tmdb: '2'}}
		]);

		const items = await fetchExternalPresetRow('tmdb_trending_all_weekly');
		expect(items.map((item) => item.Type)).toEqual(['Movie', 'Series']);
	});

	it('keeps the rating the plugin looked up', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Elf', type: 'Movie', officialRating: 'PG', providerIds: {Tmdb: '10719'}}]);

		const [card] = await fetchExternalPresetRow('tmdb_popular_movies');
		expect(card.OfficialRating).toBe('PG');
	});

	it('forwards language option to fetchCustomRow', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Elf', type: 'Movie', officialRating: 'PG', providerIds: {Tmdb: '10719'}}]);

		await fetchExternalPresetRow('tmdb_popular_movies', {language: 'fr-FR'});
		expect(fetchCustomRow).toHaveBeenCalledWith(
			{source: 'tmdb_chart', type: 'movie/popular', params: {}},
			{language: 'fr-FR'}
		);
	});
});

describe('buildSeasonalRow', () => {
	const owned = {Id: 'abc', Name: 'Elf', Type: 'Movie', OfficialRating: 'PG', ImageTags: {Primary: '1A'}};
	const suggestion = {name: 'The Polar Express', type: 'Movie', productionYear: 2004, officialRating: 'G', providerIds: {Tmdb: '10719'}, posterUrl: '/p.jpg', overview: 'A boy rides a train.', rating: 6.7, genres: ['Animation'], runTimeTicks: 60000000000};
	const payload = (over = {}) => ({holiday: 'christmas', items: [owned], suggestions: [suggestion], ...over});

	it('answers nothing without a holiday or for one the viewer hid', () => {
		expect(buildSeasonalRow(null)).toBeNull();
		expect(buildSeasonalRow(payload({holiday: null}))).toBeNull();
		expect(buildSeasonalRow(payload(), ['christmas'])).toBeNull();
		expect(buildSeasonalRow(payload({items: [], suggestions: []}))).toBeNull();
	});

	it('keeps owned movies as the library items they are and makes Seerr cards of the suggestions', () => {
		const rowData = buildSeasonalRow(payload(), ['halloween']);

		expect(rowData.id).toBe('seasonal');
		expect(rowData.holiday).toBe('christmas');
		expect(rowData.title).toBe('Christmas Movies');
		expect(rowData.isExternalRow).toBe(true);
		expect(rowData.isSeasonalRow).toBe(true);
		expect(rowData.items[0]).toBe(owned);
		const card = rowData.items[1];
		expect(card._seerr).toBe(true);
		expect(card._strictRating).toBe(true);
		expect(card.OfficialRating).toBe('G');
		expect(card.Overview).toBe('A boy rides a train.');
		expect(card.CommunityRating).toBe(6.7);
		expect(card.Genres).toEqual(['Animation']);
		expect(card.RunTimeTicks).toBe(60000000000);
		expect(card._seerrRaw).toEqual({mediaId: 10719, mediaType: 'movie'});
	});

	it('leaves the rating null on a suggestion nobody rated', () => {
		const rowData = buildSeasonalRow(payload({items: [], suggestions: [{...suggestion, officialRating: null}]}));

		expect(rowData.items[0].OfficialRating).toBeNull();
	});
});

describe('fetchCalendarRows', () => {
	const settings = {radarrCalendarShowCinema: true, radarrCalendarShowDate: true};
	const movie = (tmdbId, title, inCinemas, extra = {}) => ({tmdbId, title, inCinemas, images: [], ...extra});

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 9, 27, 12));
		jest.spyOn(seerrApi, 'getRadarrSettings').mockResolvedValue([{hostname: 'radarr', port: 7878, apiKey: 'key'}]);
		jest.spyOn(seerrApi, 'getSonarrSettings').mockResolvedValue([{hostname: 'sonarr', port: 8989, apiKey: 'key'}]);
	});
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	const radarrRow = async (movies, extra = {}) => {
		fetchWithTimeout.mockResolvedValue({ok: true, json: () => Promise.resolve(movies)});
		const [calendar] = await fetchCalendarRows({...settings, ...extra}, {radarrEnabled: true});
		return calendar;
	};

	it('keeps a movie on the row through its release day and drops it after', async () => {
		const calendar = await radarrRow([
			movie(1, 'Out today', '2026-10-27T00:00:00Z'),
			movie(2, 'Out yesterday', '2026-10-26T00:00:00Z'),
			movie(3, 'Out tomorrow', '2026-10-28T00:00:00Z')
		]);
		expect(calendar.items.map((item) => item.Name)).toEqual(['Out today', 'Out tomorrow']);
	});

	it('labels a release with the day Radarr gives, wherever the TV is', async () => {
		const calendar = await radarrRow([movie(1, 'Out today', '2026-10-27T00:00:00Z')]);
		expect(calendar.items[0].Subtitle).toBe('Cinema \u00b7 Today (Oct 27)');
	});

	it('leaves out a movie Radarr already has only while the setting is on', async () => {
		const movies = [
			movie(1, 'Downloaded', '2026-10-28T00:00:00Z', {hasFile: true}),
			movie(2, 'Missing', '2026-10-29T00:00:00Z')
		];

		expect((await radarrRow(movies, {radarrCalendarHideDownloaded: true})).items.map((item) => item.Name)).toEqual(['Missing']);
		expect((await radarrRow(movies, {radarrCalendarHideDownloaded: false})).items.map((item) => item.Name)).toEqual(['Downloaded', 'Missing']);
	});

	it('names the release format only when more than one kind of date could show', async () => {
		const digital = [{tmdbId: 1, title: 'Streaming', digitalRelease: '2026-10-30T00:00:00Z', physicalRelease: '2026-12-01T00:00:00Z', images: []}];
		const only = {radarrCalendarShowCinema: false, radarrCalendarShowDigital: true};

		expect((await radarrRow(digital, only)).items[0].Subtitle).toBe('In 3 days (Oct 30)');
		expect((await radarrRow(digital, {...only, radarrCalendarShowPhysical: true})).items[0].Subtitle).toBe('Digital \u00b7 In 3 days (Oct 30)');
		expect((await radarrRow(digital, {...only, radarrCalendarShowDate: false})).items[0].Subtitle).toBe('');
	});

	it('reads two releases on one day as the physical one', async () => {
		const sameDay = [{tmdbId: 1, title: 'Both', digitalRelease: '2026-10-30T00:00:00Z', physicalRelease: '2026-10-30T00:00:00Z', images: []}];

		expect((await radarrRow(sameDay, {radarrCalendarShowDigital: true, radarrCalendarShowPhysical: true})).items[0].Subtitle).toBe('Physical \u00b7 In 3 days (Oct 30)');
	});

	const sonarrSettings = {sonarrCalendarShowEpisodeInfo: true, sonarrCalendarShowDate: true, sonarrCalendarHideDownloaded: true};
	const episode = (tvdbId, title, number, airs, hasFile = false) => ({
		series: {tvdbId, title, images: []},
		seasonNumber: 1,
		episodeNumber: number,
		airDateUtc: airs.toISOString(),
		hasFile
	});
	const sonarrRow = async (calendar, extra = {}) => {
		fetchWithTimeout.mockResolvedValue({ok: true, json: () => Promise.resolve(calendar)});
		const [sonarr] = await fetchCalendarRows({...sonarrSettings, ...extra}, {sonarrEnabled: true});
		return sonarr;
	};
	const shown = (calendar) => calendar.items.map((item) => `${item.Name} ${item.Subtitle}`);

	const episodes = [
		episode(1, 'Show A', 1, new Date(2026, 9, 26, 21)),
		episode(1, 'Show A', 2, new Date(2026, 9, 27, 8), true),
		episode(1, 'Show A', 3, new Date(2026, 10, 3, 21)),
		episode(2, 'Show B', 5, new Date(2026, 9, 28, 21), true),
		episode(3, 'Show C', 1, new Date(2026, 9, 29, 21))
	];

	it('shows each series by its first episode from today on that is not downloaded yet', async () => {
		expect(shown(await sonarrRow(episodes))).toEqual([
			'Show C S1:E1 \u00b7 In 2 days (Oct 29)',
			'Show A S1:E3 \u00b7 In 7 days (Nov 3)'
		]);
	});

	it('keeps downloaded episodes while the setting is off', async () => {
		expect(shown(await sonarrRow(episodes, {sonarrCalendarHideDownloaded: false}))).toEqual([
			'Show A S1:E2 \u00b7 Today (Oct 27)',
			'Show B S1:E5 \u00b7 Tomorrow (Oct 28)',
			'Show C S1:E1 \u00b7 In 2 days (Oct 29)'
		]);
	});

	it('shows just the episode or just the date when the other is turned off', async () => {
		const one = [episode(3, 'Show C', 4, new Date(2026, 9, 28, 21))];

		expect((await sonarrRow(one, {sonarrCalendarShowDate: false})).items[0].Subtitle).toBe('S1:E4');
		expect((await sonarrRow(one, {sonarrCalendarShowEpisodeInfo: false})).items[0].Subtitle).toBe('Tomorrow (Oct 28)');
	});

	it('reads a missing season or episode number as 0', async () => {
		const unnumbered = [{...episode(3, 'Show C', 4, new Date(2026, 9, 28, 21)), seasonNumber: undefined, episodeNumber: undefined}];

		expect((await sonarrRow(unnumbered, {sonarrCalendarShowDate: false})).items[0].Subtitle).toBe('S0:E0');
	});
});

describe('sortExternalItems', () => {
	const film = (Name, ProductionYear, CommunityRating) => ({Name, ProductionYear, CommunityRating});
	const items = [film('Metropolis', 1927, 8.3), film('M', 1931, 8.3), film('City Lights', 1931, 8.5), film('The Kid', 1921, 8.2)];
	const sorted = (by, order) => sortExternalItems(items, by, order).map((item) => item.Name);

	it('keeps the list order by default', () => {
		expect(sorted('none', 'ascending')).toEqual(['Metropolis', 'M', 'City Lights', 'The Kid']);
	});

	it('falls back to the name for a shared year in either direction', () => {
		expect(sorted('releaseDate', 'ascending')).toEqual(['The Kid', 'Metropolis', 'City Lights', 'M']);
		expect(sorted('releaseDate', 'descending')).toEqual(['City Lights', 'M', 'Metropolis', 'The Kid']);
	});

	it('sorts by the community rating', () => {
		expect(sorted('rating', 'descending')).toEqual(['City Lights', 'M', 'Metropolis', 'The Kid']);
	});

	it('sorts by name, ignoring case', () => {
		expect(sorted('name', 'descending')).toEqual(['The Kid', 'Metropolis', 'M', 'City Lights']);
	});

	it('sorts by popularity', () => {
		const charted = [{Name: 'A', Popularity: 12}, {Name: 'B', Popularity: 80}, {Name: 'C'}];
		expect(sortExternalItems(charted, 'popularity', 'descending').map((item) => item.Name)).toEqual(['B', 'A', 'C']);
	});

	it('keeps every item in a shuffle', () => {
		expect(sorted('shuffle', 'ascending').sort()).toEqual(['City Lights', 'M', 'Metropolis', 'The Kid']);
	});

	it('sorts the whole chart before cutting the row to size', async () => {
		fetchCustomRow.mockResolvedValue([
			{name: 'Zulu', providerIds: {Tmdb: '1'}},
			{name: 'Yankee', providerIds: {Tmdb: '2'}},
			{name: 'Alpha', providerIds: {Tmdb: '3'}}
		]);

		const cut = await fetchExternalPresetRow('tmdb_popular_movies', {limit: 2, sortBy: 'name', sortOrder: 'ascending'});
		expect(cut.map((item) => item.Name)).toEqual(['Alpha', 'Yankee']);
	});
});

describe('WatchingNow helpers', () => {
	it('formats live summary subtitle correctly in live mode', () => {
		const data = {mode: 'live', users: 1250, movies: 540, shows: 710};
		const subtitle = formatWatchingNowSubtitle(data);
		expect(subtitle).toContain('1,250 watching now');
		expect(subtitle).toContain('540 movies');
		expect(subtitle).toContain('710 shows');
	});

	it('formats live summary subtitle correctly in today mode', () => {
		const data = {mode: 'today', users: 9500, movies: 4200, shows: 5300};
		const subtitle = formatWatchingNowSubtitle(data);
		expect(subtitle).toContain('9,500 watched today');
		expect(subtitle).toContain('4,200 movies');
		expect(subtitle).toContain('5,300 shows');
	});

	it('normalizes watching now item with 1-based rank and seerr metadata', () => {
		const item = {
			title: 'Inception',
			year: 2010,
			media_type: 'movie',
			watchers: 85,
			imdb_id: 'tt1375666',
			tmdb_id: 27205,
			backdrop: 'https://image.tmdb.org/t/p/w780/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
			logo: 'https://image.tmdb.org/t/p/w500/inception_logo.png'
		};
		const normalized = normalizeWatchingNowItem(item, 0);

		expect(normalized.Rank).toBe(1);
		expect(normalized.Name).toBe('Inception');
		expect(normalized.Type).toBe('Movie');
		expect(normalized.ProductionYear).toBe(2010);
		expect(normalized.Watchers).toBe(85);
		expect(normalized.ProviderIds).toEqual({Imdb: 'tt1375666', Tmdb: '27205'});
		expect(normalized._externalBackdropUrl).toBe(item.backdrop);
		expect(normalized._externalLogoUrl).toBe(item.logo);
		expect(normalized._seerrRaw).toEqual({mediaId: 27205, mediaType: 'movie'});
	});

	it('normalizes a show as a series', () => {
		const normalized = normalizeWatchingNowItem({title: 'Severance', media_type: 'show', tmdb_id: 95396}, 1);
		expect(normalized.Type).toBe('Series');
		expect(normalized._seerrMediaType).toBe('tv');
		expect(normalized.Rank).toBe(2);
	});
});
