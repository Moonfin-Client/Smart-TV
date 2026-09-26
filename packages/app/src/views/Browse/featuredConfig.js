// The settings that decide what the media bar holds. A setting missing here won't redraw the bar
// when it changes.
export const featuredConfigKey = (settings = {}) => JSON.stringify([
	settings.useMoonfinPlugin === true,
	settings.mediaBarSourceType || 'library',
	settings.featuredContentType ?? null,
	settings.featuredItemCount ?? null,
	settings.mediaBarLibraryIds || [],
	settings.mediaBarCollectionIds || [],
	settings.excludedGenres || []
]);
