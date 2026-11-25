// Trailer and preview volume are stored as 0 to 100, and a missing one plays at full volume.
export const volumeLevel = (value) => {
	const volume = Number(value);
	return Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) / 100 : 1;
};
