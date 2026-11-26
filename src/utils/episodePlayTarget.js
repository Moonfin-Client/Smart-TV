// Which episode a Play press on a series or season should start. The pick follows
// the watch state rather than plain list order, so a run in progress carries on
// where it left off instead of restarting or jumping ahead.

// Placeholders for missing or unaired episodes come back from the server too,
// and starting one of those plays nothing.
const isPlayableEpisode = (ep) => !ep.IsVirtualItem && ep.LocationType !== 'Virtual' && !ep.IsMissing && !ep.IsPlaceholder;

const isPlayed = (ep) => Boolean(ep.UserData?.Played);
const resumeTicks = (ep) => ep.UserData?.PlaybackPositionTicks || 0;
// A rewatch keeps the watched flag and has a position again, so it counts as in progress too.
const isInProgress = (ep) => resumeTicks(ep) > 0;
const lastPlayed = (ep) => Date.parse(ep.UserData?.LastPlayedDate || '') || 0;

// Of the items left part way through, the one played last. Without dates a first watch
// goes before a rewatch, then list order.
export const latestInProgress = (items) => items.filter(isInProgress).reduce((best, ep) => {
	if (!best) return ep;
	if (lastPlayed(ep) !== lastPlayed(best)) return lastPlayed(ep) > lastPlayed(best) ? ep : best;
	return isPlayed(best) && !isPlayed(ep) ? ep : best;
}, null);

// A Next Up marked played is stale until the series asks the server again, so the run goes on from
// the first unwatched episode after it. One with a position is being rewatched and stays.
const freshNextUp = (episodes, nextUp) => {
	if (!nextUp || !isPlayed(nextUp) || isInProgress(nextUp)) return nextUp || null;
	const at = episodes.findIndex((ep) => ep.Id === nextUp.Id);
	return at < 0 ? null : episodes.slice(at + 1).find((ep) => !isPlayed(ep)) || null;
};

// A fully untouched run starts from the first episode, and so does a fully watched
// one unless an episode of it is being rewatched. Anything else continues: Next Up
// when the server offers it, else the episode part way through that was played
// last, else the first unwatched one. First unwatched alone isn't enough, since a
// skipped episode or a special counts as unwatched and can sit behind the one
// actually being watched.
export const pickEpisodePlayTarget = (episodes, nextUp = null) => {
	const list = (Array.isArray(episodes) ? episodes : []).filter(isPlayableEpisode);
	if (list.length === 0) return nextUp || null;
	const allWatched = list.every(isPlayed);
	const allUnwatched = list.every((ep) => !isPlayed(ep) && resumeTicks(ep) === 0);
	if (allWatched || allUnwatched) {
		const rewatching = allWatched && latestInProgress(list);
		return rewatching || list.find((ep) => ep.ParentIndexNumber === 1 && ep.IndexNumber === 1) || list[0];
	}
	return freshNextUp(list, nextUp) || latestInProgress(list) || list.find((ep) => !isPlayed(ep)) || list[0];
};

// Resume only when the target itself was left part way through, watched before or not,
// so a target without a position still starts clean.
export const shouldResumeTarget = (target) => Boolean(target) && isInProgress(target);
