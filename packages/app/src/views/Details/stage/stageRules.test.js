import {
	ACTIONS, NAVBAR, alignDelta, drawsStage, resumeLine, revealDelta, stageNeighbour, stagePoster, stageScrimAlpha,
	stageSubtitle, stageTrackChoices
} from './stageRules';

const SERVER = 'https://tv.example';

const TICKS_PER_MINUTE = 600000000;

describe('what Stage draws', () => {
	test('takes the video types and leaves the rest to Modern', () => {
		['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo'].forEach((type) => expect(drawsStage(type)).toBe(true));
		['Person', 'BoxSet', 'MusicAlbum', 'Playlist', 'Book', undefined].forEach((type) => expect(drawsStage(type)).toBe(false));
	});

	test('keeps the backdrop darkened even with the slider at the bottom', () => {
		expect(stageScrimAlpha(0)).toBeCloseTo(0.55);
		expect(stageScrimAlpha(25)).toBeCloseTo(0.85);
		expect(stageScrimAlpha(40)).toBeCloseTo(0.85);
	});

	test('names the episode under its show', () => {
		expect(stageSubtitle({Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 5, Name: 'Pilot'})).toBe('S2:E5 · Pilot');
		expect(stageSubtitle({Type: 'Season', Name: 'Season 2'})).toBe('Season 2');
		expect(stageSubtitle({Type: 'Movie', Name: 'Film'})).toBe('');
	});
});

describe('the poster', () => {
	const episode = {Id: 'e', Type: 'Episode', SeriesId: 's', SeriesPrimaryImageTag: 'st', ImageTags: {Primary: 'et'}};

	test('keeps an episode its own wide still', () => {
		const poster = stagePoster(SERVER, episode, {detailUseSeriesThumbnails: false});
		expect(poster.wide).toBe(true);
		expect(poster.url).toContain('/Items/e/Images/Primary');
	});

	test('shows the show\'s poster on an episode with series thumbnails on', () => {
		const poster = stagePoster(SERVER, episode, {detailUseSeriesThumbnails: true});
		expect(poster.wide).toBe(false);
		expect(poster.url).toContain('/Items/s/Images/Primary');
	});

	test('takes a Seerr title\'s TMDB poster', () => {
		expect(stagePoster(SERVER, {Type: 'Movie', _externalPosterUrl: 'https://tmdb/p.jpg'}, {})).toEqual({url: 'https://tmdb/p.jpg', wide: false});
	});
});

describe('the track chips', () => {
	const mediaSource = {Name: '4K', MediaStreams: [
		{Type: 'Audio', DisplayTitle: 'English 5.1'},
		{Type: 'Audio', DisplayTitle: 'French'},
		{Type: 'Subtitle', DisplayTitle: 'English SDH'}
	]};
	const base = {
		settings: {}, seerrOnly: false, mediaSource, selectedAudioIndex: 1, selectedSubtitleIndex: -1,
		hasMultipleAudio: true, hasMultipleVersions: true, supportsMediaSourceSelection: true
	};

	test('say what each picker is set to', () => {
		expect(stageTrackChoices(base)).toEqual([
			{id: 'audio', current: 'French'},
			{id: 'subtitles', current: 'None'},
			{id: 'version', current: '4K'}
		]);
		expect(stageTrackChoices({...base, selectedSubtitleIndex: 0})[1]).toEqual({id: 'subtitles', current: 'English SDH'});
	});

	test('leave out a picker whose button the viewer hid, or that has nothing to choose', () => {
		const ids = (props) => stageTrackChoices({...base, ...props}).map((choice) => choice.id);
		expect(ids({settings: {hiddenDetailButtonsTv: ['audio', 'version']}})).toEqual(['subtitles']);
		expect(ids({hasMultipleAudio: false, hasMultipleVersions: false})).toEqual(['subtitles']);
		expect(ids({seerrOnly: true})).toEqual([]);
		expect(ids({supportsMediaSourceSelection: false})).toEqual([]);
	});
});

describe('focus between the stops', () => {
	const stops = {beside: ['tracks', 'episodes'], below: ['cast', 'similar']};

	test('walks the column beside the poster and then the rows under it', () => {
		expect(stageNeighbour(stops, 'tracks', 'down')).toBe('episodes');
		expect(stageNeighbour(stops, 'episodes', 'down')).toBe('cast');
		expect(stageNeighbour(stops, 'similar', 'down')).toBe(null);
		expect(stageNeighbour(stops, 'cast', 'up')).toBe('episodes');
		expect(stageNeighbour(stops, 'similar', 'up')).toBe('cast');
	});

	test('goes up off the column to the toolbar along the top, and to the buttons beside a sidebar', () => {
		expect(stageNeighbour(stops, 'tracks', 'up', true)).toBe(NAVBAR);
		expect(stageNeighbour(stops, 'tracks', 'up', false)).toBe(ACTIONS);
		expect(stageNeighbour({beside: [], below: ['cast']}, 'cast', 'up', true)).toBe(ACTIONS);
	});

	test('sends the buttons right to the column and down past it', () => {
		expect(stageNeighbour(stops, ACTIONS, 'right')).toBe('tracks');
		expect(stageNeighbour(stops, ACTIONS, 'down')).toBe('cast');
		expect(stageNeighbour({beside: ['episodes'], below: []}, ACTIONS, 'down')).toBe('episodes');
	});
});

describe('scrolling a section into view', () => {
	const view = {viewTop: 0, viewBottom: 1000};

	test('leaves a section that is already on screen alone', () => {
		expect(revealDelta({top: 100, bottom: 600}, view)).toBe(0);
	});

	test('scrolls only as far as it takes', () => {
		expect(revealDelta({top: 800, bottom: 1200}, view)).toBe(200);
		expect(revealDelta({top: -150, bottom: 300}, view)).toBe(-150);
	});

	test('lines a section taller than the view up by its top', () => {
		expect(revealDelta({top: 400, bottom: 1800}, view)).toBe(400);
	});

	test('brings a card partly off screen three tenths of the way down', () => {
		expect(alignDelta({top: 100, bottom: 400}, view)).toBe(0);
		expect(alignDelta({top: 900, bottom: 1200}, view)).toBe(690);
		expect(alignDelta({top: -100, bottom: 200}, view)).toBe(-310);
	});
});

describe('the resume line', () => {
	const movie = {Type: 'Movie', RunTimeTicks: 120 * TICKS_PER_MINUTE, UserData: {PlaybackPositionTicks: 48 * TICKS_PER_MINUTE}};

	test('shows how far into a film the viewer is and how long is left', () => {
		expect(resumeLine(movie, [])).toEqual({percent: 40, label: '1h 12m remaining'});
	});

	test('follows the episode a show would resume, numbered', () => {
		const episode = {Type: 'Episode', ParentIndexNumber: 3, IndexNumber: 4, RunTimeTicks: 40 * TICKS_PER_MINUTE, UserData: {PlaybackPositionTicks: 16 * TICKS_PER_MINUTE}};
		expect(resumeLine({Type: 'Series'}, [episode])).toEqual({percent: 40, label: 'S3:E4 · 24m remaining'});
	});

	test('has nothing to show with nowhere to resume', () => {
		expect(resumeLine({...movie, UserData: {PlaybackPositionTicks: 0}}, [])).toBe(null);
		expect(resumeLine({...movie, UserData: {...movie.UserData, Played: true}}, [])).toBe(null);
		expect(resumeLine({Type: 'Series'}, [])).toBe(null);
	});
});
