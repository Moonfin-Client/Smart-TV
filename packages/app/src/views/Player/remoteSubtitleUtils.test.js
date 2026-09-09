jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	mapSubtitleStreamsFromMediaSource,
	mapRemoteSubtitleOptions,
	remoteSubtitleDetails,
	remoteSubtitleFlags,
	remoteSubtitleSearchError,
	remoteSubtitleDownloadError,
	pollForSubtitleAppearance,
	SUBTITLE_APPEARANCE_DELAYS
} from './remoteSubtitleUtils';

const mediaSource = (streams, over = {}) => ({MediaStreams: streams, ...over});
const mapOne = (stream, over) =>
	mapSubtitleStreamsFromMediaSource(mediaSource([stream], over), 'https://server', {includeEmbeddedNative: true})[0];

const subtitle = (overrides) => ({
	Type: 'Subtitle',
	Index: 3,
	Codec: 'subrip',
	Language: 'eng',
	IsExternal: false,
	DeliveryMethod: 'Embed',
	...overrides
});

describe('mapSubtitleStreamsFromMediaSource', () => {
	// A server that cant transcode cant extract either, so there AVPlay is all text has.
	it('leaves embedded text to the server when it can extract', () => {
		expect(mapOne(subtitle()).isEmbeddedNative).toBe(false);
		expect(mapOne(subtitle(), {SupportsTranscoding: true}).isEmbeddedNative).toBe(false);
	});

	it('treats embedded text as native when the server cant extract', () => {
		expect(mapOne(subtitle(), {SupportsTranscoding: false}).isEmbeddedNative).toBe(true);
	});

	it('treats an embedded mov_text track as text', () => {
		expect(mapOne(subtitle({Codec: 'mov_text'})).isTextBased).toBe(true);
	});

	it('treats an embedded hdmv_pgs_subtitle track as image based', () => {
		const mapped = mapOne(subtitle({Codec: 'hdmv_pgs_subtitle', DeliveryMethod: 'Embed'}));

		expect(mapped.isImageBased).toBe(true);
		expect(mapped.isEmbeddedNative).toBe(true);
	});

	it('does not treat a server delivered text track as native', () => {
		expect(mapOne(subtitle({DeliveryMethod: 'External'})).isEmbeddedNative).toBe(false);
	});

	it('does not treat a server delivered image track as native', () => {
		const mapped = mapOne(subtitle({Codec: 'PGSSUB', DeliveryMethod: 'External'}));

		expect(mapped.isImageBased).toBe(true);
		expect(mapped.isEmbeddedNative).toBe(false);
	});

	it('treats an embedded image track as native', () => {
		expect(mapOne(subtitle({Codec: 'PGSSUB', DeliveryMethod: 'Embed'})).isEmbeddedNative).toBe(true);
	});

	it('never treats an external subtitle file as native', () => {
		expect(mapOne(subtitle({IsExternal: true, DeliveryMethod: 'Embed'})).isEmbeddedNative).toBe(false);
	});

	it('leaves isEmbeddedNative off when the caller does not ask for it', () => {
		const mapped = mapSubtitleStreamsFromMediaSource(mediaSource([subtitle({})]), 'https://server')[0];

		expect(mapped.isEmbeddedNative).toBeUndefined();
	});

	it('classifies the codec regardless of delivery', () => {
		expect(mapOne(subtitle({Codec: 'ass', DeliveryMethod: 'External'})).isAss).toBe(true);
		expect(mapOne(subtitle({Codec: 'dvdsub', DeliveryMethod: 'External'})).isBurnIn).toBe(true);
	});

	it('leaves a track the server has to encode to the server', () => {
		const mapped = mapOne(subtitle({Codec: 'PGSSUB', DeliveryMethod: 'Encode'}));

		expect(mapped.isBurnIn).toBe(true);
		expect(mapped.isEmbeddedNative).toBe(false);
	});

	it('marks nothing native when the whole source is server delivered', () => {
		const streams = [
			subtitle({Index: 3, DeliveryMethod: 'External'}),
			subtitle({Index: 4, DeliveryMethod: 'External'}),
			subtitle({Index: 5, Codec: 'PGSSUB', DeliveryMethod: 'External'}),
			subtitle({Index: 6, Language: 'ara', DeliveryMethod: 'External'})
		];
		const mapped = mapSubtitleStreamsFromMediaSource(mediaSource(streams), 'https://server', {includeEmbeddedNative: true});

		expect(mapped.every((s) => s.isEmbeddedNative === false)).toBe(true);
		expect(mapped.filter((s) => s.isTextBased)).toHaveLength(3);
	});

	it('builds a delivery url against the server for non external tracks', () => {
		const mapped = mapOne(subtitle({DeliveryUrl: '/Videos/1/sub.vtt', IsExternalUrl: false}));

		expect(mapped.deliveryUrl).toBe('https://server/Videos/1/sub.vtt');
	});

	it('ignores non subtitle streams', () => {
		const source = mediaSource([{Type: 'Audio', Index: 1, Codec: 'truehd'}, subtitle({Index: 2})]);

		expect(mapSubtitleStreamsFromMediaSource(source, 'https://server')).toHaveLength(1);
	});
});

describe('remote subtitle results', () => {
	const result = (over = {}) => ({Id: 'r1', Name: 'Some.Release.1080p', ...over});

	test('names the flags the provider set and leaves the rest out', () => {
		expect(remoteSubtitleFlags(result())).toEqual([]);
		expect(remoteSubtitleFlags(result({AiTranslated: true, HearingImpaired: true, IsHashMatch: true})))
			.toEqual(['AI Translated', 'SDH', 'Perfect match']);
		expect(remoteSubtitleFlags(result({MachineTranslated: true, Forced: true})))
			.toEqual(['Machine Translated', 'Forced']);
	});

	test('builds the detail line out of what the provider filled in', () => {
		const details = remoteSubtitleDetails(result({
			ThreeLetterISOLanguageName: 'eng',
			ProviderName: 'Open Subtitles',
			Format: 'srt',
			CommunityRating: 8,
			DownloadCount: 1204,
			FrameRate: 23.976
		}));

		expect(details).toBe('ENG · Open Subtitles · SRT · 8.0★ · 1204 downloads · 23.976 fps');
	});

	test('drops a whole frame rate to the whole number and skips what is missing', () => {
		expect(remoteSubtitleDetails(result({FrameRate: 25}))).toBe('25 fps');
		expect(remoteSubtitleDetails(result({DownloadCount: 1}))).toBe('1 download');
		expect(remoteSubtitleDetails(result({DownloadCount: 0}))).toBe('0 downloads');
		expect(remoteSubtitleDetails(result({Language: 'spa'}))).toBe('SPA');
		expect(remoteSubtitleDetails(result({FrameRate: 0}))).toBe('');
		expect(remoteSubtitleDetails(result())).toBe('');
	});

	test('an option carries its flags alongside the detail line', () => {
		const [option] = mapRemoteSubtitleOptions([result({ProviderName: 'Open Subtitles', Forced: true})]);

		expect(option).toEqual({
			id: 'r1',
			name: 'Some.Release.1080p',
			info: 'Open Subtitles',
			flags: ['Forced']
		});
		expect(mapRemoteSubtitleOptions(null)).toEqual([]);
	});

	test('a refused request reads differently from one that simply failed', () => {
		expect(remoteSubtitleSearchError({status: 403})).toBe('You do not have permission to search for subtitles');
		expect(remoteSubtitleSearchError({status: 404})).toBe('No subtitle provider is set up on the server');
		expect(remoteSubtitleSearchError({status: 500})).toBe('Subtitle search failed');
		expect(remoteSubtitleSearchError(undefined)).toBe('Subtitle search failed');
		expect(remoteSubtitleDownloadError({status: 403})).toBe('You do not have permission to download subtitles');
		expect(remoteSubtitleDownloadError({status: 404})).toBe('That subtitle is no longer available');
		expect(remoteSubtitleDownloadError(new Error('offline'))).toBe('Subtitle download failed');
	});
});

describe('pollForSubtitleAppearance', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// The whole schedule has to outlast a metadata refresh on a busy server.
	test('waits about twenty seconds in total', () => {
		const total = SUBTITLE_APPEARANCE_DELAYS.reduce((sum, ms) => sum + ms, 0);

		expect(total).toBe(19300);
	});

	test('stops as soon as the probe finds the stream', async () => {
		const probe = jest.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({Index: 4});
		const found = pollForSubtitleAppearance(probe);

		await jest.advanceTimersByTimeAsync(1000);

		await expect(found).resolves.toEqual({Index: 4});
		expect(probe).toHaveBeenCalledTimes(2);
	});

	test('gives up once the schedule runs out', async () => {
		const probe = jest.fn().mockResolvedValue(null);
		const found = pollForSubtitleAppearance(probe);

		await jest.advanceTimersByTimeAsync(30000);

		await expect(found).resolves.toBeNull();
		expect(probe).toHaveBeenCalledTimes(SUBTITLE_APPEARANCE_DELAYS.length + 1);
	});

	test('a probe that throws is tried again rather than ending the wait', async () => {
		const probe = jest.fn()
			.mockRejectedValueOnce(new Error('server hiccup'))
			.mockResolvedValueOnce({Index: 7});
		const found = pollForSubtitleAppearance(probe);

		await jest.advanceTimersByTimeAsync(1000);

		await expect(found).resolves.toEqual({Index: 7});
		expect(probe).toHaveBeenCalledTimes(2);
	});
});
