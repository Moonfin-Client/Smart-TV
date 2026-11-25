// Megabytes until the number would run to four figures, then gigabytes to two places. The Seerr
// screens round differently, so they keep their own formatter in seerrStatus.js.
export const formatFileSize = (bytes) => {
	if (!(bytes > 0)) return null;
	const mb = bytes / (1024 * 1024);
	return mb > 999 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
};
