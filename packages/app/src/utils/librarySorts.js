// The sorts a library grid offers for each kind of library. A sort is only worth showing when the
// items carry the field it reads, so album and track order belong to music, episode dates to
// series and folders to the libraries that show them.

import $L from '@enact/i18n/$L';

// Every sort ends on SortName so items the server ranks equally keep a stable order between
// pages. My Rating is served by the Moonfin plugin, so its field only matters as a fallback, and
// Folders First is read off by name while the folders come in on a request of their own.
const SORTS = {
	MyRating: {field: 'SortName', label: () => $L('My Rating')},
	SortName: {field: 'SortName', label: () => $L('Name')},
	DateCreated: {field: 'DateCreated,SortName', label: () => $L('Date Added')},
	DateLastContentAdded: {field: 'DateLastContentAdded,SortName', label: () => $L('Date Episode Added')},
	PremiereDate: {field: 'PremiereDate,SortName', label: () => $L('Release Date')},
	OfficialRating: {field: 'OfficialRating,SortName', label: () => $L('Parental Rating')},
	DatePlayed: {field: 'DatePlayed,SortName', label: () => $L('Last Played')},
	PlayCount: {field: 'PlayCount,SortName', label: () => $L('Play Count')},
	CriticRating: {field: 'CriticRating,SortName', label: () => $L('Critic Rating')},
	CommunityRating: {field: 'CommunityRating,SortName', label: () => $L('Community Rating')},
	AlbumArtist: {field: 'AlbumArtist,Album,SortName', label: () => $L('Album Artist')},
	Album: {field: 'Album,SortName', label: () => $L('Album')},
	Artist: {field: 'Artist,Album,SortName', label: () => $L('Artist')},
	IndexNumber: {field: 'IndexNumber,SortName', label: () => $L('Track Number')},
	Genre: {field: 'Genre,SortName', label: () => $L('Genre')},
	Runtime: {field: 'Runtime,SortName', label: () => $L('Runtime')},
	Random: {field: 'Random', label: () => $L('Random')},
	FoldersFirst: {field: 'SortName', label: () => $L('Folders First')}
};

export const sortField = (key) => (SORTS[key] || SORTS.SortName).field;

export const sortLabel = (key, music) => {
	if (key === 'Runtime' && music) return $L('Length');
	return (SORTS[key] || SORTS.SortName).label();
};

export const librarySortKeys = ({songs, music, series, books, folders, movieOrSeries, myRating}) => {
	if (folders) {
		return ['SortName', 'DateCreated', 'PremiereDate', 'OfficialRating', 'DatePlayed', 'PlayCount', 'CriticRating', 'CommunityRating', 'Runtime', 'Random', 'FoldersFirst'];
	}
	if (songs) {
		return ['SortName', 'DateCreated', 'AlbumArtist', 'Album', 'Artist', 'IndexNumber', 'PremiereDate', 'DatePlayed', 'PlayCount', 'Runtime', 'Random'];
	}
	return [
		myRating && 'MyRating',
		'SortName',
		'DateCreated',
		series && 'DateLastContentAdded',
		'PremiereDate',
		// Group By covers parental rating better than a sort does, so the libraries offering it
		// drop the duplicate.
		!movieOrSeries && !music && 'OfficialRating',
		'DatePlayed',
		!music && 'PlayCount',
		books && 'IndexNumber',
		!music && 'CriticRating',
		!music && 'CommunityRating',
		music && 'AlbumArtist',
		music && 'Album',
		music && 'Genre',
		'Runtime',
		'Random'
	].filter(Boolean);
};

// A sort picked before every sort shared one direction was saved without one, and these ran
// newest or highest first then.
const DESCENDING_BY_DEFAULT = ['DateCreated', 'DateLastContentAdded', 'PremiereDate', 'CommunityRating', 'CriticRating', 'DatePlayed', 'PlayCount'];

export const savedSortOrder = (sortOrder, sortKey) => sortOrder || (DESCENDING_BY_DEFAULT.includes(sortKey) ? 'Descending' : 'Ascending');

// Only the name sorts line up with the letters, and songs are one long list a jump has nowhere
// sensible to land in.
const NAME_SORTS = ['SortName', 'FoldersFirst', 'AlbumArtist', 'Album'];

export const alphabetApplies = ({sortKey, music, songs}) => !songs && (music || NAME_SORTS.includes(sortKey));

// The plugin hands back every rating the viewer gave as an id and a score, so the order is worked
// out here. Ties settle on the id so the order survives a reload.
export const orderByMyRating = (entries, ascending) => (entries || [])
	.filter((entry) => entry && entry.ItemId && typeof entry.Rating === 'number')
	.sort((a, b) => {
		const byRating = ascending ? a.Rating - b.Rating : b.Rating - a.Rating;
		if (byRating !== 0) return byRating;
		return a.ItemId < b.ItemId ? -1 : a.ItemId > b.ItemId ? 1 : 0;
	})
	.map((entry) => String(entry.ItemId));
