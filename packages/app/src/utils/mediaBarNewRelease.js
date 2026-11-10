import mapBounded from './mapBounded';
import {parseServerDate} from './serverDate';

export const NEW_SERIES = 'newSeries';
export const NEW_SEASON = 'newSeason';
export const NEW_EPISODES = 'newEpisodes';

// The sources that read a library newest first rather than at random.
export const DATED_SOURCES = ['recentlyAdded', 'recentlyReleased', 'newReleases'];
export const MEDIA_BAR_SOURCES = ['random', ...DATED_SOURCES];
// The library and collection sources saved before, which draw like random now.
export const LEGACY_MEDIA_BAR_SOURCES = ['library', 'collection'];
export const NEW_RELEASE_DAYS = [7, 14, 30, 60, 90];

// The fewest episodes a season released at once has. A two episode premiere is still a season
// aired week by week.
const SEASON_DROP_EPISODES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 6;

// An episode that's really on the server and aired within the last `days`. A Virtual episode is
// one the server only knows from metadata.
export const isRecentlyAiredEpisode = (episode, now, days) => {
	if (episode?.LocationType === 'Virtual') return false;
	const aired = parseServerDate(episode?.PremiereDate);
	if (!aired) return false;
	return aired.getTime() <= now.getTime() && aired.getTime() >= now.getTime() - days * DAY_MS;
};

const seasonOf = (episode) => (Number.isFinite(episode?.ParentIndexNumber) ? episode.ParentIndexNumber : 0);

// The air day in UTC, so a drop reads the same in every time zone.
const airDay = (episode) => parseServerDate(episode?.PremiereDate)?.toISOString().slice(0, 10) ?? null;

const latestSeasonOf = (episodes) => Math.max(...episodes.map(seasonOf));

// The latest season's id when several of its recent episodes share an air day, which is the only
// case worth fetching the whole season for. `recent` holds only episodes that aired in the window.
export const seasonToCheck = (recent) => {
	if (recent.length === 0) return null;
	const season = latestSeasonOf(recent);
	const inSeason = recent.filter((episode) => seasonOf(episode) === season);
	const perDay = {};
	inSeason.forEach((episode) => {
		const day = airDay(episode);
		perDay[day] = (perDay[day] || 0) + 1;
	});
	if (!Object.values(perDay).some((count) => count >= SEASON_DROP_EPISODES)) return null;
	return inSeason[0].SeasonId || null;
};

// `latestSeason` holds every episode of the latest season when seasonToCheck asked for it. A season
// whose episodes on the server all came out on one day was released at once. Anything else is new
// episodes, a split season's second part too.
export const newReleaseOf = (recent, latestSeason) => {
	if (recent.length === 0) return null;

	if (latestSeason) {
		const present = latestSeason.filter((episode) => episode.LocationType !== 'Virtual');
		const airDays = new Set(present.map(airDay));
		if (present.length >= SEASON_DROP_EPISODES && airDays.size === 1 && !airDays.has(null)) {
			const dropped = seasonOf(present[0]);
			return {kind: dropped <= 1 ? NEW_SERIES : NEW_SEASON, season: dropped};
		}
	}

	const season = latestSeasonOf(recent);
	const latest = recent
		.filter((episode) => seasonOf(episode) === season)
		.sort((a, b) => parseServerDate(a.PremiereDate) - parseServerDate(b.PremiereDate))
		.pop();
	return {
		kind: NEW_EPISODES,
		season,
		episode: Number.isFinite(latest.IndexNumber) ? latest.IndexNumber : null
	};
};

// The server may ignore the date floor or list episodes it only knows from metadata, so every one
// is checked again.
export const recentEpisodes = async (api, parentId, days, limit) => {
	const now = new Date();
	const result = await api.getItems({
		ParentId: parentId,
		IncludeItemTypes: 'Episode',
		Recursive: true,
		SortBy: 'PremiereDate',
		SortOrder: 'Descending',
		MinPremiereDate: new Date(now.getTime() - days * DAY_MS).toISOString(),
		Limit: limit,
		EnableTotalRecordCount: false
	});
	return (result?.Items || []).filter((episode) => isRecentlyAiredEpisode(episode, now, days));
};

export const loadNewReleases = async (items, days, apiFor) => {
	const releases = {};
	const series = items.filter((item) => item?.Type === 'Series' && !item._external);
	await mapBounded(series, CONCURRENCY, async (item) => {
		try {
			const api = apiFor(item);
			const recent = await recentEpisodes(api, item.Id, days, 100);
			const seasonId = seasonToCheck(recent);
			const season = seasonId
				? (await api.getItems({ParentId: seasonId, IncludeItemTypes: 'Episode', Recursive: true, Limit: 200, EnableTotalRecordCount: false}))?.Items
				: null;
			const release = newReleaseOf(recent, season);
			if (release) releases[item.Id] = release;
		} catch (e) {
			// A series that can't be asked about just goes without a label.
		}
	});
	return releases;
};
