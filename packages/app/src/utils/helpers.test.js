import {formatDuration, toAbsoluteImageUrl, videoResolutionLabel} from './helpers';

const video = (Width, Height, extra = {}) => ({
	MediaStreams: [{Type: 'Audio'}, {Type: 'Video', Width, Height, ...extra}]
});

describe('formatDuration', () => {
	it('spells out hours and minutes', () => {
		expect(formatDuration(96900000000)).toBe('2h 41m');
	});

	it('drops the hours from anything under one', () => {
		expect(formatDuration(24600000000)).toBe('41m');
	});

	it('says nothing for a runtime it was never given', () => {
		expect(formatDuration(0)).toBe('');
		expect(formatDuration(null)).toBe('');
		expect(formatDuration(undefined)).toBe('');
	});
});

describe('videoResolutionLabel', () => {
	it('reads the video stream past the audio one', () => {
		expect(videoResolutionLabel(video(1920, 1080))).toBe('1080p');
	});

	it('names each tier at its lower edge', () => {
		expect(videoResolutionLabel(video(7600, 4320))).toBe('8K');
		expect(videoResolutionLabel(video(3800, 2000))).toBe('4K');
		expect(videoResolutionLabel(video(2500, 1400))).toBe('1440p');
		expect(videoResolutionLabel(video(1800, 1000))).toBe('1080p');
		expect(videoResolutionLabel(video(1200, 700))).toBe('720p');
		expect(videoResolutionLabel(video(600, 400))).toBe('480p');
	});

	it('drops a tier just under each edge', () => {
		expect(videoResolutionLabel(video(3799, 1999))).toBe('1440p');
		expect(videoResolutionLabel(video(2499, 1399))).toBe('1080p');
		expect(videoResolutionLabel(video(1799, 999))).toBe('720p');
		expect(videoResolutionLabel(video(1199, 699))).toBe('480p');
		expect(videoResolutionLabel(video(599, 399))).toBe('SD');
	});

	it('takes whichever side is the taller claim', () => {
		expect(videoResolutionLabel(video(3840, 1600))).toBe('4K');
		expect(videoResolutionLabel(video(1440, 1080))).toBe('1080p');
	});

	it('marks an interlaced source', () => {
		expect(videoResolutionLabel(video(1920, 1080, {IsInterlaced: true}))).toBe('1080i');
		expect(videoResolutionLabel(video(720, 480, {IsInterlaced: true}))).toBe('480i');
	});

	it('leaves the tiers that have no interlaced form unmarked', () => {
		expect(videoResolutionLabel(video(3840, 2160, {IsInterlaced: true}))).toBe('4K');
	});

	it('says nothing when there is nothing to read', () => {
		expect(videoResolutionLabel(null)).toBe(null);
		expect(videoResolutionLabel({})).toBe(null);
		expect(videoResolutionLabel({MediaStreams: []})).toBe(null);
		expect(videoResolutionLabel({MediaStreams: [{Type: 'Audio'}]})).toBe(null);
		expect(videoResolutionLabel(video(null, 1080))).toBe(null);
		expect(videoResolutionLabel(video(1920, undefined))).toBe(null);
		expect(videoResolutionLabel(video(0, 0))).toBe(null);
	});

	it('reads dimensions the server sent as text', () => {
		expect(videoResolutionLabel(video('1920', '1080'))).toBe('1080p');
	});
});

describe('toAbsoluteImageUrl', () => {
	const server = 'https://media.example';

	it('leaves an absolute url alone', () => {
		expect(toAbsoluteImageUrl('https://image.tmdb.org/t/p/w500/a.jpg', server)).toBe(
			'https://image.tmdb.org/t/p/w500/a.jpg'
		);
		expect(toAbsoluteImageUrl('http://art.example/a.jpg', server)).toBe('http://art.example/a.jpg');
	});

	// A TV browser on an https page drops protocol-relative images.
	it('pins a protocol-relative url to https', () => {
		expect(toAbsoluteImageUrl('//art.example/a.jpg', server)).toBe('https://art.example/a.jpg');
	});

	it('hangs a path off the server it belongs to', () => {
		expect(toAbsoluteImageUrl('/Items/1/Images/Primary', server)).toBe(
			'https://media.example/Items/1/Images/Primary'
		);
		expect(toAbsoluteImageUrl('Items/1/Images/Primary', server)).toBe(
			'https://media.example/Items/1/Images/Primary'
		);
	});

	it('returns the path unchanged when there is no server to resolve against', () => {
		expect(toAbsoluteImageUrl('/Items/1/Images/Primary', null)).toBe('/Items/1/Images/Primary');
	});

	it('answers null for anything that is not a url', () => {
		expect(toAbsoluteImageUrl(null, server)).toBeNull();
		expect(toAbsoluteImageUrl('', server)).toBeNull();
		expect(toAbsoluteImageUrl(42, server)).toBeNull();
	});
});
