import $L from '../services/i18n.js';

import {formatClockTime, shiftedNow} from './clock';

// The video player fills six time slots, the music player shows one trailing time.
export const PLAYBACK_TIME_SLOTS = ['none', 'elapsed', 'totalDuration', 'timeRemaining', 'endsAt', 'time'];

export const PLAYBACK_TIME_DISPLAYS = ['totalDuration', 'timeRemaining', 'endsAt'];

const pad = (value) => String(value).padStart(2, '0');

const atLeastZero = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);

export const formatPlaybackDuration = (seconds) => {
	const total = Math.floor(atLeastZero(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;

	if (h > 0) {
		return `${h}:${pad(m)}:${pad(s)}`;
	}
	return `${m}:${pad(s)}`;
};

// Wall-clock time playback finishes at, like `Ends at 21:45`. An empty string means
// nothing is left to play, so the caller falls back.
export const formatPlaybackEndsAt = (remainingSeconds, clockDisplay, timeOffsetHours) => {
	// Rounding makes the last half second read as zero, so the label hands over to the
	// total duration instead of promising an end time that's already passed.
	const wallSeconds = Math.round(atLeastZero(remainingSeconds));
	if (wallSeconds <= 0) return '';

	const end = new Date(shiftedNow(timeOffsetHours).getTime() + (wallSeconds * 1000));

	return $L('Ends at {time}').replace('{time}', formatClockTime(end, clockDisplay));
};

// Falls back to the total duration whenever the chosen mode has nothing to work with,
// such as a stream with no known length.
export const formatPlaybackTrailingTime = ({mode, position, duration, clockDisplay, timeOffsetHours}) => {
	switch (mode) {
		case 'timeRemaining':
			if (!(duration > 0)) return formatPlaybackDuration(duration);
			return `-${formatPlaybackDuration(duration - position)}`;
		case 'endsAt': {
			if (!(duration > 0)) return formatPlaybackDuration(duration);
			const label = formatPlaybackEndsAt(duration - position, clockDisplay, timeOffsetHours);
			return label || formatPlaybackDuration(duration);
		}
		default:
			return formatPlaybackDuration(duration);
	}
};

// An empty string means the slot is hidden.
export const formatPlaybackTimeSlot = ({slot, position, duration, clockDisplay, timeOffsetHours}) => {
	switch (slot) {
		case 'elapsed':
			return formatPlaybackDuration(position);
		case 'totalDuration':
			return formatPlaybackDuration(duration);
		case 'timeRemaining':
		case 'endsAt':
			return formatPlaybackTrailingTime({mode: slot, position, duration, clockDisplay, timeOffsetHours});
		case 'time':
			return formatClockTime(shiftedNow(timeOffsetHours), clockDisplay);
		default:
			return '';
	}
};
