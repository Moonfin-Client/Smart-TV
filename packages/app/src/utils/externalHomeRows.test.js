jest.mock('../services/externalRowsApi', () => ({
	fetchCustomRow: jest.fn(),
	constructSourceUrl: jest.fn()
}));
jest.mock('./fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('./uiLocale', () => ({uiLocale: () => 'en-US'}));

import {fetchCustomRow, constructSourceUrl} from '../services/externalRowsApi';
import seerrApi from '../services/seerrApi';
import {fetchWithTimeout} from './fetchTimeout';
import {buildSeasonalRow, fetchCalendarRows, fetchExternalPresetRow, sortExternalItems, validateCustomRow} from './externalHomeRows';

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
	const movie = (tmdbId, title, inCinemas) => ({tmdbId, title, inCinemas, images: []});

	beforeEach(() => {
		jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-27T12:00:00Z'));
		jest.spyOn(seerrApi, 'getRadarrSettings').mockResolvedValue([{hostname: 'radarr', port: 7878, apiKey: 'key'}]);
	});
	afterEach(() => jest.restoreAllMocks());

	const radarrRow = async (movies) => {
		fetchWithTimeout.mockResolvedValue({ok: true, json: () => Promise.resolve(movies)});
		const [calendar] = await fetchCalendarRows(settings, {radarrEnabled: true});
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
		expect(calendar.items[0].Subtitle).toBe('Cinema: Oct 27');
	});
});

describe('sortExternalItems', () => {
	const items = [
		{Name: 'Bravo', ProductionYear: 2010, CommunityRating: 7.5, Popularity: 300},
		{Name: 'Alpha', ProductionYear: 2020, CommunityRating: 9.0, Popularity: 100},
		{Name: 'Charlie', ProductionYear: 2005, CommunityRating: 6.0, Popularity: 500}
	];

	it('returns items unchanged when sortBy is none or empty', () => {
		expect(sortExternalItems(items, 'none', 'ascending')).toEqual(items);
		expect(sortExternalItems(items, '', 'ascending')).toEqual(items);
	});

	it('sorts by name ascending and descending', () => {
		const asc = sortExternalItems(items, 'name', 'ascending');
		expect(asc.map((i) => i.Name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

		const desc = sortExternalItems(items, 'name', 'descending');
		expect(desc.map((i) => i.Name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
	});

	it('sorts by releaseDate ascending and descending', () => {
		const asc = sortExternalItems(items, 'releaseDate', 'ascending');
		expect(asc.map((i) => i.ProductionYear)).toEqual([2005, 2010, 2020]);

		const desc = sortExternalItems(items, 'releaseDate', 'descending');
		expect(desc.map((i) => i.ProductionYear)).toEqual([2020, 2010, 2005]);
	});

	it('sorts by full release date and falls back to production year', () => {
		const datedItems = [
			{Name: 'May Movie', PremiereDate: '2024-05-20', ProductionYear: 2024},
			{Name: 'Jan Movie', PremiereDate: '2024-01-10', ProductionYear: 2024},
			{Name: 'Dec Movie', PremiereDate: '2024-12-01', ProductionYear: 2024},
			{Name: 'Older Year', ProductionYear: 2023}
		];
		const asc = sortExternalItems(datedItems, 'releaseDate', 'ascending');
		expect(asc.map((i) => i.Name)).toEqual(['Older Year', 'Jan Movie', 'May Movie', 'Dec Movie']);

		const desc = sortExternalItems(datedItems, 'releaseDate', 'descending');
		expect(desc.map((i) => i.Name)).toEqual(['Dec Movie', 'May Movie', 'Jan Movie', 'Older Year']);
	});

	it('sorts by rating ascending and descending', () => {
		const asc = sortExternalItems(items, 'rating', 'ascending');
		expect(asc.map((i) => i.CommunityRating)).toEqual([6.0, 7.5, 9.0]);

		const desc = sortExternalItems(items, 'rating', 'descending');
		expect(desc.map((i) => i.CommunityRating)).toEqual([9.0, 7.5, 6.0]);
	});

	it('sorts by popularity ascending and descending', () => {
		const asc = sortExternalItems(items, 'popularity', 'ascending');
		expect(asc.map((i) => i.Popularity)).toEqual([100, 300, 500]);

		const desc = sortExternalItems(items, 'popularity', 'descending');
		expect(desc.map((i) => i.Popularity)).toEqual([500, 300, 100]);
	});

	it('shuffles items when sortBy is shuffle', () => {
		const shuffled = sortExternalItems(items, 'shuffle', 'ascending');
		expect(shuffled).toHaveLength(items.length);
		expect(new Set(shuffled.map((i) => i.Name))).toEqual(new Set(['Alpha', 'Bravo', 'Charlie']));
	});
});
