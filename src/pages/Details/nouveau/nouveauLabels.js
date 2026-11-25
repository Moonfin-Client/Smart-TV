import $L from '../../../services/i18n.js';

import {videoResolutionLabel} from '../../../utils/helpers';
import {formatPlaybackDuration} from '../../../utils/playbackTimeLabels';

const collectionTypeLabel = (type) => {
	switch (type) {
		case 'Movie': return $L('Movie');
		case 'Series': return $L('TV Show');
		case 'BoxSet': return $L('Collection');
		default: return null;
	}
};

// A chapter's start as a clock reading. formatDuration would say "5m" where this wants "5:00", and
// nothing at all at the very start.
const formatChapterTime = (ticks) => formatPlaybackDuration((Number(ticks) || 0) / 10000000);

// Times come off the server written a few different ways, so they're compared in one form rather
// than as typed. Leading zeros go, and an hour of zero is dropped entirely.
const normalizeTime = (value) => {
	const text = String(value == null ? '' : value).trim();
	const parts = text.split(':');

	if (parts.length === 2 && /^\d+$/.test(parts[0])) {
		return `${Number(parts[0])}:${parts[1]}`;
	}

	if (parts.length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
		const hours = Number(parts[0]);
		const minutes = Number(parts[1]);
		return hours === 0
			? `${minutes}:${parts[2]}`
			: `${hours}:${String(minutes).padStart(2, '0')}:${parts[2]}`;
	}

	return text;
};

// A chapter is shown with its start time on the end. Plenty of them are already named after that
// time, so the name is taken apart first and any piece that only repeats the time is dropped rather
// than printed twice.
export const chapterDisplayName = (rawName, startPositionTicks) => {
	const time = formatChapterTime(startPositionTicks);

	const unique = [];
	String(rawName == null ? '' : rawName)
		.split(/\s*-\s*/)
		.map((part) => part.trim())
		.filter(Boolean)
		.forEach((part) => {
			if (!unique.includes(part)) unique.push(part);
		});

	if (unique.length && normalizeTime(unique[unique.length - 1]) === normalizeTime(time)) {
		unique.pop();
	}

	return unique.length ? `${unique.join(' - ')} - ${time}` : time;
};

// The second line under a card in a collection. A box set can hold films and shows together, and
// the year alone leaves no way to tell one from the other.
export const collectionSubtitle = (item) => {
	const year = item?.ProductionYear || null;
	const type = collectionTypeLabel(item?.Type);

	if (type && year) return `${type} · ${year}`;
	return type || (year ? String(year) : null);
};

// The second line under an extra. Nothing is invented for one the server said little about, so a
// card with neither simply goes without.
export const extraSubtitle = (item) => {
	const year = item?.ProductionYear || null;
	const resolution = videoResolutionLabel(item);

	if (year && resolution) return `${year}  •  ${resolution}`;
	if (year) return String(year);
	return resolution || null;
};
