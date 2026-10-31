import {SILO_ORIGINAL, siloDefaultSortTitle, siloItemToJellyfin, siloLibrariesToViews, siloMediaSources, siloProfileToUser, siloStreamIndexForTrack, siloTrackForStreamIndex} from './siloMapper';
import {forgetSiloImages, siloImageFor} from '../utils/siloUrls';
import movie from './__fixtures__/silo/catalog_item_movie.json';
import series from './__fixtures__/silo/catalog_item_series.json';
import episode from './__fixtures__/silo/catalog_item_episode.json';
import seasonEpisodes from './__fixtures__/silo/season_episodes.json';
import libraries from './__fixtures__/silo/user_libraries.json';
import profiles from './__fixtures__/silo/profiles.json';

const baseUrl = 'http://silo:8090';
const map = (item, options) => siloItemToJellyfin(item, {baseUrl, ...options});

beforeEach(() => forgetSiloImages());

describe('movie', () => {
	const dto = () => map(movie);

	test('identity, text and dates', () => {
		expect(dto()).toMatchObject({
			Id: 'movie-imdb-tt0295701',
			Name: 'xXx',
			Type: 'Movie',
			MediaType: 'Video',
			IsFolder: false,
			ProductionYear: 2002,
			PremiereDate: '2002-08-09T00:00:00.0000000Z',
			OfficialRating: 'PG-13',
			CommunityRating: 6,
			ProviderIds: {Imdb: 'tt0295701', Tmdb: '7451'}
		});
		expect(dto()[SILO_ORIGINAL]).toBe(movie);
	});

	test('genres and studios get ids made from their names', () => {
		expect(dto().GenreItems).toContainEqual({Name: 'Action', Id: 'silo-genre:Action'});
		expect(dto().Studios.every((s) => s.Id === `silo-studio:${encodeURIComponent(s.Name)}`)).toBe(true);
	});

	test('the artwork tag is the signed address on the server, kept for callers that ask without a tag', () => {
		const item = dto();
		expect(item.ImageTags.Primary).toMatch(/^http:\/\/silo:8090\/api\/v2\/artwork\/tmdb\/movies\/7451\/poster\//);
		expect(siloImageFor(baseUrl, item.Id, 'Primary')).toBe(item.ImageTags.Primary);
		expect(item.ImageTags.Logo).toBeTruthy();
		expect(item.PrimaryImageAspectRatio).toBeCloseTo(2 / 3);
	});

	test('the run time is the file\'s exact length', () => {
		expect(dto().RunTimeTicks).toBe(Math.round(movie.versions[0].duration * 10000000));
	});

	test('a file\'s streams share one index space, subtitles keeping the index in the container', () => {
		const [source] = dto().MediaSources;
		expect(source).toMatchObject({Id: String(movie.versions[0].file_id), ItemId: 'movie-imdb-tt0295701', Type: 'Default', SupportsDirectPlay: true});
		const indices = source.MediaStreams.map((s) => s.Index);
		expect(new Set(indices).size).toBe(indices.length);
		const subtitles = source.MediaStreams.filter((s) => s.Type === 'Subtitle');
		expect(subtitles).toHaveLength(movie.versions[0].subtitle_tracks.length);
		const tracks = movie.versions[0].subtitle_tracks.map((track, ordinal) => ({track, ordinal, index: siloStreamIndexForTrack(source, 'subtitle', ordinal)}));
		expect(tracks.filter(({track}) => Number.isInteger(track.index)).every(({track, index}) => index === track.index)).toBe(true);
		tracks.forEach(({ordinal, index}) => expect(siloTrackForStreamIndex(source, index)).toMatchObject({kind: 'subtitle', ordinal}));
		expect(siloTrackForStreamIndex(source, source.DefaultAudioStreamIndex)).toMatchObject({kind: 'audio', ordinal: 0});
	});

	test('the profile\'s rating in stars is out of 10, and progress shows as a position', () => {
		const rated = map({...movie, user_rating: 4, user_data: {position_seconds: 600, duration_seconds: 6000}});
		expect(rated.UserData).toMatchObject({Rating: 8, PlaybackPositionTicks: 6000000000, PlayedPercentage: 10, Played: false});
	});

	test('a watched item has no position left', () => {
		expect(map({...movie, user_state: {played: true}, position_seconds: 600}).UserData).toMatchObject({Played: true, PlayCount: 1, PlaybackPositionTicks: 0});
	});
});

describe('series, seasons and episodes', () => {
	test('a series counts its seasons', () => {
		const dto = map(series);
		expect(dto).toMatchObject({Type: 'Series', IsFolder: true});
		expect(dto.MediaType).toBeUndefined();
		expect(dto.MediaSources).toBeUndefined();
	});

	test('an episode links to its series and season, and carries the series artwork once the series is seen', () => {
		const seriesDto = map(series);
		const dto = map(episode);
		expect(dto).toMatchObject({
			Type: 'Episode',
			SeriesId: 'series-imdb-tt1641384',
			SeasonId: 'season-imdb-tt1641384-1',
			ParentId: 'season-imdb-tt1641384-1',
			IndexNumber: 1,
			ParentIndexNumber: 1,
			SeasonName: 'Season 1',
			SeriesName: 'Young Justice'
		});
		expect(dto.SeriesPrimaryImageTag).toBe(seriesDto.ImageTags.Primary);
		// The episode's backdrop is the series', so it's never the episode's own.
		expect(dto.BackdropImageTags).toEqual([]);
	});

	test('a season\'s episode list entries have no type and no series, which the caller supplies', () => {
		const items = seasonEpisodes.items.map((item) => map(item, {series: {id: 'series-imdb-tt1641384', name: 'Young Justice'}}));
		expect(items.every((item) => item.Type === 'Episode' && item.SeriesId === 'series-imdb-tt1641384')).toBe(true);
		expect(items[0].ImageTags.Primary).toBeTruthy();
		expect(items[0].MediaSources?.[0].MediaStreams[0]).toMatchObject({Type: 'Video'});
	});
});

describe('media sources', () => {
	test('the default version comes first', () => {
		const item = {versions: [{file_id: 1, video_tracks: []}, {file_id: 2, video_tracks: []}], playback_variants: [{default_file_id: 2}]};
		expect(siloMediaSources(item, 'movie-x').map((s) => [s.Id, s.Type])).toEqual([['2', 'Default'], ['1', 'Grouping']]);
	});

	test('a video stream reads its range from Silo, or works it out', () => {
		const source = siloMediaSources({versions: [{file_id: 1, video_tracks: [
			{codec: 'hevc', width: 3840, height: 2160, video_range_type: 'HDR10+'},
			{codec: 'hevc', width: 1920, height: 1080, dv_profile: 8, dv_bl_compat_id: 1}
		]}]}, 'movie-x')[0];
		expect(source.MediaStreams.map((s) => [s.VideoRangeType, s.DisplayTitle])).toEqual([
			['HDR10Plus', '4K HDR10Plus HEVC'],
			['DOVIWithHDR10', '1080p DOVIWithHDR10 HEVC']
		]);
	});
});

describe('libraries and profiles', () => {
	test('libraries come as views in the admin\'s order', () => {
		const views = siloLibrariesToViews([...libraries.items].reverse(), baseUrl);
		expect(views.map((v) => [v.Id, v.Name, v.CollectionType])).toEqual([['1', 'Movies', 'movies'], ['3', 'TV Shows', 'tvshows']]);
		expect(views[0].ImageTags.Primary).toMatch(/^http:\/\/silo:8090\/api\/v2\/artwork\/library-posters\/1\.png/);
	});

	test('book and audiobook libraries are left out', () => {
		expect(siloLibrariesToViews([{id: 9, name: 'Books', type: 'ebooks'}], baseUrl)).toEqual([]);
	});

	test('a profile is a user, and only an admin account\'s primary profile is an admin', () => {
		const [profile] = profiles.items;
		expect(siloProfileToUser(profile, {id: 7, username: 'axl', role: 'admin'})).toMatchObject({
			Id: profile.id,
			Name: 'Profile 1',
			HasPassword: false,
			SiloAccountId: '7',
			Policy: {IsAdministrator: true}
		});
		expect(siloProfileToUser({...profile, is_primary: false, has_pin: true}, {id: 7, role: 'admin'}).Policy.IsAdministrator).toBe(false);
	});
});

test('a title starting with an article sorts by the word after it', () => {
	expect(siloDefaultSortTitle('The Hobbit')).toBe('Hobbit, The');
	expect(siloDefaultSortTitle('Alien')).toBeNull();
});
