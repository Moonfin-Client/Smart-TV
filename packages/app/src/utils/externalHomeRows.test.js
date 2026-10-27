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
