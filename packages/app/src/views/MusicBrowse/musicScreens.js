import $L from '@enact/i18n/$L';
import {foldAccents} from '../../utils/accentFolding';
import {LETTERS} from '../../utils/gridChrome';
import {shuffleArray} from '../Details/detailsMedia';

// The genre stations and the mix cards. Dark enough for white labels whatever the theme.
export const TILE_COLORS = ['#7A2E22', '#3B2D5C', '#6B2F4A', '#4D3B72', '#B4472F', '#1F3A5F', '#8A5A1E', '#14505C'];

export const PAGE_SIZE = 100;

// What the music styles' categories and See All links ask for, and the screen each one opens.
// Anything not listed here keeps opening the library grid.
const SCREEN_FOR_TARGET = {
	artists: {id: 'artists', mode: 'albumArtists'},
	albumArtists: {id: 'artists', mode: 'albumArtists'},
	allArtists: {id: 'artists', mode: 'artists'},
	albums: {id: 'albums'},
	songs: {id: 'songs'},
	playlists: {id: 'playlists'},
	genres: {id: 'genres'},
	favorites: {id: 'favorites'},
	favoriteItems: {id: 'favorites'},
	favoriteAlbums: {id: 'favorites', tab: 'albums'}
};

export const musicScreenFor = (target) => SCREEN_FOR_TARGET[target] || null;

export const OVERVIEW_TAB = 'overview';

const TAB_FOR_SCREEN = {
	artists: 'albumArtists',
	albums: 'albums',
	songs: 'songs',
	playlists: 'playlists',
	genres: 'genres',
	favorites: 'favoriteItems'
};

// The pill a screen shows as current, Overview being the library home.
export const tabForScreen = (screen) => (screen && TAB_FOR_SCREEN[screen.id]) || OVERVIEW_TAB;

// Each style moves between the screens the way its own overview shows the categories: Classic
// on its chips, Quick Access on its side rail, and Immersive, like any style this app doesn't
// know, on its pill strip.
export const musicNavFor = (style) => {
	if (style === 'classic') return 'chips';
	if (style === 'quickAccess') return 'rail';
	return 'strip';
};

// What picking a pill does from the screen whose pill is `current`: nothing for its own pill,
// 'home' for Overview, or the screen to swap in.
export const stripTarget = (tab, current) => {
	if (tab === current) return null;
	if (tab === OVERVIEW_TAB) return 'home';
	return musicScreenFor(tab);
};

export const countLabel = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)));

// The letter heading a name files under: its first letter with accents folded away, and `#` for
// anything that doesn't start with A to Z.
export const letterOf = (item) => {
	const first = foldAccents((item?.SortName || item?.Name || '').trim()).charAt(0).toUpperCase();
	return first >= 'A' && first <= 'Z' ? first : '#';
};

// Lays `count` items out in rows of up to `columns`. With `sectionAt`, every change of section
// starts a new row whose `heading` is set, so each run of one letter gets its own heading.
export const gridRows = (count, columns, sectionAt) => {
	const rows = [];
	for (let index = 0; index < count; index++) {
		const section = sectionAt ? sectionAt(index) : null;
		const last = rows[rows.length - 1];
		if (last && last.section === section && index - last.start < columns) {
			last.end = index + 1;
		} else {
			rows.push({start: index, end: index + 1, section, heading: Boolean(sectionAt) && (!last || last.section !== section)});
		}
	}
	return rows;
};

export const rowIndexOf = (rows, index) => {
	let low = 0;
	let high = rows.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (index < rows[mid].start) high = mid - 1;
		else if (index >= rows[mid].end) low = mid + 1;
		else return mid;
	}
	return -1;
};

// Where an arrow goes from `index` in `row`: along the row, or to the same column of the row
// above or below, clamped to a shorter row. Null at the edges.
export const gridMove = (rows, row, index, direction) => {
	const current = rows[row];
	if (!current) return null;
	if (direction === 'left') return index > current.start ? index - 1 : null;
	if (direction === 'right') return index < current.end - 1 ? index + 1 : null;
	const next = rows[row + (direction === 'up' ? -1 : 1)];
	if (!next) return null;
	return next.start + Math.min(index - current.start, next.end - next.start - 1);
};

// The heading row a letter on the jump rail lands on: that letter's, or the next one along in the
// list's own order when it has none, or the last section once the whole list is in. -1 means the
// next page has to load first.
export const jumpRow = (rows, letter, descending, complete) => {
	const wanted = LETTERS.indexOf(letter);
	const found = rows.findIndex((row) => {
		if (!row.heading) return false;
		const at = LETTERS.indexOf(row.section);
		return descending ? at <= wanted : at >= wanted;
	});
	if (found >= 0 || !complete) return found;
	for (let row = rows.length - 1; row >= 0; row--) {
		if (rows[row].heading) return row;
	}
	return -1;
};

export const genreAlbumCount = (genre) => genre.AlbumCount ?? genre.ChildCount ?? null;

export const hasGenreCounts = (genres) => genres.some((genre) => genreAlbumCount(genre) != null);

const byName = (a, b) => (a.SortName || a.Name || '').localeCompare(b.SortName || b.Name || '');

// Most albums first with ties by name, or plain A to Z.
export const sortGenres = (genres, mode) => {
	const sorted = genres.slice();
	if (mode === 'albums') sorted.sort((a, b) => (genreAlbumCount(b) || 0) - (genreAlbumCount(a) || 0) || byName(a, b));
	else sorted.sort(byName);
	return sorted;
};

// The four song mixes. Each plays straight away in the order its query returns, except
// Rediscover, which is shuffled here.
export const SONG_MIXES = [
	{id: 'everything', eyebrow: $L('Shuffle'), title: $L('Everything'), line: $L('300 songs at random'), query: {SortBy: 'Random', Limit: 300}},
	{id: 'mostPlayed', eyebrow: $L('Mix'), title: $L('Most Played'), line: $L('Your top 100'), color: TILE_COLORS[4], query: {Filters: 'IsPlayed', SortBy: 'PlayCount,SortName', SortOrder: 'Descending', Limit: 100}},
	{id: 'fresh', eyebrow: $L('Mix'), title: $L('Fresh Arrivals'), line: $L('The newest 100 songs'), color: TILE_COLORS[7], query: {SortBy: 'DateCreated,SortName', SortOrder: 'Descending', Limit: 100}},
	{id: 'rediscover', eyebrow: $L('Mix'), title: $L('Rediscover'), line: $L("Favorites you haven't played lately"), color: TILE_COLORS[3], query: {IsFavorite: true, SortBy: 'DatePlayed,SortName', SortOrder: 'Ascending', Limit: 100}, shuffle: true}
];

export const mixQuery = (mix, libraryId) => ({
	ParentId: libraryId,
	IncludeItemTypes: 'Audio',
	Recursive: true,
	...mix.query
});

export const mixOrder = (mix, tracks, shuffle = shuffleArray) => (mix.shuffle ? shuffle(tracks) : tracks);

export const ALBUM_SORTS = [
	{id: 'recent', label: $L('Recently Added'), SortBy: 'DateCreated,SortName', SortOrder: 'Descending'},
	{id: 'name', label: $L('A to Z'), SortBy: 'SortName', SortOrder: 'Ascending'},
	{id: 'year', label: $L('Year'), SortBy: 'ProductionYear,PremiereDate,SortName', SortOrder: 'Descending'},
	{id: 'artist', label: $L('Artist'), SortBy: 'AlbumArtist,SortName', SortOrder: 'Ascending'}
];

// The Favorites tabs, with the one a See All names starting it when it has anything in it.
export const FAVORITE_TABS = [
	{id: 'songs', label: $L('Songs')},
	{id: 'albums', label: $L('Albums')},
	{id: 'artists', label: $L('Artists')},
	{id: 'playlists', label: $L('Playlists')}
];

export const startingTab = (counts, requested) => {
	if (requested && counts[requested] > 0) return requested;
	const first = FAVORITE_TABS.find((tab) => counts[tab.id] > 0);
	return first ? first.id : null;
};
