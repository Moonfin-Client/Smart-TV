import {isInBandSubtitleTrack, isMatroskaContainer} from './subtitleCodecs';

const pgs = {codec: 'PGSSUB', isExternal: false, container: 'mkv', canStreamInBand: true};

describe('isMatroskaContainer', () => {
	test('takes Matroska whatever the server calls the container', () => {
		expect(isMatroskaContainer('mkv')).toBe(true);
		expect(isMatroskaContainer('matroska')).toBe(true);
		expect(isMatroskaContainer('MKV')).toBe(true);
		expect(isMatroskaContainer('mov,mp4,m4a')).toBe(false);
		expect(isMatroskaContainer(undefined)).toBe(false);
	});

	test('reads a comma separated container list', () => {
		expect(isMatroskaContainer('mp4,mkv')).toBe(true);
	});
});

describe('isInBandSubtitleTrack', () => {
	test('takes embedded PGS in a container it can demux', () => {
		expect(isInBandSubtitleTrack('pgssub', pgs)).toBe(true);
		expect(isInBandSubtitleTrack('hdmv_pgs_subtitle', pgs)).toBe(true);
	});

	test('leaves an external sidecar to the server', () => {
		expect(isInBandSubtitleTrack('pgssub', {...pgs, isExternal: true})).toBe(false);
	});

	test('leaves a container it cannot demux to the sidecar', () => {
		expect(isInBandSubtitleTrack('pgssub', {...pgs, container: 'mp4'})).toBe(false);
	});

	test('leaves the decision to the platform that has to render it', () => {
		expect(isInBandSubtitleTrack('pgssub', {...pgs, canStreamInBand: false})).toBe(false);
	});

	test('leaves every other codec alone', () => {
		expect(isInBandSubtitleTrack('subrip', pgs)).toBe(false);
		expect(isInBandSubtitleTrack('ass', pgs)).toBe(false);
		expect(isInBandSubtitleTrack('dvdsub', pgs)).toBe(false);
	});
});
