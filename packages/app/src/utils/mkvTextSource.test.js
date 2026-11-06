import util from 'util';
import {createInBandTextSource} from './mkvTextSource';

// The jsdom environment jest runs in has neither, and the TV's browser has both.
global.TextEncoder = global.TextEncoder || util.TextEncoder;
global.TextDecoder = global.TextDecoder || util.TextDecoder;

const join = (parts) => {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

const bytesOf = (text) => new TextEncoder().encode(text);

const encodeId = (id) => {
	const bytes = [];
	for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
	return new Uint8Array(bytes);
};

const uintBytes = (value, length) => {
	const out = new Uint8Array(length);
	for (let i = length - 1, rest = value; i >= 0; i--, rest = Math.floor(rest / 256)) out[i] = rest & 0xff;
	return out;
};

// Always an eight byte size, which every reader accepts and keeps offsets easy to follow.
const element = (id, body) => {
	const size = uintBytes(body.length, 8);
	size[0] = 0x01;
	return join([encodeId(id), size, body]);
};

const trackEntry = (number, codec, language) => element(0xae, join([
	element(0xd7, uintBytes(number, 1)),
	element(0x83, uintBytes(number === 1 ? 1 : 17, 1)),
	element(0x86, bytesOf(codec)),
	element(0x22b59c, bytesOf(language))
]));

// The track number in a block is a one byte vint here, then timecode and flags.
const blockGroup = (track, text, durationMs) => element(0xa0, join([
	element(0xa1, join([new Uint8Array([0x80 | track, 0x00, 0x00, 0x00]), bytesOf(text)])),
	element(0x9b, uintBytes(durationMs, 2))
]));

/** A Matroska file with one cluster per line, subtitles behind video filler, cues at the end. */
const buildFile = ({lines, subtitleTracks = [[2, 'S_TEXT/UTF8', 'fre']], timestampScale = 1000000}) => {
	const tracks = element(0x1654ae6b, join([trackEntry(1, 'V_MPEG4/ISO/AVC', 'und'), ...subtitleTracks.map((t) => trackEntry(...t))]));
	const info = element(0x1549a966, element(0x2ad7b1, uintBytes(timestampScale, 3)));
	const seekHead = (cuesPosition) => element(0x114d9b74, element(0x4dbb, join([
		element(0x53ab, encodeId(0x1c53bb6b)),
		element(0x53ac, uintBytes(cuesPosition, 8))
	])));
	let position = seekHead(0).length + info.length + tracks.length;
	const clusters = [];
	const cuePoints = [];
	for (const {track = 2, time, text, duration = 2000, simple = false} of lines) {
		const timecode = element(0xe7, uintBytes(time, 4));
		const video = element(0xa3, new Uint8Array(4096).fill(0x55));
		const subtitle = simple ? element(0xa3, join([new Uint8Array([0x80 | track, 0x00, 0x00, 0x80]), bytesOf(text)])) : blockGroup(track, text, duration);
		const cluster = element(0x1f43b675, join([timecode, video, subtitle]));
		cuePoints.push(element(0xbb, join([
			element(0xb3, uintBytes(time, 4)),
			element(0xb7, join([
				element(0xf7, uintBytes(track, 1)),
				element(0xf1, uintBytes(position, 8)),
				element(0xf0, uintBytes(timecode.length + video.length, 4))
			]))
		])));
		clusters.push(cluster);
		position += cluster.length;
	}
	return join([
		element(0x1a45dfa3, new Uint8Array([0x42, 0x86, 0x81, 0x01])),
		element(0x18538067, join([seekHead(position), info, tracks, ...clusters, element(0x1c53bb6b, join(cuePoints))]))
	]);
};

const serveFile = (bytes, status = 206, failFirstWith = null) => {
	let failing = failFirstWith;
	global.fetch = jest.fn(async (_url, init) => {
		if (failing) {
			const failure = failing;
			failing = null;
			return {status: failure, body: null, arrayBuffer: async () => new ArrayBuffer(0)};
		}
		const [, start, end] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range).map(Number);
		const slice = status === 206 ? bytes.subarray(start, Math.min(end + 1, bytes.length)) : bytes;
		return {status, body: null, arrayBuffer: async () => slice.slice().buffer};
	});
};

let source = null;
const open = (options = {}) => {
	const received = [];
	let notify;
	const firstBatch = new Promise((resolve) => {
		notify = resolve;
	});
	source = createInBandTextSource({
		streamUrl: 'http://server/stream',
		subtitleOrdinal: 0,
		language: 'fre',
		getTime: () => 0,
		onEvents: (events) => {
			received.push(...events);
			notify();
		},
		...options
	});
	return {received, firstBatch};
};

afterEach(() => {
	source?.dispose();
	source = null;
	delete global.fetch;
});

describe('createInBandTextSource', () => {
	test('reads the lines near the playhead as track events with their duration', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'Bonjour à tous'}, {time: 4000, text: 'Deuxième ligne', duration: 1500}]}));
		const {received, firstBatch} = open();
		expect(await source.ready).toBe(true);
		await firstBatch;
		expect(received).toEqual([
			{StartPositionTicks: 10000000, EndPositionTicks: 30000000, Text: 'Bonjour à tous'},
			{StartPositionTicks: 40000000, EndPositionTicks: 55000000, Text: 'Deuxième ligne'}
		]);
	});

	test('reads a line stored as a SimpleBlock, with the default duration', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'simple', simple: true}]}));
		const {received, firstBatch} = open();
		await firstBatch;
		expect(received).toEqual([{StartPositionTicks: 10000000, EndPositionTicks: 40000000, Text: 'simple'}]);
	});

	test('reads times and durations in the file timestamp scale', async () => {
		serveFile(buildFile({timestampScale: 500000, lines: [{time: 2000, text: 'half', duration: 4000}]}));
		const {received, firstBatch} = open();
		await firstBatch;
		expect(received).toEqual([{StartPositionTicks: 10000000, EndPositionTicks: 30000000, Text: 'half'}]);
	});

	test('retries a range request the server failed once', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'again'}]}), 206, 503);
		const {received, firstBatch} = open();
		expect(await source.ready).toBe(true);
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['again']);
	});

	test('falls back once every attempt has timed out', async () => {
		global.fetch = jest.fn(() => new Promise(() => {}));
		open({fetchTimeoutMs: 20});
		expect(await source.ready).toBe(false);
		expect(global.fetch).toHaveBeenCalledTimes(3);
		expect(global.fetch.mock.calls.every(([, init]) => init.signal.aborted)).toBe(true);
	});

	test('times out a body that never arrives', async () => {
		global.fetch = jest.fn(async () => ({status: 206, body: null, arrayBuffer: () => new Promise(() => {})}));
		open({fetchTimeoutMs: 20});
		expect(await source.ready).toBe(false);
		expect(global.fetch).toHaveBeenCalledTimes(3);
	});

	test('reads a line again once the network comes back', async () => {
		const file = buildFile({lines: [{time: 1000, text: 'late'}]});
		serveFile(file);
		const served = global.fetch;
		let blockReads = 0;
		// The cluster header and the block are the only reads past the file head and the cue index.
		global.fetch = jest.fn((url, init) => {
			const start = Number(/bytes=(\d+)-/.exec(init.headers.Range)[1]);
			const isBlock = start > 0 && init.headers.Range.endsWith(`-${start + 1023}`);
			if (isBlock && blockReads++ < 3) return Promise.reject(new TypeError('Failed to fetch'));
			return served(url, init);
		});
		const {received, firstBatch} = open();
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['late']);
		expect(blockReads).toBe(4);
	});

	test('skips a subtitle block whose size is corrupt', async () => {
		const file = buildFile({lines: [{time: 1000, text: 'fine'}, {time: 2000, text: 'broken'}]});
		// Its text sits 22 bytes into the block group: two nine byte element headers, then
		// track, timecode and flags. The group's size follows its one byte id.
		const groupSize = Array.from(file, (byte) => String.fromCharCode(byte)).join('').indexOf('broken') - 22 + 1;
		file.set(uintBytes(1024 * 1024, 8), groupSize);
		file[groupSize] = 0x01;
		serveFile(file);
		const {received, firstBatch} = open();
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['fine']);
	});

	test('leaves lines past the lookahead for later', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'now'}, {time: 600000, text: 'later'}]}));
		const {received, firstBatch} = open();
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['now']);
	});

	test('starts at the line on screen after a seek', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'start'}, {time: 600000, text: 'on screen'}, {time: 601000, text: 'next'}]}));
		const {received, firstBatch} = open({getTime: () => 600.5});
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['on screen', 'next']);
	});

	test('takes the track at the ordinal among subtitle tracks', async () => {
		serveFile(buildFile({
			subtitleTracks: [[2, 'S_TEXT/UTF8', 'fre'], [3, 'S_TEXT/UTF8', 'eng']],
			lines: [{track: 2, time: 1000, text: 'français'}, {track: 3, time: 1000, text: 'english'}]
		}));
		const {received, firstBatch} = open({subtitleOrdinal: 1, language: 'en'});
		await firstBatch;
		expect(received.map((event) => event.Text)).toEqual(['english']);
	});

	test('refuses a track whose language disagrees with the server', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'x'}]}));
		open({language: 'ger'});
		expect(await source.ready).toBe(false);
	});

	test('refuses a track that is not SRT', async () => {
		serveFile(buildFile({subtitleTracks: [[2, 'S_TEXT/ASS', 'fre']], lines: [{time: 1000, text: 'x'}]}));
		open();
		expect(await source.ready).toBe(false);
	});

	test('refuses a server that ignores range requests', async () => {
		serveFile(buildFile({lines: [{time: 1000, text: 'x'}]}), 200);
		open();
		expect(await source.ready).toBe(false);
	});
});
