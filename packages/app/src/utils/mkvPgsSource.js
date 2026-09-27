/**
 * In-band PGS source for Matroska.
 *
 * webOS hands the container to the Starfish video pipeline and exposes only audio and
 * video track lists, so an embedded PGS track is invisible to the page and the client
 * cannot select it. The work around that used to be a server side extraction of the
 * whole file into a sidecar .sup, which on a large remux costs a full read of the source
 * before the first subtitle can appear.
 *
 * This module takes the subtitle out of the file the player is already streaming: the
 * Matroska cue index gives the byte offset of every PGS access unit, so the access units
 * around the playhead are reachable with a couple of small HTTP range requests, and each
 * one is repackaged into the .sup framing libpgs already parses. The result is the same
 * byte stream the server produced, only produced near the playhead and never written to
 * disk.
 */

import {unzlibSync} from 'fflate';

const ID = {
	Segment: 0x18538067,
	SeekHead: 0x114d9b74,
	Seek: 0x4dbb,
	SeekID: 0x53ab,
	SeekPosition: 0x53ac,
	Info: 0x1549a966,
	TimestampScale: 0x2ad7b1,
	Tracks: 0x1654ae6b,
	TrackEntry: 0xae,
	TrackNumber: 0xd7,
	TrackType: 0x83,
	CodecID: 0x86,
	ContentEncodings: 0x6d80,
	ContentEncoding: 0x6240,
	ContentEncodingScope: 0x5032,
	ContentEncodingType: 0x5033,
	ContentCompression: 0x5034,
	ContentCompAlgo: 0x4254,
	ContentCompSettings: 0x4255,
	Cues: 0x1c53bb6b,
	CuePoint: 0xbb,
	CueTime: 0xb3,
	CueTrackPositions: 0xb7,
	CueTrack: 0xf7,
	CueClusterPosition: 0xf1,
	CueRelativePosition: 0xf0,
	Cluster: 0x1f43b675,
	BlockGroup: 0xa0,
	Block: 0xa1,
	SimpleBlock: 0xa3
};

const PGS_CODEC_ID = 'S_HDMV/PGS';
const PGS_END_SEGMENT = 0x80;
// Palette, object, presentation composition, window and end of display set.
const PGS_SEGMENT_TYPES = [0x14, 0x15, 0x16, 0x17, PGS_END_SEGMENT];
const SUBTITLE_TRACK_TYPE = 17;
const SUP_FRAME_HEADER_BYTES = 10;
const SUP_PTS_UNITS_PER_MS = 90;
const HEAD_BYTES = 64 * 1024;
const BLOCK_PROBE_BYTES = 64;
const MAX_CUES_PER_BATCH = 64;
const READ_CONCURRENCY = 4;
const POLL_INTERVAL_MS = 100;
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
// How far the cursor can fall behind the playhead before it counts as a seek forward.
const FORWARD_JUMP_MS = 5000;
const RESTART_TOLERANCE_MS = 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readVint = (bytes, offset, stripMarker) => {
	const first = bytes[offset];
	if (first === undefined) return null;
	let length = 1;
	let mask = 0x80;
	while (length <= 8 && !(first & mask)) {
		mask >>= 1;
		length++;
	}
	if (length > 8) return null;
	let value = stripMarker ? first & (mask - 1) : first;
	for (let i = 1; i < length; i++) {
		if (bytes[offset + i] === undefined) return null;
		value = value * 256 + bytes[offset + i];
	}
	return {value, length, unknown: stripMarker ? value === (2 ** (7 * length) - 1) : false};
};

const readElementHeader = (bytes, offset) => {
	const id = readVint(bytes, offset, false);
	if (!id) return null;
	const size = readVint(bytes, offset + id.length, true);
	if (!size) return null;
	return {
		id: id.value,
		headerLength: id.length + size.length,
		size: size.value,
		unknownSize: size.unknown
	};
};

const readUint = (bytes, offset, length) => {
	let value = 0;
	for (let i = 0; i < length; i++) value = value * 256 + bytes[offset + i];
	return value;
};

const readString = (bytes, offset, length) => {
	let out = '';
	for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
	return out.replace(/\0+$/, '');
};

/**
 * Walk the children of a master element. An element whose body runs past `end` is still
 * handed to `visit`, because the top level Segment always does, but the walk stops there.
 */
const forEachChild = (bytes, start, end, visit) => {
	let offset = start;
	while (offset < end) {
		const header = readElementHeader(bytes, offset);
		if (!header) return;
		visit(header, offset + header.headerLength);
		if (header.unknownSize) return;
		if (offset + header.headerLength + header.size > end) return;
		offset += header.headerLength + header.size;
	}
};

/**
 * Parse a Tracks element into `{number, type, codec, compressionAlgorithm, compressionSettings,
 * unsupportedEncoding}` entries. The compression fields are only set when the compression applies to frames.
 */
export const parseTracks = (bytes, start, size) => {
	const tracks = [];
	forEachChild(bytes, start, start + size, (header, bodyStart) => {
		if (header.id !== ID.TrackEntry) return;
		const track = {
			number: 0,
			type: 0,
			codec: '',
			compressionAlgorithm: null,
			compressionSettings: null,
			unsupportedEncoding: false
		};
		let encodingCount = 0;
		forEachChild(bytes, bodyStart, bodyStart + header.size, (child, childBody) => {
			switch (child.id) {
				case ID.TrackNumber:
					track.number = readUint(bytes, childBody, child.size);
					break;
				case ID.TrackType:
					track.type = readUint(bytes, childBody, child.size);
					break;
				case ID.CodecID:
					track.codec = readString(bytes, childBody, child.size);
					break;
				case ID.ContentEncodings:
					forEachChild(bytes, childBody, childBody + child.size, (encoding, encodingBody) => {
						if (encoding.id !== ID.ContentEncoding) return;
						encodingCount++;
						// Spec defaults: a compression, applied to every frame, zlib unless ContentCompAlgo
						// says otherwise. Header stripping carries the removed prefix in ContentCompSettings.
						let type = 0;
						let scope = 1;
						let algorithm = null;
						let settings = null;
						forEachChild(bytes, encodingBody, encodingBody + encoding.size, (field, fieldBody) => {
							if (field.id === ID.ContentEncodingType) {
								type = readUint(bytes, fieldBody, field.size);
							} else if (field.id === ID.ContentEncodingScope) {
								scope = readUint(bytes, fieldBody, field.size);
							} else if (field.id === ID.ContentCompression) {
								algorithm = 0;
								forEachChild(bytes, fieldBody, fieldBody + field.size, (compression, compressionBody) => {
									if (compression.id === ID.ContentCompAlgo) {
										algorithm = readUint(bytes, compressionBody, compression.size);
									} else if (compression.id === ID.ContentCompSettings) {
										settings = bytes.slice(compressionBody, compressionBody + compression.size);
									}
								});
							}
						});
						// Encryption, or a compression entry missing its ContentCompression, can't be undone here.
						if (type !== 0 || algorithm === null) {
							track.unsupportedEncoding = true;
						} else if (scope & 1) {
							track.compressionAlgorithm = algorithm;
							track.compressionSettings = settings;
						}
					});
					// Chained encodings have to be undone in order, which this doesn't do.
					if (encodingCount > 1) track.unsupportedEncoding = true;
					break;
				default:
					break;
			}
		});
		tracks.push(track);
	});
	return tracks;
};

/** Parse a Cues element into sorted cue points, optionally filtered to one track. */
export const parseCues = (bytes, start, size, trackNumber = null) => {
	const cues = [];
	forEachChild(bytes, start, start + size, (header, bodyStart) => {
		if (header.id !== ID.CuePoint) return;
		let time = 0;
		const positions = [];
		forEachChild(bytes, bodyStart, bodyStart + header.size, (child, childBody) => {
			if (child.id === ID.CueTime) {
				time = readUint(bytes, childBody, child.size);
			} else if (child.id === ID.CueTrackPositions) {
				let track = 0;
				let clusterPosition = 0;
				// Optional in the spec. Left null when missing, since zero is a real position.
				let relativePosition = null;
				forEachChild(bytes, childBody, childBody + child.size, (field, fieldBody) => {
					if (field.id === ID.CueTrack) track = readUint(bytes, fieldBody, field.size);
					else if (field.id === ID.CueClusterPosition) clusterPosition = readUint(bytes, fieldBody, field.size);
					else if (field.id === ID.CueRelativePosition) relativePosition = readUint(bytes, fieldBody, field.size);
				});
				positions.push({track, clusterPosition, relativePosition});
			}
		});
		for (const position of positions) {
			// A cue point whose positions element was cut short by the buffer reads back
			// as track zero, which is not a track number any file can hold.
			if (position.track > 0 && (trackNumber === null || position.track === trackNumber)) {
				cues.push({time, clusterPosition: position.clusterPosition, relativePosition: position.relativePosition});
			}
		}
	});
	cues.sort((a, b) => a.time - b.time);
	return cues;
};

/** Parse the file header: segment data offset, timestamp scale, tracks and cue position. */
export const parseHeader = (bytes) => {
	const header = {segmentDataOffset: 0, timestampScale: 1000000, tracks: [], cuesOffset: null};
	forEachChild(bytes, 0, bytes.length, (element, bodyStart) => {
		if (element.id !== ID.Segment || element.unknownSize) return;
		header.segmentDataOffset = bodyStart;
		const segmentEnd = bodyStart + element.size;
		forEachChild(bytes, bodyStart, Math.min(segmentEnd, bytes.length), (child, childBody) => {
			if (child.id === ID.SeekHead) {
				forEachChild(bytes, childBody, childBody + child.size, (seek, seekBody) => {
					if (seek.id !== ID.Seek) return;
					let seekId = 0;
					let seekPosition = null;
					forEachChild(bytes, seekBody, seekBody + seek.size, (field, fieldBody) => {
						if (field.id === ID.SeekID) seekId = readUint(bytes, fieldBody, field.size);
						else if (field.id === ID.SeekPosition) seekPosition = readUint(bytes, fieldBody, field.size);
					});
					if (seekId === ID.Cues && seekPosition !== null) header.cuesOffset = seekPosition;
				});
			} else if (child.id === ID.Info) {
				forEachChild(bytes, childBody, childBody + child.size, (field, fieldBody) => {
					if (field.id === ID.TimestampScale) header.timestampScale = readUint(bytes, fieldBody, field.size);
				});
			} else if (child.id === ID.Tracks) {
				header.tracks = parseTracks(bytes, childBody, child.size);
			}
		});
	});
	return header;
};

/**
 * Wrap one PGS segment in a .sup frame: a ten byte header, "PG" then the 90kHz
 * presentation and decode timestamps, followed by the segment verbatim. This is the
 * framing ffmpeg writes, so the stream is interchangeable with an extracted .sup.
 */
export const supFrame = (ptsMs, segment) => {
	const frame = new Uint8Array(SUP_FRAME_HEADER_BYTES + segment.length);
	frame[0] = 0x50;
	frame[1] = 0x47;
	const pts = Math.round(ptsMs * SUP_PTS_UNITS_PER_MS) >>> 0;
	frame[2] = (pts >>> 24) & 0xff;
	frame[3] = (pts >>> 16) & 0xff;
	frame[4] = (pts >>> 8) & 0xff;
	frame[5] = pts & 0xff;
	frame[6] = frame[2];
	frame[7] = frame[3];
	frame[8] = frame[4];
	frame[9] = frame[5];
	frame.set(segment, SUP_FRAME_HEADER_BYTES);
	return frame;
};

/** Repackage one decompressed PGS access unit into .sup frames. */
export const accessUnitToSup = (ptsMs, payload) => {
	const frames = [];
	let offset = 0;
	while (offset + 3 <= payload.length) {
		const length = (payload[offset + 1] << 8) | payload[offset + 2];
		if (offset + 3 + length > payload.length) break;
		frames.push(supFrame(ptsMs, payload.subarray(offset, offset + 3 + length)));
		offset += 3 + length;
	}
	return frames;
};

const concat = (chunks) => {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
};

// Keep inflate local and synchronous so the libpgs stream can be fed on every webOS
// generation we support. The input here is the exact Matroska block payload.
const inflate = (bytes) => unzlibSync(bytes);

/**
 * Create a source of .sup bytes for one embedded PGS track of a Matroska file.
 *
 * `subtitleOrdinal` is the position of the wanted track among the container's subtitle
 * tracks, which is how a Jellyfin subtitle stream maps onto a Matroska track number.
 * `getTime` and `startTime` are the time libpgs draws at, in seconds, which is the video
 * time plus its offset. The source reads one access unit before it reports ready, so a
 * track that isn't PGS or a layout this reader gets wrong shows up as a fallback rather
 * than as missing or garbage subtitles.
 */
export const createInBandPgsSource = ({streamUrl, subtitleOrdinal, getTime, startTime = 0, lookaheadSeconds = 15}) => {
	if (!streamUrl || typeof subtitleOrdinal !== 'number' || subtitleOrdinal < 0) return null;

	let header = null;
	let trackNumber = 0;
	let timestampScale = 1;
	let cues = [];
	let nextCue = 0;
	// Where the data handed to libpgs starts. It can't take anything earlier once it has later.
	let servedFromMs = 0;
	let disposed = false;
	let compressionAlgorithm = null;
	let compressionSettings = null;
	const clusterDataOffsets = new Map();

	const cueMs = (index) => cues[index].time * timestampScale;

	// An answer that isn't read keeps downloading, and a 200 here is the whole file.
	const discard = (response) => {
		if (response.body) response.body.cancel().catch(() => {});
	};

	const fetchRange = async (start, end) => {
		for (let attempt = 1; ; attempt++) {
			let response;
			try {
				response = await fetch(streamUrl, {headers: {Range: `bytes=${start}-${end}`}});
			} catch (err) {
				if (attempt >= FETCH_ATTEMPTS || disposed) throw err;
				await delay(RETRY_DELAY_MS);
				continue;
			}
			if (response.status === 206) return new Uint8Array(await response.arrayBuffer());
			discard(response);
			if (response.status >= 500 && attempt < FETCH_ATTEMPTS && !disposed) {
				await delay(RETRY_DELAY_MS);
				continue;
			}
			// A server that ignores Range answers 200 with the whole file, which would make
			// every offset below wrong, so treat that as a hard failure.
			throw new Error(`range request not honoured: ${response.status}`);
		}
	};

	const readCues = async (offset) => {
		const start = header.segmentDataOffset + offset;
		let bytes = await fetchRange(start, start + HEAD_BYTES - 1);
		const headerOfCues = readElementHeader(bytes, 0);
		if (!headerOfCues || headerOfCues.id !== ID.Cues) return [];
		const end = headerOfCues.headerLength + headerOfCues.size;
		if (end > bytes.length) {
			const tail = await fetchRange(start + bytes.length, start + end - 1);
			bytes = concat([bytes, tail]);
		}
		return parseCues(bytes, headerOfCues.headerLength, headerOfCues.size, trackNumber);
	};

	const clusterDataOffset = async (clusterPosition) => {
		const cached = clusterDataOffsets.get(clusterPosition);
		if (cached !== undefined) return cached;
		const clusterStart = header.segmentDataOffset + clusterPosition;
		const clusterHeader = readElementHeader(await fetchRange(clusterStart, clusterStart + 15), 0);
		if (!clusterHeader || clusterHeader.id !== ID.Cluster) throw new Error(`no cluster at ${clusterStart}`);
		const value = clusterStart + clusterHeader.headerLength;
		clusterDataOffsets.set(clusterPosition, value);
		return value;
	};

	const readAccessUnit = async (cue) => {
		const blockStart = await clusterDataOffset(cue.clusterPosition) + cue.relativePosition;
		const probe = await fetchRange(blockStart, blockStart + BLOCK_PROBE_BYTES - 1);
		const element = readElementHeader(probe, 0);

		// FFmpeg's muxer, which HandBrake uses, keeps a subtitle that has a duration in a
		// BlockGroup, and the Block inside it has the same body as a SimpleBlock.
		let bodyStart = null;
		let bodyEnd = null;
		if (element?.id === ID.SimpleBlock) {
			bodyStart = element.headerLength;
			bodyEnd = element.headerLength + element.size;
		} else if (element?.id === ID.BlockGroup) {
			forEachChild(probe, element.headerLength, element.headerLength + element.size, (child, childBody) => {
				if (child.id !== ID.Block || bodyStart !== null) return;
				bodyStart = childBody;
				bodyEnd = childBody + child.size;
			});
		}
		if (bodyStart === null) throw new Error(`no subtitle block at ${blockStart}`);
		const trackVint = readVint(probe, bodyStart, true);
		if (!trackVint || trackVint.value !== trackNumber) throw new Error(`wrong track at ${blockStart}`);

		// The body is the track number, a signed 16 bit timecode, one flags byte, then the payload.
		const flagsOffset = bodyStart + trackVint.length + 2;
		const dataOffset = flagsOffset + 1;
		if (dataOffset > bodyEnd) throw new Error(`short subtitle block at ${blockStart}`);

		// PGS access units aren't laced, so a laced block is refused rather than read as corrupt subtitle bytes.
		const flags = probe[flagsOffset];
		if (flags === undefined) throw new Error(`short subtitle block header at ${blockStart}`);
		if (flags & 0x06) throw new Error(`laced subtitle block unsupported at ${blockStart}`);

		let bytes;
		if (bodyEnd <= probe.length) {
			bytes = probe.subarray(dataOffset, bodyEnd);
		} else {
			// The probe already contains the first part of the payload. Fetch only the
			// tail rather than requesting the same bytes a second time.
			const tail = await fetchRange(blockStart + probe.length, blockStart + bodyEnd - 1);
			bytes = concat([probe, tail]).subarray(dataOffset, bodyEnd);
		}
		return {timeMs: cue.time * timestampScale, bytes};
	};

	const toSupFrames = (unit) => {
		let payload = unit.bytes;
		if (compressionAlgorithm === 0) {
			payload = inflate(payload);
		} else if (compressionAlgorithm === 3 && compressionSettings?.length) {
			payload = concat([compressionSettings, payload]);
		}
		if (!PGS_SEGMENT_TYPES.includes(payload[0])) throw new Error('not a PGS access unit');
		return accessUnitToSup(unit.timeMs, payload);
	};

	const prepare = async () => {
		header = parseHeader(await fetchRange(0, HEAD_BYTES - 1));
		if (!header.tracks.length || header.cuesOffset === null) return false;
		const subtitleTracks = header.tracks.filter((entry) => entry.type === SUBTITLE_TRACK_TYPE);
		const track = subtitleTracks[subtitleOrdinal];
		if (!track || track.codec !== PGS_CODEC_ID || track.unsupportedEncoding) return false;
		// zlib and header stripping are both cheap to undo here. bzip2/lzo are rare
		// and deliberately fall back to Jellyfin's extractor instead.
		if (track.compressionAlgorithm !== null && track.compressionAlgorithm !== 0 && track.compressionAlgorithm !== 3) return false;
		trackNumber = track.number;
		compressionAlgorithm = track.compressionAlgorithm;
		compressionSettings = track.compressionSettings;
		timestampScale = header.timestampScale / 1000000;
		cues = await readCues(header.cuesOffset);
		// A cue with no relative position names only the cluster, not where the block sits in it.
		if (!cues.length || cues.some((cue) => cue.relativePosition === null)) return false;
		// Read one access unit up front, so a layout this reader gets wrong falls back before anything shows.
		// mkvmerge and FFmpeg put a whole display set in each block, so it has to end with the end segment.
		const frames = toSupFrames(await readAccessUnit(cues[0]));
		return frames.length > 0 && frames[frames.length - 1][SUP_FRAME_HEADER_BYTES] === PGS_END_SEGMENT;
	};

	const readBatch = async (targetMs, nowMs) => {
		const batch = [];
		while (nextCue < cues.length && batch.length < MAX_CUES_PER_BATCH && cueMs(nextCue) <= targetMs) {
			batch.push(cues[nextCue++]);
		}
		// libpgs only draws a display set once a later one is loaded, so one always sits past the playhead.
		if (nextCue < cues.length && nextCue > 0 && cueMs(nextCue - 1) <= nowMs) batch.push(cues[nextCue++]);
		if (!batch.length) return null;
		const frames = [];
		for (let i = 0; i < batch.length; i += READ_CONCURRENCY) {
			const reads = batch.slice(i, i + READ_CONCURRENCY).map((cue) => readAccessUnit(cue).then(toSupFrames).catch((err) => {
				// Skipping one subtitle beats erroring the stream, which stops libpgs for the rest of playback.
				console.warn('[PgsRenderer] Skipped an in-band subtitle:', err);
				return [];
			}));
			for (const unitFrames of await Promise.all(reads)) frames.push(...unitFrames);
		}
		return concat(frames);
	};

	// Put the cursor on the last cue at or before `targetMs`, which is the subtitle on screen there.
	const arm = (targetMs) => {
		let index = 0;
		while (index < cues.length && cueMs(index) <= targetMs) index++;
		nextCue = Math.max(0, index - 1);
		servedFromMs = cues.length ? Math.min(cueMs(nextCue), targetMs) : targetMs;
	};

	const ready = prepare().then((ok) => {
		if (ok) arm(Math.max(0, startTime || 0) * 1000);
		return ok;
	});
	// A pull that never runs would otherwise leave this rejection unhandled.
	ready.catch(() => {});

	// libpgs pulls from this stream as fast as it parses, so the loop is paced by the
	// playhead: hand over everything up to just past the current position, then wait for
	// the position to move on. Waiting inside the pull is what keeps the whole subtitle
	// track from being read up front, which is the cost this path exists to avoid.
	const pullOnce = async (controller) => {
		if (!(await ready)) {
			controller.close();
			return;
		}
		for (;;) {
			if (disposed) {
				controller.close();
				return;
			}
			const time = getTime();
			const nowMs = (Number.isFinite(time) ? time : 0) * 1000;
			// After a seek forward, everything between the cursor and the playhead is already over.
			if (nextCue < cues.length && cueMs(nextCue) < nowMs - FORWARD_JUMP_MS) arm(nowMs);
			const bytes = await readBatch(nowMs + lookaheadSeconds * 1000, nowMs);
			if (disposed) {
				controller.close();
				return;
			}
			if (bytes?.length) {
				controller.enqueue(bytes);
				return;
			}
			if (nextCue >= cues.length) {
				controller.close();
				return;
			}
			if (!bytes) await delay(POLL_INTERVAL_MS);
		}
	};

	const readable = new ReadableStream({
		pull(controller) {
			return pullOnce(controller);
		},
		cancel() {
			disposed = true;
		}
	});

	return {
		readable,
		ready,
		/** True when the time moved back before the data libpgs holds, which only a new renderer can fix. */
		needsRestart(timeSeconds) {
			return timeSeconds * 1000 < servedFromMs - RESTART_TOLERANCE_MS;
		},
		dispose() {
			disposed = true;
			clusterDataOffsets.clear();
			cues = [];
		}
	};
};
