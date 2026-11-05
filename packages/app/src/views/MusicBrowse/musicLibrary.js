import $L from '@enact/i18n/$L';
import {getImageUrl} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {MUSIC_CHIPS} from './MusicChips';
import {nextMusicNode} from './musicFocus';

// Where a row's See All goes, named for the screen it opens. Last Played has nowhere of its own
// to send you, so it gets none.
export const SEE_ALL_TARGET = {
	latestMusic: 'albums',
	favorites: 'favoriteAlbums',
	playlists: 'playlists',
	albumArtists: 'albumArtists',
	artists: 'allArtists',
	albums: 'albums'
};

// The subtitle each card type earns: who made it, or how much is in it.
export const subtitleFor = (item) => {
	if (!item) return '';
	switch (item.Type) {
		case 'Audio':
		case 'MusicAlbum': {
			if (item.Artists?.length) return item.Artists.join(', ');
			const names = (item.AlbumArtists || []).map((a) => a.Name).filter(Boolean);
			if (names.length) return names.join(', ');
			return item.AlbumArtist || '';
		}
		case 'Playlist': {
			const count = item.ChildCount;
			return count > 0 ? $L('{count} items').replace('{count}', String(count)) : '';
		}
		case 'MusicArtist':
		case 'AlbumArtist': {
			const count = item.RecursiveItemCount;
			return count > 0 ? $L('{count} albums').replace('{count}', String(count)) : '';
		}
		default:
			return '';
	}
};

// A song's artist and album, the line under it in a Last Played row.
export const songSubtitle = (song) => {
	const artist = subtitleFor(song);
	if (!song?.Album) return artist;
	return artist ? `${artist} · ${song.Album}` : song.Album;
};

const chip = (id) => MUSIC_CHIPS.find((c) => c.id === id);

// The categories the tabs and the rail open. Artists lists the album artists, and Favorites holds
// every favorite in the library whatever its type.
export const MUSIC_CATEGORIES = [
	{...chip('artists'), id: 'albumArtists'},
	chip('albums'),
	{id: 'songs', label: $L('Songs'), icon: 'M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v382q0 66-47 113t-113 47Z'},
	chip('playlists'),
	chip('genres'),
	// The chip's heart path draws outside its box, so this one's whole.
	{...chip('favorites'), id: 'favoriteItems', icon: 'm480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z'}
];

// A song's album art ahead of its own, which is often missing or a scan of the same cover.
export const musicArtUrl = (item, serverUrl, maxHeight = 300) => {
	if (!item) return null;
	const base = item._serverUrl || serverUrl;
	if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
		return getImageUrl(base, item.AlbumId, 'Primary', {maxHeight, quality: 90, tag: item.AlbumPrimaryImageTag});
	}
	if (item.ImageTags?.Primary) return getImageUrl(base, item.Id, 'Primary', {maxHeight, quality: 90, tag: item.ImageTags.Primary});
	return null;
};

// The albums of the songs played last, each once, then the playlists. A song with no album
// stands in for itself.
export const quickItems = (lastPlayed = [], playlists = [], max = 8) => {
	const seen = new Set();
	const albums = [];
	lastPlayed.forEach((track) => {
		const key = track.AlbumId || track.Id;
		if (seen.has(key)) return;
		seen.add(key);
		albums.push(track.AlbumId ? {
			Id: track.AlbumId,
			Type: 'MusicAlbum',
			Name: track.Album || track.Name,
			ImageTags: track.AlbumPrimaryImageTag ? {Primary: track.AlbumPrimaryImageTag} : undefined,
			_serverUrl: track._serverUrl
		} : track);
	});
	return albums.concat(playlists).slice(0, max);
};

// Whether anything in `rects` lies past `rect` the way an arrow points. Middles are compared
// so a focused card's zoom never reads as another row.
export const hasNeighbor = (rect, rects, direction) => rects.some((other) => {
	const x = (other.left + other.right) / 2;
	const y = (other.top + other.bottom) / 2;
	if (direction === 'up') return y < rect.top;
	if (direction === 'down') return y > rect.bottom;
	if (direction === 'left') return x < rect.left;
	return x > rect.right;
});

const DIRECTIONS = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

// The arrows inside one section of the page. Spotlight moves within it. At its edge up and down
// go to `onUp` and `onDown` when the section has its own stop there, like a See All, and to the
// section before or after it otherwise. Left and right go to `onLeft` and `onRight` when the
// screen has somewhere for them, and anything else holds focus rather than jumping to whatever
// lies that way.
export const handleSectionKey = (e, {node, chain, focusNode, onLeft, onRight, onUp, onDown}) => {
	const direction = DIRECTIONS[e.keyCode];
	if (!direction) return;
	const target = e.target;
	const others = Array.prototype.filter.call(e.currentTarget.querySelectorAll('.spottable'), (el) => el !== target);
	if (hasNeighbor(target.getBoundingClientRect(), others.map((el) => el.getBoundingClientRect()), direction)) return;
	e.preventDefault();
	e.stopPropagation();
	if (direction === 'left' || direction === 'right') {
		if (direction === 'left') onLeft?.();
		else onRight?.();
		return;
	}
	const own = direction === 'up' ? onUp : onDown;
	if (own) {
		own();
		return;
	}
	const next = nextMusicNode(chain, node, direction);
	if (next) focusNode(next);
};

// Plays a song's album from that song on, using the album's tracks when the screen already has
// them. A song with no album, or an album that won't load, plays alone.
export const playSongFromAlbum = async ({api, onPlay, onSelectItem}, song, albumTracks) => {
	let tracks = albumTracks;
	if (!tracks?.some((t) => t.Id === song.Id) && song.AlbumId) {
		try {
			tracks = (await api.getAlbumTracks(song.AlbumId))?.Items;
		} catch {
			tracks = null;
		}
	}
	const start = tracks?.find((t) => t.Id === song.Id);
	if (start && onPlay) onPlay(start, false, {audioPlaylist: tracks});
	else onSelectItem?.(song);
};
