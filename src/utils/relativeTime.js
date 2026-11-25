import $L from '../services/i18n.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "Just now", "5m ago", "3h ago" or "2d ago" for a moment already past.
export const relativeTimeLabel = (at, now = Date.now()) => {
	const elapsed = now - at.getTime();
	if (elapsed < MINUTE) return $L('Just now');
	if (elapsed < HOUR) return $L('{count}m ago').replace('{count}', String(Math.floor(elapsed / MINUTE)));
	if (elapsed < DAY) return $L('{count}h ago').replace('{count}', String(Math.floor(elapsed / HOUR)));
	return $L('{count}d ago').replace('{count}', String(Math.floor(elapsed / DAY)));
};
