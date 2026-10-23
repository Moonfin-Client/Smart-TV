import {itemMenuActions} from './itemMenuActions';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

const ids = (item, options) => itemMenuActions(item, options).map((action) => action.id);
const labelOf = (item, id, options) => itemMenuActions(item, options).find((action) => action.id === id)?.label;

const movie = (userData = {}) => ({Id: 'm1', Type: 'Movie', Name: 'A movie', UserData: userData});
const episode = (userData = {}) => ({Id: 'e1', Type: 'Episode', SeriesId: 's1', UserData: userData});

describe('itemMenuActions', () => {
	test('offers a viewer the everyday entries, Play first', () => {
		expect(ids(movie())).toEqual(['play', 'watched', 'favorite', 'addToPlaylist']);
	});

	test('reads Resume with a resume point and flips the toggles to what would change', () => {
		const underWay = movie({PlaybackPositionTicks: 50, IsFavorite: true});
		expect(labelOf(underWay, 'play')).toBe('Resume');
		expect(labelOf(underWay, 'favorite')).toBe('Remove from Favorites');
		expect(labelOf(movie({Played: true}), 'watched')).toBe('Mark as Unwatched');
		expect(ids(underWay)).toContain('hideContinueWatching');
		expect(ids(movie({Played: true, PlaybackPositionTicks: 50}))).not.toContain('hideContinueWatching');
	});

	test('counts a series as under way once some of it is watched', () => {
		const series = {Id: 's1', Type: 'Series', RecursiveItemCount: 10, UserData: {UnplayedItemCount: 4}};
		expect(labelOf(series, 'play')).toBe('Resume');
		expect(labelOf({...series, UserData: {UnplayedItemCount: 10}}, 'play')).toBe('Play');
	});

	test('gives an episode its series entries', () => {
		expect(ids(episode())).toEqual(['play', 'watched', 'hideNextUp', 'favorite', 'addToPlaylist', 'goToSeries']);
	});

	test('gives a playlist row its own entries, View Details right after Play', () => {
		const playlist = {canManage: true, first: false, last: false};
		expect(ids(movie(), {playlist})).toEqual(['play', 'viewDetails', 'watched', 'favorite', 'addToPlaylist', 'removeFromPlaylist', 'moveUp', 'moveDown']);
		expect(ids(movie(), {playlist: {canManage: true, first: true, last: false}})).not.toContain('moveUp');
		expect(ids(movie(), {playlist: {canManage: true, first: false, last: true}})).not.toContain('moveDown');
		expect(ids(movie(), {playlist: {canManage: false}})).toEqual(['play', 'viewDetails', 'watched', 'favorite', 'addToPlaylist']);
		expect(ids(movie(), {playlist: {canManage: true, canMove: false, first: false, last: false}}))
			.toEqual(['play', 'viewDetails', 'watched', 'favorite', 'addToPlaylist', 'removeFromPlaylist']);
	});

	test('leaves View Details off a song, which has no page to open', () => {
		const song = {Id: 'a1', Type: 'Audio', Name: 'A song', UserData: {}};
		expect(ids(song, {playlist: {canManage: true, first: true, last: true}})).toEqual(['play', 'watched', 'favorite', 'addToPlaylist', 'removeFromPlaylist']);
	});

	test('adds the collection entries only for someone who can manage collections', () => {
		expect(ids(movie(), {canManageCollections: true})).toContain('addToCollection');
		expect(ids(movie(), {canManageCollections: true})).not.toContain('removeFromCollection');
		expect(ids(movie(), {canManageCollections: true, inCollection: true})).toContain('removeFromCollection');
		expect(ids(movie(), {inCollection: true})).not.toContain('removeFromCollection');
	});

	test('keeps the server tools to an admin on Jellyfin', () => {
		const admin = {isAdmin: true, isJellyfin: true};
		expect(ids(movie(), admin)).toEqual(['play', 'watched', 'favorite', 'addToPlaylist', 'refreshMetadata', 'identify', 'changeArtwork']);
		expect(ids(movie(), {isAdmin: true, isJellyfin: false})).toEqual(['play', 'watched', 'favorite', 'addToPlaylist']);
		expect(ids({Id: 'a1', Type: 'Audio'}, admin)).not.toContain('identify');
	});

	test('offers an admin artwork alone on a library or a genre', () => {
		expect(ids({Id: 'g1', Type: 'Genre'}, {isAdmin: true})).toEqual(['changeArtwork']);
		expect(ids({Id: 'l1', Type: 'CollectionFolder'}, {isAdmin: true})).toEqual(['changeArtwork']);
	});

	test("has nothing for what it doesn't know how to act on", () => {
		expect(ids({Id: 'p1', Type: 'Person'}, {isAdmin: true})).toEqual([]);
		expect(ids({Id: 'c1', Type: 'TvChannel'})).toEqual([]);
		expect(ids(null)).toEqual([]);
	});

	test('flips the top action to Go to Details when Continue Watching and Next Up play on select', () => {
		const options = {isContinueWatchingOrNextUp: true, playImmediately: true};
		expect(ids(movie(), options)).toEqual(['viewDetails', 'watched', 'favorite', 'addToPlaylist']);
		expect(labelOf(movie(), 'viewDetails', options)).toBe('Go to Details');
		expect(ids(episode(), options)).toEqual(['viewDetails', 'watched', 'hideNextUp', 'favorite', 'addToPlaylist', 'goToSeries']);
		expect(labelOf(episode(), 'viewDetails', options)).toBe('Go to Details');
	});

	test('keeps Play first on Continue Watching and Next Up when they open Details on select', () => {
		const options = {isContinueWatchingOrNextUp: true, playImmediately: false};
		expect(ids(movie(), options)).toEqual(['play', 'watched', 'favorite', 'addToPlaylist']);
		expect(labelOf(movie(), 'play', options)).toBe('Play');
	});
});
