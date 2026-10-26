import {plexAdditionalParts, plexItemToJellyfin, plexPartOf, plexSourceOf} from './plexMapper';

test('maps a movie with its images, ratings and progress', () => {
	const movie = plexItemToJellyfin({
		ratingKey: '1715',
		type: 'movie',
		title: '10 Cloverfield Lane',
		contentRating: 'PG-13',
		rating: 9.1,
		ratingImage: 'rottentomatoes://image.rating.ripe',
		audienceRating: 7.9,
		thumb: '/library/metadata/1715/thumb/1792104771',
		art: '/library/metadata/1715/art/1792104771',
		duration: 6213916,
		viewOffset: 1800000,
		lastViewedAt: 1792123617,
		originallyAvailableAt: '2016-03-10',
		Image: [{type: 'clearLogo', url: '/library/metadata/1715/clearLogo/1'}],
		Guid: [{id: 'imdb://tt1179933'}, {id: 'tmdb://333371'}],
		Role: [{id: 3053, tag: 'John Goodman', role: 'Howard', thumb: 'https://metadata-static.plex.tv/people/goodman.jpg'}],
		Media: [{
			container: 'mkv',
			bitrate: 9536,
			Part: [{
				key: '/library/parts/3721/1700000000/file.mkv',
				file: '/media/Movies/10 Cloverfield Lane (2016).mkv',
				Stream: [
					{streamType: 1, index: 0, codec: 'h264', width: 1920, colorTrc: 'smpte2084'},
					{streamType: 2, index: 1, codec: 'eac3', channels: 6}
				]
			}]
		}]
	});

	expect(movie.Type).toBe('Movie');
	expect(movie.RunTimeTicks).toBe(62139160000);
	expect(movie.CommunityRating).toBe(7.9);
	expect(movie.CriticRating).toBe(91);
	expect(movie.PremiereDate).toBe('2016-03-10T00:00:00.000Z');
	expect(movie.ImageTags).toEqual({Primary: '/library/metadata/1715/thumb/1792104771', Logo: '/library/metadata/1715/clearLogo/1'});
	expect(movie.BackdropImageTags).toEqual(['/library/metadata/1715/art/1792104771']);
	expect(movie.ProviderIds).toEqual({Imdb: 'tt1179933', Tmdb: '333371'});
	expect(movie.People[0]).toEqual({
		Id: 'person-3053',
		Name: 'John Goodman',
		Type: 'Actor',
		Role: 'Howard',
		PrimaryImageTag: 'https://metadata-static.plex.tv/people/goodman.jpg'
	});
	expect(movie.UserData.PlaybackPositionTicks).toBe(18000000000);
	expect(movie.UserData.PlayedPercentage).toBeCloseTo(28.97, 2);
	expect(movie.UserData.LastPlayedDate).toBe('2026-10-16T04:06:57.000Z');
	expect(movie.MediaSources[0]).toMatchObject({Id: '1715-0', Bitrate: 9536000, DirectStreamUrl: '/library/parts/3721/1700000000/file.mkv'});
	expect(movie.MediaStreams[0]).toMatchObject({Type: 'Video', VideoRange: 'HDR', VideoRangeType: 'HDR10'});
});

test('points an episode at its show for series art and logo', () => {
	const episode = plexItemToJellyfin({
		ratingKey: '17100',
		parentRatingKey: '17099',
		grandparentRatingKey: '17098',
		type: 'episode',
		title: 'Countdown',
		grandparentTitle: '3 Body Problem',
		parentTitle: 'Season 1',
		index: 1,
		parentIndex: 1,
		thumb: '/library/metadata/17100/thumb/1',
		art: '/library/metadata/17098/art/1',
		grandparentThumb: '/library/metadata/17098/thumb/1',
		viewCount: 1,
		Image: [{type: 'clearLogo', url: '/library/metadata/17098/clearLogo/1'}]
	});

	expect(episode).toMatchObject({SeriesId: '17098', SeasonId: '17099', IndexNumber: 1, ParentIndexNumber: 1});
	expect(episode.ImageTags).toEqual({Primary: '/library/metadata/17100/thumb/1'});
	expect(episode.BackdropImageTags).toEqual([]);
	expect(episode.ParentBackdropItemId).toBe('17098');
	expect(episode.ParentLogoImageTag).toBe('/library/metadata/17098/clearLogo/1');
	expect(episode.UserData.Played).toBe(true);
	expect(episode.MediaSources).toBeUndefined();
});

test('counts a show as a folder of unplayed episodes and reads a 10 as a favorite', () => {
	const show = plexItemToJellyfin({ratingKey: '17098', type: 'show', childCount: 1, leafCount: 8, viewedLeafCount: 1, userRating: 10});
	expect(show).toMatchObject({Type: 'Series', IsFolder: true, ChildCount: 1, RecursiveItemCount: 8});
	expect(show.UserData).toMatchObject({UnplayedItemCount: 7, IsFavorite: true, Played: false});
});

test('leaves out closed captions carried in the video', () => {
	const movie = plexItemToJellyfin({
		ratingKey: '1804',
		type: 'movie',
		Media: [{Part: [{Stream: [
			{id: 9480, index: 0, streamType: 1, codec: 'h264'},
			{id: 9481, index: 1, streamType: 2, codec: 'eac3'},
			{id: 9482, index: 0, streamType: 3, codec: 'eia_608', embeddedInVideo: '1'},
			{id: 9483, streamType: 3, codec: 'srt', key: '/library/streams/9483'}
		]}]}]
	});
	expect(movie.MediaStreams.map((s) => [s.Index, s.Codec])).toEqual([[0, 'h264'], [1, 'eac3'], [9483, 'srt']]);
	expect(movie.MediaStreams[2]).toMatchObject({IsExternal: true, DeliveryUrl: '/library/streams/9483', DeliveryMethod: 'External'});
});

test('gives a track its album and artists', () => {
	const track = plexItemToJellyfin({
		ratingKey: '23025',
		type: 'track',
		parentRatingKey: '23020',
		parentTitle: 'The Great Depression',
		parentThumb: '/library/metadata/23020/thumb/1',
		grandparentRatingKey: '23019',
		grandparentTitle: 'DMX',
		originalTitle: 'DMX feat. Sisqo'
	});
	expect(track).toMatchObject({Type: 'Audio', MediaType: 'Audio', Album: 'The Great Depression', AlbumId: '23020', AlbumArtist: 'DMX'});
	expect(track.Artists).toEqual(['DMX feat. Sisqo']);
	expect(track.AlbumArtists).toEqual([{Name: 'DMX', Id: '23019'}]);
});

test('a split movie counts its files and lists the later ones as parts', () => {
	const plex = {
		ratingKey: '23071',
		type: 'movie',
		title: 'Stack Test',
		duration: 200000,
		Media: [{duration: 200000, Part: [
			{id: 1, key: '/library/parts/1/file.mkv', file: '/m/Stack Test pt1.mkv', duration: 120000},
			{id: 2, key: '/library/parts/2/file.mkv', file: '/m/Stack Test pt2.mkv', duration: 80000}
		]}]
	};
	expect(plexItemToJellyfin(plex).PartCount).toBe(2);
	const [second] = plexAdditionalParts(plex, 0);
	expect(second).toMatchObject({Id: 'part-23071-0-1', Name: 'Stack Test pt2', RunTimeTicks: 800000000});
	expect(second.PartCount).toBeUndefined();
	expect(plexPartOf(second.Id)).toEqual({key: '23071', mediaIndex: 0, partIndex: 1});
	expect(plexSourceOf('23071-1')).toEqual({key: '23071', mediaIndex: 1});
	expect(plexSourceOf('23071')).toEqual({key: '23071', mediaIndex: 0});
});

test('chapters keep names and pictures and never start before zero', () => {
	const movie = plexItemToJellyfin({
		ratingKey: '19722',
		type: 'episode',
		Chapter: [{startTimeOffset: -40, tag: 'Opening'}, {startTimeOffset: 60000, thumb: '/library/media/1/chapterImages/2'}]
	});
	expect(movie.Chapters).toEqual([
		{StartPositionTicks: 0, Name: 'Opening'},
		{StartPositionTicks: 600000000, ImageTag: '/library/media/1/chapterImages/2'}
	]);
});
