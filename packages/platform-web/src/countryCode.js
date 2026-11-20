// The region of the browser's language, as in US for en-US, is the best a page can do.
export const getCountryCode = async () => {
	const match = /-([A-Za-z]{2})\b/.exec(navigator.language || '');
	return match ? match[1].toUpperCase() : null;
};
