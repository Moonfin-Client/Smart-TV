// The Genres row can rank genres by how many titles they hold. No server sorts genres by count,
// so the ranking is done here.

// Titles of the types the row shows, or the plain total when the server sends only that.
export const titleCount = (genre, includeTypes = 'Movie,Series') => {
	if (genre.MovieCount == null && genre.SeriesCount == null) return genre.ChildCount || 0;
	const types = includeTypes.split(',');
	return (types.includes('Movie') ? genre.MovieCount || 0 : 0) + (types.includes('Series') ? genre.SeriesCount || 0 : 0);
};

const byName = (a, b) => (a.Name || '').toLowerCase().localeCompare((b.Name || '').toLowerCase());

// Orders genres by name, at random, or by how many titles of `includeTypes` each holds.
export const sortGenres = (genres, sortBy, sortOrder, includeTypes) => {
	const sorted = [...genres];
	if (sortBy === 'Random') {
		for (let i = sorted.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[sorted[i], sorted[j]] = [sorted[j], sorted[i]];
		}
		return sorted;
	}
	const direction = sortOrder === 'Descending' ? -1 : 1;
	if (sortBy !== 'ItemCount') return sorted.sort((a, b) => direction * byName(a, b));
	return sorted.sort((a, b) => direction * (titleCount(a, includeTypes) - titleCount(b, includeTypes)) || byName(a, b));
};
