import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';

const source = (codec, range, overrides = {}) => ({
	Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type: 'Video', Codec: codec, VideoRangeType: range}],
	...overrides
});
const hdrCaps = {hevc: true, av1: true, hdr10: true, dolbyVision: false};

beforeEach(() => {
	jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe.each(['hevc', 'av1'])('%s HDR negotiation on Tizen', (codec) => {
	test.each(['DOVIInvalid', 'DOVI', 'DOVIWithEL', 'DOVIWithELHDR10Plus'])(
		'never remuxes unsupported %s, even when the server supplies a URL', (range) => {
			expect(getPlayMethod(source(codec, range), hdrCaps)).toBe('Transcode');
			expect(getPlayMethod(source(codec, range, {
				DirectStreamUrl: '/Videos/movie/stream.ts?VideoCodec=copy', SupportsDirectPlay: false
			}), hdrCaps)).toBe('Transcode');
		}
	);

	test.each(['HDR10', 'HDR10Plus', 'DOVIWithHDR10', 'DOVIWithHDR10Plus'])(
		'keeps compatible %s direct play and remux, but transcodes on an SDR panel', (range) => {
			expect(getPlayMethod(source(codec, range), hdrCaps)).toBe('DirectPlay');
			expect(getPlayMethod(source(codec, range, {SupportsDirectPlay: false}), hdrCaps)).toBe('DirectStream');
			expect(getPlayMethod(source(codec, range), {...hdrCaps, hdr10: false})).toBe('Transcode');
		}
	);

	test.each(['SDR', 'DOVIWithSDR'])('keeps %s playable on an SDR panel', (range) => {
		expect(getPlayMethod(source(codec, range), {...hdrCaps, hdr10: false})).toBe('DirectPlay');
		expect(getPlayMethod(source(codec, range, {SupportsDirectPlay: false}), {...hdrCaps, hdr10: false})).toBe('DirectStream');
	});
});

describe('the Tizen server profile HDR conditions', () => {
	afterEach(() => {
		delete global.tizen;
		delete global.webapis;
		clearCapabilitiesCache();
	});

	test.each([
		['SDR', false, false,
			['SDR', 'DOVIWithSDR'],
			['HDR10', 'DOVIInvalid', 'DOVI', 'DOVIWithEL', 'DOVIWithELHDR10Plus']],
		['HDR10', true, false,
			['SDR', 'HDR10', 'HDR10Plus', 'HLG', 'DOVIWithSDR', 'DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithHLG'],
			['DOVIInvalid', 'DOVI', 'DOVIWithEL', 'DOVIWithELHDR10Plus']],
		['reported Dolby Vision support', true, true,
			['DOVI', 'DOVIInvalid', 'DOVIWithEL', 'DOVIWithELHDR10Plus'], []]
	])('applies the %s capability to both HEVC and AV1', async (_label, hdr10, dolbyVision, accepted, rejected) => {
		global.tizen = {systeminfo: {getCapability: () => '6.5'}};
		global.webapis = {
			productinfo: {isUdPanelSupported: () => true},
			avinfo: {isHdrTvSupport: () => hdr10, isDolbyVisionSupport: () => dolbyVision}
		};
		const capabilities = await getDeviceCapabilities();
		const profile = await getJellyfinDeviceProfile();
		for (const codec of ['hevc', 'av1']) {
			const condition = profile.CodecProfiles.find((p) => p.Codec === codec)
				.Conditions.find((c) => c.Property === 'VideoRangeType');
			expect(condition).toMatchObject({Condition: 'EqualsAny', IsRequired: false});
			const ranges = condition.Value.split('|');
			for (const range of accepted) {
				expect(ranges).toContain(range);
				expect(getPlayMethod(source(codec, range), capabilities)).toBe('DirectPlay');
			}
			for (const range of rejected) {
				expect(ranges).not.toContain(range);
			}
		}
	});
});
