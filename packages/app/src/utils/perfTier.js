export const computePerfTier = (ua) => {
	const match = (ua || '').match(/Chrome\/(\d+)/);
	if (!match) return 'low';
	const major = parseInt(match[1], 10);
	if (!(major >= 56)) return 'low';
	if (major < 85) return 'mid';
	return 'high';
};

let detectedTier = null;
let overrideTier = null;

export const getDetectedPerfTier = () => {
	if (detectedTier === null) {
		detectedTier = computePerfTier(typeof navigator !== 'undefined' ? navigator.userAgent : '');
	}
	return detectedTier;
};

export const getPerfTier = () => overrideTier || getDetectedPerfTier();

export const applyPerfTier = (mode) => {
	overrideTier = (mode === 'low' || mode === 'mid' || mode === 'high') ? mode : null;
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const classes = [];
	const existing = root.className.split(/\s+/);
	for (let i = 0; i < existing.length; i++) {
		if (existing[i] && existing[i].indexOf('perf-') !== 0) classes.push(existing[i]);
	}
	classes.push('perf-' + getPerfTier());
	root.className = classes.join(' ');
};
