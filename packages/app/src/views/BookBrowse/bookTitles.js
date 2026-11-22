import $L from '@enact/i18n/$L';

import {SCOPE_ALL, combinedTypes, matchesScope, scopedTypes} from '../../utils/bookLibrary';
import {BOOK_FIELDS, UNTYPED_EXCLUDE} from './useBookLibrary';

// The sorts the Titles screen offers, in the order its pills show them.
export const TITLE_SORTS = [
	{id: 'dateAdded', label: () => $L('Date Added'), sortBy: 'DateCreated,SortName', descending: true},
	{id: 'name', label: () => $L('Name'), sortBy: 'SortName', descending: false},
	{id: 'premiereDate', label: () => $L('Release Date'), sortBy: 'PremiereDate,SortName', descending: true},
	{id: 'datePlayed', label: () => $L('Last Played'), sortBy: 'DatePlayed,SortName', descending: true}
];

export const sortById = (id) => TITLE_SORTS.find((sort) => sort.id === id) || TITLE_SORTS[0];

// Pages of a library's titles for `usePagedItems`: a format's, or every favorite, in a sort and
// narrowed to a genre. Comics are typed Book, so they're split out here, and `total` stays the
// server's so paging goes by its offsets. A server that answers nothing when the query names book
// types gets every later page untyped too.
export const titlesFetcher = ({api, library, scope = SCOPE_ALL, sort = TITLE_SORTS[0], genreId, favorites}) => {
	const types = favorites ? combinedTypes(library) : scopedTypes(library, scope);
	const wanted = types.split(',');
	let untyped = false;
	return async (start, limit) => {
		const request = () => api.getItems({
			ParentId: library.Id,
			...(untyped ? {ExcludeItemTypes: UNTYPED_EXCLUDE} : {IncludeItemTypes: types}),
			Recursive: true,
			...(favorites ? {Filters: 'IsFavorite'} : {}),
			...(genreId ? {GenreIds: genreId} : {}),
			SortBy: sort.sortBy,
			SortOrder: sort.descending ? 'Descending' : 'Ascending',
			StartIndex: start,
			Limit: limit,
			Fields: BOOK_FIELDS,
			EnableImageTypes: 'Primary',
			ImageTypeLimit: 1
		});
		let result = await request();
		if (start === 0 && !untyped && !result?.Items?.length) {
			untyped = true;
			result = await request();
		}
		const raw = result?.Items || [];
		const items = raw.filter((item) => item.Id && (!untyped || wanted.includes(item.Type)) && (favorites || matchesScope(item, scope)));
		return {items, total: result?.TotalRecordCount ?? start + raw.length};
	};
};
