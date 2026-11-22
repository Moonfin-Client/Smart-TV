import {completeShowingOptions, configureIncompleteRecordings, scheduleSuggestedShowing} from './incompleteRecordings';

jest.mock('./jellyfinApi', () => ({
	getAuthHeader: () => 'MediaBrowser Token="t"',
	getServerUrl: () => 'http://server'
}));

const jsonResponse = (body) => ({ok: true, status: 200, json: async () => body});
const future = () => new Date(Date.now() + 86400000).toISOString();
const showing = (overrides = {}) => ({
	programId: 'p2',
	name: 'Jeopardy!',
	description: 'Tournament of Champions',
	channelName: 'WPTODT',
	channelNumber: '16.1',
	startDate: future(),
	...overrides
});

const reply = (options) => {
	global.fetch = jest.fn((url) => Promise.resolve(/Incomplete$/.test(url) ? jsonResponse([]) : jsonResponse(options)));
};

beforeEach(() => {
	reply({canSearch: false, showing: null});
	configureIncompleteRecordings({supported: true, extended: true, canManage: true});
});

afterEach(() => {
	delete global.fetch;
});

describe('complete showing options', () => {
	test('a valid future showing comes back to confirm', async () => {
		reply({canSearch: false, showing: showing({alreadyScheduled: true})});
		const options = await completeShowingOptions('p1');
		expect(options).toMatchObject({canSearch: false, answered: true});
		expect(options.showing).toMatchObject({name: 'Jeopardy!', channelNumber: '16.1', alreadyScheduled: true});
		expect(global.fetch.mock.calls.at(-1)[0]).toBe('http://server/Moonfin/LiveTv/CompleteShowing/Options?programId=p1');
	});

	test('a showing in the past or without a name is left out', async () => {
		reply({canSearch: true, showing: showing({startDate: new Date(Date.now() - 60000).toISOString()})});
		expect((await completeShowingOptions('p1')).showing).toBe(null);
		reply({canSearch: true, showing: showing({name: '  '})});
		expect((await completeShowingOptions('p1')).showing).toBe(null);
	});

	test('an empty description is only accepted when the plugin can search', async () => {
		reply({canSearch: false, showing: showing({description: ''})});
		expect((await completeShowingOptions('p1')).showing).toBe(null);
		reply({canSearch: true, showing: showing({description: ''})});
		expect((await completeShowingOptions('p1')).showing).not.toBe(null);
	});

	test('an older plugin is never asked', async () => {
		configureIncompleteRecordings({supported: true, extended: false, canManage: true});
		global.fetch.mockClear();
		expect(await completeShowingOptions('p1')).toEqual({canSearch: false, showing: null, answered: false});
		expect(global.fetch.mock.calls.some(([url]) => /Options/.test(url))).toBe(false);
	});

	test('a showing from an earlier server session is never booked', async () => {
		reply({canSearch: false, showing: showing()});
		const {showing: suggested} = await completeShowingOptions('p1');
		configureIncompleteRecordings({supported: true, extended: true, canManage: true});
		expect(await scheduleSuggestedShowing('p1', suggested)).toBe(false);
	});
});
