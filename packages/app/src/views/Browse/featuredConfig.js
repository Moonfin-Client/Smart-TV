import {isKidsMode} from '../../utils/kidsMode';

// The settings that decide what the media bar holds, and whether it draws from every server. A
// setting missing here won't redraw the bar when it changes. Kids Mode leaves the outside lists out.
export const featuredConfigKey = (settings = {}, unifiedMode) => JSON.stringify([
	unifiedMode === true,
	settings.useMoonfinPlugin === true,
	settings.mediaBarSourceType || 'random',
	settings.featuredContentType ?? null,
	settings.featuredItemCount ?? null,
	settings.mediaBarNewReleaseDays ?? null,
	settings.mediaBarLibraryIds || [],
	settings.mediaBarCollectionIds || [],
	settings.excludedGenres || [],
	settings.mediaBarExternalLists || [],
	isKidsMode(settings)
]);
