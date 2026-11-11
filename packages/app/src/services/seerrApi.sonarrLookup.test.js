import {fetchWithTimeout} from '../utils/fetchTimeout';
import {lookupSonarrSeries, requestTv, setMoonfinConfig} from './seerrApi';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));
jest.mock('./siloSession', () => ({loadSiloSessions: () => Promise.resolve()}));
let mockSilo = false;
jest.mock('./moonbaseEndpoint', () => ({moonbaseEndpoint: jest.fn(), isSiloLogin: () => mockSilo}));
jest.mock('./siloSeerr', () => ({createSiloSeerr: () => ({request: async () => []})}));

const reply = (status, body) => fetchWithTimeout.mockResolvedValue({
	status, text: () => Promise.resolve(JSON.stringify(body)), headers: {forEach: () => {}}
});

beforeEach(() => {
	mockSilo = false;
	setMoonfinConfig('https://jf.example', 'token');
});

describe('lookupSonarrSeries', () => {
	test('asks Seerr for the TMDB id and keeps only the matches with a TVDB id and a title', async () => {
		reply(200, [{tvdbId: 5, title: 'Braunschlag'}, {tvdbId: 0, title: 'No id'}, {title: 'Missing'}, {tvdbId: 6}]);
		await expect(lookupSonarrSeries(42)).resolves.toEqual([{tvdbId: 5, title: 'Braunschlag'}]);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe('https://jf.example/Moonfin/Seerr/Api/service/sonarr/lookup/42');
	});

	test('a Seerr with no Sonarr and a Silo login have nothing to ask', async () => {
		reply(404, {message: 'Not found'});
		await expect(lookupSonarrSeries(42)).resolves.toBeNull();
		mockSilo = true;
		fetchWithTimeout.mockClear();
		await expect(lookupSonarrSeries(42)).resolves.toBeNull();
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	test('any other failure is thrown', async () => {
		reply(500, {message: 'Sonarr is down'});
		await expect(lookupSonarrSeries(42)).rejects.toMatchObject({status: 500});
	});
});

test('a series request carries the picked TVDB id only when there is one', async () => {
	reply(200, {id: 1});
	await requestTv(42, {seasons: 'all'});
	expect(JSON.parse(fetchWithTimeout.mock.calls[0][1].body)).not.toHaveProperty('tvdbId');
	await requestTv(42, {seasons: 'all', tvdbId: 5});
	expect(JSON.parse(fetchWithTimeout.mock.calls[1][1].body)).toMatchObject({mediaType: 'tv', mediaId: 42, tvdbId: 5});
});
