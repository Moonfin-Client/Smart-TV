// How far chrome colors move toward true black, and how much artwork gains in saturation and
// contrast to make up for the darker surround.
const OLED_TUNING = {
	subtle: {crush: 0.8, saturate: 1.1, contrast: 1.03},
	vivid: {crush: 1.0, saturate: 1.25, contrast: 1.08}
};

// The surfaces the chrome is built from. Text and accents keep their color so
// the darker background stays readable.
const CRUSHED_COLORS = ['background', 'surface', 'surfaceVariant'];

const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));
const hex2 = (value) => clampChannel(value).toString(16).padStart(2, '0');

// Theme colors are #AARRGGBB, with plain #RRGGBB accepted too. The alpha is
// left alone so a translucent surface stays as translucent as it was.
const crushThemeColor = (value, crush) => {
	if (typeof value !== 'string') return value;
	const match = value.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
	if (!match) return value;
	const digits = match[1];
	const hasAlpha = digits.length === 8;
	const alpha = hasAlpha ? digits.slice(0, 2) : '';
	const rgb = hasAlpha ? digits.slice(2) : digits;
	const keep = 1 - crush;
	const crushed = [0, 2, 4]
		.map((offset) => hex2(parseInt(rgb.slice(offset, offset + 2), 16) * keep))
		.join('');
	return `#${alpha}${crushed}`.toUpperCase();
};

export const applyOledMode = (theme, mode) => {
	const tuning = OLED_TUNING[mode];
	if (!tuning || !theme?.colors) return theme;
	const colors = {...theme.colors};
	for (const name of CRUSHED_COLORS) {
		if (colors[name] !== undefined) colors[name] = crushThemeColor(colors[name], tuning.crush);
	}
	return {...theme, colors};
};
