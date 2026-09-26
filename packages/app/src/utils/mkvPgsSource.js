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
	Language: 0x22b59c,
	ContentEncodings: 0x6d80,
	ContentEncoding: 0x6240,
	ContentCompression: 0x5034,
	Cues: 0x1c53bb6b,
	CuePoint: 0xbb,
	CueTime: 0xb3,
	CueTrackPositions: 0xb7,
	CueTrack: 0xf7,
	CueClusterPosition: 0xf1,
	CueRelativePosition: 0xf0,
	Cluster: 0x1f43b675,
	SimpleBlock: 0xa3
};

const PGS_CODEC_IDS = ['S_HDMV/PGS', 'S_HDRV_PGS'];
const SUBTITLE_TRACK_TYPE = 17;
const ZLIB_HEADER = 0x78;
const SUP_FRAME_HEADER_BYTES = 10;
const SUP_PTS_UNITS_PER_MS = 90;
const HEAD_BYTES = 64 * 1024;
const BLOCK_PROBE_BYTES = 64;
const MAX_CUES_PER_BATCH = 64;
const READ_CONCURRENCY = 4;
const POLL_INTERVAL_MS = 100;

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

/** Parse a Tracks element into `{number, type, codec, language, compressed}` entries. */
export const parseTracks = (bytes, start, size) => {
	const tracks = [];
	forEachChild(bytes, start, start + size, (header, bodyStart) => {
		if (header.id !== ID.TrackEntry) return;
		const track = {number: 0, type: 0, codec: '', language: 'und', compressed: false};
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
				case ID.Language:
					track.language = readString(bytes, childBody, child.size);
					break;
				case ID.ContentEncodings:
					forEachChild(bytes, childBody, childBody + child.size, (encoding, encodingBody) => {
						if (encoding.id !== ID.ContentEncoding) return;
						forEachChild(bytes, encodingBody, encodingBody + encoding.size, (field, fieldBody) => {
							// Algorithm zero is zlib, which is how PGS access units are
							// stored in Matroska.
							if (field.id === ID.ContentCompression) {
								track.compressed = readUint(bytes, fieldBody, field.size) === 0;
							}
						});
					});
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
				let relativePosition = 0;
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

// A compressed PGS access unit carries bytes past the end of its deflate stream, which
// the platform DecompressionStream rejects outright, so the inflate is done here.
const inflate = (bytes) => unzlibSync(bytes);

/**
 * Create a source of .sup bytes for one embedded PGS track of a Matroska file.
 *
 * `subtitleOrdinal` is the position of the wanted track among the container's subtitle
 * tracks, which is how a Jellyfin subtitle stream maps onto a Matroska track number, and
 * `startTime` is where playback begins, which matters when resuming mid file. The source
 * refuses to start unless the track it lands on really is PGS, so a mismatch shows up as a
 * fallback rather than as garbage subtitles.
 */
export const createInBandPgsSource = ({streamUrl, subtitleOrdinal, getTime, startTime = 0, lookaheadSeconds = 15}) => {
	if (!streamUrl || typeof subtitleOrdinal !== 'number' || subtitleOrdinal < 0) return null;

	let header = null;
	let trackNumber = 0;
	let timestampScale = 1;
	let cues = [];
	let nextCue = 0;
	let servedThroughMs = -1;
	let lastServedMs = 0;
	let disposed = false;
	const clusterDataOffsets = new Map();

	const fetchRange = async (start, end) => {
		const response = await fetch(streamUrl, {headers: {Range: `bytes=${start}-${end}`}});
		// A server that ignores Range answers 200 with the whole file, which would make
		// every offset below wrong, so treat that as a hard failure.
		if (response.status !== 206) throw new Error(`range request not honoured: ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	};

	const readCues = async (offset) => {
		const start = header.segmentDataOffset + offset;
		let bytes = await fetchRange(start, start + HEAD_BYTES - 1);
		const headerOfCues = readElementHeader(bytes, 0);
		if (!headerOfCues || headerOfCues.id !== ID.Cues) return [];
		const end = headerOfCues.headerLength + headerOfCues.size;
		if (end > bytes.length) bytes = await fetchRange(start, start + end - 1);
		return parseCues(bytes, headerOfCues.headerLength, headerOfCues.size, trackNumber);
	};

	const prepare = async () => {
		if (header) return true;
		header = parseHeader(await fetchRange(0, HEAD_BYTES - 1));
		if (!header.tracks.length || header.cuesOffset === null) return false;
		const subtitleTracks = header.tracks.filter((entry) => entry.type === SUBTITLE_TRACK_TYPE);
		const track = subtitleTracks[subtitleOrdinal];
		if (!track || !PGS_CODEC_IDS.includes(track.codec)) return false;
		trackNumber = track.number;
		timestampScale = header.timestampScale / 1000000;
		cues = await readCues(header.cuesOffset);
		return cues.length > 0;
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
		const block = readElementHeader(probe, 0);
		if (!block || block.id !== ID.SimpleBlock) throw new Error(`no subtitle block at ${blockStart}`);
		const trackVint = readVint(probe, block.headerLength, true);
		if (!trackVint || trackVint.value !== trackNumber) throw new Error(`wrong track at ${blockStart}`);
		const dataOffset = block.headerLength + trackVint.length + 3;
		const end = dataOffset + block.size;
		const bytes = end <= probe.length
			? probe.subarray(dataOffset, end)
			: (await fetchRange(blockStart, blockStart + end - 1)).subarray(dataOffset, end);
		return {timeMs: cue.time * timestampScale, bytes};
	};

	const readBatch = async (targetMs) => {
		const batch = [];
		while (nextCue < cues.length && batch.length < MAX_CUES_PER_BATCH && cues[nextCue].time * timestampScale <= targetMs) {
			batch.push(cues[nextCue++]);
		}
		if (!batch.length) return null;
		const units = [];
		for (let i = 0; i < batch.length; i += READ_CONCURRENCY) {
			units.push(...await Promise.all(batch.slice(i, i + READ_CONCURRENCY).map((cue) => readAccessUnit(cue))));
		}
		const frames = [];
		for (const unit of units) {
			const payload = unit.bytes[0] === ZLIB_HEADER ? inflate(unit.bytes) : unit.bytes;
			frames.push(...accessUnitToSup(unit.timeMs, payload));
		}
		servedThroughMs = batch[batch.length - 1].time * timestampScale;
		lastServedMs = servedThroughMs;
		return concat(frames);
	};

	/** Drop everything after `timeMs` and re-arm the cue cursor there. */
	const seekTo = (timeMs) => {
		const target = Math.max(0, timeMs);
		nextCue = 0;
		while (nextCue < cues.length && cues[nextCue].time * timestampScale < target) nextCue++;
		servedThroughMs = nextCue < cues.length ? cues[nextCue].time * timestampScale - 1 : Infinity;
		lastServedMs = Math.max(0, target - 1000);
	};

	const ready = prepare().then((ok) => {
		if (ok) seekTo(Math.max(0, startTime || 0) * 1000);
		return ok;
	});
	// A pull that never runs would otherwise leave this rejection unhandled.
	ready.catch(() => {});

	// libpgs pulls from this stream as fast as it parses, so the loop is paced by the
	// playhead: hand over everything up to just past the current position, then wait for
	// the position to move on. Waiting inside the pull is what keeps the whole subtitle
	// track from being read up front, which is the cost this path exists to avoid.
	const pullOnce = async (controller) => {
		await ready;
		if (disposed) {
			controller.close();
			return;
		}
		for (;;) {
			const time = getTime();
			const targetMs = (Number.isFinite(time) ? time : 0) * 1000 + lookaheadSeconds * 1000;
			const bytes = await readBatch(targetMs);
			if (bytes) {
				controller.enqueue(bytes);
				return;
			}
			if (servedThroughMs === Infinity || nextCue >= cues.length) {
				controller.close();
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
		get lastServedTimeMs() {
			return lastServedMs;
		},
		/** True when the playhead moved back behind data that has already been handed over. */
		needsRestart(timeMs) {
			return timeMs * 1000 < lastServedMs - 1000;
		},
		seek: seekTo,
		dispose() {
			disposed = true;
			clusterDataOffsets.clear();
			cues = [];
		}
	};
};
