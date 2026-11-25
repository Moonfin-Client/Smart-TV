const TICKS_PER_SECOND = 10000000;

// The resume rewind is stored as a string count of seconds, the same shape the
// other clients sync, and only applies when a playback actually resumes.
export const applyResumeRewind = (startTicks, settings) => {
	if (!startTicks || startTicks <= 0) return startTicks;
	const seconds = parseInt(settings?.resumeSubtractDuration, 10) || 0;
	if (seconds <= 0) return startTicks;
	return Math.max(0, startTicks - seconds * TICKS_PER_SECOND);
};

// Skip lengths are stored in milliseconds. The D-pad seek step is a separate TV
// setting in seconds, and stands in when a length was never stored.
export const skipBackSeconds = (settings) => {
	const ms = settings?.skipBackLength;
	if (typeof ms === 'number' && ms > 0) return ms / 1000;
	return settings?.seekStep || 10;
};

export const skipForwardSeconds = (settings) => {
	const ms = settings?.skipForwardLength;
	if (typeof ms === 'number' && ms > 0) return ms / 1000;
	return settings?.seekStep || 10;
};

// The players call the cropping mode fill, while the stored setting keeps the
// name the other clients sync for it.
export const zoomInternalFromSetting = (value) => {
	if (value === 'autoCrop') return 'fill';
	if (value === 'stretch') return 'stretch';
	return 'fit';
};

export const zoomSettingFromInternal = (value) => {
	if (value === 'fill') return 'autoCrop';
	if (value === 'stretch') return 'stretch';
	return 'fit';
};
