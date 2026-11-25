import $L from '../../../services/i18n.js';

import {bookExtension} from '../../../utils/books';
import {formatFileSize} from '../../../utils/formatFileSize';
import {languageName} from '../../../utils/languageNames';
import {getBitDepth, getFrameRate, getResolution} from '../../../utils/mediaStreamFacts';

// What the details footer says about the file. It keeps the raw codec and range the server gives
// rather than the friendlier names the player shows.

export const videoLines = (videoStream) => {
	if (!videoStream) return [];

	const lines = [];

	const codec = String(videoStream.Codec || '').toUpperCase() || $L('Unknown Codec');
	lines.push(videoStream.Profile ? `${codec} (${videoStream.Profile})` : codec);

	const resolution = getResolution(videoStream);
	if (resolution) lines.push(resolution);

	const frameRate = getFrameRate(videoStream);
	if (frameRate) lines.push(frameRate);

	const bitDepth = getBitDepth(videoStream);
	if (bitDepth) lines.push(bitDepth);

	const range = videoStream.VideoRange;
	if (range) {
		lines.push(videoStream.VideoRangeType ? `${range} (${videoStream.VideoRangeType})` : range);
	}

	return lines;
};

// Both halves or neither, since one on its own reads as a sentence with a hole in it.
export const fileSizeLine = (mediaSource) => {
	const size = formatFileSize(mediaSource?.Size);
	const container = String(mediaSource?.Container || '').toUpperCase();
	if (!size || !container) return null;

	return $L('Size: {size}  •  Format: {format}')
		.replace('{size}', size)
		.replace('{format}', container);
};

// The name the server holds for the file, falling back to the last part of its path where it only
// gave one of those.
export const fileName = (mediaSource) => {
	const name = String(mediaSource?.Name || '').trim();
	if (name) return name;

	const path = String(mediaSource?.Path || '').trim();
	if (!path) return null;

	return path.split(/[\\/]/).pop() || null;
};

// A book has no media source, so its file is read off the item: the name from its path, or its
// title where the server gave no path, and the format from the file's extension.
export const bookFileName = (item) => {
	const path = String(item?.Path || '').trim();
	return (path && path.split(/[\\/]/).pop()) || item?.Name || null;
};

export const bookFormatLine = (item) => {
	const extension = bookExtension(item);
	return extension ? $L('Format: .{extension}').replace('{extension}', extension) : null;
};

export const trackRows = (streams = [], activeIndex, {includeForced = false} = {}) =>
	streams.map((stream) => {
		const title = stream.DisplayTitle || String(stream.Codec || '').toUpperCase() || $L('Unknown');
		const language = languageName(stream.Language);

		// Forced only means anything on a subtitle, so the audio list isn't asked about it.
		const attributes = [
			stream.IsDefault === true ? $L('Default') : null,
			includeForced && stream.IsForced === true ? $L('Forced') : null
		].filter(Boolean);

		return {
			label: language ? `${title} (${language})` : title,
			detail: attributes.length ? attributes.join(' · ') : null,
			active: stream.Index != null && stream.Index === activeIndex
		};
	});
