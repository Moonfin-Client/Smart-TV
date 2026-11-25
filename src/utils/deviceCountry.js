import {resolvePlatformModule} from '../services/platformModule';
import {twoLetterCountry} from './seasonalRow';

// The browser's language tag is the fallback every platform has, as in en-US.
const countryFromLanguage = () => {
	const match = /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(navigator.language || '');
	return match ? match[1].toUpperCase() : null;
};

let deviceCountry;

// The TV's own country first, since the menu language is often left on en-US abroad.
export const resolveDeviceCountry = async () => {
	if (deviceCountry !== undefined) return deviceCountry;
	const fromPlatform = await resolvePlatformModule('countryCode')
		.then((countryCode) => countryCode.getCountryCode())
		.then(twoLetterCountry)
		.catch(() => null);
	deviceCountry = fromPlatform || countryFromLanguage();
	return deviceCountry;
};
