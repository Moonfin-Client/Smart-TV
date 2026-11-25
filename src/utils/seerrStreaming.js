// Where a title streams, the way Seerr's own page works it out. The viewer's region wins, then
// the server's, then the US, and a blank setting counts as none.

const filled = (value) => (typeof value === 'string' ? value.trim() : '');

export const streamingRegion = (user, publicSettings) =>
	filled(user?.settings?.streamingRegion) || filled(publicSettings?.streamingRegion) || 'US';

// Only the subscription services, in the order Seerr sends them.
export const streamingProviders = (details, region) =>
	details?.watchProviders?.find((entry) => entry.iso_3166_1 === region)?.flatrate || [];
