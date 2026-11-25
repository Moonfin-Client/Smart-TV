// The seasonal Home row follows the viewer's country. Moonbase decides the holiday, these are
// the names it uses and the settings the clients share with it.

export const SEASONAL_HOLIDAYS = ['newYear', 'valentines', 'easter', 'pride', 'halloween', 'thanksgiving', 'christmas', 'lunarNewYear', 'diwali'];

// Only the countries Moonbase tells apart, plus Other for everyone else.
export const SEASONAL_COUNTRY_OPTIONS = ['auto', 'US', 'CA', 'other'];

// Moonbase reads this as "no country, and don't fall back to the server's".
const COUNTRY_OTHER_PARAM = 'ZZ';

export const twoLetterCountry = (value) => {
	const trimmed = String(value || '').trim();
	return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : null;
};

export const normalizeSeasonalRowCountry = (value) => {
	const lower = String(value || '').trim().toLowerCase();
	if (lower === 'auto' || lower === 'other') return lower;
	return twoLetterCountry(value) || undefined;
};

export const normalizeSeasonalHiddenHolidays = (value) =>
	(Array.isArray(value) ? value.filter((id) => SEASONAL_HOLIDAYS.includes(id)) : undefined);

export const seasonalCountryParam = (setting, deviceCountry) => {
	const normalized = String(setting || 'auto').trim().toLowerCase();
	if (normalized === 'other') return COUNTRY_OTHER_PARAM;
	return twoLetterCountry(normalized === 'auto' ? deviceCountry : setting);
};
