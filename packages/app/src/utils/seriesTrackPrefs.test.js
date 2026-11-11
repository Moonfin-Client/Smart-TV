import {createSeriesTrackPref, matchSeriesTrackIndex, toSeriesTrackPref} from './seriesTrackPrefs';

const forced = {index: 1, language: 'deu', title: 'Forced'};
const full = {index: 2, language: 'deu', title: 'Full'};
const eng = {index: 3, language: 'eng', title: 'English'};

const OFF = {language: 'none', title: '', relativeIndex: 0};

describe('createSeriesTrackPref', () => {
	test('records the language, the name and the place among full tracks in its language', () => {
		expect(createSeriesTrackPref([forced, full, eng], 2)).toEqual({
			language: 'deu',
			title: 'full',
			relativeIndex: 0
		});
	});

	test('a leading track number is dropped from the name', () => {
		const numbered = {index: 4, language: 'deu', title: '3 - Forced'};
		expect(createSeriesTrackPref([numbered], 4).title).toBe('forced');
	});

	test('off is recorded as off', () => {
		expect(createSeriesTrackPref([forced], -1)).toEqual(OFF);
	});

	test('a track that is not there records nothing', () => {
		expect(createSeriesTrackPref([forced], 99)).toBeNull();
	});

	test('an untagged track still records its name', () => {
		const untagged = {index: 5, title: 'Signs and Songs'};
		expect(createSeriesTrackPref([untagged], 5)).toEqual({
			language: '',
			title: 'signs and songs',
			relativeIndex: 0
		});
	});

	test('a track the player calls Unknown counts as having no language', () => {
		const untagged = {index: 5, language: 'Unknown', title: 'Forced'};
		expect(createSeriesTrackPref([untagged], 5).language).toBe('');
	});

	test('the name falls back to the display title', () => {
		const shown = {index: 6, language: 'deu', displayTitle: 'German - SUBRIP'};
		expect(createSeriesTrackPref([shown], 6).title).toBe('german - subrip');
	});
});

describe('matchSeriesTrackIndex', () => {
	const pref = createSeriesTrackPref([forced, full, eng], 1);

	test('the name picks the same track out of two in one language', () => {
		const reordered = [{index: 7, language: 'deu', title: 'Full'}, {index: 8, language: 'deu', title: 'Forced'}];
		expect(matchSeriesTrackIndex(reordered, pref)).toBe(8);
	});

	test('a differently spelled language tag still answers', () => {
		const other = [{index: 9, language: 'ger', title: 'Forced'}];
		expect(matchSeriesTrackIndex(other, pref)).toBe(9);
	});

	test('without a matching name it falls back to the same place in that language', () => {
		const other = [{index: 4, language: 'deu'}, {index: 5, language: 'deu'}];
		expect(matchSeriesTrackIndex(other, pref)).toBe(4);
	});

	test('tracks sharing a name are told apart by their place', () => {
		const both = [
			{index: 1, language: 'eng', title: 'English'},
			{index: 2, language: 'eng', title: 'English'}
		];
		const second = createSeriesTrackPref(both, 2);
		expect(second.relativeIndex).toBe(1);

		const later = [
			{index: 4, language: 'eng', title: 'English'},
			{index: 5, language: 'eng', title: 'English'}
		];
		expect(matchSeriesTrackIndex(later, second)).toBe(5);
	});

	test('a track only flagged as forced is remembered as forced and matched among forced tracks', () => {
		const flagged = [{index: 1, language: 'eng', title: 'English', isForced: true}, {index: 2, language: 'eng', title: 'English'}];
		const picked = createSeriesTrackPref(flagged, 1);
		expect(picked).toEqual({language: 'eng', title: 'english', relativeIndex: 0, forced: true});
		const later = [{index: 4, language: 'eng', title: 'English'}, {index: 5, language: 'eng', title: 'English', isForced: true}];
		expect(matchSeriesTrackIndex(later, toSeriesTrackPref(picked))).toBe(5);
		expect(matchSeriesTrackIndex(later, createSeriesTrackPref(flagged, 2))).toBe(4);
	});

	test('a full track remembered from another episode skips a forced track listed first', () => {
		const earlier = createSeriesTrackPref([{index: 10, language: 'eng', title: 'English'}], 10);
		const episode = [
			{index: 10, language: 'eng', title: 'English (Forced)', displayTitle: 'English (Forced) - SUBRIP'},
			{index: 11, language: 'eng', displayTitle: 'English - SUBRIP'}
		];
		expect(matchSeriesTrackIndex(episode, earlier)).toBe(11);
	});

	test('nothing in that language means no answer', () => {
		expect(matchSeriesTrackIndex([eng], pref)).toBeNull();
	});

	test('an untagged track is matched on its name alone', () => {
		const untaggedPref = createSeriesTrackPref([{index: 5, title: 'Forced'}], 5);
		expect(matchSeriesTrackIndex([{index: 6, title: 'Forced'}], untaggedPref)).toBe(6);
	});

	test('an untagged track the player calls Unknown is still matched by name', () => {
		const untaggedPref = createSeriesTrackPref([{index: 5, language: 'Unknown', title: 'Forced'}], 5);
		expect(matchSeriesTrackIndex([{index: 6, language: 'Unknown', title: 'Forced'}], untaggedPref)).toBe(6);
	});

	test('an untagged track with no name to match gives no answer', () => {
		const untaggedPref = createSeriesTrackPref([{index: 5, title: 'Forced'}], 5);
		expect(matchSeriesTrackIndex([{index: 6, language: 'deu'}], untaggedPref)).toBeNull();
	});

	test('a series remembered as off answers off', () => {
		expect(matchSeriesTrackIndex([forced], OFF)).toBe(-1);
	});

	test('nothing remembered leaves the choice alone', () => {
		expect(matchSeriesTrackIndex([forced], undefined)).toBeNull();
	});

	test('a preference with neither language nor name leaves the choice alone', () => {
		expect(matchSeriesTrackIndex([forced], {language: '', title: '', relativeIndex: 0})).toBeNull();
	});
});

describe('toSeriesTrackPref', () => {
	test('an older language string becomes a record', () => {
		expect(toSeriesTrackPref('deu')).toEqual({language: 'deu', title: '', relativeIndex: 0});
	});

	test('an older empty string meant off', () => {
		expect(toSeriesTrackPref('')).toEqual(OFF);
	});

	test('a record is kept as it is', () => {
		expect(toSeriesTrackPref({language: 'deu', title: 'forced', relativeIndex: 2}))
			.toEqual({language: 'deu', title: 'forced', relativeIndex: 2});
	});

	test('a half written record is filled in', () => {
		expect(toSeriesTrackPref({language: 'deu'})).toEqual({language: 'deu', title: '', relativeIndex: 0});
	});

	test('nothing stored stays nothing', () => {
		expect(toSeriesTrackPref(undefined)).toBeUndefined();
	});
});
