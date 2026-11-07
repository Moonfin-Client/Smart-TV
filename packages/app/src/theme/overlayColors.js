// The color the navigation and media bar surfaces paint themselves with. It's
// held as a named key rather than a hex so the setting survives a round trip
// through the server profile. Earlier builds saved a hex instead, so those
// values map back onto the key they were picked from.

const OVERLAY_COLORS = {
	gray: '#6B7280',
	black: '#000000',
	dark_blue: '#1A2332',
	purple: '#4A148C',
	teal: '#00695C',
	navy: '#0D1B2A',
	charcoal: '#36454F',
	brown: '#3E2723',
	dark_red: '#8B0000',
	dark_green: '#0B4F0F',
	slate: '#475569',
	indigo: '#1E3A8A',
	moonfinCyan: '#00A4DC',
	neonPulseMagenta: '#FF2E92'
};

const ALIASES = {
	grey: 'gray',
	darkblue: 'dark_blue',
	darkred: 'dark_red',
	darkgreen: 'dark_green',
	moonfincyan: 'moonfinCyan',
	moonfin_cyan: 'moonfinCyan',
	neonpulsemagenta: 'neonPulseMagenta',
	neon_pulse_magenta: 'neonPulseMagenta',
	'#000000': 'black',
	'#003366': 'dark_blue',
	'#6a0dad': 'purple',
	'#008080': 'teal',
	'#000080': 'navy',
	'#36454f': 'charcoal',
	'#8b4513': 'brown',
	'#8b0000': 'dark_red',
	'#006400': 'dark_green',
	'#708090': 'slate',
	'#4b0082': 'indigo',
	'#00a4dc': 'moonfinCyan',
	'#ff2e92': 'neonPulseMagenta'
};

const owns = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

// Anything unrecognized lands on gray, which is where the setting starts.
export const normalizeOverlayColorKey = (name) => {
	const raw = typeof name === 'string' ? name.trim() : '';
	if (!raw) return 'gray';
	if (owns(OVERLAY_COLORS, raw)) return raw;
	const lower = raw.toLowerCase();
	if (owns(OVERLAY_COLORS, lower)) return lower;
	return owns(ALIASES, lower) ? ALIASES[lower] : 'gray';
};

export const resolveOverlayColor = (name) => OVERLAY_COLORS[normalizeOverlayColorKey(name)];

// Core draws each choice with a brighter swatch than the color it paints with, so it reads as a
// color at that size
const PICKER_SWATCHES = {
	gray: '#6B7280',
	black: '#111827',
	dark_blue: '#1E3A8A',
	purple: '#6D28D9',
	teal: '#0F766E',
	navy: '#1E293B',
	charcoal: '#374151',
	brown: '#7C4A2D',
	dark_red: '#7F1D1D',
	dark_green: '#14532D',
	slate: '#334155',
	indigo: '#4338CA',
	moonfinCyan: '#00A4DC',
	neonPulseMagenta: '#FF2E92'
};

export const overlaySwatchColor = (name) => PICKER_SWATCHES[normalizeOverlayColorKey(name)];
