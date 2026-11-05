import {createChannelCarouselPrewarm} from './channelCarouselPrewarm';

const channelList = (count) => Array.from({length: count}, (_, i) => ({Id: `c${i}`, Name: `Ch ${i}`, ChannelNumber: String(i + 1)}));

const fakeApi = (channels) => {
	const calls = [];
	return {
		calls,
		getLiveTvChannels: async () => ({Items: channels}),
		getLiveTvPrograms: async (ids, from, to) => {
			calls.push(ids);
			return {
				Items: ids.map((id) => ({
					Id: `p-${id}`,
					ChannelId: id,
					Name: `Show ${id}`,
					StartDate: from.toISOString(),
					EndDate: to.toISOString()
				}))
			};
		}
	};
};

const settle = async () => {
	for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('waits for surfing to settle, then loads the lineup once', async () => {
	const channels = channelList(8);
	const api = fakeApi(channels);
	const prewarm = createChannelCarouselPrewarm(api);
	prewarm.tuned(channels.slice(0, 5));
	jest.advanceTimersByTime(500);
	prewarm.tuned(channels.slice(0, 5));
	jest.advanceTimersByTime(999);
	await settle();
	expect(api.calls).toHaveLength(0);

	jest.advanceTimersByTime(1);
	await settle();
	expect(api.calls).toHaveLength(1);
	expect(api.calls[0]).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
	expect(prewarm.isWarm).toBe(true);
	prewarm.dispose();
});

test('a warm prewarm only fetches the channels it is missing', async () => {
	const channels = channelList(8);
	const api = fakeApi(channels);
	const prewarm = createChannelCarouselPrewarm(api);
	prewarm.tuned(channels.slice(0, 3));
	jest.advanceTimersByTime(1000);
	await settle();

	await prewarm.ensureVisibleChannels(['c1', 'c2', 'c3', 'c4']);
	expect(api.calls).toHaveLength(2);
	expect(api.calls[1]).toEqual(['c3', 'c4']);
	prewarm.dispose();
});

test('nothing loads after dispose', async () => {
	const channels = channelList(4);
	const api = fakeApi(channels);
	const prewarm = createChannelCarouselPrewarm(api);
	prewarm.tuned(channels);
	prewarm.dispose();
	jest.advanceTimersByTime(2000);
	await settle();
	expect(api.calls).toHaveLength(0);
});

test('catches up on a recording changed during its first load', async () => {
	const channels = channelList(4);
	const api = fakeApi(channels);
	const prewarm = createChannelCarouselPrewarm(api);
	const getLiveTvPrograms = api.getLiveTvPrograms;
	api.getLiveTvPrograms = (...args) => {
		if (api.calls.length === 0) prewarm.refresh();
		return getLiveTvPrograms(...args);
	};
	prewarm.tuned(channels);
	jest.advanceTimersByTime(1000);
	await settle();

	expect(prewarm.isWarm).toBe(true);
	expect(api.calls).toHaveLength(2);
	expect(api.calls[1]).toEqual(['c0', 'c1', 'c2', 'c3']);
	prewarm.dispose();
});
