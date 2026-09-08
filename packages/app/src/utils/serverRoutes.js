/**
 * Jellyfin 12 dropped every /Users/{userId}/... route from its OpenAPI spec.
 * They still answer, but the server marks them kept for backwards compatibility
 * and anything missing from the spec can go in any major release. Emby only
 * ever spoke the old shape, so the path a call takes depends on which server is
 * answering. Every replacement below works back to 10.9.
 */

// Each builder leaves the query string open, because the modern spelling has to
// carry the user id there. Callers append their own parameters with a leading
// '&' and trimQuerySeparator drops the separator when nothing follows.
export const makeUserRoutes = (readType, readUserId) => {
	const legacy = () => readType() === 'emby';
	const uid = () => encodeURIComponent(readUserId());
	return {
		items: () => (legacy() ? `/Users/${uid()}/Items?` : `/Items?userId=${uid()}&`),
		item: (itemId) => (legacy() ? `/Users/${uid()}/Items/${itemId}?` : `/Items/${itemId}?userId=${uid()}&`),
		latest: () => (legacy() ? `/Users/${uid()}/Items/Latest?` : `/Items/Latest?userId=${uid()}&`),
		resume: () => (legacy() ? `/Users/${uid()}/Items/Resume?` : `/UserItems/Resume?userId=${uid()}&`),
		extras: (itemId, kind) => (legacy()
			? `/Users/${uid()}/Items/${itemId}/${kind}?`
			: `/Items/${itemId}/${kind}?userId=${uid()}&`),
		favorite: (itemId) => (legacy() ? `/Users/${uid()}/FavoriteItems/${itemId}?` : `/UserFavoriteItems/${itemId}?userId=${uid()}&`),
		played: (itemId) => (legacy() ? `/Users/${uid()}/PlayedItems/${itemId}?` : `/UserPlayedItems/${itemId}?userId=${uid()}&`),
		views: () => (legacy() ? `/Users/${uid()}/Views?` : `/UserViews?userId=${uid()}&`),
		configuration: () => (legacy() ? `/Users/${uid()}/Configuration?` : `/Users/Configuration?userId=${uid()}&`)
	};
};

export const trimQuerySeparator = (endpoint) => endpoint.replace(/[?&]$/, '');

// Jellyfin 12 turns legacy authorization off by default, which 401s this
// header. It reads the standard Authorization header either way, so Emby is the
// only server that still needs the second copy.
export const legacyAuthHeader = (type, authHeader) =>
	(type === 'emby' ? {'X-Emby-Authorization': authHeader} : null);

// Jellyfin 12 serves the avatar from /UserImage and discards the sizing hints on
// both spellings of the route, so only Emby is still sent them.
export const buildUserImageUrl = (serverUrl, userId, imageTag, type) => {
	const tag = imageTag ? `&tag=${encodeURIComponent(imageTag)}` : '';
	if (type === 'emby') {
		return `${serverUrl}/Users/${userId}/Images/Primary?quality=90&maxHeight=150${tag}`;
	}
	return `${serverUrl}/UserImage?userId=${encodeURIComponent(userId)}${tag}`;
};
