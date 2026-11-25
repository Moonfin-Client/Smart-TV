// Servers don't agree on how to spell the collection type, so it's lowercased first.
export const isLiveTvLibrary = (library) =>
	String(library?.CollectionType || '').toLowerCase() === 'livetv';

export const isLiveTvProgram = (item) => (item?.Type === 'Program' || item?.Type === 'LiveTvProgram') && Boolean(item.ChannelId);

// The guide has a button of its own, so the library list drops Live TV rather than offer a second
// way in. hideLiveTv drops it with no button standing in, for Kids Mode, where the guide is off
// limits and the tile would be the way in.
export const librariesForNav = (libraries, hasLiveTvButton, {hideLiveTv = false} = {}) => {
	const list = libraries || [];
	return (hasLiveTvButton || hideLiveTv) ? list.filter((library) => !isLiveTvLibrary(library)) : list;
};
