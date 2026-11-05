import {api, createApiForServer, getUserId, setServer, setServerType, setAuth, reportCapabilities, resolveItemsByProviderIds, resetLibraryIndexForTests} from './jellyfinApi';
import {platformFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));
jest.mock('./userDataSync', () => ({}));
jest.mock('../platform', () => ({getPlatform: () => 'webos'}));

const urlOf = (call) => call[0];
const empty = () => platformFetch.mockImplementation(() => Promise.resolve({ok: true, status: 200, text: () => Promise.resolve('{"Items":[]}')}));

beforeAll(() => {
	empty();
	setServer('http://server');
	// Signing in reports the session's capabilities, which is a request of its own.
	setAuth('user-1', 'token');
});
// The runner resets every mock between tests, implementation included.
beforeEach(empty);

describe('Next Up', () => {
	test('asks Emby for its legacy list and nothing else', async () => {
		setServerType('emby');
		await api.getNextUp(15);
		expect(platformFetch).toHaveBeenCalledTimes(1);
		expect(urlOf(platformFetch.mock.calls[0])).toContain('/Shows/NextUp?');
		expect(urlOf(platformFetch.mock.calls[0])).toContain('&LegacyNextUp=true');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('NextUpDateCutoff');
	});

	test('leaves a series page on Emby alone', async () => {
		setServerType('emby');
		await api.getNextUp(1, 'series-1');
		expect(urlOf(platformFetch.mock.calls[0])).toContain('SeriesId=series-1');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('LegacyNextUp');
	});

	test('keeps the date window on Jellyfin without the Emby flag', async () => {
		setServerType('jellyfin');
		await api.getNextUp(15, null, 30);
		expect(urlOf(platformFetch.mock.calls[0])).toContain('NextUpDateCutoff=');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('LegacyNextUp');
	});
});

describe('search', () => {
	test('items and people are separate requests, and people get their own timeout', async () => {
		setServerType('jellyfin');
		await api.search('alien', 240);
		await api.searchPeople('alien', 24);
		const [items, people] = platformFetch.mock.calls;
		expect(urlOf(items)).toContain('searchTerm=alien');
		expect(urlOf(items)).not.toContain('/Persons');
		expect(urlOf(people)).toContain('/Persons?searchTerm=alien&Limit=24');
		expect(people[2]).toBe(10000);
	});

	test('only Jellyfin asks for audiobooks, and a refill asks for its own types', async () => {
		setServerType('jellyfin');
		await api.search('alien', 240);
		await api.search('alien', 24, 'Movie');
		setServerType('emby');
		await api.search('alien', 240);
		const [jellyfin, refill, emby] = platformFetch.mock.calls.map(urlOf);
		expect(jellyfin).toContain('IncludeItemTypes=Book,AudioBook,Movie,');
		expect(refill).toContain('Limit=24&Recursive=true&IncludeItemTypes=Movie&');
		expect(emby).toContain('IncludeItemTypes=Book,Movie,');
		setServerType('jellyfin');
	});
});

describe('libraries', () => {
	const answer = (byUrl) => platformFetch.mockImplementation((url) => {
		const body = /Views(\?|$)/.test(url) ? byUrl.views : byUrl.user;
		return Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body))});
	});
	const views = {Items: [{Id: 'movies'}, {Id: 'shows'}], TotalRecordCount: 2};

	test('Emby leaves out what the user hid from My Media, since Emby itself does not', async () => {
		setServerType('emby');
		answer({views, user: {Configuration: {MyMediaExcludes: ['shows']}}});
		const result = await api.getLibraries();
		expect(result.Items.map((item) => item.Id)).toEqual(['movies']);
	});

	test('Emby keeps every library when the user cant be read', async () => {
		setServerType('emby');
		platformFetch.mockImplementation((url) => (/Views(\?|$)/.test(url)
			? Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(views))})
			: Promise.reject(new Error('offline'))));
		const result = await api.getLibraries();
		expect(result.Items.map((item) => item.Id)).toEqual(['movies', 'shows']);
	});

	test('Jellyfin is asked once and trusted, since it filters for itself', async () => {
		setServerType('jellyfin');
		answer({views, user: {Configuration: {MyMediaExcludes: ['shows']}}});
		const result = await api.getLibraries();
		expect(platformFetch).toHaveBeenCalledTimes(1);
		expect(result.Items.map((item) => item.Id)).toEqual(['movies', 'shows']);
	});
});

describe('matching outside list items to the library', () => {
	const json = (body) => Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body))});
	// A movie and a show that share TMDB id 1585, and a movie the library only knows by IMDb id.
	const library = [
		{Id: 'wonderful-life', Type: 'Movie', ProviderIds: {Tmdb: '1585', Imdb: 'tt0038650'}},
		{Id: 'dragon-tales', Type: 'Series', ProviderIds: {Tmdb: '1585'}},
		{Id: 'fight-club', Type: 'Movie', ProviderIds: {Imdb: 'tt0137523'}}
	];
	const outside = [
		{Id: 'ext-1', Type: 'Series', Name: 'Dragon Tales', ProviderIds: {Tmdb: '1585'}},
		{Id: 'ext-2', Type: 'Movie', Name: 'Fight Club', ProviderIds: {Tmdb: '550', Imdb: 'tt0137523'}},
		{Id: 'ext-3', Type: 'Movie', Name: 'Not owned', ProviderIds: {Tmdb: '999'}}
	];
	const isIndexRead = (url) => url.includes('Fields=ProviderIds&');
	const indexReads = () => platformFetch.mock.calls.map(urlOf).filter(isIndexRead);
	const jellyfin = (pages = [library]) => platformFetch.mockImplementation((url) => {
		if (isIndexRead(url)) return json({Items: pages[Number(/StartIndex=(\d+)/.exec(url)[1]) / 1000] || []});
		const ids = /[?&]Ids=([^&]+)/.exec(url)[1].split(',');
		return json({Items: library.filter((item) => ids.includes(item.Id))});
	});

	beforeEach(() => {
		resetLibraryIndexForTests();
		setServerType('jellyfin');
	});

	test('Jellyfin matches through its own index, keeping movies and shows with the same TMDB id apart', async () => {
		jellyfin();
		const [show, imdbOnly, unowned] = await resolveItemsByProviderIds(outside);
		expect(show.Id).toBe('dragon-tales');
		expect(show._resolvedFromExternal).toBe(true);
		expect(imdbOnly.Id).toBe('fight-club');
		expect(unowned).toBe(outside[2]);
		expect(platformFetch.mock.calls.map(urlOf).some((url) => url.includes('AnyProviderIdEquals'))).toBe(false);
	});

	test('Jellyfin reads the index once for every row that follows', async () => {
		jellyfin();
		await resolveItemsByProviderIds(outside);
		await resolveItemsByProviderIds(outside);
		expect(indexReads()).toHaveLength(1);
	});

	test('Jellyfin reads the library a page at a time until a page comes back short', async () => {
		const filler = Array.from({length: 1000}, (_, i) => ({Id: `filler-${i}`, Type: 'Movie', ProviderIds: {Tmdb: `${100000 + i}`}}));
		jellyfin([filler, library]);
		const [show] = await resolveItemsByProviderIds(outside);
		expect(indexReads().map((url) => /StartIndex=(\d+)/.exec(url)[1])).toEqual(['0', '1000']);
		expect(show.Id).toBe('dragon-tales');
	});

	test('a failed index read leaves the items alone and is tried again next time', async () => {
		platformFetch.mockImplementation(() => Promise.reject(new Error('offline')));
		expect(await resolveItemsByProviderIds(outside)).toEqual(outside);
		jellyfin();
		const [show] = await resolveItemsByProviderIds(outside);
		expect(show.Id).toBe('dragon-tales');
	});

	test('Emby filters on the server, and a movie never takes the show with its TMDB id', async () => {
		setServerType('emby');
		platformFetch.mockImplementation(() => json({Items: library.slice(0, 2)}));
		const [movie] = await resolveItemsByProviderIds([{Id: 'ext-4', Type: 'Movie', ProviderIds: {Tmdb: '1585'}}]);
		expect(movie.Id).toBe('wonderful-life');
		const url = urlOf(platformFetch.mock.calls[0]);
		expect(url).toContain('AnyProviderIdEquals=tmdb.1585');
		expect(url).toContain('IncludeItemTypes=Movie,Series');
	});
});

describe('stopActiveEncodings', () => {
	test('tells the server to drop the transcode for this device and play session', async () => {
		setServerType('jellyfin');
		await api.stopActiveEncodings('session-1');
		const [url, options] = platformFetch.mock.calls[0];
		expect(url).toContain('http://server/Videos/ActiveEncodings?deviceId=');
		expect(url).toContain('&playSessionId=session-1');
		expect(options.method).toBe('DELETE');
	});

	test('goes to the other server when the row came from one', async () => {
		await createApiForServer('http://other', 'tok', 'u2').stopActiveEncodings('session-2');
		const [url, options] = platformFetch.mock.calls[0];
		expect(url).toContain('http://other/Videos/ActiveEncodings?deviceId=');
		expect(url).toContain('&playSessionId=session-2');
		expect(options.method).toBe('DELETE');
	});
});

describe('reads made as the app starts', () => {
	const userReads = () => platformFetch.mock.calls.filter((call) => /\/Users\/user-2$/.test(urlOf(call)));
	const capabilityReports = () => platformFetch.mock.calls.filter((call) => urlOf(call).includes('/Sessions/Capabilities/Full'));

	beforeEach(() => {
		setServerType('jellyfin');
		setAuth('user-2', 'token-2');
	});

	test('callers reading the user at the same time share one request', async () => {
		platformFetch.mockClear();
		await Promise.all([api.getUserConfiguration(), api.getUserConfiguration(), api.getUserConfiguration()]);
		expect(userReads()).toHaveLength(1);
	});

	test('saving the configuration makes the next read go to the server', async () => {
		await api.getUserConfiguration();
		await api.updateUserConfiguration({});
		platformFetch.mockClear();
		await api.getUserConfiguration();
		expect(userReads()).toHaveLength(1);
	});

	test("the socket opening right after sign in doesn't report capabilities again", () => {
		platformFetch.mockClear();
		reportCapabilities({unlessRecent: true});
		expect(capabilityReports()).toHaveLength(0);
		reportCapabilities();
		expect(capabilityReports()).toHaveLength(1);
	});
});

describe('creating a playlist', () => {
	const sentBody = () => {
		const [, options] = platformFetch.mock.calls.find(([url]) => url.includes('/Playlists'));
		return JSON.parse(options.body);
	};

	test('makes it private on Jellyfin', async () => {
		setServerType('jellyfin');
		await api.createPlaylist('Mix', ['a', 'b']);
		expect(sentBody()).toEqual({Name: 'Mix', Ids: ['a', 'b'], UserId: getUserId(), IsPublic: false});
	});

	test('sends Emby the items as a comma list', async () => {
		setServerType('emby');
		await api.createPlaylist('Mix', ['a', 'b']);
		expect(sentBody()).toEqual({Name: 'Mix', Ids: 'a,b', UserId: getUserId()});
	});

	test('follows the type of the server it was made for', async () => {
		setServerType('jellyfin');
		await createApiForServer('http://other', 'tok', 'u2', 'emby').createPlaylist('Mix', ['a']);
		expect(sentBody()).toEqual({Name: 'Mix', Ids: 'a', UserId: 'u2'});
	});
});

describe('Silo apis for other servers', () => {
	test('stay the same across a token rotation, so the playback sessions they started are still theirs', () => {
		const {openSiloSession} = require('./siloSession');
		const session = openSiloSession('http://silo2:8090', 'acct-1', {accessToken: 'T0', refreshToken: 'R0', expiresAt: Date.now() + 3600000, lifetimeMs: 3600000});
		const before = createApiForServer('http://silo2:8090', 'T0', 'p1', 'silo');
		session.aliases = ['T0', ...session.aliases];
		session.tokens = {...session.tokens, accessToken: 'T1'};
		expect(createApiForServer('http://silo2:8090', 'T1', 'p1', 'silo')).toBe(before);
		expect(createApiForServer('http://silo2:8090', 'T1', 'p2', 'silo')).not.toBe(before);
	});
});
