/**
 * In-band SRT subtitles for Matroska.
 *
 * webOS gives the page no subtitle track of the file it plays, and a server that can't
 * extract tracks has no Stream.js to answer with. Like the in-band PGS source, this reads
 * the cue index at the end of the file, then fetches only the subtitle blocks around the
 * playhead with range requests and hands them over as Jellyfin style track events.
 */

import {ID, forEachChild, parseCues, parseHeader, readElementHeader, readUint, readVint} from './mkvPgsSource';
import {normalizeLanguageCode} from './audioLanguage';

const TEXT_CODEC_ID = 'S_TEXT/UTF8';
const SUBTITLE_TRACK_TYPE = 17;
const HEAD_BYTES = 64 * 1024;
// An SRT block group is a few hundred bytes, so one request almost always holds all of it.
const BLOCK_PROBE_BYTES = 1024;
const LOOKAHEAD_MS = 30000;
const POLL_INTERVAL_MS = 500;
const READ_CONCURRENCY = 4;
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 10000;
// Far above anything real (the biggest cue index seen was 1.7 MB), so only a corrupt size trips them.
const MAX_CUES_BYTES = 16 * 1024 * 1024;
const MAX_BLOCK_BYTES = 64 * 1024;
// Only a SimpleBlock lacks a duration, and SRT muxers write a BlockGroup with one.
const DEFAULT_DURATION_MS = 3000;
const TICKS_PER_MS = 10000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const concat = (first, second) => {
	const out = new Uint8Array(first.length + second.length);
	out.set(first, 0);
	out.set(second, first.length);
	return out;
};

/**
 * Read one embedded SRT track of a Matroska file near the playhead.
 *
 * `subtitleOrdinal` is the track's position among the file's subtitle tracks, the same
 * mapping the PGS source uses. `ready` resolves false when the track can't be read this
 * way, so the caller can fall back to asking the server for it.
 */
export const createInBandTextSource = ({streamUrl, subtitleOrdinal, language, getTime, onEvents, fetchTimeoutMs = FETCH_TIMEOUT_MS}) => {
	let disposed = false;
	let header = null;
	let trackNumber = 0;
	let msPerUnit = 1;
	let cues = [];
	const loaded = new Set();
	const clusterDataOffsets = new Map();
	const decoder = new TextDecoder('utf-8');

	const requestRange = async (start, end, signal) => {
		const response = await fetch(streamUrl, {headers: {Range: `bytes=${start}-${end}`}, signal});
		if (response.status === 206) return new Uint8Array(await response.arrayBuffer());
		if (response.body) response.body.cancel().catch(() => {});
		// A 200 here is the whole file, which would also make every offset wrong.
		throw Object.assign(new Error(`range request not honoured: ${response.status}`), {status: response.status});
	};

	// One deadline covers the body as well as the headers, since a body that stalls hangs as
	// surely as a server that never answers. Aborting also frees the connection, where the TV can.
	const requestWithDeadline = (start, end) => new Promise((resolve, reject) => {
		const controller = typeof AbortController === 'undefined' ? null : new AbortController();
		const timer = setTimeout(() => {
			if (controller) controller.abort();
			reject(new Error('range request timed out'));
		}, fetchTimeoutMs);
		requestRange(start, end, controller?.signal).then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});

	// Network errors, timeouts and 5xx are retried, and marked transient once retries run out.
	const fetchRange = async (start, end) => {
		for (let attempt = 1; ; attempt++) {
			try {
				return await requestWithDeadline(start, end);
			} catch (err) {
				const transient = !(err.status < 500);
				if (!transient || disposed) throw err;
				if (attempt >= FETCH_ATTEMPTS) throw Object.assign(err, {transient});
			}
			await delay(RETRY_DELAY_MS);
		}
	};

	const readCues = async () => {
		const start = header.segmentDataOffset + header.cuesOffset;
		let bytes = await fetchRange(start, start + HEAD_BYTES - 1);
		const cuesHeader = readElementHeader(bytes, 0);
		if (!cuesHeader || cuesHeader.id !== ID.Cues) return [];
		if (cuesHeader.size > MAX_CUES_BYTES) throw new Error(`cue index too large: ${cuesHeader.size}`);
		const end = cuesHeader.headerLength + cuesHeader.size;
		if (end > bytes.length) bytes = concat(bytes, await fetchRange(start + bytes.length, start + end - 1));
		return parseCues(bytes, cuesHeader.headerLength, cuesHeader.size, trackNumber);
	};

	const clusterDataOffset = async (clusterPosition) => {
		if (clusterDataOffsets.has(clusterPosition)) return clusterDataOffsets.get(clusterPosition);
		const clusterStart = header.segmentDataOffset + clusterPosition;
		const clusterHeader = readElementHeader(await fetchRange(clusterStart, clusterStart + 15), 0);
		if (!clusterHeader || clusterHeader.id !== ID.Cluster) throw new Error(`no cluster at ${clusterStart}`);
		const value = clusterStart + clusterHeader.headerLength;
		clusterDataOffsets.set(clusterPosition, value);
		return value;
	};

	const readEvent = async (cue) => {
		const blockStart = await clusterDataOffset(cue.clusterPosition) + cue.relativePosition;
		let bytes = await fetchRange(blockStart, blockStart + BLOCK_PROBE_BYTES - 1);
		const element = readElementHeader(bytes, 0);
		if (!element || (element.id !== ID.BlockGroup && element.id !== ID.SimpleBlock)) throw new Error(`no subtitle block at ${blockStart}`);
		if (element.size > MAX_BLOCK_BYTES) throw new Error(`subtitle block too large at ${blockStart}`);
		const elementEnd = element.headerLength + element.size;
		if (elementEnd > bytes.length) bytes = concat(bytes, await fetchRange(blockStart + bytes.length, blockStart + elementEnd - 1));

		let bodyStart = element.headerLength;
		let bodyEnd = elementEnd;
		let durationMs = DEFAULT_DURATION_MS;
		if (element.id === ID.BlockGroup) {
			bodyStart = null;
			forEachChild(bytes, element.headerLength, elementEnd, (child, childBody) => {
				if (child.id === ID.Block && bodyStart === null) {
					bodyStart = childBody;
					bodyEnd = childBody + child.size;
				} else if (child.id === ID.BlockDuration) {
					durationMs = readUint(bytes, childBody, child.size) * msPerUnit;
				}
			});
			if (bodyStart === null) throw new Error(`no block in group at ${blockStart}`);
		}

		// The body is the track number, a signed 16 bit timecode, one flags byte, then the text.
		const trackVint = readVint(bytes, bodyStart, true);
		if (!trackVint || trackVint.value !== trackNumber) throw new Error(`wrong track at ${blockStart}`);
		const flagsOffset = bodyStart + trackVint.length + 2;
		if (flagsOffset >= bodyEnd || bytes[flagsOffset] & 0x06) throw new Error(`unreadable subtitle block at ${blockStart}`);

		const startMs = cue.time * msPerUnit;
		return {
			StartPositionTicks: Math.round(startMs * TICKS_PER_MS),
			EndPositionTicks: Math.round((startMs + durationMs) * TICKS_PER_MS),
			Text: decoder.decode(bytes.subarray(flagsOffset + 1, bodyEnd)).trim()
		};
	};

	const prepare = async () => {
		header = parseHeader(await fetchRange(0, HEAD_BYTES - 1));
		if (header.cuesOffset === null) return false;
		const track = header.tracks.filter((entry) => entry.type === SUBTITLE_TRACK_TYPE)[subtitleOrdinal];
		if (!track || track.codec !== TEXT_CODEC_ID || track.compressionAlgorithm !== null || track.unsupportedEncoding) return false;
		// The ordinal is all that ties the server's stream to the file's track, so a language
		// that disagrees means the two orders differ.
		const wanted = normalizeLanguageCode(language);
		const found = normalizeLanguageCode(track.language);
		if (wanted && found && wanted !== found) return false;
		trackNumber = track.number;
		msPerUnit = header.timestampScale / 1000000;
		cues = await readCues();
		return cues.length > 0 && cues.every((cue) => cue.relativePosition !== null);
	};

	// The window starts at the last cue at or before the playhead, which is the line on screen there.
	const unloadedInWindow = (nowMs) => {
		let first = 0;
		while (first + 1 < cues.length && cues[first + 1].time * msPerUnit <= nowMs) first++;
		const picked = [];
		for (let i = first; i < cues.length && cues[i].time * msPerUnit <= nowMs + LOOKAHEAD_MS; i++) {
			if (!loaded.has(i)) picked.push(i);
			if (picked.length === READ_CONCURRENCY) break;
		}
		return picked;
	};

	const run = async () => {
		while (!disposed) {
			const time = getTime();
			const picked = unloadedInWindow((Number.isFinite(time) ? time : 0) * 1000);
			if (!picked.length) {
				await delay(POLL_INTERVAL_MS);
				continue;
			}
			picked.forEach((index) => loaded.add(index));
			let networkFailed = false;
			const events = (await Promise.all(picked.map((index) => readEvent(cues[index]).catch((err) => {
				// A block that can't be read is skipped for good, one the network lost is tried again.
				if (err.transient) {
					loaded.delete(index);
					networkFailed = true;
				} else {
					console.warn('[mkvTextSource] Skipped an in-band subtitle:', err);
				}
				return null;
			})))).filter((event) => event?.Text);
			if (!disposed && events.length) onEvents(events);
			if (networkFailed) await delay(POLL_INTERVAL_MS);
		}
	};

	const ready = prepare().catch((err) => {
		console.warn('[mkvTextSource] Could not open the in-band subtitle track:', err);
		return false;
	});
	ready.then((ok) => {
		if (ok) run();
	});

	return {
		ready,
		dispose() {
			disposed = true;
			cues = [];
			clusterDataOffsets.clear();
		}
	};
};
