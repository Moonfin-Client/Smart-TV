import {deepenForLightInk, isValidHexColor, toCssColor} from './themeSpec';

// The parts of the app that can each take an accent color of their own. `key` is the
// setting that holds the pick, and an empty value means the surface keeps whatever the
// active theme says, which is how every surface starts out.
//
// `id` is also the group name scripts/gen-accent-rules.js files a stylesheet under, so
// the two have to stay in step.
export const ACCENT_SURFACES = [
	{id: 'navigation', key: 'accentNavigation', themed: true},
	{id: 'home', key: 'accentHome', themed: true},
	{id: 'settings', key: 'accentSettings', themed: true},
	// The fill of a focused row or button in Settings, which the theme takes from its button color
	// and not its accent, so it is picked apart from the rest of the screen. It owns no stylesheet.
	{id: 'settingsFocus', key: 'accentSettingsFocus', themed: true, swatchFrom: 'buttonFocused'},
	{id: 'achievements', key: 'accentAchievements', themed: true},
	{id: 'details', key: 'accentDetails', themed: true},
	{id: 'player', key: 'accentPlayer', themed: false},
	{id: 'skip', key: 'accentSkip', themed: false},
	{id: 'liveTv', key: 'accentLiveTv', themed: false},
	{id: 'other', key: 'accentOther', themed: false}
];

// The cyan the stylesheets ship with, which is what a surface the theme does not reach keeps
// wearing whatever theme is active.
export const SHIPPED_ACCENT = '#00a4dc';

export const ACCENT_KEYS = ACCENT_SURFACES.map((surface) => surface.key);

// What Apply to All Surfaces writes: every surface's accent, and the outline around whatever is
// selected, which is a color of its own that the picker treats like the rest.
export const ACCENT_ALL_KEYS = [...ACCENT_KEYS, 'focusBorderColor'];

const KEY_OF = ACCENT_SURFACES.reduce((map, surface) => ({...map, [surface.id]: surface.key}), {});

// The color a person picked for a surface, or '' when they never did.
export const pickedAccent = (settings, surfaceId) => {
	const value = settings?.[KEY_OF[surfaceId]];
	return isValidHexColor(value) ? value : '';
};

// Every pick that is actually set, keyed by surface. This is what themeOverrides takes,
// and an empty object is what leaves the app looking exactly as it always did.
export const pickedAccents = (settings) => {
	const picked = {};
	ACCENT_SURFACES.forEach((surface) => {
		const value = pickedAccent(settings, surface.id);
		if (value) picked[surface.id] = value;
	});
	return picked;
};

// A stable signature for effect dependencies, so a change to any pick re-runs it and an
// unrelated settings update does not.
export const accentSignature = (settings) =>
	ACCENT_KEYS.map((key) => (isValidHexColor(settings?.[key]) ? settings[key] : '')).join('|');

// What a surface looks like with nothing picked, for the swatch beside its Default option. A
// surface the theme reaches follows the theme's accent, and any other keeps the shipped cyan.
export const defaultAccentSwatch = (surface, theme) => {
	if (!surface.themed) return SHIPPED_ACCENT;
	// A focused row is filled with the theme's button color, deepened until light text reads on it.
	if (surface.swatchFrom === 'buttonFocused') {
		const fill = theme?.colors?.buttonFocused;
		return fill ? toCssColor(deepenForLightInk(fill)) : undefined;
	}
	const accent = theme?.colors?.accent;
	return accent ? toCssColor(accent) : undefined;
};
