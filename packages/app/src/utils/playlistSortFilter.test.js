import {
	sortAndFilterPlaylistTracks,
	showsPlaylistOrder,
	playlistRowMenu,
	PLAYLIST_SORT_ORDER,
	PLAYLIST_SORT_NAME,
	PLAYLIST_SORT_ARTIST,
	PLAYLIST_SORT_ALBUM,
	PLAYLIST_SORT_RUNTIME,
	PLAYLIST_SORT_DATE_ADDED,
	PLAYLIST_SORT_PREMIERE_DATE,
	PLAYLIST_SORT_COMMUNITY_RATING,
	PLAYLIST_SORT_CRITIC_RATING,
	PLAYLIST_SORT_DATE_PLAYED,
	PLAYLIST_SORT_PLAY_COUNT,
	PLAYLIST_SORT_RANDOM,
	SORT_DIR_ASC,
	SORT_DIR_DESC,
	PLAYED_ALL,
	PLAYED_WATCHED,
	PLAYED_UNWATCHED,
	PLAYED_IN_PROGRESS,
	sortLabel,
	playedFilterLabel,
	playlistSortOptions,
	playedFilterOptions
} from './playlistSortFilter';

describe('playlistSortFilter', () => {
	const sampleTracks = [
		{
			Id: '1',
			Name: 'Track Bravo',
			AlbumArtist: 'Artist Beta',
			Album: 'Album Z',
			RunTimeTicks: 2000,
			DateCreated: '2023-01-02T00:00:00Z',
			PremiereDate: '2020-01-01T00:00:00Z',
			CommunityRating: 7.5,
			CriticRating: 70,
			MediaType: 'Audio',
			UserData: {
				IsFavorite: true,
				Played: true,
				PlayCount: 5,
				LastPlayedDate: '2023-02-01T00:00:00Z'
			}
		},
		{
			Id: '2',
			Name: 'Track Alpha',
			AlbumArtist: 'Artist Alpha',
			Album: 'Album A',
			RunTimeTicks: 1000,
			DateCreated: '2023-01-01T00:00:00Z',
			PremiereDate: '2021-01-01T00:00:00Z',
			CommunityRating: 9.0,
			CriticRating: 85,
			MediaType: 'Audio',
			UserData: {
				IsFavorite: false,
				Played: false,
				PlaybackPositionTicks: 500,
				PlayCount: 1,
				LastPlayedDate: '2023-01-15T00:00:00Z'
			}
		},
		{
			Id: '3',
			Name: 'Video Charlie',
			AlbumArtist: 'Artist Gamma',
			Album: 'Album M',
			RunTimeTicks: 3000,
			DateCreated: '2023-01-03T00:00:00Z',
			PremiereDate: '2019-01-01T00:00:00Z',
			CommunityRating: 8.0,
			CriticRating: 75,
			MediaType: 'Video',
			UserData: {
				IsFavorite: false,
				Played: false,
				PlaybackPositionTicks: 0,
				PlayCount: 0
			}
		}
	];

	describe('labels & options', () => {
		test('sortLabel returns localized labels', () => {
			expect(sortLabel(PLAYLIST_SORT_ORDER)).toBe('Playlist Order');
			expect(sortLabel(PLAYLIST_SORT_NAME)).toBe('Name');
			expect(sortLabel(PLAYLIST_SORT_RANDOM)).toBe('Random');
			expect(sortLabel('custom')).toBe('custom');
		});

		test('playedFilterLabel returns expected labels', () => {
			expect(playedFilterLabel(PLAYED_ALL)).toBe('All');
			expect(playedFilterLabel(PLAYED_WATCHED)).toBe('Watched');
			expect(playedFilterLabel(PLAYED_UNWATCHED)).toBe('Unplayed');
			expect(playedFilterLabel(PLAYED_IN_PROGRESS)).toBe('In Progress');
		});

		test('options return list of items with id and label', () => {
			expect(playlistSortOptions().length).toBe(12);
			expect(playedFilterOptions().length).toBe(4);
		});
	});

	describe('filtering', () => {
		test('filters by favoriteOnly', () => {
			const res = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				favoriteOnly: true
			});
			expect(res.map((t) => t.Id)).toEqual(['1']);
		});

		test('filters by playedFilter watched', () => {
			const res = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				playedFilter: PLAYED_WATCHED
			});
			expect(res.map((t) => t.Id)).toEqual(['1']);
		});

		test('filters by playedFilter unwatched', () => {
			const res = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				playedFilter: PLAYED_UNWATCHED
			});
			expect(res.map((t) => t.Id)).toEqual(['3']);
		});

		test('filters by playedFilter inProgress', () => {
			const res = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				playedFilter: PLAYED_IN_PROGRESS
			});
			expect(res.map((t) => t.Id)).toEqual(['2']);
		});

		test('filters by mediaTypeFilter', () => {
			const audioOnly = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				mediaTypeFilter: 'Audio'
			});
			expect(audioOnly.map((t) => t.Id)).toEqual(['1', '2']);

			const videoOnly = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				mediaTypeFilter: 'Video'
			});
			expect(videoOnly.map((t) => t.Id)).toEqual(['3']);
		});
	});

	describe('sorting', () => {
		test('default playlistOrder preserves order or reverses on descending', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_ORDER,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Id)).toEqual(['1', '2', '3']);

			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_ORDER,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Id)).toEqual(['3', '2', '1']);
		});

		test('sorts by name', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_NAME,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Name)).toEqual(['Track Alpha', 'Track Bravo', 'Video Charlie']);

			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_NAME,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Name)).toEqual(['Video Charlie', 'Track Bravo', 'Track Alpha']);
		});

		test('sorts by artist', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_ARTIST,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.AlbumArtist)).toEqual(['Artist Alpha', 'Artist Beta', 'Artist Gamma']);
		});

		test('sorts by album', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_ALBUM,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Album)).toEqual(['Album A', 'Album M', 'Album Z']);
		});

		test('sorts by runtime', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_RUNTIME,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Id)).toEqual(['2', '1', '3']);
		});

		test('sorts by dateAdded', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_DATE_ADDED,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Id)).toEqual(['2', '1', '3']);
		});

		test('sorts by premiereDate', () => {
			const asc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_PREMIERE_DATE,
				sortDirection: SORT_DIR_ASC
			});
			expect(asc.map((t) => t.Id)).toEqual(['3', '1', '2']);
		});

		test('sorts by communityRating', () => {
			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_COMMUNITY_RATING,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Id)).toEqual(['2', '3', '1']);
		});

		test('sorts by criticRating', () => {
			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_CRITIC_RATING,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Id)).toEqual(['2', '3', '1']);
		});

		test('sorts by datePlayed', () => {
			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_DATE_PLAYED,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Id)).toEqual(['1', '2', '3']);
		});

		test('sorts by playCount', () => {
			const desc = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_PLAY_COUNT,
				sortDirection: SORT_DIR_DESC
			});
			expect(desc.map((t) => t.Id)).toEqual(['1', '2', '3']);
		});

		test('sorts by random with seed deterministically', () => {
			const res1 = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_RANDOM,
				randomSeed: 99
			});
			const res2 = sortAndFilterPlaylistTracks({
				tracks: sampleTracks,
				sortBy: PLAYLIST_SORT_RANDOM,
				randomSeed: 99
			});
			expect(res1.map((t) => t.Id)).toEqual(res2.map((t) => t.Id));
		});
	});
});

describe('showsPlaylistOrder', () => {
	const plain = {sortBy: PLAYLIST_SORT_ORDER, sortDirection: SORT_DIR_ASC, playedFilter: PLAYED_ALL, favoriteOnly: false, mediaTypeFilter: null};

	test('is true only with no sort or filter applied', () => {
		expect(showsPlaylistOrder(plain)).toBe(true);
		expect(showsPlaylistOrder({...plain, mediaTypeFilter: 'all'})).toBe(true);
		expect(showsPlaylistOrder({...plain, sortBy: PLAYLIST_SORT_NAME})).toBe(false);
		expect(showsPlaylistOrder({...plain, sortDirection: SORT_DIR_DESC})).toBe(false);
		expect(showsPlaylistOrder({...plain, playedFilter: PLAYED_WATCHED})).toBe(false);
		expect(showsPlaylistOrder({...plain, favoriteOnly: true})).toBe(false);
		expect(showsPlaylistOrder({...plain, mediaTypeFilter: 'Audio'})).toBe(false);
	});
});

describe('playlistRowMenu', () => {
	const play = jest.fn();
	const menu = {playlist: {canManage: true, play}};

	test('plays the shown list and passes on whether rows can move', () => {
		const shown = [{Id: 'b'}, {Id: 'a'}];
		const rowMenu = playlistRowMenu(menu, shown, false);
		expect(rowMenu.playlist.canMove).toBe(false);
		expect(rowMenu.playlist.canManage).toBe(true);
		rowMenu.playlist.play(shown[1]);
		expect(play).toHaveBeenCalledWith(shown[1], shown);
	});

	test('leaves a menu with no playlist as it is', () => {
		expect(playlistRowMenu(null, [], true)).toBeNull();
		const plain = {collectionRemoval: true};
		expect(playlistRowMenu(plain, [], true)).toBe(plain);
	});
});
