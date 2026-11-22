import {pickEpisodePlayTarget, shouldResumeTarget} from './episodePlayTarget';

const ep = (season, num, userData = {}, extra = {}) => ({
	Id: `s${season}e${num}`,
	ParentIndexNumber: season,
	IndexNumber: num,
	UserData: userData,
	...extra
});

describe('pickEpisodePlayTarget', () => {
	test('starts a fully unwatched series at S1E1', () => {
		const episodes = [ep(0, 1), ep(1, 1), ep(1, 2)];
		expect(pickEpisodePlayTarget(episodes).Id).toBe('s1e1');
	});

	test('starts a fully watched series over at S1E1', () => {
		const episodes = [ep(1, 1, {Played: true}), ep(1, 2, {Played: true})];
		expect(pickEpisodePlayTarget(episodes).Id).toBe('s1e1');
	});

	test('prefers next up on a series part way through', () => {
		const episodes = [ep(1, 1, {Played: true}), ep(1, 2)];
		const nextUp = ep(1, 2);
		expect(pickEpisodePlayTarget(episodes, nextUp)).toBe(nextUp);
	});

	test('continues the episode in progress when next up is missing', () => {
		const episodes = [
			ep(1, 1),
			ep(1, 2, {PlaybackPositionTicks: 500}),
			ep(1, 3)
		];
		expect(pickEpisodePlayTarget(episodes).Id).toBe('s1e2');
	});

	test('falls back to the first unwatched episode', () => {
		const episodes = [ep(1, 1, {Played: true}), ep(1, 2), ep(1, 3)];
		expect(pickEpisodePlayTarget(episodes).Id).toBe('s1e2');
	});

	test('skips placeholder episodes', () => {
		const episodes = [
			ep(1, 1, {}, {LocationType: 'Virtual'}),
			ep(1, 2, {}, {IsMissing: true}),
			ep(1, 3)
		];
		expect(pickEpisodePlayTarget(episodes).Id).toBe('s1e3');
	});

	test('goes on from the first unwatched episode after a next up marked played', () => {
		const episodes = [ep(1, 1), ep(1, 2, {Played: true}), ep(1, 3, {Played: true}), ep(1, 4), ep(1, 5)];
		const staleNextUp = ep(1, 2, {Played: true});
		expect(pickEpisodePlayTarget(episodes, staleNextUp).Id).toBe('s1e4');
	});

	test('falls back as before when nothing unwatched follows a played next up', () => {
		const episodes = [ep(1, 1), ep(1, 2, {PlaybackPositionTicks: 500}), ep(1, 3, {Played: true})];
		expect(pickEpisodePlayTarget(episodes, ep(1, 3, {Played: true})).Id).toBe('s1e2');
		expect(pickEpisodePlayTarget(episodes, ep(9, 9, {Played: true})).Id).toBe('s1e2');
	});

	test('hands back next up when the list is empty', () => {
		const nextUp = ep(1, 1);
		expect(pickEpisodePlayTarget([], nextUp)).toBe(nextUp);
		expect(pickEpisodePlayTarget([], null)).toBe(null);
	});
});

describe('shouldResumeTarget', () => {
	test('resumes only a target left part way through', () => {
		expect(shouldResumeTarget(ep(1, 1, {PlaybackPositionTicks: 500}))).toBe(true);
		expect(shouldResumeTarget(ep(1, 1))).toBe(false);
		expect(shouldResumeTarget(ep(1, 1, {Played: true, PlaybackPositionTicks: 500}))).toBe(false);
		expect(shouldResumeTarget(null)).toBe(false);
	});
});
