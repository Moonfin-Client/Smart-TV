import {isRecentlyAiredEpisode, loadNewReleases, newReleaseOf, seasonToCheck, NEW_EPISODES, NEW_SEASON, NEW_SERIES} from './mediaBarNewRelease';

const now = new Date(Date.UTC(2026, 10, 2, 12));
const day = new Date(Date.UTC(2026, 9, 28));
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

// Jellyfin writes seven fractional digits.
const episode = (season, aired, {virtual = false, number} = {}) => ({
	ParentIndexNumber: season,
	IndexNumber: number,
	SeasonId: `season-${season}`,
	PremiereDate: `${aired.toISOString().slice(0, 19)}.0000000Z`,
	LocationType: virtual ? 'Virtual' : 'FileSystem'
});

const sameDay = (season, count, date) => Array.from({length: count}, () => episode(season, date));

// The two steps the media bar runs: the recent episodes first, then the whole season when the
// first step asks for it.
const infoOf = (season) => {
	const recent = season.filter((e) => isRecentlyAiredEpisode(e, now, 30));
	return newReleaseOf(recent, seasonToCheck(recent) ? season : null);
};
const releaseOf = (season) => infoOf(season)?.kind ?? null;

describe('a series in the media bar', () => {
	test('a season out all on one day is a new season', () => {
		expect(releaseOf(sameDay(3, 8, day))).toBe(NEW_SEASON);
	});

	test('a first season out all at once is a new series', () => {
		expect(releaseOf(sameDay(1, 6, day))).toBe(NEW_SERIES);
	});

	test('a weekly season ending on three episodes in one day has new episodes', () => {
		const season = [
			...Array.from({length: 6}, (_, week) => episode(2, new Date(utc(2026, 9, 1).getTime() + week * 7 * 86400000))),
			...sameDay(2, 3, day)
		];
		expect(releaseOf(season)).toBe(NEW_EPISODES);
	});

	test("a split season's second part has new episodes", () => {
		expect(releaseOf([...sameDay(4, 4, utc(2026, 7, 1)), ...sameDay(4, 4, day)])).toBe(NEW_EPISODES);
	});

	test('a season aired week by week has new episodes', () => {
		expect(releaseOf([episode(2, utc(2026, 10, 19)), episode(2, utc(2026, 10, 26)), episode(2, utc(2026, 11, 2))])).toBe(NEW_EPISODES);
		expect(releaseOf([episode(2, utc(2026, 11, 2))])).toBe(NEW_EPISODES);
	});

	test('a two episode premiere is not a whole season', () => {
		expect(releaseOf(sameDay(4, 2, day))).toBe(NEW_EPISODES);
	});

	test('episodes not on the server do not count against a drop', () => {
		expect(releaseOf([...sameDay(3, 5, day), episode(3, utc(2026, 12, 1), {virtual: true})])).toBe(NEW_SEASON);
	});

	test('an old show added today has nothing new', () => {
		expect(releaseOf(sameDay(1, 10, utc(2005, 6, 1)))).toBeNull();
	});

	test('episodes known only from metadata or not aired yet do not count', () => {
		expect(releaseOf([
			...Array.from({length: 8}, () => episode(5, utc(2026, 10, 30), {virtual: true})),
			episode(5, utc(2026, 12, 1))
		])).toBeNull();
	});
});

describe('the line under the label', () => {
	test('a season out at once names the season', () => {
		expect(infoOf(sameDay(3, 8, day)).season).toBe(3);
	});

	test('new episodes name the latest one', () => {
		const info = infoOf([episode(2, utc(2026, 10, 23), {number: 4}), episode(2, utc(2026, 10, 30), {number: 5})]);
		expect(info.season).toBe(2);
		expect(info.episode).toBe(5);
	});
});

describe('loadNewReleases', () => {
	test('asks only about series on the server, and a failing one goes without a label', async () => {
		const recent = new Date(Date.now() - 2 * 86400000);
		const getItems = jest.fn(async ({ParentId}) => {
			if (ParentId === 'broken') throw new Error('offline');
			return {Items: [episode(1, recent, {number: 2}), episode(1, new Date(recent.getTime() - 7 * 86400000), {number: 1})]};
		});
		const items = [
			{Id: 'show', Type: 'Series'},
			{Id: 'broken', Type: 'Series'},
			{Id: 'film', Type: 'Movie'},
			{Id: 'outside', Type: 'Series', _external: true}
		];
		const releases = await loadNewReleases(items, 30, () => ({getItems}));
		expect(releases).toEqual({show: {kind: NEW_EPISODES, season: 1, episode: 2}});
		expect(getItems.mock.calls.map(([q]) => q.ParentId).sort()).toEqual(['broken', 'show']);
	});
});
