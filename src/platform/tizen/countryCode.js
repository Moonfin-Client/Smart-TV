/* global tizen */

// The set's locale as ll_RR, so the region is what follows the underscore.
export const getCountryCode = () => new Promise((resolve) => {
	try {
		if (typeof tizen === 'undefined' || !tizen.systeminfo) {
			resolve(null);
			return;
		}
		tizen.systeminfo.getPropertyValue('LOCALE', (locale) => {
			const match = /[_-]([A-Za-z]{2})$/.exec(locale?.country || locale?.language || '');
			resolve(match ? match[1] : null);
		}, () => resolve(null));
	} catch {
		resolve(null);
	}
});
