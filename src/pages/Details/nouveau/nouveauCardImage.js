import {spotlightItemImageUrl, spotlightLandscapeImageUrl} from '../spotlight/spotlightImages';

// The artwork a Nouveau rail card shows. An episode keeps its own still under Primary, so that's
// asked for first. Falling straight to the wider search ends at the parent backdrop, which every
// episode of a season shares, and the whole rail comes out looking the same.
export const nouveauCardImageUrl = (serverUrl, item, {fallbackUrl = null} = {}) =>
	spotlightItemImageUrl(serverUrl, item) || spotlightLandscapeImageUrl(serverUrl, item, {fallbackUrl});
