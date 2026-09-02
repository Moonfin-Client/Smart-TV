import {describeVideoStream, describeVideoSupport, readVideoSupport} from './videoDiagnostics';
import {getDeviceCapabilities} from '../../services/deviceProfile';

jest.mock('../../services/deviceProfile', () => ({getDeviceCapabilities: jest.fn()}));

describe('describeVideoStream', () => {
	// A Dolby Vision profile 8.1 file, which is the shape that gets turned away on a set
	// that only reads the HDR10 base layer underneath it.
	const stream = {
		Type: 'Video',
		Codec: 'hevc',
		Profile: 'Main 10',
		Level: 153,
		BitDepth: 10,
		VideoRange: 'HDR',
		VideoRangeType: 'DOVIWithHDR10',
		DvProfile: 8,
		DvLevel: 6,
		DvBlSignalCompatibilityId: 1,
		Width: 3840,
		Height: 2160,
		BitRate: 64030323
	};

	it('carries the fields a profile turns a stream away on', () => {
		expect(describeVideoStream(stream)).toEqual({
			codec: 'hevc',
			profile: 'Main 10',
			level: 153,
			bitDepth: 10,
			videoRange: 'HDR',
			videoRangeType: 'DOVIWithHDR10',
			dvProfile: 8,
			dvLevel: 6,
			dvBlSignalCompatibilityId: 1,
			width: 3840,
			height: 2160,
			bitRate: 64030323
		});
	});

	// A stream with no Dolby Vision leaves those fields off the entry rather than
	// filling the report with nulls.
	it('writes out only what the server reported', () => {
		const described = describeVideoStream({Codec: 'h264', BitDepth: 8});
		expect(JSON.parse(JSON.stringify(described))).toEqual({codec: 'h264', bitDepth: 8});
	});

	it('gives null for a missing stream', () => {
		expect(describeVideoStream(null)).toBeNull();
		expect(describeVideoStream(undefined)).toBeNull();
	});
});

describe('describeVideoSupport', () => {
	it('reports what the set said it can show', () => {
		const caps = {
			hdr10: true, hdr10Plus: true, hlg: true, dolbyVision: false,
			uhd: true, uhd8K: false,
			modelName: 'left out'
		};
		expect(describeVideoSupport(caps)).toEqual({
			hdr10: true, hdr10Plus: true, hlg: true, dolbyVision: false, uhd: true, uhd8K: false
		});
	});

	it('gives null when the capabilities never arrived', () => {
		expect(describeVideoSupport(null)).toBeNull();
		expect(describeVideoSupport(undefined)).toBeNull();
	});
});

describe('readVideoSupport', () => {
	it('reads what the set reports', async () => {
		getDeviceCapabilities.mockResolvedValue({hdr10: true, hlg: false, uhd: true});
		await expect(readVideoSupport()).resolves.toMatchObject({hdr10: true, hlg: false, uhd: true});
	});

	// A set that fails to answer should cost the entry its capabilities, not stop playback.
	it('gives null when the set fails to answer', async () => {
		getDeviceCapabilities.mockRejectedValue(new Error('avinfo unavailable'));
		await expect(readVideoSupport()).resolves.toBeNull();
	});
});
