import {
	accessUnitToSup,
	createInBandPgsSource,
	parseCues,
	parseHeader,
	parseTracks,
	supFrame
} from './mkvPgsSource';
import {deflateSync} from 'zlib';

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

const uintBytes = (value, length) => {
	const out = new Uint8Array(length);
	let remaining = value;
	for (let i = length - 1; i >= 0; i--) {
		out[i] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}
	return out;
};

// Each byte of a VINT carries seven bits of value, and all ones is reserved for an unknown size.
const encodeSize = (size) => {
	let length = 1;
	while (size >= 2 ** (7 * length) - 1) length++;
	const bytes = uintBytes(size, length);
	bytes[0] |= 0x80 >> (length - 1);
	return bytes;
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

const displaySet = (marker, objectBytes = 0) => join([
	pgsSegment(0x16, new Uint8Array([0x00, marker])),
	pgsSegment(0x14, new Uint8Array([0x00, marker])),
	...(objectBytes > 0 ? [pgsSegment(0x15, new Uint8Array(objectBytes).fill(marker))] : []),
	pgsSegment(0x80, new Uint8Array([]))
]);

// The track number in a block is a variable length integer, marker bit and all.
const simpleBlock = (trackNumber, payload) => join([
	encodeSize(trackNumber),
	new Uint8Array([0x00, 0x00, 0x80]),
	payload
]);

const trackEntry = (number, type, codec, extra = []) => element(0xae, join([
	element(0xd7, uintBytes(number, 1)),
	element(0x83, uintBytes(type, 1)),
	element(0x86, ascii(codec)),
	...extra
]));

const contentEncodings = (fields) => element(0x6d80, element(0x6240, join(fields)));

// mkvmerge's default for PGS: every block zlib compressed, declared once on the track.
const ZLIB = contentEncodings([element(0x5034, element(0x4254, uintBytes(0, 1)))]);

const pgsTrackWithEncoding = (fields) => {
	const tracksElement = element(0x1654ae6b, trackEntry(7, 17, 'S_HDMV/PGS', [contentEncodings(fields)]));
	const tracks = splitElement(tracksElement);
	return parseTracks(tracksElement, tracks.bodyStart, tracks.bodyEnd - tracks.bodyStart)[0];
};

/**
 * Build a real Matroska file with a subtitle cue per cluster, so the source sees the same
 * layout it sees in the wild: cues at the end, subtitle blocks buried behind filler.
 */
const buildFile = ({subtitleTimes, fillerBytes = 200 * 1024, subtitlePayloadBytes = 0, blockGroup = false, omitRelativePosition = false, brokenIndex = -1, zlib = false, incompleteSets = false}) => {
	const tracks = element(0x1654ae6b, join([
		trackEntry(1, 1, 'V_MPEGH/ISO/HEVC'),
		trackEntry(2, 17, 'S_HDMV/PGS', zlib ? [ZLIB] : [])
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
	for (const [index, time] of subtitleTimes.entries()) {
		const filler = new Uint8Array(fillerBytes).fill(0x55);
		let subtitle = displaySet(time & 0xff, subtitlePayloadBytes);
		// The spec's one segment per block, where the rest of the display set sits in blocks with no cue.
		if (incompleteSets) subtitle = pgsSegment(0x16, new Uint8Array([0x00, time & 0xff]));
		if (zlib) subtitle = new Uint8Array(deflateSync(subtitle));
		// FFmpeg writes a BlockGroup with the duration ahead of the Block, and a Void stands in for a broken one.
		let block = blockGroup
			? element(0xa0, join([element(0x9b, uintBytes(500, 2)), element(0xa1, simpleBlock(2, subtitle))]))
			: element(0xa3, simpleBlock(2, subtitle));
		if (index === brokenIndex) block = element(0xec, simpleBlock(2, subtitle));
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
				...(omitRelativePosition ? [] : [element(0xf0, uintBytes(blockOffset, 4))])
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

const serveFile = (bytes, {status = 206, ranges = null, failFirstWith = null} = {}) => {
	let failed = failFirstWith === null;
	global.fetch = jest.fn(async (url, init) => {
		if (!failed) {
			failed = true;
			return {status: failFirstWith, arrayBuffer: async () => new ArrayBuffer(0)};
		}
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

const openSource = (options = {}) => createInBandPgsSource({streamUrl: 'http://server/stream', subtitleOrdinal: 0, getTime: () => 0, ...options});

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
			{number: 1, type: 1, codec: 'V_MPEGH/ISO/HEVC', compressionAlgorithm: null, compressionSettings: null, unsupportedEncoding: false},
			{number: 2, type: 17, codec: 'S_HDMV/PGS', compressionAlgorithm: null, compressionSettings: null, unsupportedEncoding: false}
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
		expect(pgsTrackWithEncoding([element(0x5034, element(0x4254, uintBytes(0, 1)))])).toEqual({
			number: 7, type: 17, codec: 'S_HDMV/PGS', compressionAlgorithm: 0, compressionSettings: null, unsupportedEncoding: false
		});
	});

	test('marks an encrypted track as unsupported', () => {
		const track = pgsTrackWithEncoding([element(0x5033, uintBytes(1, 1)), element(0x5035, new Uint8Array([]))]);
		expect(track.unsupportedEncoding).toBe(true);
	});

	test('leaves frames uncompressed when the compression only covers the codec private data', () => {
		const track = pgsTrackWithEncoding([element(0x5032, uintBytes(2, 1)), element(0x5034, element(0x4254, uintBytes(0, 1)))]);
		expect(track.compressionAlgorithm).toBeNull();
		expect(track.unsupportedEncoding).toBe(false);
	});

	test('parses Matroska header-stripping settings', () => {
		const prefix = new Uint8Array([0x16, 0x00, 0x02]);
		const parsed = pgsTrackWithEncoding([element(0x5034, join([
			element(0x4254, uintBytes(3, 1)),
			element(0x4255, prefix)
		]))]);
		expect(parsed.compressionAlgorithm).toBe(3);
		expect(Array.from(parsed.compressionSettings)).toEqual(Array.from(prefix));
	});

	test('streams .sup frames from the subtitle on screen at the start position', async () => {
		const bytes = buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32});
		serveFile(bytes);
		const source = createInBandPgsSource({
			streamUrl: 'http://server/Videos/1/stream?Static=true',
			subtitleOrdinal: 0,
			getTime: () => 0,
			startTime: 2.5,
			lookaheadSeconds: 10
		});
		expect(await source.ready).toBe(true);
		const out = await readAll(source);
		// Three segments per display set, so three frames share each timestamp.
		expect([...new Set(ptsOf(out))]).toEqual([2000 * 90, 3000 * 90]);
		expect(out[0]).toBe(0x50);
		expect(out[1]).toBe(0x47);
	});

	test('reads the Block out of a BlockGroup', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 2000], fillerBytes: 32, blockGroup: true}));
		const source = openSource({lookaheadSeconds: 10});
		expect(await source.ready).toBe(true);
		expect([...new Set(ptsOf(await readAll(source)))]).toEqual([1000 * 90, 2000 * 90]);
	});

	test('inflates zlib compressed blocks', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 2000], fillerBytes: 32, zlib: true}));
		const source = openSource({lookaheadSeconds: 10});
		expect(await source.ready).toBe(true);
		const out = await readAll(source);
		expect([...new Set(ptsOf(out))]).toEqual([1000 * 90, 2000 * 90]);
		// Right after the first .sup header sits the display set's composition segment.
		expect(out[10]).toBe(0x16);
	});

	test('falls back when a block holds only part of a display set', async () => {
		serveFile(buildFile({subtitleTimes: [1000], fillerBytes: 32, incompleteSets: true}));
		const source = openSource();
		expect(await source.ready).toBe(false);
	});

	test('keeps a display set past the playhead so libpgs draws the one on screen', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 40000], fillerBytes: 32}));
		const source = openSource({getTime: () => 2, startTime: 2, lookaheadSeconds: 5});
		await source.ready;
		const first = await source.readable.getReader().read();
		expect([...new Set(ptsOf(first.value))]).toEqual([1000 * 90, 40000 * 90]);
	});

	test('falls back when a cue has no relative position', async () => {
		serveFile(buildFile({subtitleTimes: [1000], fillerBytes: 32, omitRelativePosition: true}));
		const source = openSource();
		expect(await source.ready).toBe(false);
	});

	test('falls back when it can't read the first block', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 2000], fillerBytes: 32, brokenIndex: 0}));
		const source = openSource();
		await expect(source.ready).rejects.toThrow(/no subtitle block/);
	});

	test('skips a broken block later on and keeps the stream going', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		serveFile(buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32, brokenIndex: 1}));
		const source = openSource({lookaheadSeconds: 10});
		expect(await source.ready).toBe(true);
		expect([...new Set(ptsOf(await readAll(source)))]).toEqual([1000 * 90, 3000 * 90]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	test('retries a range request the server failed once', async () => {
		serveFile(buildFile({subtitleTimes: [1000], fillerBytes: 32}), {failFirstWith: 503});
		const source = openSource();
		expect(await source.ready).toBe(true);
	});

	test('jumps the cursor to the playhead after a seek forward', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 2000, 10000, 20000, 30000, 31000], fillerBytes: 32}));
		let time = 0;
		const source = openSource({getTime: () => time, lookaheadSeconds: 5});
		await source.ready;
		const reader = source.readable.getReader();
		expect([...new Set(ptsOf((await reader.read()).value))]).toEqual([1000 * 90, 2000 * 90]);
		time = 30;
		// 10s and 20s are over by now, so they are never read.
		expect([...new Set(ptsOf((await reader.read()).value))]).toEqual([30000 * 90, 31000 * 90]);
		expect((await reader.read()).done).toBe(true);
		expect(source.needsRestart(25)).toBe(true);
		expect(source.needsRestart(29.5)).toBe(false);
	});

	test('fetches only the unread tail of a large SimpleBlock', async () => {
		const bytes = buildFile({subtitleTimes: [1000], fillerBytes: 32, subtitlePayloadBytes: 4096});
		const ranges = [];
		serveFile(bytes, {ranges});
		const source = createInBandPgsSource({
			streamUrl: 'http://server/Videos/1/stream?Static=true',
			subtitleOrdinal: 0,
			getTime: () => 0,
			lookaheadSeconds: 10
		});
		await source.ready;
		const out = await readAll(source);
		expect(out.length).toBeGreaterThan(4096);

		// Once a 64-byte block probe has been made, the follow-up starts exactly
		// after it instead of downloading those bytes again.
		const contiguous = ranges.some((range, index) => {
			if (index === 0 || !range) return false;
			const previous = ranges[index - 1];
			return previous && previous[1] - previous[0] + 1 === 64 && range[0] === previous[1] + 1;
		});
		expect(contiguous).toBe(true);
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

	test('needs a restart only for a seek back before the data it handed over', async () => {
		serveFile(buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32}));
		const fromStart = openSource({lookaheadSeconds: 10});
		await fromStart.ready;
		await readAll(fromStart);
		// libpgs still holds everything from the start, so seeking back inside it is fine.
		expect(fromStart.needsRestart(0)).toBe(false);
		expect(fromStart.needsRestart(2)).toBe(false);

		serveFile(buildFile({subtitleTimes: [1000, 2000, 3000], fillerBytes: 32}));
		const resumed = openSource({getTime: () => 2.5, startTime: 2.5, lookaheadSeconds: 10});
		await resumed.ready;
		expect(resumed.needsRestart(0)).toBe(true);
		expect(resumed.needsRestart(2)).toBe(false);
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
		const source = openSource();
		expect(await source.ready).toBe(false);
	});

	test('refuses a server that ignores the range request', async () => {
		serveFile(buildFile({subtitleTimes: [1000], fillerBytes: 32}), {status: 200});
		const source = openSource();
		await expect(source.ready).rejects.toThrow(/range request not honoured/);
		await expect(source.readable.getReader().read()).rejects.toThrow(/range request not honoured/);
	});
});
