// The seasonal effects and densities, under the names the other Moonfin clients and the plugin use.
const SEASONAL_EFFECTS = [
	'none', 'snow', 'fireworks', 'confetti', 'leaves', 'christmas', 'petals', 'fireflies', 'halloween',
	'valentines', 'easter', 'pride', 'lunar', 'diwali'
];
export const SEASONAL_DENSITIES = ['light', 'normal', 'heavy'];

// The original Android TV client and older builds of this app sync these names.
const LEGACY_EFFECTS = {
	winter: 'snow',
	fall: 'leaves',
	spring: 'petals',
	summer: 'fireflies'
};

// Undefined for a value this app doesn't know, so a sync leaves the local choice alone.
export const normalizeSeasonalTheme = (value) => {
	if (typeof value !== 'string') return undefined;
	const key = value.trim().toLowerCase();
	if (SEASONAL_EFFECTS.includes(key)) return key;
	return LEGACY_EFFECTS[key];
};

export const normalizeSeasonalDensity = (value) =>
	(SEASONAL_DENSITIES.includes(value) ? value : 'normal');
