// Servers do not agree on how to spell the collection type, so it is lowercased
// before it is compared.
export const isLiveTvLibrary = (library) =>
	String(library?.CollectionType || '').toLowerCase() === 'livetv';

// The guide has a button of its own, so the library list drops Live TV rather
// than offering a second way to the same screen.
export const librariesForNav = (libraries, hasLiveTvButton) => {
	const list = libraries || [];
	return hasLiveTvButton ? list.filter((library) => !isLiveTvLibrary(library)) : list;
};
