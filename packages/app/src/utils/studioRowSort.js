// Jellyfin's /Studios takes no SortBy or SortOrder and always lists by name, so the Studios row
// picks its order from name pages: the first page for A to Z, the last for Z to A, and a page
// from a random point for Random. Any other sort would need every studio, so it reads as Name,
// the way the setting shows it.

export const STUDIO_PAGE_SIZE = 200;

export const studioRowSortBy = (stored) => (stored === 'Random' ? 'Random' : 'SortName');

const shuffled = (items) => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

// fetchPage(startIndex, limit) reads one page of studios in name order.
export const readStudioRow = async (fetchPage, {limit, sortBy, sortOrder}) => {
	const random = sortBy === 'Random';
	const descending = !random && sortOrder === 'Descending';
	const first = await fetchPage(0, random ? STUDIO_PAGE_SIZE : limit);
	if (!random && !descending) return first;
	const total = first?.TotalRecordCount || 0;
	if (descending) {
		const last = total > limit ? await fetchPage(total - limit, limit) : first;
		return {...last, Items: [...(last?.Items || [])].reverse()};
	}
	const lastStart = total - STUDIO_PAGE_SIZE;
	const page = lastStart > 0 ? await fetchPage(Math.floor(Math.random() * (lastStart + 1)), STUDIO_PAGE_SIZE) : first;
	return {...page, Items: shuffled(page?.Items || []).slice(0, limit)};
};
