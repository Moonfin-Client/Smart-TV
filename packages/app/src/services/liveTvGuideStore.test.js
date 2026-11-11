import {createLiveTvGuideStore} from './liveTvGuideStore';

const at = (hh, mm) => new Date(2026, 8, 22, hh, mm, 0, 0).getTime();
const iso = (time) => new Date(time).toISOString();

const channelList = (count) => Array.from({length: count}, (_, i) => ({Id: `c${i}`, Name: `Ch ${i}`, ChannelNumber: String(i + 1)}));

// Every channel airs one program across the window. Channels whose index is in sportsAt carry
// the sports flag.
const fakeApi = ({channels, sportsAt = [], programFor} = {}) => {
	const calls = [];
	return {
		calls,
		getLiveTvChannels: jest.fn(async () => ({Items: channels})),
		getLiveTvPrograms: jest.fn(async (ids, from, to, options = {}) => {
			calls.push({ids, from: from.getTime(), to: to.getTime(), category: options.category});
			const items = ids.map((id) => {
				const index = parseInt(id.slice(1), 10);
				return programFor ? programFor(id, from.getTime(), to.getTime()) : {
					Id: `p-${id}-${from.getTime()}`,
					ChannelId: id,
					Name: `Show ${id}`,
					StartDate: iso(from.getTime()),
					EndDate: iso(to.getTime()),
					IsSports: sportsAt.indexOf(index) >= 0
				};
			}).filter(Boolean).filter((p) => (options.category === 'sports' ? p.IsSports : true));
			return {Items: items};
		}),
		getLiveTvProgram: jest.fn(),
		setFavorite: jest.fn(async () => {})
	};
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('loading', () => {
	test('fetches the first batch of channels in sort order', async () => {
		const api = fakeApi({channels: channelList(120)});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0), window: 180 * 60000});
		expect(store.state).toBe('ready');
		expect(api.calls).toHaveLength(1);
		expect(api.calls[0].ids).toHaveLength(50);
		expect(store.hasProgramsFor('c0')).toBe(true);
		expect(store.hasProgramsFor('c60')).toBe(false);
		expect(store.windowEnd - store.windowStart).toBe(180 * 60000);
	});

	test('pages in the next batch on request', async () => {
		const api = fakeApi({channels: channelList(120)});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		await store.loadMorePrograms();
		expect(store.hasProgramsFor('c99')).toBe(true);
		expect(store.hasMorePrograms).toBe(true);
	});

	test('a lazy batch waits on a request already out and asks again after it fails', async () => {
		const api = fakeApi({channels: channelList(120)});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		expect(store.programsHighWater).toBe(50);

		const replies = [];
		api.getLiveTvPrograms.mockImplementation((ids) => new Promise((resolve, reject) => {
			replies.push({ids, resolve, reject});
		}));
		const favorite = store.ensureProgramsForChannels(['c60']);
		const lazy = store.loadMorePrograms();
		await flush();
		expect(replies).toHaveLength(2);
		expect(replies[1].ids).not.toContain('c60');

		replies[1].resolve({Items: []});
		replies[0].reject(new Error('offline'));
		await expect(favorite).rejects.toThrow('offline');
		await lazy;
		expect(store.hasProgramsFor('c60')).toBe(false);
		expect(store.programsHighWater).toBe(50);

		const retry = store.loadMorePrograms();
		await flush();
		expect(replies[replies.length - 1].ids).toEqual(['c60']);
		replies[replies.length - 1].resolve({Items: [{Id: 'p', ChannelId: 'c60', StartDate: iso(at(7, 0)), EndDate: iso(at(8, 0))}]});
		await retry;
		expect(store.hasProgramsFor('c60')).toBe(true);
		expect(store.programsForChannel('c60')).toHaveLength(1);
		expect(store.programsHighWater).toBe(100);
	});
});

describe('category filters', () => {
	test('walk the whole lineup past the first page', async () => {
		const api = fakeApi({channels: channelList(450), sportsAt: [5, 380]});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		store.setFilter('sports');
		await flush();
		await flush();
		await flush();
		expect(store.state).toBe('ready');
		expect(store.filteredChannels.map((c) => c.Id)).toEqual(['c5', 'c380']);
		const categoryCalls = api.calls.filter((call) => call.category === 'sports');
		expect(categoryCalls[0].ids).toHaveLength(200);
	});

	test('favorites fetch their channels wherever they sit', async () => {
		const channels = channelList(120);
		channels[110].UserData = {IsFavorite: true};
		const api = fakeApi({channels});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		store.setFilter('favorites');
		await flush();
		expect(store.filteredChannels.map((c) => c.Id)).toEqual(['c110']);
		expect(store.hasProgramsFor('c110')).toBe(true);
	});
});

describe('moving the window', () => {
	test('keeps the rows on screen until the replacements are in', async () => {
		const api = fakeApi({channels: channelList(3)});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		const pending = store.setWindowStart(at(7, 30));
		expect(store.state).toBe('ready');
		expect(store.windowStart).toBe(at(7, 30));
		await pending;
		expect(store.programsForChannel('c0')[0].StartDate).toBe(iso(at(7, 30)));
		expect(store.atLivePosition).toBe(false);
	});
});

describe('the boundary refresh', () => {
	afterEach(() => jest.useRealTimers());

	test('arms itself on the next program boundary', async () => {
		const api = fakeApi({
			channels: channelList(1),
			programFor: (id) => ({Id: 'p', ChannelId: id, Name: 'Show', StartDate: iso(at(7, 0)), EndDate: iso(at(7, 30))})
		});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		jest.useFakeTimers();
		store.scheduleBoundaryRefresh();
		expect(store.boundaryDueAt).toBe(at(7, 30));
		store.dispose();
	});
});

describe('program artwork', () => {
	test('is looked up once and cached, a missing result included', async () => {
		const api = fakeApi({channels: channelList(1)});
		api.getLiveTvProgram.mockResolvedValue({Id: 'p1'});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		const program = {Id: 'p1', ChannelId: 'c0', Name: 'Show'};
		expect(await store.artworkSourceFor(program)).toBeNull();
		expect(await store.artworkSourceFor(program)).toBeNull();
		expect(api.getLiveTvProgram).toHaveBeenCalledTimes(1);
		expect(store.hasArtworkResult('p1')).toBe(true);
	});

	test('shares a result with a repeat airing of the same episode', async () => {
		const api = fakeApi({channels: channelList(1)});
		api.getLiveTvProgram.mockResolvedValue({Id: 'p1', ImageTags: {Primary: 'tag'}});
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.artworkSourceFor({Id: 'p1', ChannelId: 'c0', Name: 'Show', EpisodeTitle: 'Pilot'});
		const repeat = await store.artworkSourceFor({Id: 'p2', ChannelId: 'c9', Name: 'Show', EpisodeTitle: 'Pilot'});
		expect(repeat).toEqual({itemId: 'p1', tag: 'tag', isThumb: false});
		expect(api.getLiveTvProgram).toHaveBeenCalledTimes(1);
	});
});

describe('favorites', () => {
	test('flip at once and roll back when the server refuses', async () => {
		const api = fakeApi({channels: channelList(2)});
		api.setFavorite.mockRejectedValue(new Error('nope'));
		const store = createLiveTvGuideStore(api, {now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		await expect(store.toggleChannelFavorite('c1')).rejects.toThrow('nope');
		expect(store.channelForId('c1').UserData?.IsFavorite).not.toBe(true);
	});

	test('one set elsewhere moves the channel up under favorites first, without a request', async () => {
		const api = fakeApi({channels: channelList(3)});
		const store = createLiveTvGuideStore(api, {sortBy: 'favoritesFirst', now: () => at(7, 10)});
		await store.load({windowStart: at(7, 0)});
		store.setChannelFavorite('c2', true);
		expect(store.filteredChannels.map((c) => c.Id)).toEqual(['c2', 'c0', 'c1']);
		expect(api.setFavorite).not.toHaveBeenCalled();
	});
});
