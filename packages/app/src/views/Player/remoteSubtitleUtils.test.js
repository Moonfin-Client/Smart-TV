import {mapSubtitleStreamsFromMediaSource} from './remoteSubtitleUtils';

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
