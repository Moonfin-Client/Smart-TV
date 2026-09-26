import {
	accessUnitToSup,
	createInBandPgsSource,
	parseCues,
	parseHeader,
	parseTracks,
	supFrame
} from './mkvPgsSource';

// The jsdom environment jest runs in has no web streams, and the source hands libpgs one.
if (typeof global.ReadableStream === 'undefined') {
	// eslint-disable-next-line global-require
	global.ReadableStream = require('node:stream/web').ReadableStream;
}

const ascii = (text) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

const encodeId = (id) => {
	const bytes = [];
	let value = id;
	do {
		bytes.unshift(value & 0xff);
		value = Math.floor(value / 256);
	} while (value > 0);
	return new Uint8Array(bytes);
};

const encodeSize = (size) => {
	const bytes = [];
	let value = size;
	do {
		bytes.unshift(value & 0xff);
		value = Math.floor(value / 256);
	} while (value > 0);
	bytes[0] |= 0x80 >> (bytes.length - 1);
	return new Uint8Array(bytes);
};

const element = (id, body) => {
	const idBytes = encodeId(id);
	const sizeBytes = encodeSize(body.length);
	const out = new Uint8Array(idBytes.length + sizeBytes.length + body.length);
	out.set(idBytes, 0);
	out.set(sizeBytes, idBytes.length);
	out.set(body, idBytes.length + sizeBytes.length);
	return out;
};

/** Read an element header back, so the writer and the reader check each other. */
const splitElement = (bytes, offset = 0) => {
	const vintLength = (at) => {
		const first = bytes[at];
		let length = 1;
		let mask = 0x80;
		while (length <= 8 && !(first & mask)) {
			mask >>= 1;
			length++;
		}
		return length;
	};
	const sizeStart = offset + vintLength(offset);
	const sizeLength = vintLength(sizeStart);
	let size = bytes[sizeStart] & (0xff >> sizeLength);
	for (let i = 1; i < sizeLength; i++) size = size * 256 + bytes[sizeStart + i];
	return {bodyStart: sizeStart + sizeLength, bodyEnd: sizeStart + sizeLength + size};
};

const uintBytes = (value, length) => {
	const out = new Uint8Array(length);
	let remaining = value;
	for (let i = length - 1; i >= 0; i--) {
		out[i] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}
	return out;
};

const join = (parts) => {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

const pgsSegment = (type, payload) => join([new Uint8Array([type]), uintBytes(payload.length, 2), payload]);

const displaySet = (marker) => join([
	pgsSegment(0x16, new Uint8Array([0x00, marker])),
	pgsSegment(0x14, new Uint8Array([0x00, marker])),
	pgsSegment(0x80, new Uint8Array([]))
]);

// The track number in a block is a variable length integer, marker bit and all.
const simpleBlock = (trackNumber, payload) => join([
	encodeSize(trackNumber),
	new Uint8Array([0x00, 0x00, 0x80]),
	payload
]);

const trackEntry = (number, type, codec) => element(0xae, join([
	element(0xd7, uintBytes(number, 1)),
	element(0x83, uintBytes(type, 1)),
	element(0x86, ascii(codec))
]));

/**
 * Build a real Matroska file with a subtitle cue per cluster, so the source sees the same
 * layout it sees in the wild: cues at the end, subtitle blocks buried behind filler.
 */
const buildFile = ({subtitleTimes, fillerBytes = 200 * 1024}) => {
	const tracks = element(0x1654ae6b, join([
		trackEntry(1, 1, 'V_MPEGH/ISO/HEVC'),
		trackEntry(2, 17, 'S_HDMV/PGS')
	]));
	const info = element(0x1549a966, element(0x2ad7b1, uintBytes(1000000, 3)));

	const seekHeadFor = (cuesPosition) => element(0x114d9b74, element(0x4dbb, join([
		element(0x53ab, encodeId(0x1c53bb6b)),
		element(0x53ac, uintBytes(cuesPosition, 4))
	])));
	// Cluster and cue positions are measured from the first byte of the segment, which
	// is where the seek head starts, not where the clusters do.
	let segmentRelative = seekHeadFor(0).length + info.length + tracks.length;
	const clusters = [];
	const cuePoints = [];
	for (const time of subtitleTimes) {
		const filler = new Uint8Array(fillerBytes).fill(0x55);
		const subtitle = displaySet(time & 0xff);
		const block = element(0xa3, simpleBlock(2, subtitle));
		const timecode = element(0xe7, uintBytes(time, 4));
		const video = element(0xa3, simpleBlock(1, filler));
		const clusterBody = element(0x1f43b675, join([timecode, video, block]));
		// CueRelativePosition counts from the first byte after the cluster header.
		const blockOffset = timecode.length + video.length;
		clusters.push(clusterBody);
		cuePoints.push(element(0xbb, join([
			element(0xb3, uintBytes(time, 4)),
			element(0xb7, join([
				element(0xf7, uintBytes(2, 1)),
				element(0xf1, uintBytes(segmentRelative, 4)),
				element(0xf0, uintBytes(blockOffset, 4))
			]))
		])));
		segmentRelative += clusterBody.length;
	}
	const cues = element(0x1c53bb6b, join(cuePoints));
	return join([
		element(0x1a45dfa3, new Uint8Array([0x42, 0x86, 0x81, 0x01])),
		element(0x18538067, join([seekHeadFor(segmentRelative), info, tracks, ...clusters, cues]))
	]);
};

const serveFile = (bytes, {status = 206, ranges = null} = {}) => {
	global.fetch = jest.fn(async (url, init) => {
		const match = /bytes=(\d+)-(\d+)/.exec(init?.headers?.Range || '');
		if (ranges) ranges.push(match ? [Number(match[1]), Number(match[2])] : null);
		if (status !== 206) {
			return {status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)};
		}
		const [start, end] = match ? [Number(match[1]), Number(match[2])] : [0, bytes.length - 1];
		const slice = bytes.subarray(start, Math.min(end + 1, bytes.length));
		return {status: 206, arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.length)};
	});
};

const readAll = async (source) => {
	const reader = source.readable.getReader();
	const chunks = [];
	for (let i = 0; i < 100; i++) {
		const {value, done} = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	return join(chunks);
};

const ptsOf = (bytes) => {
	const times = [];
	for (let offset = 0; offset + 13 <= bytes.length;) {
		const length = (bytes[offset + 11] << 8) | bytes[offset + 12];
		times.push((bytes[offset + 2] << 24) | (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5]);
		offset += 10 + 3 + length;
	}
	return times;
};

describe('mkvPgsSource', () => {
	afterEach(() => {
		delete global.fetch;
	});

	test('wraps a segment in the ten byte .sup header ffmpeg writes', () => {
		const frame = supFrame(15682, new Uint8Array([0x16, 0x00, 0x13, 0x07]));
		expect(Array.from(frame.subarray(0, 10))).toEqual([0x50, 0x47, 0x00, 0x15, 0x89, 0x34, 0x00, 0x15, 0x89, 0x34]);
		expect(Array.from(frame.subarray(10))).toEqual([0x16, 0x00, 0x13, 0x07]);
	});

	test('splits an access unit into one frame per segment and stops at a short tail', () => {
		const payload = join([
			pgsSegment(0x16, new Uint8Array([0x01])),
			pgsSegment(0x80, new Uint8Array([])),
			new Uint8Array([0x14, 0xff])
		]);
		const frames = accessUnitToSup(1000, payload);
		expect(frames).toHaveLength(2);
		expect(frames[0][10]).toBe(0x16);
		expect(frames[1][10]).toBe(0x80);
		expect(frames[0].length).toBe(10 + 3 + 1);
	});

	test('reads the segment offset, timecode scale, tracks and cue position from the header', () => {
		const bytes = buildFile({subtitleTimes: [0]});
		const header = parseHeader(bytes);
		expect(header.timestampScale).toBe(1000000);
		expect(header.segmentDataOffset).toBeGreaterThan(0);
		expect(header.cuesOffset).not.toBeNull();
		expect(header.tracks).toEqual([
			{number: 1, type: 1, codec: 'V_MPEGH/ISO/HEVC', language: 'und', compressed: false},
			{number: 2, type: 17, codec: 'S_HDMV/PGS', language: 'und', compressed: false}
		]);
	});

	test('keeps only the cue positions of the wanted track', () => {
		const bytes = buildFile({subtitleTimes: [10, 20]});
		const header = parseHeader(bytes);
		const cues = splitElement(bytes, header.segmentDataOffset + header.cuesOffset);
		const all = parseCues(bytes, cues.bodyStart, cues.bodyEnd - cues.bodyStart, null);
		expect(all).toEqual(parseCues(bytes, cues.bodyStart, cues.bodyEnd - cues.bodyStart, 2));
		expect(all.map((cue) => cue.time)).toEqual([10, 20]);
		expect(parseCues(bytes, cues.bodyStart, cues.bodyEnd - cues.bodyStart, 1)).toEqual([]);
	});

	test('parses a tracks element with a zlib content encoding', () => {
		const entry = element(0xae, join([
			element(0xd7, uintBytes(7, 1)),
			element(0x83, uintBytes(17, 1)),
			element(0x86, ascii('S_HDMV/PGS')),
			element(0x6d80, element(0x6240, element(0x5034, uintBytes(0, 1))))
		]));
		const tracksElement = element(0x1654ae6b, entry);
		const tracks = splitElement(tracksElement);
		expect(parseTracks(tracksElement, tracks.bodyStart, tracks.bodyEnd - tracks.bodyStart)[0]).toEqual({
			number: 7, type: 17, codec: 'S_HDMV/PGS', language: 'und', compressed: true
		});
	});

	test('streams .sup frames for the cue at and after the start position', async () => {
		const bytes = buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32});
		serveFile(bytes);
		const source = createInBandPgsSource({
			streamUrl: 'http://server/Videos/1/stream?Static=true',
			subtitleOrdinal: 0,
			getTime: () => 0,
			startTime: 1.5,
			lookaheadSeconds: 10
		});
		expect(await source.ready).toBe(true);
		const out = await readAll(source);
		// Three segments per display set, so three frames share each timestamp.
		expect([...new Set(ptsOf(out))]).toEqual([2000 * 90, 3000 * 90]);
		expect(out[0]).toBe(0x50);
		expect(out[1]).toBe(0x47);
	});

	test('reads a small share of the file rather than all of it', async () => {
		const bytes = buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 200 * 1024});
		const ranges = [];
		serveFile(bytes, {ranges});
		const source = createInBandPgsSource({
			streamUrl: 'http://server/Videos/1/stream?Static=true',
			subtitleOrdinal: 0,
			getTime: () => 0,
			lookaheadSeconds: 10
		});
		await source.ready;
		await readAll(source);
		const fetched = ranges.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
		expect(ranges.every(Boolean)).toBe(true);
		expect(fetched).toBeLessThan(bytes.length / 4);
	});

	test('re-arms after a seek back behind the data already handed over', async () => {
		const bytes = buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32});
		serveFile(bytes);
		const source = createInBandPgsSource({
			streamUrl: 'http://server/Videos/1/stream?Static=true',
			subtitleOrdinal: 0,
			getTime: () => 0,
			lookaheadSeconds: 10
		});
		await source.ready;
		await readAll(source);
		expect(source.needsRestart(0)).toBe(true);
		expect(source.needsRestart(3)).toBe(false);
		source.seek(2.5);
		expect(source.needsRestart(0)).toBe(false);
	});

	test('refuses a track that is not PGS so the caller can fall back', async () => {
		const tracks = element(0x1654ae6b, trackEntry(1, 17, 'S_TEXT/UTF8'));
		const cues = element(0x1c53bb6b, element(0xbb, element(0xb3, uintBytes(0, 1))));
		const seekHead = element(0x114d9b74, element(0x4dbb, join([
			element(0x53ab, encodeId(0x1c53bb6b)),
			element(0x53ac, uintBytes(tracks.length + 8, 4))
		])));
		const bytes = join([
			element(0x1a45dfa3, new Uint8Array([0x42, 0x86, 0x81, 0x01])),
			element(0x18538067, join([seekHead, tracks, cues]))
		]);
		serveFile(bytes);
		const source = createInBandPgsSource({streamUrl: 'http://server/stream', subtitleOrdinal: 0, getTime: () => 0});
		expect(await source.ready).toBe(false);
	});

	test('refuses a server that ignores the range request', async () => {
		serveFile(buildFile({subtitleTimes: [1000], fillerBytes: 32}), {status: 200});
		const source = createInBandPgsSource({streamUrl: 'http://server/stream', subtitleOrdinal: 0, getTime: () => 0});
		await expect(source.ready).rejects.toThrow(/range request not honoured/);
		await expect(source.readable.getReader().read()).rejects.toThrow(/range request not honoured/);
	});
});
