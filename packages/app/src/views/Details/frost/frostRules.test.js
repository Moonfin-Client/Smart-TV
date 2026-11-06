import {resolveThemeById} from '../../../theme/themeRegistry';
import {MEDIA_STATUS} from '../../../utils/seerrStatus';
import {ACTIONS, NAVBAR} from '../stage/stageRules';
import {
	frostCredits, frostInfo, frostNeighbour, frostScrims, frostSeason, frostSeerrGroups, frostSeerrStatus, frostSegments,
	frostStageFit, frostStatusColors, frostTabs
} from './frostRules';

jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('../../../services/seerrApi', () => ({getImageUrl: (path) => `https://tmdb${path}`}));

const everything = () => true;

describe('the tabs along the bar', () => {
	test('give a film its cast and a show its episodes, then the parts each has and the details', () => {
		expect(frostTabs({Type: 'Movie'}, {showsSection: everything, cast: 8, extras: 2, related: 12, seerr: 3}))
			.toEqual(['overview', 'cast', 'extras', 'related', 'seerr', 'details']);
		['Series', 'Season', 'Episode'].forEach((Type) => expect(frostTabs({Type}, {showsSection: everything, cast: 8}))
			.toEqual(['overview', 'episodes', 'details']));
	});

	test('leave out a part with nothing in it', () => {
		expect(frostTabs({Type: 'Movie'}, {showsSection: everything})).toEqual(['overview', 'details']);
	});

	test('leave an episode the rest of its show only while More episodes is on', () => {
		const hidden = (id) => id !== 'moreEpisodes';
		expect(frostTabs({Type: 'Episode'}, {showsSection: hidden})).toEqual(['overview', 'details']);
		expect(frostTabs({Type: 'Series'}, {showsSection: hidden})).toEqual(['overview', 'episodes', 'details']);
	});

	test('give a title only in Seerr its seasons or cast and Seerr\'s related titles, with no Seerr tab', () => {
		expect(frostTabs({Type: 'Series'}, {seerrOnly: true, showsSection: everything, seasons: 3, cast: 4, related: 2, seerr: 3}))
			.toEqual(['overview', 'seasons', 'related', 'details']);
		expect(frostTabs({Type: 'Movie'}, {seerrOnly: true, showsSection: everything, cast: 4, extras: 2}))
			.toEqual(['overview', 'cast', 'details']);
	});
});

describe('the segments of Seerr\'s titles', () => {
	test('show what Seerr has, with About on the Seerr tab when there are numbers, services or tags', () => {
		const all = {recommendations: true, similar: true, facts: true};
		expect(frostSegments(all, {about: true})).toEqual(['recommendations', 'similar', 'about']);
		expect(frostSegments(all)).toEqual(['recommendations', 'similar']);
		expect(frostSegments({similar: true, chips: true}, {about: true})).toEqual(['similar', 'about']);
		expect(frostSegments({}, {about: true})).toEqual([]);
	});
});

describe('the season the episodes open on', () => {
	test('is the one picked, else the one the viewer is in, else the first that isn\'t Specials', () => {
		expect(frostSeason([0, 1, 2], 2, 1, 1)).toBe(2);
		expect(frostSeason([0, 1, 2], null, 2, 1)).toBe(2);
		expect(frostSeason([0, 1, 2], null, null, 1)).toBe(1);
		expect(frostSeason([0, 1, 2], null, null, null)).toBe(1);
		expect(frostSeason([0, 1, 2], 7, null, null)).toBe(1);
	});

	test('falls back to Specials when that is all there is, and to nothing without episodes', () => {
		expect(frostSeason([0], null, null, null)).toBe(0);
		expect(frostSeason([], 1, 1, 1)).toBe(null);
	});
});

describe('where a press goes', () => {
	const tabs = ['overview', 'cast', 'related', 'seerr', 'details'];
	const ctx = {tabs, navbarTop: true, hasText: true, tracks: 2, pills: 0, shownPill: 0, start: 'cast:0', count: 12};
	const sidebar = {...ctx, navbarTop: false};

	test('walks the tab bar, with Up going back to the toolbar and the far end holding', () => {
		expect(frostNeighbour('tab:cast', 'left', ctx)).toBe('tab:overview');
		expect(frostNeighbour('tab:cast', 'right', ctx)).toBe('tab:related');
		expect(frostNeighbour('tab:details', 'right', ctx)).toBe(null);
		expect(frostNeighbour('tab:cast', 'up', ctx)).toBe(ACTIONS);
		expect(frostNeighbour('tab:cast', 'down', ctx)).toBe(null);
	});

	test('leaves the first tab for the sidebar only when it is docked there', () => {
		expect(frostNeighbour('tab:overview', 'left', ctx)).toBe(null);
		expect(frostNeighbour('tab:overview', 'left', sidebar)).toBe(NAVBAR);
	});

	test('moves between the overview text and the tracks beside it', () => {
		expect(frostNeighbour('overview:text', 'right', ctx)).toBe('overview:track:0');
		expect(frostNeighbour('overview:text', 'down', ctx)).toBe(ACTIONS);
		expect(frostNeighbour('overview:track:0', 'down', ctx)).toBe('overview:track:1');
		expect(frostNeighbour('overview:track:1', 'up', ctx)).toBe('overview:track:0');
		expect(frostNeighbour('overview:track:1', 'down', ctx)).toBe(ACTIONS);
		expect(frostNeighbour('overview:track:1', 'left', ctx)).toBe('overview:text');
		expect(frostNeighbour('overview:track:1', 'right', ctx)).toBe(null);
		expect(frostNeighbour('overview:text', 'right', {...ctx, tracks: 0})).toBe(null);
	});

	test('leaves the overview\'s edges for the navigation beside them', () => {
		expect(frostNeighbour('overview:text', 'up', ctx)).toBe(NAVBAR);
		expect(frostNeighbour('overview:text', 'left', ctx)).toBe(null);
		expect(frostNeighbour('overview:track:0', 'up', ctx)).toBe(NAVBAR);
		expect(frostNeighbour('overview:text', 'up', sidebar)).toBe(null);
		expect(frostNeighbour('overview:text', 'left', sidebar)).toBe(NAVBAR);
		expect(frostNeighbour('overview:track:0', 'left', {...sidebar, hasText: false})).toBe(NAVBAR);
	});

	test('holds a grid\'s right edge and sends Down off the last row to the toolbar', () => {
		expect(frostNeighbour('cast:6', 'left', ctx)).toBe('cast:5');
		expect(frostNeighbour('cast:4', 'right', ctx)).toBe(null);
		expect(frostNeighbour('cast:11', 'right', ctx)).toBe(null);
		expect(frostNeighbour('cast:7', 'up', ctx)).toBe('cast:2');
		expect(frostNeighbour('cast:8', 'down', ctx)).toBe('cast:11');
		expect(frostNeighbour('cast:10', 'down', ctx)).toBe(ACTIONS);
		expect(frostNeighbour('related:6', 'right', {...ctx, count: 14})).toBe(null);
		expect(frostNeighbour('related:6', 'down', {...ctx, count: 14})).toBe('related:13');
	});

	test('leaves a grid\'s left and top edges for the navigation beside them, or holds', () => {
		expect(frostNeighbour('cast:5', 'left', ctx)).toBe(null);
		expect(frostNeighbour('cast:5', 'left', sidebar)).toBe(NAVBAR);
		expect(frostNeighbour('cast:2', 'up', ctx)).toBe(NAVBAR);
		expect(frostNeighbour('cast:2', 'up', sidebar)).toBe(null);
	});

	test('goes up from the first row to the pills, and down from a pill to where the tab starts', () => {
		const episodes = {...ctx, pills: 3, shownPill: 1, start: 'episodes:4', count: 10};
		expect(frostNeighbour('episodes:0', 'up', episodes)).toBe('episodes:pill:1');
		expect(frostNeighbour('episodes:3', 'up', episodes)).toBe('episodes:2');
		expect(frostNeighbour('episodes:9', 'down', episodes)).toBe(ACTIONS);
		expect(frostNeighbour('episodes:3', 'right', episodes)).toBe(null);
		expect(frostNeighbour('episodes:pill:2', 'down', episodes)).toBe('episodes:4');
		expect(frostNeighbour('episodes:pill:1', 'left', episodes)).toBe('episodes:pill:0');
		expect(frostNeighbour('episodes:pill:2', 'right', episodes)).toBe(null);
		expect(frostNeighbour('episodes:pill:1', 'up', episodes)).toBe(NAVBAR);
		expect(frostNeighbour('episodes:pill:0', 'left', episodes)).toBe(null);
		expect(frostNeighbour('episodes:pill:0', 'left', {...episodes, navbarTop: false})).toBe(NAVBAR);
		const seerr = {...ctx, pills: 3, shownPill: 2, start: 'seerr:about'};
		expect(frostNeighbour('seerr:3', 'up', seerr)).toBe('seerr:pill:2');
		expect(frostNeighbour('seerr:pill:2', 'down', seerr)).toBe('seerr:about');
	});

	test('treats the details and Seerr\'s About as one stop each', () => {
		expect(frostNeighbour('details:0', 'down', ctx)).toBe(ACTIONS);
		expect(frostNeighbour('details:0', 'right', ctx)).toBe(null);
		expect(frostNeighbour('details:0', 'up', ctx)).toBe(NAVBAR);
		expect(frostNeighbour('details:0', 'left', sidebar)).toBe(NAVBAR);
		const seerr = {...ctx, pills: 3, shownPill: 2};
		expect(frostNeighbour('seerr:about', 'up', seerr)).toBe('seerr:pill:2');
		expect(frostNeighbour('seerr:about', 'left', seerr)).toBe(null);
		expect(frostNeighbour('seerr:about', 'down', seerr)).toBe(ACTIONS);
	});
});

describe('the stage', () => {
	test('is the screen as drawn with no navigation beside it', () => {
		expect(frostStageFit({width: 1920, height: 1080, scale: 1})).toEqual({width: 1920, height: 1080, fit: 1, left: 0, top: 0});
	});

	test('widens to the room under the bar along the top, so it fills it with no bars at the sides', () => {
		const stage = frostStageFit({width: 1920, height: 1080, scale: 1, top: 135});
		expect(stage.height).toBeCloseTo(1080);
		expect(stage.width).toBeCloseTo((1080 * 1920) / 945);
		expect(stage.width * stage.fit).toBeCloseTo(1920);
		expect(stage.top).toBe(135);
		expect(stage.left).toBe(0);
	});

	test('grows taller beside the sidebar, so it fills the room with no bars at the ends', () => {
		const stage = frostStageFit({width: 1920, height: 1080, scale: 1, left: 78});
		expect(stage.width).toBe(1920);
		expect(stage.height * stage.fit).toBeCloseTo(1080);
		expect(stage.fit).toBeCloseTo(1842 / 1920);
		expect(stage.left).toBe(78);
	});

	test('keeps to the screen when the UI is scaled up', () => {
		const stage = frostStageFit({width: 1920, height: 1080, scale: 1.2});
		expect(stage.width * stage.fit * 1.2).toBeCloseTo(1920);
		expect(stage.height * stage.fit * 1.2).toBeCloseTo(1080);
	});
});

describe('where a title stands in Seerr', () => {
	test('reads as available, requested or pending in their colors, and as not requested otherwise', () => {
		const colors = frostStatusColors(resolveThemeById('moonfin'));
		expect(frostSeerrStatus(MEDIA_STATUS.AVAILABLE, colors)).toEqual({label: 'Available', color: colors.available});
		expect(frostSeerrStatus(MEDIA_STATUS.PROCESSING, colors)).toEqual({label: 'Requested', color: colors.requested});
		expect(frostSeerrStatus(MEDIA_STATUS.PENDING, colors)).toEqual({label: 'Pending', color: colors.pending});
		expect(frostSeerrStatus(undefined, colors)).toEqual({label: 'Not Requested', color: colors.none});
	});

	test('takes its colors from the theme, with not requested in its faded text color', () => {
		expect(frostStatusColors(resolveThemeById('8bit_hero'))).toEqual({
			available: 'rgb(56, 183, 100)', requested: 'rgb(93, 39, 93)', pending: 'rgb(255, 205, 117)', none: 'rgba(244, 244, 244, 0.55)'
		});
	});
});

describe('the dim and fade over the art', () => {
	test('take the background color and hand back the same layers for the same color', () => {
		const neon = frostScrims('11, 4, 32');
		expect(frostScrims('11, 4, 32')).toBe(neon);
		expect(neon.vignette[0].rgb).toBe('11, 4, 32');
		expect(neon.artFade.map((layer) => layer.rgb)).toEqual(['11, 4, 32', '11, 4, 32']);
		expect(frostScrims('16, 16, 16')).not.toBe(neon);
	});
});

describe('what the overview and the Details tab say', () => {
	const film = {
		People: [{Name: 'Writer One', Type: 'Writer'}, {Name: 'Director One', Type: 'Director'}, {Name: 'Director Two', Type: 'Director'}],
		Studios: [{Name: 'Universal'}, {Name: 'Syncopy'}],
		Genres: ['Drama', 'History'],
		PremiereDate: '2026-07-17T00:00:00.0000000Z',
		RunTimeTicks: 108000000000,
		OfficialRating: 'R',
		MediaSources: [{Name: '4K'}, {Name: '1080p'}]
	};
	const cast = ['One', 'Two', 'Three', 'Four'].map((Name) => ({Name}));
	const source = {
		Path: '/media/movies/Film (2026)/Film (2026) - 4K.mkv',
		Container: 'mkv',
		Size: 2 * 1024 * 1024 * 1024,
		MediaStreams: [
			{Type: 'Video', Codec: 'hevc'},
			{Type: 'Audio', Language: 'eng'},
			{Type: 'Audio', Language: 'eng'},
			{Type: 'Audio'},
			{Type: 'Subtitle', Language: 'fre'}
		]
	};
	const seerr = {
		mediaType: 'movie',
		pieces: {facts: true, streaming: true, chips: true},
		details: {voteAverage: 8, genres: [{name: 'Adventure'}], keywords: [{name: 'heist'}, {name: 'paris'}]},
		streamingProviders: [{id: 8, name: 'Netflix', logoPath: '/n.png'}]
	};

	test('credits the first three actors and the directors', () => {
		expect(frostCredits(film, {cast, showsSection: everything})).toEqual([
			{label: 'Cast', names: 'One, Two, Three'},
			{label: 'Director', names: 'Director One, Director Two'}
		]);
		expect(frostCredits(film, {cast: [], showsSection: (id) => id !== 'crew'})).toEqual([]);
	});

	test('groups the facts, the languages and the file', () => {
		const groups = frostInfo(film, {showsSection: everything, mediaSource: source});
		expect(groups.map((group) => group.title)).toEqual([null, 'Language', 'Media info']);
		expect(groups[0].rows.map(([label]) => label)).toEqual(['Studios', 'Release Date', 'Runtime', 'Parental Rating', 'Director', 'Writer', 'Genres']);
		expect(groups[0].rows[0][1]).toBe('Universal, Syncopy');
		expect(groups[1].rows).toEqual([['Audio', 'ENG, ?'], ['Subtitles', 'FRE']]);
		expect(groups[2].rows.map(([label]) => label)).toEqual(['Version', 'File', 'Video', 'Container', 'Size']);
		expect(groups[2].rows[1][1]).toBe('Film (2026) - 4K.mkv');
		expect(groups[2].rows[3][1]).toBe('MKV');
		expect(groups[2].rows[4][1]).toBe('2.00 GB');
	});

	test('leaves out what the viewer hid and what there is nothing to say about', () => {
		const groups = frostInfo({Genres: ['Drama']}, {showsSection: (id) => id !== 'mediaInfo', mediaSource: source});
		expect(groups.map((group) => group.title)).toEqual([null, 'Language']);
		expect(groups[0].rows).toEqual([['Genres', 'Drama']]);
	});

	test('gives Seerr\'s About its numbers, where it streams and its tags', () => {
		const groups = frostSeerrGroups(seerr);
		expect(groups.map((group) => group.title)).toEqual([null, 'Streaming on', 'Tags']);
		expect(groups[0].rows[0]).toEqual(['TMDB Score', '80%']);
		expect(groups[1].rows).toEqual([['Netflix', '', 'https://tmdb/n.png']]);
		expect(groups[2].rows).toEqual([['Genres', 'Adventure'], ['Tags', 'heist, paris']]);
	});

	test('adds Seerr\'s groups to the details of a title only in Seerr, without repeating the genres', () => {
		const groups = frostInfo({Genres: ['Drama']}, {showsSection: everything, seerr});
		expect(groups.map((group) => group.title)).toEqual([null, 'About', 'Streaming on', 'Tags']);
		expect(groups[3].rows).toEqual([['Tags', 'heist, paris']]);
	});
});
