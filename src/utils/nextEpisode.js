// Seasons and episodes come back in whatever order the server chose, which puts
// Specials first on some setups, so anything that means "the one after this" goes
// by IndexNumber rather than position in the list.

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const indexOf = (entry) => toNumber(entry?.IndexNumber);

// Missing and unaired episodes are listed alongside real ones but have no file
// behind them, so they can never be the thing that plays next.
export const isPlayableEpisode = (episode) => Boolean(episode) && episode.LocationType !== 'Virtual';

// A step of -1 walks back for the previous one instead.
export const findNextInSeason = (episodes, currentId, step = 1) => {
	const list = episodes || [];
	// Ids are coerced because Emby returns them as numbers where Jellyfin uses strings.
	const current = list.findIndex((ep) => String(ep?.Id) === String(currentId));
	if (current < 0) return null;
	const rest = step > 0 ? list.slice(current + 1) : list.slice(0, current).reverse();
	return rest.find(isPlayableEpisode) || null;
};

export const findNextSeason = (seasons, currentSeasonId, currentSeasonNumber, step = 1) => {
	const list = seasons || [];
	const currentEntry = list.find((s) => String(s.Id) === String(currentSeasonId));
	const current = toNumber(currentSeasonNumber) ?? indexOf(currentEntry);

	if (current == null) {
		// No numbering to compare, so the order the server gave is all there is.
		const position = list.findIndex((s) => String(s.Id) === String(currentSeasonId));
		const target = position + step;
		return position >= 0 && target >= 0 && target < list.length ? list[target] : null;
	}

	// Going back stops short of the Specials, which aren't the season before the first one.
	return list.reduce((best, season) => {
		const number = indexOf(season);
		if (number == null || (step > 0 ? number <= current : number >= current || number === 0)) return best;
		return best == null || (step > 0 ? number < indexOf(best) : number > indexOf(best)) ? season : best;
	}, null);
};

export const firstPlayableEpisode = (episodes, step = 1) => {
	const list = episodes || [];
	return (step > 0 ? list : [...list].reverse()).find(isPlayableEpisode) || null;
};
