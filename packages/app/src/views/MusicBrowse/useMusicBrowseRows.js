import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';

const ROW_LIMIT = 30;
const PLAYLIST_WORKERS = 4;
const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,ImageTags,UserData,AlbumArtist,AlbumArtists,Artists,ChildCount,RecursiveItemCount';
const PLAYLIST_FIELDS = 'PrimaryImageAspectRatio,ImageTags,MediaType,ChildCount,RecursiveItemCount';

// Albums and favorites are the only rows that carry a release year, so the rest
// fall back to name when that sort is picked.
const resolveSort = (sortOption, type) => {
	if (sortOption === 'release_year' && (type === 'MusicAlbum' || type === 'Favorites')) {
		return {SortBy: 'ProductionYear,SortName', SortOrder: 'Descending'};
	}
	if (sortOption === 'date_added') {
		return {SortBy: 'DateCreated', SortOrder: 'Descending'};
	}
	return {SortBy: 'SortName', SortOrder: 'Ascending'};
};

// A playlist only belongs in a music library when everything in it is audio, and
// the server won't answer that, so each one has to be opened to find out.
const filterAudioPlaylists = async (api, playlists) => {
	const audioPlaylists = [];
	const queue = playlists.slice();
	const workerCount = Math.min(PLAYLIST_WORKERS, queue.length);
	const workers = Array.from({length: workerCount}, async () => {
		while (queue.length > 0) {
			const playlist = queue.shift();
			if (!playlist || playlist.Type !== 'Playlist' || !playlist.Id) continue;

			const count = playlist.ChildCount != null ? playlist.ChildCount : playlist.RecursiveItemCount;
			if (count != null && count <= 0) continue;

			try {
				const res = await api.getPlaylistItems(playlist.Id, 300);
				const entries = res?.Items || [];
				if (entries.length === 0) continue;
				const hasOnlyAudio = entries.every((entry) => (
					entry?.MediaType ? entry.MediaType === 'Audio' : entry?.Type === 'Audio'
				));
				if (hasOnlyAudio) audioPlaylists.push(playlist);
			} catch (err) {
				if (playlist.MediaType === 'Audio') audioPlaylists.push(playlist);
			}
		}
	});
	await Promise.all(workers);
	return audioPlaylists;
};

// Loads the rows, dropping the ones turned off in settings and the ones that
// came back empty.
const useMusicBrowseRows = ({api, library, settings}) => {
	const [rows, setRows] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const generationRef = useRef(0);

	const libraryId = library?.Id;
	const libraryName = library?.Name;
	const {
		displayAudioLatest, displayAudioLastPlayed, displayAudioFavorites,
		displayAudioPlaylists, displayAudioAlbumArtists, displayAudioArtists,
		displayAudioAlbums, audioSortOption
	} = settings;

	const load = useCallback(async () => {
		if (!libraryId) return;
		const generation = ++generationRef.current;
		setIsLoading(true);

		const base = {ParentId: libraryId, Recursive: true, Limit: ROW_LIMIT, Fields: FIELDS};
		// Latest and Last Played are defined by their own order, so the sort setting
		// only reaches the rows that browse the library rather than recap it.
		const sorted = (type) => ({...base, ...resolveSort(audioSortOption, type)});
		const empty = Promise.resolve(null);

		try {
			const [latest, lastPlayed, favorites, playlists, albumArtists, artists, albums] = await Promise.all([
				displayAudioLatest ? api.getItems({
					...base,
					IncludeItemTypes: 'MusicAlbum',
					SortBy: 'DateCreated',
					SortOrder: 'Descending'
				}) : empty,
				displayAudioLastPlayed ? api.getItems({
					...base,
					IncludeItemTypes: 'Audio',
					SortBy: 'DatePlayed',
					SortOrder: 'Descending',
					Filters: 'IsPlayed'
				}) : empty,
				displayAudioFavorites ? api.getItems({
					...sorted('Favorites'),
					IncludeItemTypes: 'MusicAlbum',
					Filters: 'IsFavorite'
				}) : empty,
				displayAudioPlaylists ? api.getItems({
					Recursive: true,
					Limit: ROW_LIMIT,
					IncludeItemTypes: 'Playlist',
					Fields: PLAYLIST_FIELDS,
					...resolveSort(audioSortOption, 'Playlist')
				}) : empty,
				displayAudioAlbumArtists ? api.getAlbumArtists(sorted('AlbumArtist')) : empty,
				displayAudioArtists ? api.getArtists(sorted('MusicArtist')) : empty,
				displayAudioAlbums ? api.getItems({
					...sorted('MusicAlbum'),
					IncludeItemTypes: 'MusicAlbum'
				}) : empty
			]);

			const audioPlaylists = playlists ? await filterAudioPlaylists(api, playlists.Items || []) : [];
			if (generation !== generationRef.current) return;

			const next = [
				{id: 'latestMusic', title: $L('Latest {name}').replace('{name}', libraryName || $L('Music')), items: latest?.Items || [], cardType: 'square'},
				{id: 'lastPlayed', title: $L('Last Played'), items: lastPlayed?.Items || [], cardType: 'square'},
				{id: 'favorites', title: $L('Favorites'), items: favorites?.Items || [], cardType: 'square'},
				{id: 'playlists', title: $L('Playlists'), items: audioPlaylists, cardType: 'square'},
				{id: 'albumArtists', title: $L('Album Artists'), items: albumArtists?.Items || [], cardType: 'circle'},
				{id: 'artists', title: $L('Artists'), items: artists?.Items || [], cardType: 'circle'},
				{id: 'albums', title: $L('Albums'), items: albums?.Items || [], cardType: 'square'}
			].filter((row) => row.items.length > 0);

			setRows(next);
		} catch (err) {
			console.error('[MusicBrowse] failed to load rows:', err);
			if (generation === generationRef.current) setRows([]);
		} finally {
			if (generation === generationRef.current) setIsLoading(false);
		}
	}, [api, libraryId, libraryName, audioSortOption,
		displayAudioLatest, displayAudioLastPlayed, displayAudioFavorites, displayAudioPlaylists,
		displayAudioAlbumArtists, displayAudioArtists, displayAudioAlbums]);

	useEffect(() => { load(); }, [load]);

	// The last thing played is the thing worth offering first.
	const featured = rows.find((r) => r.id === 'lastPlayed')?.items[0] || rows[0]?.items[0] || null;

	return {rows, isLoading, featured};
};

export default useMusicBrowseRows;
