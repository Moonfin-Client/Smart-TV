jest.mock('./uiLocale', () => ({uiLocale: () => 'en-US'}));

import {
	BADGE, PROBLEM, addDays, airsText, buildEntries, calendarAllows, daysBetween, followsEpisode, inLibrary, isoDay, monthGridDays,
	nextOf, parseRadarrEntries, parseSonarrEntry, problemFrom, readyToWatchOf, recentOf, seriesProgressOf, statusAt,
	thisWeekOf, upcomingOf, worstProblem
} from './calendarEntries';

const series = (extra = {}) => ({
	title: 'The Simpsons',
	tvdbId: 71663,
	tmdbId: 456,
	imdbId: 'tt0096697',
	network: 'FOX',
	year: 1989,
	images: [
		{coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/poster.jpg'},
		{coverType: 'fanart', url: '/MediaCover/1/fanart.jpg'},
		{coverType: 'fanart', remoteUrl: 'https://image.tmdb.org/t/p/original/fanart.jpg'}
	],
	...extra
});

const episode = (extra = {}) => ({
	id: 11,
	seasonNumber: 38,
	episodeNumber: 7,
	title: 'Dream Scenari-Moe',
	airDateUtc: '2026-11-12T01:00:00Z',
	hasFile: false,
	monitored: true,
	runtime: 22,
	images: [{coverType: 'screenshot', remoteUrl: 'https://image.tmdb.org/t/p/original/still.jpg'}],
	series: series(),
	moonfinItemId: 'series1',
	moonfinEpisodeId: null,
	moonfinLibraryIds: ['tv'],
	...extra
});

const movie = (extra = {}) => ({
	id: 5,
	title: 'Sintel',
	tmdbId: 45745,
	year: 2010,
	studio: 'Blender',
	hasFile: true,
	monitored: true,
	images: [{coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/sintel.jpg'}],
	moonfinItemId: 'movie1',
	moonfinLibraryIds: ['films'],
	...extra
});

const day = (y, m, d) => new Date(y, m - 1, d);

describe('parseSonarrEntry', () => {
	it('reads an episode with its series, sized TMDB art and the server ids', () => {
		const e = parseSonarrEntry(episode());
		expect(e).toMatchObject({
			key: 'sonarr:11',
			kind: 'episode',
			hasTime: true,
			title: 'The Simpsons',
			episodeTitle: 'Dream Scenari-Moe',
			seasonNumber: 38,
			episodeNumber: 7,
			network: 'FOX',
			runtimeMinutes: 22,
			tvdbId: 71663,
			tmdbId: 456,
			itemId: 'series1',
			episodeId: null,
			libraryIds: ['tv'],
			badge: null
		});
		expect(e.date.toISOString()).toBe('2026-11-12T01:00:00.000Z');
		expect(e.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
		// The local arr path is skipped for the remote one after it.
		expect(e.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/fanart.jpg');
		expect(e.stillUrl).toBe('https://image.tmdb.org/t/p/w780/still.jpg');
	});

	it('drops a TBA title and has no time with only an air day', () => {
		const e = parseSonarrEntry(episode({title: 'TBA', airDateUtc: null, airDate: '2026-11-20'}));
		expect(e.episodeTitle).toBeNull();
		expect(e.hasTime).toBe(false);
		expect(isoDay(e.day)).toBe('2026-11-20');
	});

	it('skips an element without a series or an air date', () => {
		expect(parseSonarrEntry(episode({series: null}))).toBeNull();
		expect(parseSonarrEntry(episode({airDateUtc: '', airDate: ''}))).toBeNull();
	});

	it('badges premieres from the numbers and finales from Sonarr', () => {
		expect(parseSonarrEntry(episode({seasonNumber: 1, episodeNumber: 1})).badge).toBe(BADGE.seriesPremiere);
		expect(parseSonarrEntry(episode({seasonNumber: 3, episodeNumber: 1})).badge).toBe(BADGE.seasonPremiere);
		expect(parseSonarrEntry(episode({seasonNumber: 0, episodeNumber: 1})).badge).toBeNull();
		expect(parseSonarrEntry(episode({finaleType: 'season'})).badge).toBe(BADGE.seasonFinale);
		expect(parseSonarrEntry(episode({finaleType: 'midseason'})).badge).toBe(BADGE.midseasonFinale);
		expect(parseSonarrEntry(episode({finaleType: 'series'})).badge).toBe(BADGE.seriesFinale);
	});

	it('counts an episode unmonitored when its series is', () => {
		expect(parseSonarrEntry(episode({series: series({monitored: false})})).monitored).toBe(false);
	});

	it('is in the library only once the episode is', () => {
		expect(inLibrary(parseSonarrEntry(episode()))).toBe(false);
		expect(inLibrary(parseSonarrEntry(episode({moonfinEpisodeId: 'ep7'})))).toBe(true);
	});
});

describe('parseRadarrEntries', () => {
	const start = day(2026, 10, 22);
	const end = day(2027, 2, 4);

	it('makes an entry per release in the window, on the day Radarr wrote', () => {
		const entries = parseRadarrEntries(movie({
			inCinemas: '2026-11-18T00:00:00Z',
			digitalRelease: '2027-01-04T00:00:00Z',
			physicalRelease: '2027-06-01T00:00:00Z'
		}), start, end);
		expect(entries.map((e) => e.release)).toEqual(['cinema', 'digital']);
		expect(isoDay(entries[0].day)).toBe('2026-11-18');
		expect(entries[0].hasTime).toBe(false);
		expect(entries[0].key).toBe('radarr:45745:cinema');
		expect(entries[0].network).toBe('Blender');
	});

	it('needs the file on the server to count as in the library', () => {
		const [owned] = parseRadarrEntries(movie({digitalRelease: '2026-11-02T00:00:00Z'}), start, end);
		const [missing] = parseRadarrEntries(movie({hasFile: false, digitalRelease: '2026-11-02T00:00:00Z'}), start, end);
		expect(inLibrary(owned)).toBe(true);
		expect(inLibrary(missing)).toBe(false);
	});

	it('skips an untitled element', () => {
		expect(parseRadarrEntries(movie({title: '', inCinemas: '2026-11-18T00:00:00Z'}), start, end)).toEqual([]);
	});
});

describe('buildEntries', () => {
	it('sorts by day, timed episodes before movies, and trims to the local window', () => {
		const start = day(2026, 11, 1);
		const end = day(2026, 11, 30);
		const late = new Date(2026, 10, 18, 20, 0);
		const entries = buildEntries(
			[episode({id: 1, airDateUtc: late.toISOString()}), episode({id: 2, airDateUtc: new Date(2026, 11, 2, 20, 0).toISOString()})],
			[movie({inCinemas: '2026-11-18T00:00:00Z'})],
			start,
			end
		);
		expect(entries.map((e) => e.key)).toEqual(['sonarr:1', 'radarr:45745:cinema']);
	});
});

describe('problemFrom', () => {
	it('reads the plugin answers', () => {
		expect(problemFrom(403, '{"error":"The calendar is limited to admins on this server"}')).toBe(PROBLEM.adminsOnly);
		expect(problemFrom(503, 'Needs an admin Seerr session')).toBe(PROBLEM.needsAdminSeerr);
		expect(problemFrom(503, 'Sonarr is not configured')).toBe(PROBLEM.notConfigured);
		expect(problemFrom(404, '')).toBe(PROBLEM.notConfigured);
		expect(problemFrom(500, '')).toBe(PROBLEM.failed);
	});

	it('lets the more telling problem win', () => {
		expect(worstProblem(PROBLEM.notConfigured, PROBLEM.needsAdminSeerr)).toBe(PROBLEM.needsAdminSeerr);
		expect(worstProblem(PROBLEM.notConfigured, PROBLEM.notConfigured)).toBe(PROBLEM.notConfigured);
		expect(worstProblem(PROBLEM.failed, PROBLEM.adminsOnly)).toBe(PROBLEM.adminsOnly);
	});
});

describe('calendarAllows', () => {
	const tv = parseSonarrEntry(episode());
	const special = parseSonarrEntry(episode({seasonNumber: 0}));
	const [cinema] = parseRadarrEntries(movie({inCinemas: '2026-11-18T00:00:00Z'}), day(2026, 11, 1), day(2026, 12, 1));
	const homeless = parseSonarrEntry(episode({moonfinLibraryIds: []}));
	const allows = calendarAllows;

	it('keeps everything but specials by default', () => {
		expect(allows(tv, {})).toBe(true);
		expect(allows(cinema, {})).toBe(true);
		expect(allows(special, {})).toBe(false);
		expect(allows(special, {calendarShowSpecials: true})).toBe(true);
	});

	it('follows the episode, movie and release type switches', () => {
		expect(allows(tv, {calendarShowEpisodes: false})).toBe(false);
		expect(allows(cinema, {calendarShowMovies: false})).toBe(false);
		expect(allows(cinema, {radarrCalendarShowCinema: false})).toBe(false);
		expect(allows(cinema, {radarrCalendarShowDigital: false})).toBe(true);
	});

	it('hides titles outside the picked libraries, and ones in no library', () => {
		expect(allows(tv, {calendarLibraryIds: ['tv']})).toBe(true);
		expect(allows(cinema, {calendarLibraryIds: ['tv']})).toBe(false);
		expect(allows(homeless, {calendarLibraryIds: ['tv']})).toBe(false);
		expect(allows(homeless, {calendarLibraryIds: []})).toBe(true);
	});

	it('keeps only followed series for My shows and leaves movies alone', () => {
		expect(allows(tv, {calendarScope: 'myShows'}, new Set())).toBe(false);
		expect(allows(tv, {calendarScope: 'myShows'}, new Set(['series1']))).toBe(true);
		expect(allows(cinema, {calendarScope: 'myShows'}, new Set())).toBe(true);
	});
});

describe('seriesProgressOf', () => {
	it('counts a series started once anything of it is played', () => {
		expect(seriesProgressOf({RecursiveItemCount: 10, UserData: {UnplayedItemCount: 10}})).toMatchObject({started: false, unplayed: 10});
		expect(seriesProgressOf({RecursiveItemCount: 10, UserData: {UnplayedItemCount: 4}})).toMatchObject({started: true, unplayed: 4});
		expect(seriesProgressOf({UserData: {IsFavorite: true, UnplayedItemCount: 0}})).toMatchObject({favorite: true, started: false});
		expect(seriesProgressOf({UserData: {LastPlayedDate: '2026-01-01'}}).started).toBe(true);
	});
});

describe('the derived lists', () => {
	const now = new Date(2026, 10, 5, 12, 0);
	const today = day(2026, 11, 5);
	const at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
	const entries = buildEntries([
		episode({id: 1, airDateUtc: at(3, 20), moonfinEpisodeId: 'e1'}),
		episode({id: 2, airDateUtc: at(4, 20), moonfinEpisodeId: 'e2'}),
		episode({id: 3, airDateUtc: at(5, 9)}),
		episode({id: 4, airDateUtc: at(5, 21)}),
		episode({id: 5, airDateUtc: at(20, 21)})
	], [], day(2026, 10, 22), day(2027, 2, 4));
	const keys = (list) => list.map((e) => e.key);

	it('splits upcoming from recently aired, newest first', () => {
		expect(keys(upcomingOf(entries, today))).toEqual(['sonarr:3', 'sonarr:4', 'sonarr:5']);
		expect(keys(recentOf(entries, today))).toEqual(['sonarr:2', 'sonarr:1']);
	});

	it('counts down to the next thing to air that the library lacks', () => {
		expect(nextOf(entries, now).key).toBe('sonarr:4');
		expect(nextOf(entries, new Date(2026, 11, 1))).toBe(null);
	});

	it('lists what aired and is on the server newest first, and the rest of this week', () => {
		expect(keys(readyToWatchOf(entries, today))).toEqual(['sonarr:2', 'sonarr:1']);
		expect(keys(thisWeekOf(entries, today, now))).toEqual(['sonarr:4']);
	});

	it('tells ready, upcoming and missing apart', () => {
		expect(statusAt(entries[0], now)).toBe('ready');
		expect(statusAt(entries[2], now)).toBe('missing');
		expect(statusAt(entries[3], now)).toBe('upcoming');
	});
});

describe('monthGridDays', () => {
	it('fills whole weeks from the chosen first day', () => {
		const sunday = monthGridDays(day(2026, 11, 1), 0);
		expect(isoDay(sunday[0])).toBe('2026-11-01');
		expect(sunday.length % 7).toBe(0);
		const monday = monthGridDays(day(2026, 11, 1), 1);
		expect(isoDay(monday[0])).toBe('2026-10-26');
		expect(isoDay(monday[monday.length - 1])).toBe('2026-12-06');
	});
});

describe('followsEpisode', () => {
	it('is the next episode or the next season premiere only', () => {
		expect(followsEpisode({seasonNumber: 38, episodeNumber: 7}, 38, 6)).toBe(true);
		expect(followsEpisode({seasonNumber: 39, episodeNumber: 1}, 38, 22)).toBe(true);
		expect(followsEpisode({seasonNumber: 38, episodeNumber: 8}, 38, 6)).toBe(false);
		expect(followsEpisode({seasonNumber: 38, episodeNumber: 7}, null, 6)).toBe(false);
	});
});

describe('daysBetween', () => {
	it('counts calendar days', () => {
		const from = new Date(2026, 10, 5, 23, 30);
		expect(daysBetween(from, new Date(2026, 10, 6, 0, 10))).toBe(1);
		expect(daysBetween(from, addDays(from, 6))).toBe(6);
		expect(daysBetween(from, new Date(2026, 10, 4))).toBe(-1);
	});
});

describe('airsText', () => {
	it('names the day by how far off it is, then the date', () => {
		const now = new Date(2026, 10, 5, 23, 30);
		expect(airsText(new Date(2026, 10, 5, 8), now)).toBe('Today (Nov 5)');
		expect(airsText(new Date(2026, 10, 6, 0, 10), now)).toBe('Tomorrow (Nov 6)');
		expect(airsText(new Date(2026, 10, 8), now)).toBe('In 3 days (Nov 8)');
	});

	it('puts the date in the order the Date Format setting picks', () => {
		const now = new Date(2026, 10, 5, 23, 30);
		expect(airsText(new Date(2026, 10, 8), now, 'dayMonth')).toBe('In 3 days (8 Nov)');
		expect(airsText(new Date(2026, 10, 8), now, 'monthDay')).toBe('In 3 days (Nov 8)');
	});
});
