import {DETAIL_ICON_PATHS} from '../detailIcons';
import {
	drawsMinimalist, minimalistBranding, minimalistCardUrl, minimalistExtrasCard, minimalistScrimAlpha,
	minimalistStillUrl, showsEpisodes, showsExtrasButton
} from './minimalistRules';

const SERVER = 'https://tv.example';

describe('what it draws', () => {
	test('takes the types it was built for', () => {
		['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo'].forEach((type) => {
			expect(drawsMinimalist(type)).toBe(true);
		});
	});

	// Spotlight already knows how to draw these, so they fall through to it rather than being
	// stripped back to a screen that has nothing to say about them.
	test('leaves the rest to Spotlight', () => {
		['Person', 'MusicAlbum', 'MusicArtist', 'Playlist', 'BoxSet', 'Book', 'Audio', undefined]
			.forEach((type) => {
				expect(drawsMinimalist(type)).toBe(false);
			});
	});

	// An episode carries the tabs as well, so arriving on one still leaves the rest of the show a
	// press away.
	test('offers the episodes on a show, a season and one episode of it', () => {
		expect(showsEpisodes('Series')).toBe(true);
		expect(showsEpisodes('Season')).toBe(true);
		expect(showsEpisodes('Episode')).toBe(true);
		expect(showsEpisodes('Movie')).toBe(false);
	});
});

describe('the Extras button', () => {
	const extras = [{Id: 'bts-1', ExtraType: 'BehindTheScenes', Name: 'Making of'}];

	test('shows on a movie with extras', () => {
		expect(showsExtrasButton('Movie', extras, false)).toBe(true);
		expect(showsExtrasButton('Video', extras, false)).toBe(true);
	});

	// A switched off Extras section hands the screen an empty list.
	test('stays away when there are no extras to open', () => {
		expect(showsExtrasButton('Movie', [], false)).toBe(false);
	});

	test('stays out of Kids Mode', () => {
		expect(showsExtrasButton('Movie', extras, true)).toBe(false);
	});

	test('stays off the pages that carry episodes', () => {
		['Series', 'Season', 'Episode'].forEach((type) => {
			expect(showsExtrasButton(type, extras, false)).toBe(false);
		});
	});

	test('opens one widescreen grid per kind of extra', () => {
		const trailer = {Id: 't1', ExtraType: 'Trailer', Name: 'Trailer'};
		const card = minimalistExtrasCard([trailer, ...extras]);

		expect(card.title).toBe('Extras');
		expect(card.icon).toBe(DETAIL_ICON_PATHS.videoLibraryOutlined);
		expect(card.sections).toEqual([
			{kind: 'media', title: 'Behind the Scenes', count: 1, items: extras, aspect: 'landscape'},
			{kind: 'media', title: 'Trailers', count: 1, items: [trailer], aspect: 'landscape'}
		]);
	});
});

describe('the scrim', () => {
	test('keeps a floor at the bottom of the slider', () => {
		expect(minimalistScrimAlpha(0)).toBeCloseTo(0.35);
	});

	test('stops short of hiding the artwork at the top', () => {
		expect(minimalistScrimAlpha(25)).toBeCloseTo(0.85);
		expect(minimalistScrimAlpha(40)).toBeCloseTo(0.85);
	});

	test('runs between the two', () => {
		expect(minimalistScrimAlpha(12.5)).toBeCloseTo(0.6);
	});

	test('settles where the setting does when there is nothing stored', () => {
		expect(minimalistScrimAlpha(undefined)).toBeCloseTo(minimalistScrimAlpha(20));
	});
});

describe('branding', () => {
	test('a movie is its own name', () => {
		expect(minimalistBranding({Type: 'Movie', Name: 'Arrival'}))
			.toEqual({title: 'Arrival', episodeName: ''});
	});

	// The mark names the show and the line under it says which part of it.
	test('an episode leads with the show and puts its own name underneath', () => {
		expect(minimalistBranding({Type: 'Episode', Name: 'The Bells', SeriesName: 'Chernobyl'}))
			.toEqual({title: 'Chernobyl', episodeName: 'The Bells'});
	});

	test('a season leads with the show and adds no second line', () => {
		expect(minimalistBranding({Type: 'Season', Name: 'Season 2', SeriesName: 'Fargo'}))
			.toEqual({title: 'Fargo', episodeName: ''});
	});

	test('an episode with no show to name falls back to its own', () => {
		expect(minimalistBranding({Type: 'Episode', Name: 'Pilot'}).title).toBe('Pilot');
		expect(minimalistBranding(undefined)).toEqual({title: '', episodeName: ''});
	});
});

describe('the episode still', () => {
	const episode = {Type: 'Episode', Id: 'ep1', ImageTags: {Primary: 'tag1'}};

	test('is the episode picture, asked for at twice the room it fills', () => {
		expect(minimalistStillUrl(SERVER, episode, {settings: {}, width: 220}))
			.toBe(`${SERVER}/Items/ep1/Images/Primary?maxWidth=440&quality=90&tag=tag1`);
	});

	// Falling back to the show's artwork would put a second copy of the backdrop on screen.
	test('is nothing when the episode has no picture of its own', () => {
		expect(minimalistStillUrl(SERVER, {Type: 'Episode', Id: 'ep1'}, {settings: {}, width: 220}))
			.toBeNull();
	});

	// That setting exists to keep stills out of sight, so with it on there is nothing to show.
	test('is nothing while series thumbnails are on', () => {
		expect(minimalistStillUrl(SERVER, episode, {settings: {detailUseSeriesThumbnails: true}, width: 220}))
			.toBeNull();
	});

	test('belongs to an episode and nothing else', () => {
		expect(minimalistStillUrl(SERVER, {Type: 'Movie', Id: 'm1', ImageTags: {Primary: 't'}}, {settings: {}, width: 220}))
			.toBeNull();
	});
});

describe('the card picture', () => {
	const episode = {Id: 'ep1', ImageTags: {Primary: 'own'}, SeriesId: 'sh1', SeriesPrimaryImageTag: 'series'};

	test('is the episode still, at twice the card', () => {
		expect(minimalistCardUrl(SERVER, episode, {settings: {}, cardWidth: 266}))
			.toBe(`${SERVER}/Items/ep1/Images/Primary?maxWidth=532&quality=90&tag=own`);
	});

	// Specials are the case worth knowing about: an episode outside a numbered season often has no
	// still of its own, so the show's artwork is all there is.
	test('falls back to the show when the episode has no still', () => {
		const special = {Id: 'ep2', SeriesId: 'sh1', ParentThumbItemId: 'sh1', ParentThumbImageTag: 'thumb'};
		expect(minimalistCardUrl(SERVER, special, {settings: {}, cardWidth: 266}))
			.toBe(`${SERVER}/Items/sh1/Images/Thumb?maxWidth=532&quality=90&tag=thumb`);
	});

	test('takes the show over the episode when series thumbnails are on', () => {
		expect(minimalistCardUrl(SERVER, episode, {settings: {detailUseSeriesThumbnails: true}, cardWidth: 266}))
			.toBe(`${SERVER}/Items/sh1/Images/Primary?maxWidth=532&quality=90&tag=series`);
	});
});
