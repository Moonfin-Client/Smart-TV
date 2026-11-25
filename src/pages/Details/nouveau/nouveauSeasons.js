import $L from '../../../services/i18n.js';

// A series arrives as one flat run of episodes, and the screen shows one season of it at a time, so
// the run is split here and the selector picks which part is on screen.

export const seasonLabel = (number) => (
	number === 0 ? $L('Specials') : $L('Season {number}').replace('{number}', number)
);

// Season zero is where a server puts specials, so an episode with no season of its own lands there
// rather than being invented into season one.
const seasonOf = (episode) => (episode?.ParentIndexNumber != null ? episode.ParentIndexNumber : 0);

export const groupEpisodesBySeason = (episodes = []) => {
	const groups = new Map();

	[...episodes]
		.sort((a, b) => (seasonOf(a) - seasonOf(b)) || ((a.IndexNumber || 0) - (b.IndexNumber || 0)))
		.forEach((episode) => {
			const season = seasonOf(episode);
			if (!groups.has(season)) groups.set(season, []);
			groups.get(season).push(episode);
		});

	return groups;
};

// A season the server has a name for keeps it, since a show can call its seasons anything it likes
// and "Book One" says more than "Season 1". The numbered label stands in where there's no name.
export const seasonOptions = (groups, seasons = []) => {
	const named = new Map(seasons
		.filter((season) => season?.IndexNumber != null && String(season.Name || '').trim())
		.map((season) => [season.IndexNumber, season.Name.trim()]));

	return [...groups.keys()].map((number) => ({
		id: String(number),
		number,
		label: named.get(number) || seasonLabel(number)
	}));
};

// Whichever season the viewer picked, else the one holding the episode they're up to, so a
// part-watched show opens where they left off. A picked season can also stop existing, which
// happens when the episodes arrive after the first paint or the title is swapped underneath.
export const effectiveSeason = (numbers = [], selected, nextUpSeason) => {
	if (numbers.includes(selected)) return selected;
	if (numbers.includes(nextUpSeason)) return nextUpSeason;
	return numbers[0];
};
