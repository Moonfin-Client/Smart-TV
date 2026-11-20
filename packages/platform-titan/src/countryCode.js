import {getTitanDeviceInfo} from './deviceInfo';
import {getCountryCode as browserCountry} from '@moonfin/platform-web/countryCode';

// The set's own country where the SDK gives one, as in GB.
export const getCountryCode = async () => {
	const country = (await getTitanDeviceInfo())?.Product?.country;
	return /^[A-Za-z]{2}$/.test(country || '') ? country.toUpperCase() : browserCountry();
};
