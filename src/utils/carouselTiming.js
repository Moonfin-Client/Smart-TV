// How long a hero banner waits before moving on, in milliseconds, or 0 with auto advance off.
// The interval preference is in seconds. The older carouselSpeed it falls back to was already
// in milliseconds, and it's kept for anyone who never set the newer one.
//
// The three preferences come in one at a time rather than as the settings object, so callers
// track exactly what they read and don't restart their timer when an unrelated setting changes.
export const carouselIntervalMs = (autoAdvance, autoAdvanceInterval, carouselSpeed) => {
	if (autoAdvance === false) return 0;
	const configured = Number(autoAdvanceInterval);
	return Number.isFinite(configured) && configured > 0
		? configured * 1000
		: (carouselSpeed || 8000);
};
