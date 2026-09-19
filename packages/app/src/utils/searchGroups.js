import $L from '@enact/i18n/$L';
import * as gamesApi from '../services/gamesApi';
import {deduplicateMediaItems} from './mediaDedup';
import {foldForSearch} from './accentFolding';

const RESULT_CAP = 24;

// The media type groups in the order they appear, both as tabs and as rows. Each
// library search result is bucketed into the group that lists its item type.
// Titles are localized here so the tab bar and the row headers share one source.
const getSearchGroups = () => [
	{key: 'books', title: $L('Books'), types: ['Book']},
	{key: 'movies', title: $L('Movies'), types: ['Movie']},
	{key: 'series', title: $L('Series'), types: ['Series']},
	{key: 'seasons', title: $L('Seasons'), types: ['Season']},
	{key: 'episodes', title: $L('Episodes'), types: ['Episode']},
	{key: 'videos', title: $L('Videos'), types: ['Video']},
	{key: 'musicVideos', title: $L('Music Videos'), types: ['MusicVideo']},
	{key: 'trailers', title: $L('Trailers'), types: ['Trailer']},
	{key: 'programs', title: $L('Programs'), types: ['Program']},
	{key: 'channels', title: $L('Channels'), types: ['TvChannel', 'LiveTvChannel']},
	{key: 'playlists', title: $L('Playlists'), types: ['Playlist']},
	{key: 'artists', title: $L('Artists'), types: ['MusicArtist', 'AlbumArtist']},
	{key: 'albums', title: $L('Albums'), types: ['MusicAlbum']},
	{key: 'songs', title: $L('Songs'), types: ['Audio']},
	{key: 'photoAlbums', title: $L('Photo Albums'), types: ['PhotoAlbum']},
	{key: 'photos', title: $L('Photos'), types: ['Photo']},
	{key: 'collections', title: $L('Collections'), types: ['BoxSet']},
	{key: 'people', title: $L('People'), types: ['Person']},
	{key: 'folders', title: $L('Folders'), types: ['Folder', 'CollectionFolder', 'UserView']}
];

// Buckets items into the group order, collapses duplicate copies of the same
// title inside each group, caps each group, and drops the empty ones.
export const groupSearchResults = (items) => {
	const groups = getSearchGroups();
	const groupForType = new Map();
	groups.forEach((group) => group.types.forEach((type) => groupForType.set(type, group)));
	const buckets = {};
	(items || []).forEach((item) => {
		const group = groupForType.get(item.Type);
		if (!group) return;
		if (!buckets[group.key]) buckets[group.key] = [];
		buckets[group.key].push(item);
	});
	return groups
		.filter((g) => buckets[g.key] && buckets[g.key].length > 0)
		.map((g) => ({...g, items: deduplicateMediaItems(buckets[g.key]).slice(0, RESULT_CAP)}));
};

// Card shape by item type: 16/9 for video-like, square for music and people,
// poster for everything else. Only people render circular.
const WIDE_TYPES = new Set(['Episode', 'Program', 'Recording', 'Video', 'MusicVideo']);
const SQUARE_TYPES = new Set(['MusicAlbum', 'Audio', 'MusicArtist', 'Playlist', 'Person']);

export const aspectClassForType = (type) => {
	if (WIDE_TYPES.has(type)) return 'wide';
	if (SQUARE_TYPES.has(type)) return 'square';
	return 'poster';
};

export const isCircleType = (type) => type === 'Person';

// Live TV channels are fetched wholesale, so they are matched by name here.
export const filterByName = (items, query, cap = RESULT_CAP) => {
	const q = foldForSearch((query || '').trim());
	if (!q) return [];
	return (items || [])
		.filter((item) => foldForSearch(item.Name || '').includes(q))
		.slice(0, cap);
};

// Games have no search endpoint, so every game across the game libraries is
// fetched once and matched here. Each game is tagged with its library so
// selection can route to the game detail screen.
export const fetchAllGames = async (gameLibraries) => {
	if (!Array.isArray(gameLibraries) || gameLibraries.length === 0) return [];
	const perLibrary = await Promise.all(
		gameLibraries.map(async (lib) => {
			try {
				const games = await gamesApi.getGames(lib.Id);
				return (games || []).map((game) => ({...game, _library: lib}));
			} catch {
				return [];
			}
		})
	);
	return perLibrary.flat();
};

export const filterGames = (all, query, cap = RESULT_CAP) => {
	const q = foldForSearch((query || '').trim());
	if (!q) return [];
	return (all || [])
		.filter((game) => foldForSearch(game.title || '').includes(q) || foldForSearch(game.fileName || '').includes(q))
		.slice(0, cap);
};
