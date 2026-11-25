// Everything the book library styles share, read at once. A failed read leaves its part empty.
import {authorTitleCounts, bookCounts, bookSeriesEntries, bookSeriesNamed, combinedTypes, peopleAuthors} from '../../../utils/bookLibrary.js';

const ROW_LIMIT = 15;

// What every book card reads.
export const BOOK_FIELDS = 'DateCreated,Type,UserData,RunTimeTicks,ProductionYear,SeriesName,ParentId,Path,People,AlbumArtist,Artists,ChildCount,ImageTags,SeriesId,SeriesPrimaryImageTag,PrimaryImageAspectRatio';

export const UNTYPED_EXCLUDE = 'Folder,CollectionFolder,UserView';

// A server that answers a typed query with nothing is asked again without the types, and only the
// wanted ones are kept.
export const loadBookItems = async (api, params) => {
	const result = await api.getItems(params);
	if ((result && result.Items && result.Items.length) || !params.IncludeItemTypes) return result;
	const rest = Object.assign({}, params);
	delete rest.IncludeItemTypes;
	const types = params.IncludeItemTypes.split(',');
	const untyped = await api.getItems(Object.assign(rest, {ExcludeItemTypes: UNTYPED_EXCLUDE}));
	const items = ((untyped && untyped.Items) || []).filter((item) => types.indexOf(item.Type) >= 0);
	return Object.assign({}, untyped, {Items: items, TotalRecordCount: items.length});
};

export const loadBookRow = (api, params) => loadBookItems(api, Object.assign({
	Recursive: true,
	Limit: ROW_LIMIT,
	Fields: BOOK_FIELDS,
	ImageTypeLimit: 1
}, params)).then((result) => (result && result.Items) || [], () => []);

// The series a book belongs to, from every title in its library carrying the same series name.
export const loadBookSeries = async (api, book) => {
	const name = String(book.SeriesName || '').trim();
	if (!name) return null;
	const ancestors = await api.getAncestors(book.Id).catch(() => null);
	const library = (ancestors || []).find((ancestor) => ancestor.Type === 'CollectionFolder');
	const result = await loadBookItems(api, {
		ParentId: library && library.Id, IncludeItemTypes: combinedTypes(library), Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending',
		Fields: BOOK_FIELDS, EnableTotalRecordCount: false
	}).catch(() => null);
	return bookSeriesNamed(name, (result && result.Items) || []);
};

// Only the collections holding something this library shows are kept, each with the first few
// of those as `Covers`. Only `limit` of them are checked, so the count is a floor while more are left.
export const loadBookCollections = async (api, parentId, types, limit = ROW_LIMIT) => {
	const result = await api.getItems({ParentId: parentId, IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending', Limit: limit, Fields: 'ChildCount,PrimaryImageAspectRatio,Overview', EnableTotalRecordCount: true});
	const boxes = (result && result.Items) || [];
	const wanted = types.split(',');
	const held = await Promise.all(boxes.map((box) => api.getItems({ParentId: box.Id, IncludeItemTypes: types, Recursive: true, Limit: 8, ImageTypeLimit: 1})
		.then((inside) => ((inside && inside.Items) || []).filter((item) => wanted.indexOf(item.Type) >= 0), () => [])));
	return {
		items: boxes.map((box, i) => Object.assign({}, box, {Covers: held[i].slice(0, 5)})).filter((box) => box.Covers.length > 0),
		isFloor: ((result && result.TotalRecordCount) || 0) > boxes.length
	};
};

export const emptyBookLibrary = () => ({
	loading: true,
	resume: [],
	resumeTotal: 0,
	titles: [],
	folders: [],
	counts: {all: 0, books: 0, audiobooks: 0, comics: 0},
	series: [],
	authors: [],
	authorCount: 0,
	authorTitles: new Map(),
	genres: [],
	genreCount: 0,
	favorites: [],
	favoriteCount: 0,
	collections: [],
	collectionsIsFloor: false
});

const itemsOf = (result) => (result && result.Items) || [];

export const loadBookLibrary = (api, library, bookFoldersAsSeries) => {
	const parentId = library.Id;
	const types = combinedTypes(library);
	const quietly = (promise, fallback = null) => promise.catch(() => fallback);
	return Promise.all([
		quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Filters: 'IsResumable', SortBy: 'DatePlayed', SortOrder: 'Descending', Recursive: true, Limit: ROW_LIMIT, Fields: BOOK_FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb,Banner', ImageTypeLimit: 1, EnableTotalRecordCount: true})),
		quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Recursive: true, Limit: 5000, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'SeriesName,ParentId,Path,People,AlbumArtist,Artists', EnableTotalRecordCount: false})),
		quietly(api.getItems({ParentId: parentId, IncludeItemTypes: 'Folder', Recursive: true, Fields: 'ParentId', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableTotalRecordCount: false})),
		quietly(api.getArtists({ParentId: parentId, SortBy: 'SortName', SortOrder: 'Ascending', Limit: ROW_LIMIT, Fields: 'PrimaryImageAspectRatio,SortName', EnableTotalRecordCount: true})),
		quietly(api.getMusicGenres({ParentId: parentId, IncludeItemTypes: types, Fields: 'ItemCounts,PrimaryImageAspectRatio', EnableTotalRecordCount: true})),
		quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Filters: 'IsFavorite', SortBy: 'SortName', SortOrder: 'Ascending', Recursive: true, Limit: ROW_LIMIT, Fields: BOOK_FIELDS, EnableTotalRecordCount: true})),
		quietly(loadBookCollections(api, parentId, types), {items: [], isFloor: false})
	]).then(([resume, titleResult, folderResult, artistResult, genreResult, favoriteResult, collections]) => {
		const titles = itemsOf(titleResult);
		const artists = itemsOf(artistResult);
		const extraAuthors = peopleAuthors(titles, artists.map((artist) => String(artist.Name || '').toLowerCase()));
		const favorites = itemsOf(favoriteResult);
		return {
			loading: false,
			resume: itemsOf(resume),
			resumeTotal: (resume && resume.TotalRecordCount) || itemsOf(resume).length,
			titles,
			folders: itemsOf(folderResult),
			counts: bookCounts(titles),
			series: bookSeriesEntries(titles, itemsOf(folderResult), bookFoldersAsSeries),
			authors: artists.concat(extraAuthors),
			authorCount: ((artistResult && artistResult.TotalRecordCount) || artists.length) + extraAuthors.length,
			authorTitles: authorTitleCounts(titles),
			genres: itemsOf(genreResult),
			genreCount: (genreResult && genreResult.TotalRecordCount) || itemsOf(genreResult).length,
			favorites,
			favoriteCount: (favoriteResult && favoriteResult.TotalRecordCount) || favorites.length,
			collections: collections.items,
			collectionsIsFloor: collections.isFloor
		};
	});
};
