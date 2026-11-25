import * as settings from '../state/settings.js';

const computePerfTier = (ua) => {
	const match = (ua || '').match(/Chrome\/(\d+)/);
	if (!match) return 'low';
	const major = parseInt(match[1], 10);
	if (!(major >= 56)) return 'low';
	if (major < 85) return 'mid';
	return 'high';
};

let detectedTier = null;

const getDetectedPerfTier = () => {
	if (detectedTier === null) {
		detectedTier = computePerfTier(typeof navigator !== 'undefined' ? navigator.userAgent : '');
	}
	return detectedTier;
};

// The Performance Mode setting wins when it names a tier.
export const getPerfTier = () => {
	const mode = settings.get('performanceMode');
	return mode === 'low' || mode === 'mid' || mode === 'high' ? mode : getDetectedPerfTier();
};

// Whether the engine can run an animation on the compositor, so a slide doesn't cost the main thread its frames.
const canSlide = () => typeof window !== 'undefined' && typeof window.Element?.prototype.animate === 'function';

// Someone's own choice wins. Otherwise the High tier glides rows, and the tiers below slide them wherever
// the engine can, since a glide drawn by script on a TV that rasters in software costs more frames than it saves.
export const smoothScrollingFor = (choice) => (typeof choice === 'boolean' ? choice : getPerfTier() === 'high' || canSlide());
