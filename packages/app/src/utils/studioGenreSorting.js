// Studios and genres carry a name, the date they were added and how many titles they hold, so
// those are the orders their rows offer. Jellyfin's /Studios takes no sort at all and no server
// sorts by count, so those orders are worked out here.

export const STUDIO_PAGE_SIZE = 200;

const NAME_SORTS = ['sortname', 'name'];

// Titles of the types the row shows, or the plain total when the server sends only that.
export const titleCount = (item, includeTypes = 'Movie,Series') => {
	if (item.MovieCount == null && item.SeriesCount == null) return item.ChildCount || 0;
	const types = includeTypes.split(',');
	return (types.includes('Movie') ? item.MovieCount || 0 : 0) + (types.includes('Series') ? item.SeriesCount || 0 : 0);
};

const byName = (a, b) => (a.Name || '').toLowerCase().localeCompare((b.Name || '').toLowerCase());

export const sortNamedItems = (items, sortBy, sortOrder, includeTypes) => {
	const key = (sortBy || '').toLowerCase();
	const sorted = [...items];
	if (key === 'random') {
		for (let i = sorted.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[sorted[i], sorted[j]] = [sorted[j], sorted[i]];
		}
		return sorted;
	}
	const direction = sortOrder === 'Descending' ? -1 : 1;
	const sortValue = key === 'itemcount' ? (item) => titleCount(item, includeTypes)
		: key === 'datecreated' ? (item) => item.DateCreated || ''
		: null;
	if (!sortValue) return sorted.sort((a, b) => direction * byName(a, b));
	return sorted.sort((a, b) => {
		const va = sortValue(a);
		const vb = sortValue(b);
		if (va !== vb) return direction * (va < vb ? -1 : 1);
		return byName(a, b);
	});
};

// Ranking by count or date needs the whole list, and counts change slowly while Home reloads on
// every return, so the list is kept for a day per server and user.
const STUDIO_LIST_TTL = 24 * 60 * 60 * 1000;
let studioList = null;

const readAllStudios = async (fetchPage, cacheKey) => {
	if (studioList?.key === cacheKey && Date.now() - studioList.at < STUDIO_LIST_TTL) return studioList.page;
	const page = await fetchPage(0, null, 'SortName', 'Ascending');
	studioList = {key: cacheKey, at: Date.now(), page};
	return page;
};

// Name and Random read at most two pages in name order: the end of the list for Z to A and a page
// from anywhere for Random. fetchPage(startIndex, limit, sortBy, sortOrder) reads one page, or
// the whole list when limit is null.
export const readStudioRow = async (fetchPage, {limit, sortBy, sortOrder, serverSorts, cacheKey}) => {
	const key = (sortBy || '').toLowerCase();
	if (serverSorts && key !== 'itemcount') return fetchPage(0, limit, sortBy, sortOrder);
	if (key === 'datecreated' || key === 'itemcount') {
		const all = await readAllStudios(fetchPage, cacheKey);
		return {...all, Items: sortNamedItems(all?.Items || [], key, sortOrder).slice(0, limit)};
	}
	const isName = NAME_SORTS.includes(key);
	const descending = sortOrder === 'Descending';
	// A sort the row no longer offers keeps the name order it always got.
	if (!(isName && descending) && key !== 'random') {
		return fetchPage(0, limit, 'SortName', 'Ascending');
	}
	let page = await fetchPage(0, STUDIO_PAGE_SIZE, 'SortName', 'Ascending');
	const lastStart = (page?.TotalRecordCount || 0) - STUDIO_PAGE_SIZE;
	if (lastStart > 0) {
		const start = isName ? lastStart : Math.floor(Math.random() * (lastStart + 1));
		page = await fetchPage(start, STUDIO_PAGE_SIZE, 'SortName', 'Ascending');
	}
	return {...page, Items: sortNamedItems(page?.Items || [], key, sortOrder).slice(0, limit)};
};
