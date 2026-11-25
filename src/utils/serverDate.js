// A date the server sent, or null when there isn't one. Jellyfin and Emby send .NET's minimum
// date (year 1) for a date they don't have, so that counts as missing too. It's checked before
// any conversion, since local time west of UTC would put it in year 0.
export const parseServerDate = (value) => {
	if (!value || (typeof value !== 'string' && !(value instanceof Date))) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return null;
	return date;
};
