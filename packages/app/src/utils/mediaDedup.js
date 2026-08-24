// Collapses copies of the same title that arrive from more than one server or
// library. Items only merge when an external provider id proves they are the
// same media, or when episode details (series name, season, episode) match,
// otherwise every copy keeps its own key and nothing is dropped.

const PROVIDER_PRIORITY = ['imdb', 'tmdb', 'tvdb'];

const providerKey = (item) => {
	const providerIds = item?.ProviderIds;
	if (!providerIds) return null;
	const keys = Object.keys(providerIds);
	for (let p = 0; p < PROVIDER_PRIORITY.length; p++) {
		const provider = PROVIDER_PRIORITY[p];
		for (let k = 0; k < keys.length; k++) {
			if (keys[k].trim().toLowerCase() !== provider) continue;
			const value = String(providerIds[keys[k]] ?? '').trim().toLowerCase();
			if (value) return `${provider}:${value}`;
		}
	}
	return null;
};

const episodeKey = (item) => {
	if (item?.Type !== 'Episode' && item?.Type !== 'Season') return null;
	const series = (item?.SeriesName || '').trim().toLowerCase();
	if (!series) return null;
	if (item.Type === 'Season') {
		const seasonNum = item.IndexNumber != null ? item.IndexNumber : 1;
		return `season:${series}:s${seasonNum}`;
	}
	if (item.IndexNumber == null) return null;
	const season = item.ParentIndexNumber != null ? item.ParentIndexNumber : 1;
	return `episode:${series}:s${season}:e${item.IndexNumber}`;
};

const nameKey = (item) => {
	if (!item?.Name || !item?.Type) return null;
	const type = item.Type.toLowerCase();
	const name = item.Name.trim().toLowerCase();
	if (type === 'episode' || type === 'season') {
		return episodeKey(item);
	}
	const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null);
	return year ? `${type}:${name}:${year}` : `${type}:${name}`;
};

export const getDeduplicationKey = (item) => {
	if (item?.Type === 'Episode') {
		return episodeKey(item) || providerKey(item) || nameKey(item) || `item:${item?._serverId || ''}:${item?.Id || ''}`;
	}
	return providerKey(item) || nameKey(item) || `item:${item?._serverId || ''}:${item?.Id || ''}`;
};

// Whether an item carries an id or metadata that could prove another copy is the same title.
// Without one it keys on its own id and never merges with anything.
export const hasProviderIdentity = (item) =>
	providerKey(item) !== null || episodeKey(item) !== null || (Boolean(item?.Name) && Boolean(item?.Type));

// Prefers the copy with watch progress, then a played one, then a favorited
// one, and finally falls back to a stable server and id order so the winner
// doesnt depend on which server answered first.
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

// Keeps first appearance order and swaps in the better representative when a
// duplicate shows up, since Map.set doesnt move an existing key.
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
