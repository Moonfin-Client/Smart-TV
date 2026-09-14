import {showsWatchedCheck} from './playedState';

const season = (played, extra) => ({UserData: {Played: played}, ...extra});

describe('showsWatchedCheck', () => {
	test('marks a played season that is in the library', () => {
		expect(showsWatchedCheck(season(true, {LocationType: 'FileSystem'}))).toBe(true);
	});

	test('leaves the mark off a season that is only a placeholder', () => {
		expect(showsWatchedCheck(season(true, {LocationType: 'Virtual'}))).toBe(false);
	});

	test('says no to an unplayed season either way', () => {
		expect(showsWatchedCheck(season(false, {LocationType: 'FileSystem'}))).toBe(false);
		expect(showsWatchedCheck(season(false, {LocationType: 'Virtual'}))).toBe(false);
	});

	test('treats an absent LocationType as present', () => {
		expect(showsWatchedCheck(season(true))).toBe(true);
	});

	test('copes with being handed nothing at all', () => {
		expect(showsWatchedCheck()).toBe(false);
		expect(showsWatchedCheck({})).toBe(false);
	});
});
