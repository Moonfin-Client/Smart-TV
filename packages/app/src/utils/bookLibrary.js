import $L from '@enact/i18n/$L';

import {bookExtension} from './books';
import {getImageUrl} from './helpers';

// What a book library holds and how its titles are told apart. Jellyfin types a comic as a Book,
// so comics are picked out by their file's extension.

export const SCOPE_ALL = 'all';
export const SCOPE_BOOKS = 'books';
export const SCOPE_AUDIOBOOKS = 'audiobooks';
export const SCOPE_COMICS = 'comics';

const COMIC_EXTENSIONS = ['cbz', 'cbr', 'cb7', 'cbt'];

export const isBookLibraryType = (collectionType) => {
	const type = String(collectionType || '').toLowerCase();
	return type === 'books' || type === 'audiobooks';
};

export const isAudiobookLibrary = (library) => String(library?.CollectionType || '').toLowerCase() === 'audiobooks';

export const isComicItem = (item) => String(item?.Type || '').toLowerCase() === 'comic' ||
	COMIC_EXTENSIONS.includes(bookExtension(item));

export const isAudiobookItem = (item) => !isComicItem(item) && (item?.Type === 'AudioBook' || item?.Type === 'Audio');

export const isEbookItem = (item) => !isAudiobookItem(item) && !isComicItem(item);

// A books library asks for audiobooks too, so the ones filed in it show up.
export const combinedTypes = (library) => (isAudiobookLibrary(library) ? 'AudioBook,Audio' : 'Book,AudioBook');

const audiobookTypes = (library) => (isAudiobookLibrary(library) ? 'AudioBook,Audio' : 'AudioBook');

export const scopedTypes = (library, scope) => {
	if (isAudiobookLibrary(library)) return audiobookTypes(library);
	if (scope === SCOPE_BOOKS || scope === SCOPE_COMICS) return 'Book';
	if (scope === SCOPE_AUDIOBOOKS) return audiobookTypes(library);
	return combinedTypes(library);
};

export const matchesScope = (item, scope) => {
	if (scope === SCOPE_BOOKS) return isEbookItem(item);
	if (scope === SCOPE_AUDIOBOOKS) return isAudiobookItem(item);
	if (scope === SCOPE_COMICS) return isComicItem(item);
	return true;
};

export const bookCounts = (titles) => ({
	[SCOPE_ALL]: titles.length,
	[SCOPE_BOOKS]: titles.filter(isEbookItem).length,
	[SCOPE_AUDIOBOOKS]: titles.filter(isAudiobookItem).length,
	[SCOPE_COMICS]: titles.filter(isComicItem).length
});

// Two or more formats turn on the format filter. An audiobooks library never counts as mixed.
export const isMixedLibrary = (library, counts) => !isAudiobookLibrary(library) &&
	[SCOPE_BOOKS, SCOPE_AUDIOBOOKS, SCOPE_COMICS].filter((scope) => counts[scope] > 0).length >= 2;

export const availableScopes = (counts) => [SCOPE_ALL, SCOPE_BOOKS, SCOPE_AUDIOBOOKS, SCOPE_COMICS]
	.filter((scope) => scope === SCOPE_ALL || counts[scope] > 0);

export const scopeLabel = (scope) => {
	if (scope === SCOPE_BOOKS) return $L('Books');
	if (scope === SCOPE_AUDIOBOOKS) return $L('Audiobooks');
	if (scope === SCOPE_COMICS) return $L('Comics');
	return $L('All');
};

export const titlesLabel = (count) => (count === 1 ? $L('1 title') : $L('{count} titles').replace('{count}', count));

export const seriesItemCountLabel = (count) => (count === 1 ? $L('1 book') : $L('{count} books').replace('{count}', count));

const isAuthor = (person) => person && (person.Type === 'Author' || person.Role === 'Author');

// Who wrote it: an author credit first, then the album artist an audiobook carries, its series and
// its artists.
export const bookSubtitle = (item) => {
	if (item.Type === 'BoxSet') return item.ChildCount > 0 ? $L('{count} items').replace('{count}', item.ChildCount) : '';
	if (item.Type === 'BookSeries') return item.ChildCount > 0 ? seriesItemCountLabel(item.ChildCount) : '';
	if (item.Type === 'MusicArtist') return '';
	const author = (item.People || []).find(isAuthor);
	return author?.Name || item.AlbumArtist || item.SeriesName || item.Artists?.[0] || '';
};

const coverUrl = (serverUrl, id, tag) => getImageUrl(serverUrl, id, 'Primary', {maxHeight: 400, quality: 90, tag});

// A title's own cover, or one it borrows from its album, series or parent.
export const bookImageUrl = (serverUrl, item) => {
	if (item.ImageTags?.Primary) return coverUrl(serverUrl, item.Id, item.ImageTags.Primary);
	if (item.PrimaryImageItemId && item.PrimaryImageTag) return coverUrl(serverUrl, item.PrimaryImageItemId, item.PrimaryImageTag);
	if (item.AlbumId && item.AlbumPrimaryImageTag) return coverUrl(serverUrl, item.AlbumId, item.AlbumPrimaryImageTag);
	const parentTag = item.SeriesPrimaryImageTag || item.ParentPrimaryImageTag;
	const parentId = item.SeriesId || item.ParentPrimaryImageItemId || item.ParentId;
	return parentTag && parentId ? coverUrl(serverUrl, parentId, parentTag) : null;
};

export const seriesCoverUrls = (serverUrl, series) => (series.StackCovers || []).map((cover) => coverUrl(serverUrl, cover.Id, cover.Tag));

export const playedPercent = (item) => item?.UserData?.PlayedPercentage || 0;

const TICKS_PER_MINUTE = 600000000;

// What's left to hear, or all of it before it's started. Null without a runtime.
export const remainingTicks = (item) => {
	const runtime = item.RunTimeTicks;
	if (!runtime) return null;
	const percent = playedPercent(item);
	if (percent <= 0) return runtime;
	if (percent >= 100) return 0;
	return Math.round(runtime * (1 - percent / 100));
};

export const formatBookDuration = (ticks) => {
	const totalMinutes = Math.floor(ticks / TICKS_PER_MINUTE);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// How far along a title is: the share read for a book, the time left in an audiobook, or an
// audiobook's whole runtime before it's started.
export const bookProgressMeta = (item) => {
	const percent = playedPercent(item);
	if (isAudiobookItem(item)) {
		const remaining = remainingTicks(item);
		if (remaining == null) return null;
		const label = formatBookDuration(remaining);
		return percent > 0 ? $L('{time} left').replace('{time}', label) : label;
	}
	if (percent <= 0) return null;
	return $L('{percent}% read').replace('{percent}', Math.round(percent));
};

const compareNames = (a, b) => {
	if (a.Name < b.Name) return -1;
	return a.Name > b.Name ? 1 : 0;
};

const seriesEntry = (id, name, members, folder) => {
	const covered = members.filter((member) => member.ImageTags?.Primary);
	const entry = {
		Id: id,
		Name: name,
		Type: 'BookSeries',
		ChildCount: members.length,
		Members: members,
		StackCovers: covered.slice(0, 3).map((member) => ({Id: member.Id, Tag: member.ImageTags.Primary}))
	};
	if (folder) entry.IsFolder = true;
	if (folder?.ImageTags?.Primary) {
		entry.ImageTags = {Primary: folder.ImageTags.Primary};
	} else if (covered.length) {
		entry.PrimaryImageItemId = covered[0].Id;
		entry.PrimaryImageTag = covered[0].ImageTags.Primary;
	}
	return entry;
};

// The series in a book library. A folder holding two or more comics is one, unless it's one of
// the library's roots, the only folders whose parent isn't another of its folders. Ebooks are
// filed by author and audiobooks split into chapter files, so neither groups by folder. Books
// sharing a series name are a series too, unless every one of them already sits in a series folder.
export const bookSeriesEntries = (titles, folders) => {
	const folderIds = new Set(folders.map((folder) => folder.Id));
	const seriesFolders = new Map(folders.filter((folder) => folderIds.has(folder.ParentId)).map((folder) => [folder.Id, folder]));
	const byFolder = new Map();
	const byName = new Map();
	const add = (groups, key, title) => {
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(title);
	};
	titles.forEach((title) => {
		if (isComicItem(title) && seriesFolders.has(title.ParentId)) add(byFolder, title.ParentId, title);
		const name = String(title.SeriesName || '').trim();
		if (name) add(byName, name, title);
	});
	byFolder.forEach((members, id) => {
		if (members.length < 2) byFolder.delete(id);
	});

	const entries = [];
	byFolder.forEach((members, id) => entries.push(seriesEntry(id, seriesFolders.get(id).Name, members, seriesFolders.get(id))));
	byName.forEach((members, name) => {
		if (members.length >= 2 && !members.every((member) => byFolder.has(member.ParentId))) {
			entries.push(seriesEntry(`bookSeries:${name}`, name, members, null));
		}
	});
	return entries.sort(compareNames);
};

// Authors an ebook only names as people, leaving out the ones `known` already holds.
export const peopleAuthors = (titles, known) => {
	const seen = new Set(known);
	const authors = [];
	titles.forEach((title) => (title.People || []).forEach((person) => {
		const name = isAuthor(person) ? person.Name : null;
		if (!name || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		const id = person.Id || name;
		authors.push({Id: id, Name: name, Type: 'Person', ...(person.PrimaryImageTag ? {ImageTags: {Primary: person.PrimaryImageTag}} : {})});
	}));
	return authors.sort((a, b) => {
		const left = a.Name.toLowerCase();
		const right = b.Name.toLowerCase();
		if (left < right) return -1;
		return left > right ? 1 : 0;
	});
};

// How many titles each author name is on, keyed in lower case.
export const authorTitleCounts = (titles) => {
	const counts = new Map();
	titles.forEach((title) => {
		const names = new Set([
			...(title.People || []).filter(isAuthor).map((person) => person.Name),
			title.AlbumArtist,
			...(title.Artists || [])
		].filter((name) => typeof name === 'string').map((name) => name.toLowerCase()));
		names.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
	});
	return counts;
};

// 2^64 mod 360, which a hash that wrapped below zero is short by.
const WRAP_MOD_360 = 16;

// A genre tile's hue, from the name's code units folded into a 64 bit integer that wraps, so a genre
// gets the same color in every Moonfin app. A JavaScript number can't wrap like that, so the hash
// is kept as four 16 bit parts.
export const genreHue = (name) => {
	const parts = [0, 0, 0, 0];
	for (let i = 0; i < name.length; i++) {
		let carry = name.charCodeAt(i);
		for (let j = 0; j < 4; j++) {
			const value = parts[j] * 31 + carry;
			parts[j] = value % 0x10000;
			carry = Math.floor(value / 0x10000);
		}
	}
	let hue = 0;
	for (let j = 3; j >= 0; j--) hue = (hue * 0x10000 + parts[j]) % 360;
	return parts[3] >= 0x8000 ? (hue - WRAP_MOD_360 + 360) % 360 : hue;
};
