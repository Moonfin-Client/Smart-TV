import {lunaRequest} from './deviceProfile';

// The country the set was set up for, as LG's own apps read it. smartServiceCountryCode2 is
// the two letter form, the plain country key is three letters.
export const getCountryCode = async () => {
	const result = await lunaRequest('com.webos.settingsservice', 'getSystemSettings', {
		category: 'option',
		keys: ['smartServiceCountryCode2']
	});
	return result?.settings?.smartServiceCountryCode2 || null;
};
