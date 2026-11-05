import {alphabetApplies, librarySortKeys, orderByMyRating, savedSortOrder, sortField, sortLabel} from './librarySorts';

describe('librarySortKeys', () => {
	test('a movie library leaves parental rating to Group By', () => {
		expect(librarySortKeys({movieOrSeries: true})).toEqual([
			'SortName', 'DateCreated', 'PremiereDate', 'DatePlayed', 'PlayCount', 'CriticRating', 'CommunityRating', 'Runtime', 'Random'
		]);
	});

	test('a series library adds the episode date after Date Added', () => {
		const keys = librarySortKeys({series: true, movieOrSeries: true});

		expect(keys.slice(0, 4)).toEqual(['SortName', 'DateCreated', 'DateLastContentAdded', 'PremiereDate']);
	});

	test('My Rating leads only when the plugin can serve it', () => {
		expect(librarySortKeys({movieOrSeries: true, myRating: true})[0]).toBe('MyRating');
		expect(librarySortKeys({movieOrSeries: true})).not.toContain('MyRating');
	});

	test('a folder view gets its own list with Folders First at the end', () => {
		const keys = librarySortKeys({folders: true, myRating: true});

		expect(keys).toEqual([
			'SortName', 'DateCreated', 'PremiereDate', 'OfficialRating', 'DatePlayed', 'PlayCount', 'CriticRating', 'CommunityRating', 'Runtime', 'Random', 'FoldersFirst'
		]);
	});

	test('songs sort by their album and track', () => {
		expect(librarySortKeys({songs: true, music: true})).toEqual([
			'SortName', 'DateCreated', 'AlbumArtist', 'Album', 'Artist', 'IndexNumber', 'PremiereDate', 'DatePlayed', 'PlayCount', 'Runtime', 'Random'
		]);
	});

	test('the other music grids drop the video sorts and add album ones', () => {
		expect(librarySortKeys({music: true})).toEqual([
			'SortName', 'DateCreated', 'PremiereDate', 'DatePlayed', 'AlbumArtist', 'Album', 'Genre', 'Runtime', 'Random'
		]);
	});

	test('books keep parental rating and add the track number', () => {
		expect(librarySortKeys({books: true})).toEqual([
			'SortName', 'DateCreated', 'PremiereDate', 'OfficialRating', 'DatePlayed', 'PlayCount', 'IndexNumber', 'CriticRating', 'CommunityRating', 'Runtime', 'Random'
		]);
	});
});

describe('sort labels and fields', () => {
	test('read the way Core labels them', () => {
		expect(sortLabel('PremiereDate')).toBe('Release Date');
		expect(sortLabel('OfficialRating')).toBe('Parental Rating');
		expect(sortLabel('IndexNumber')).toBe('Track Number');
		expect(sortLabel('Runtime', false)).toBe('Runtime');
		expect(sortLabel('Runtime', true)).toBe('Length');
	});

	test('an unknown key falls back to the name sort', () => {
		expect(sortField('Nope')).toBe('SortName');
		expect(sortLabel('Nope')).toBe('Name');
		expect(sortField('DatePlayed')).toBe('DatePlayed,SortName');
	});
});

describe('alphabetApplies', () => {
	test('shows for the name sorts only', () => {
		expect(alphabetApplies({sortKey: 'SortName'})).toBe(true);
		expect(alphabetApplies({sortKey: 'FoldersFirst'})).toBe(true);
		expect(alphabetApplies({sortKey: 'AlbumArtist'})).toBe(true);
		expect(alphabetApplies({sortKey: 'Album'})).toBe(true);
		expect(alphabetApplies({sortKey: 'DateCreated'})).toBe(false);
	});

	test('music grids always get it and songs never do', () => {
		expect(alphabetApplies({sortKey: 'DateCreated', music: true})).toBe(true);
		expect(alphabetApplies({sortKey: 'SortName', music: true, songs: true})).toBe(false);
	});
});

describe('orderByMyRating', () => {
	const entries = [
		{ItemId: 'b', Rating: 7},
		{ItemId: 'a', Rating: 9},
		{ItemId: 'c', Rating: 7},
		{ItemId: 'd'},
		null
	];

	test('highest first when descending, ties settled by id', () => {
		expect(orderByMyRating(entries, false)).toEqual(['a', 'b', 'c']);
	});

	test('lowest first when ascending', () => {
		expect(orderByMyRating(entries, true)).toEqual(['b', 'c', 'a']);
	});

	test('copes with nothing', () => {
		expect(orderByMyRating(null, true)).toEqual([]);
	});
});

describe('savedSortOrder', () => {
	test('a direction that was saved wins', () => {
		expect(savedSortOrder('Ascending', 'DateCreated')).toBe('Ascending');
	});

	test('a sort saved without a direction keeps the one it used to run in', () => {
		expect(savedSortOrder('', 'DateCreated')).toBe('Descending');
		expect(savedSortOrder('', 'SortName')).toBe('Ascending');
	});
});
