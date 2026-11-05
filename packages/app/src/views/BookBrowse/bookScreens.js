import $L from '@enact/i18n/$L';
import {SCOPE_ALL, availableScopes, isAudiobookItem, isComicItem, isEbookItem, isMixedLibrary, scopeLabel} from '../../utils/bookLibrary';
import {countLabel} from '../MusicBrowse/musicScreens';

export const OVERVIEW = 'overview';
export const TITLES = 'titles';
const DISCOVER = 'discover';

// The genre stations' palette, dark enough for white text whatever the theme.
export const STATION_COLORS = ['#7A2E22', '#3B2D5C', '#6B2F4A', '#4D3B72', '#B4472F', '#1F3A5F', '#8A5A1E', '#14505C'];

const SCOPE_ICONS = {all: 'library_books_outlined', books: 'menu_book_rounded', audiobooks: 'headphones_rounded', comics: 'auto_stories_rounded'};

// The destinations past Titles, which hide while they have nothing in them.
const BROWSE_DESTINATIONS = [
	{id: 'series', label: () => $L('Series'), icon: 'layers_outlined'},
	{id: 'authors', label: () => $L('Authors'), icon: 'person_outline_rounded'},
	{id: 'genres', label: () => $L('Genres'), icon: 'sell_outlined'},
	{id: 'collections', label: () => $L('Collections'), icon: 'collections_bookmark_outlined'},
	{id: 'favorites', label: () => $L('Favorites'), icon: 'favorite_border_rounded'}
];

const DISCOVER_ENTRY = {id: DISCOVER, label: () => $L('Discover'), icon: 'explore_outlined'};

// Bookstore keeps its rail, Classic gets a pill strip and Reading Room a row of icon chips.
export const bookNavFor = (style) => {
	if (style === 'classic') return 'strip';
	if (style === 'readingRoom') return 'chips';
	return 'rail';
};

// Bookstore has no overview, so its root is All Titles.
export const ROOT_SCREEN = {id: TITLES, scope: SCOPE_ALL};

export const screenFor = (id, scope, sort) => (id === TITLES ? {id, scope: scope || SCOPE_ALL, ...(sort ? {sort} : {})} : {id});

export const titlesHeading = (scope) => (scope && scope !== SCOPE_ALL ? scopeLabel(scope) : $L('All Titles'));

const browseCount = (data, id) => {
	if (id === 'series') return data.series.length;
	if (id === 'authors') return data.authorCount;
	if (id === 'genres') return data.genreCount;
	if (id === 'collections') return data.collections.length;
	if (id === 'favorites') return data.favoriteCount;
	return 0;
};

// The nav's entries, each with the key the current one is told apart by. Bookstore lists Titles
// as its formats, with counts. The other two lead with Overview and list Titles once.
export const navEntries = ({style, library, data, showDiscover}) => {
	const browse = BROWSE_DESTINATIONS.filter((entry) => browseCount(data, entry.id) > 0)
		.map((entry) => ({key: entry.id, screen: {id: entry.id}, label: entry.label(), icon: entry.icon, count: browseCount(data, entry.id)}));
	const discover = showDiscover ? [{key: DISCOVER, screen: {id: DISCOVER}, label: DISCOVER_ENTRY.label(), icon: DISCOVER_ENTRY.icon}] : [];
	if (bookNavFor(style) === 'rail') {
		const scopes = isMixedLibrary(library, data.counts) ? availableScopes(data.counts) : [SCOPE_ALL];
		return [
			...scopes.map((scope) => ({key: `scope-${scope}`, screen: screenFor(TITLES, scope), label: titlesHeading(scope), icon: SCOPE_ICONS[scope], count: data.counts[scope], section: 'titles'})),
			...browse.map((entry) => ({...entry, section: 'browse'})),
			...discover.map((entry) => ({...entry, section: 'discover'}))
		];
	}
	return [
		{key: OVERVIEW, screen: null, label: $L('Overview'), icon: 'space_dashboard_outlined'},
		{key: TITLES, screen: screenFor(TITLES), label: $L('Titles'), icon: SCOPE_ICONS.all},
		...browse,
		...discover
	];
};

// Which entry a screen lights up: the format it shows on Bookstore's rail, its own destination on
// the others, or Overview while there's no screen.
export const navKeyFor = (style, screen) => {
	if (!screen) return bookNavFor(style) === 'rail' ? `scope-${SCOPE_ALL}` : OVERVIEW;
	if (screen.id === TITLES && bookNavFor(style) === 'rail') return `scope-${screen.scope || SCOPE_ALL}`;
	return screen.id;
};

// Where Back goes from a screen: Bookstore's All Titles from any other, the overview for the other
// styles, or nowhere from the root, which leaves the library.
export const backTarget = (style, screen) => {
	if (!screen) return null;
	if (bookNavFor(style) !== 'rail') return OVERVIEW;
	return navKeyFor(style, screen) === `scope-${SCOPE_ALL}` ? null : ROOT_SCREEN;
};

export const formatEyebrow = (item) => {
	if (isAudiobookItem(item)) return $L('Audiobook');
	return isComicItem(item) ? $L('Comic') : $L('Book');
};

const isAuthorCredit = (person) => person && (person.Type === 'Author' || person.Role === 'Author');

export const authorOf = (item) => (item?.People || []).find(isAuthorCredit)?.Name || item?.AlbumArtist || item?.Artists?.[0] || '';

const seriesLine = (item) => {
	if (!item?.SeriesName) return '';
	return item.IndexNumber != null ? `${item.SeriesName} #${item.IndexNumber}` : item.SeriesName;
};

// What sits under a title in its panel: who wrote it and when, then its place in a series.
export const titleMeta = (item) => [authorOf(item), item?.ProductionYear ? String(item.ProductionYear) : '', seriesLine(item)]
	.filter(Boolean).join(' · ');

export const isFinished = (item) => Boolean(item?.UserData?.Played);

const collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}) : null;
const compareText = (a, b) => (collator ? collator.compare(a, b) : a.localeCompare(b));

// A series' books by their number, then by name for any without one.
export const readingOrder = (books) => books.slice().sort((a, b) => {
	const left = a.IndexNumber ?? Infinity;
	const right = b.IndexNumber ?? Infinity;
	if (left !== right) return left < right ? -1 : 1;
	return compareText(a.SortName || a.Name || '', b.SortName || b.Name || '');
});

// The first book not finished, its place in the series, and whether every book is done.
export const seriesProgress = (books) => {
	const index = books.findIndex((book) => !isFinished(book));
	if (index < 0) return {next: null, finished: books.length > 0, label: $L('Finished')};
	const number = books[index].IndexNumber ?? index + 1;
	return {
		next: books[index],
		finished: false,
		label: $L('Book {number} of {count}').replace('{number}', number).replace('{count}', books.length)
	};
};

const nameKey = (name) => String(name || '').trim().toLowerCase();

const credits = (item) => new Set([
	...(item.People || []).filter(isAuthorCredit).map((person) => person.Name),
	item.AlbumArtist,
	...(item.Artists || [])
].filter((name) => typeof name === 'string').map(nameKey));

export const booksByAuthor = (titles, author) => {
	const key = nameKey(author?.Name);
	return key ? titles.filter((title) => credits(title).has(key)) : [];
};

// An author's books a shelf per series, in reading order, then everything else.
export const authorShelves = (books) => {
	const bySeries = new Map();
	const other = [];
	books.forEach((book) => {
		const name = String(book.SeriesName || '').trim();
		if (!name) {
			other.push(book);
			return;
		}
		if (!bySeries.has(name)) bySeries.set(name, []);
		bySeries.get(name).push(book);
	});
	const shelves = Array.from(bySeries.keys()).sort(compareText)
		.map((name) => ({id: `series:${name}`, title: name, items: readingOrder(bySeries.get(name)), numbered: true}));
	if (other.length) shelves.push({id: 'other', title: shelves.length ? $L('Other Books') : $L('Books'), items: other});
	return shelves;
};

export const authorStats = (books) => {
	const audiobooks = books.filter(isAudiobookItem).length;
	const series = new Set(books.map((book) => String(book.SeriesName || '').trim()).filter(Boolean)).size;
	return {books: books.length - audiobooks, audiobooks, series};
};

export const genreTitleCount = (genre) => genre?.ChildCount || 0;

// Most titles first with ties by name, or plain A to Z.
export const sortBookGenres = (genres, mode) => genres.slice().sort((a, b) => (
	(mode === 'most' ? genreTitleCount(b) - genreTitleCount(a) : 0) || compareText(a.Name || '', b.Name || '')
));

// The Favorites board's panels in order, each split out of the favorite titles or loaded on its own.
export const FAVORITE_PANELS = [
	{id: 'books', label: () => $L('Books')},
	{id: 'audiobooks', label: () => $L('Audiobooks')},
	{id: 'comics', label: () => $L('Comics')},
	{id: 'series', label: () => $L('Series')},
	{id: 'authors', label: () => $L('Authors')}
];

export const splitFavorites = (titles) => ({
	books: titles.filter(isEbookItem),
	audiobooks: titles.filter(isAudiobookItem),
	comics: titles.filter(isComicItem)
});

export const titlesCount = (count) => (count > 0 ? countLabel(count, $L('1 title'), $L('{count} titles')) : null);
