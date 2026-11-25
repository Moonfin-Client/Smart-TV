// Collapses copies of the same title from more than one server or library. Items only merge when an
// external provider id proves they're the same media, otherwise every copy keeps its own key.

const PROVIDER_PRIORITY = ['imdb', 'tmdb', 'tvdb'];

const getDeduplicationKey = (item) => {
	const providerIds = item?.ProviderIds;
	if (providerIds) {
		const keys = Object.keys(providerIds);
		for (let p = 0; p < PROVIDER_PRIORITY.length; p++) {
			const provider = PROVIDER_PRIORITY[p];
			for (let k = 0; k < keys.length; k++) {
				if (keys[k].trim().toLowerCase() !== provider) continue;
				const value = String(providerIds[keys[k]] ?? '').trim().toLowerCase();
				if (value) return `${provider}:${value}`;
			}
		}
	}
	return `item:${item?._serverId || ''}:${item?.Id || ''}`;
};

// Prefers the copy with watch progress, then a played one, then a favorited one, then a stable
// server and id order so the winner doesn't depend on which server answered first.
const isBetterRepresentative = (candidate, current) => {
	const candidateTicks = candidate?.UserData?.PlaybackPositionTicks || 0;
	const currentTicks = current?.UserData?.PlaybackPositionTicks || 0;
	if (candidateTicks !== currentTicks) return candidateTicks > currentTicks;
	const candidatePlayed = !!candidate?.UserData?.Played;
	if (candidatePlayed !== !!current?.UserData?.Played) return candidatePlayed;
	const candidateFavorite = !!candidate?.UserData?.IsFavorite;
	if (candidateFavorite !== !!current?.UserData?.IsFavorite) return candidateFavorite;
	const candidateRef = `${candidate?._serverId || ''}:${candidate?.Id || ''}`;
	const currentRef = `${current?._serverId || ''}:${current?.Id || ''}`;
	return candidateRef < currentRef;
};

// Keeps first appearance order and swaps in the better representative when a duplicate shows up,
// since Map.set doesn't move an existing key.
export const deduplicateMediaItems = (items) => {
	if (!Array.isArray(items) || items.length < 2) return items || [];
	const byKey = new Map();
	items.forEach((item) => {
		if (!item) return;
		const key = getDeduplicationKey(item);
		const current = byKey.get(key);
		if (!current || isBetterRepresentative(item, current)) {
			byKey.set(key, item);
		}
	});
	if (byKey.size === items.length) return items;
	const deduplicated = [];
	byKey.forEach((item) => deduplicated.push(item));
	return deduplicated;
};
