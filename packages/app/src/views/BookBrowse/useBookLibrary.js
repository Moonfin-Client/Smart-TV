import {useEffect, useState} from 'react';

import {authorTitleCounts, bookCounts, bookSeriesEntries, combinedTypes, peopleAuthors} from '../../utils/bookLibrary';

const ROW_LIMIT = 15;

// What every book card reads.
export const BOOK_FIELDS = 'DateCreated,Type,UserData,RunTimeTicks,ProductionYear,SeriesName,ParentId,Path,People,AlbumArtist,Artists,ChildCount,ImageTags,SeriesId,SeriesPrimaryImageTag,PrimaryImageAspectRatio';

export const UNTYPED_EXCLUDE = 'Folder,CollectionFolder,UserView';

// A server that answers a typed query with nothing is asked again without the types, and only the
// wanted ones are kept.
const loadBookItems = async (api, params) => {
	const result = await api.getItems(params);
	if (result?.Items?.length || !params.IncludeItemTypes) return result;
	const {IncludeItemTypes, ...rest} = params;
	const types = IncludeItemTypes.split(',');
	const untyped = await api.getItems({...rest, ExcludeItemTypes: UNTYPED_EXCLUDE});
	const items = (untyped?.Items || []).filter((item) => types.includes(item.Type));
	return {...untyped, Items: items, TotalRecordCount: items.length};
};

export const loadBookRow = (api, params) => loadBookItems(api, {
	Recursive: true,
	Limit: ROW_LIMIT,
	Fields: BOOK_FIELDS,
	ImageTypeLimit: 1,
	...params
}).then((result) => result?.Items || [], () => []);

// Only the collections holding something this library shows are kept, each with the first few
// of those as `Covers`. Only `limit` of them are checked, so the count is a floor while more are left.
export const loadBookCollections = async (api, parentId, types, limit = ROW_LIMIT) => {
	const result = await api.getItems({ParentId: parentId, IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending', Limit: limit, Fields: 'ChildCount,PrimaryImageAspectRatio,Overview', EnableTotalRecordCount: true});
	const boxes = result?.Items || [];
	const wanted = types.split(',');
	const held = await Promise.all(boxes.map((box) => api.getItems({ParentId: box.Id, IncludeItemTypes: types, Recursive: true, Limit: 8, ImageTypeLimit: 1})
		.then((inside) => (inside?.Items || []).filter((item) => wanted.includes(item.Type)), () => [])));
	return {
		items: boxes.map((box, i) => ({...box, Covers: held[i].slice(0, 5)})).filter((box) => box.Covers.length > 0),
		isFloor: (result?.TotalRecordCount || 0) > boxes.length
	};
};

const EMPTY = {
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
};

const itemsOf = (result) => result?.Items || [];

// Everything the book library styles share, read at once: what's being read, every title for the
// counts and series, the folders the series group by, and the authors, genres, favorites and
// collections. A failed read leaves its part empty.
const useBookLibrary = ({api, library}) => {
	const [state, setState] = useState(EMPTY);

	useEffect(() => {
		if (!api || !library?.Id) return undefined;
		let cancelled = false;
		const parentId = library.Id;
		const types = combinedTypes(library);
		const quietly = (promise, fallback = null) => promise.catch(() => fallback);
		setState(EMPTY);

		Promise.all([
			quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Filters: 'IsResumable', SortBy: 'DatePlayed', SortOrder: 'Descending', Recursive: true, Limit: ROW_LIMIT, Fields: BOOK_FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb,Banner', ImageTypeLimit: 1, EnableTotalRecordCount: true})),
			quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Recursive: true, Limit: 5000, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'SeriesName,ParentId,Path,People,AlbumArtist,Artists', EnableTotalRecordCount: false})),
			quietly(api.getItems({ParentId: parentId, IncludeItemTypes: 'Folder', Recursive: true, Fields: 'ParentId', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableTotalRecordCount: false})),
			quietly(api.getArtists({ParentId: parentId, SortBy: 'SortName', SortOrder: 'Ascending', Limit: ROW_LIMIT, Fields: 'PrimaryImageAspectRatio,SortName', EnableTotalRecordCount: true})),
			quietly(api.getMusicGenres({ParentId: parentId, IncludeItemTypes: types, Fields: 'ItemCounts,PrimaryImageAspectRatio', EnableTotalRecordCount: true})),
			quietly(loadBookItems(api, {ParentId: parentId, IncludeItemTypes: types, Filters: 'IsFavorite', SortBy: 'SortName', SortOrder: 'Ascending', Recursive: true, Limit: ROW_LIMIT, Fields: BOOK_FIELDS, EnableTotalRecordCount: true})),
			quietly(loadBookCollections(api, parentId, types), {items: [], isFloor: false})
		]).then(([resume, titleResult, folderResult, artistResult, genreResult, favoriteResult, collections]) => {
			if (cancelled) return;
			const titles = itemsOf(titleResult);
			const artists = itemsOf(artistResult);
			const extraAuthors = peopleAuthors(titles, artists.map((artist) => String(artist.Name || '').toLowerCase()));
			const favorites = itemsOf(favoriteResult);
			setState({
				loading: false,
				resume: itemsOf(resume),
				resumeTotal: resume?.TotalRecordCount || itemsOf(resume).length,
				titles,
				folders: itemsOf(folderResult),
				counts: bookCounts(titles),
				series: bookSeriesEntries(titles, itemsOf(folderResult)),
				authors: [...artists, ...extraAuthors],
				authorCount: (artistResult?.TotalRecordCount || artists.length) + extraAuthors.length,
				authorTitles: authorTitleCounts(titles),
				genres: itemsOf(genreResult),
				genreCount: genreResult?.TotalRecordCount || itemsOf(genreResult).length,
				favorites,
				favoriteCount: favoriteResult?.TotalRecordCount || favorites.length,
				collections: collections.items,
				collectionsIsFloor: collections.isFloor
			});
		});
		return () => { cancelled = true; };
	}, [api, library]);

	return state;
};

export default useBookLibrary;
