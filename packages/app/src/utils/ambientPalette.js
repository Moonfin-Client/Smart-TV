// Pulls a small colour palette out of album artwork for the music player's
// ambient background. Falls back to the accent colour when there is no artwork,
// or when the server doesn't allow the cross origin read the canvas needs.

const SAMPLE_SIZE = 32;
const MIN_HUE_DISTANCE = 24;
const PALETTE_SIZE = 3;
const DEFAULT_ACCENT = '#00a4dc';

// The crossOrigin request is what keeps getImageData from throwing on a canvas
// tainted by the artwork.
const loadImage = (src) =>
	new Promise((resolve, reject) => {
		const img = document.createElement('img');
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

const hexToRgb = (hex) => {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
	if (!match) return null;
	return {
		r: parseInt(match[1], 16),
		g: parseInt(match[2], 16),
		b: parseInt(match[3], 16)
	};
};

const rgbToHsl = (r, g, b) => {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;
	const l = (max + min) / 2;
	if (delta === 0) return {h: 0, s: 0, l};
	const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let h;
	if (max === rn) h = ((gn - bn) / delta) % 6;
	else if (max === gn) h = (bn - rn) / delta + 2;
	else h = (rn - gn) / delta + 4;
	h *= 60;
	if (h < 0) h += 360;
	return {h, s, l};
};

const hslToRgb = (h, s, l) => {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = ((h % 360) + 360) % 360 / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let rgb;
	if (hp < 1) rgb = [c, x, 0];
	else if (hp < 2) rgb = [x, c, 0];
	else if (hp < 3) rgb = [0, c, x];
	else if (hp < 4) rgb = [0, x, c];
	else if (hp < 5) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	const m = l - c / 2;
	return {
		r: Math.round((rgb[0] + m) * 255),
		g: Math.round((rgb[1] + m) * 255),
		b: Math.round((rgb[2] + m) * 255)
	};
};

const hueDistance = (a, b) => {
	const diff = Math.abs(a - b) % 360;
	return diff > 180 ? 360 - diff : diff;
};

// Lifts a swatch so it reads as glowing light rather than the flat album colour.
const lift = (hsl) => hslToRgb(
	hsl.h,
	Math.min(1, hsl.s * 1.1),
	Math.min(0.7, hsl.l * 0.55 + 0.22)
);

export const accentPalette = (accentHex) => {
	const rgb = hexToRgb(accentHex) || hexToRgb(DEFAULT_ACCENT);
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
	return [0, 40, 320].map((rotation) => hslToRgb(hsl.h + rotation, hsl.s, hsl.l));
};

// Buckets the sampled pixels by colour, favours the vivid buckets over muddy
// greys, then keeps the strongest few that are far enough apart in hue.
const paletteFromPixels = (data) => {
	const buckets = new Map();
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (data[i + 3] < 128) continue;
		if (0.299 * r + 0.587 * g + 0.114 * b < 18) continue;
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.r += r;
			bucket.g += g;
			bucket.b += b;
			bucket.count += 1;
		} else {
			buckets.set(key, {r, g, b, count: 1});
		}
	}

	const scored = [];
	buckets.forEach((bucket) => {
		const hsl = rgbToHsl(
			Math.round(bucket.r / bucket.count),
			Math.round(bucket.g / bucket.count),
			Math.round(bucket.b / bucket.count)
		);
		scored.push({hsl, score: bucket.count * (0.35 + hsl.s)});
	});
	scored.sort((a, b) => b.score - a.score);

	const picked = [];
	for (const candidate of scored) {
		if (picked.length === PALETTE_SIZE) break;
		if (picked.every((p) => hueDistance(p.hsl.h, candidate.hsl.h) >= MIN_HUE_DISTANCE)) {
			picked.push(candidate);
		}
	}
	if (picked.length === 0) return null;
	while (picked.length < PALETTE_SIZE) picked.push(picked[picked.length - 1]);
	return picked.map((p) => lift(p.hsl));
};

export const getAmbientPalette = async (artworkUrl, accentHex = DEFAULT_ACCENT) => {
	if (!artworkUrl) return accentPalette(accentHex);
	try {
		const img = await loadImage(artworkUrl);
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return accentPalette(accentHex);
		canvas.width = SAMPLE_SIZE;
		canvas.height = SAMPLE_SIZE;
		ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
		const {data} = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
		return paletteFromPixels(data) || accentPalette(accentHex);
	} catch {
		return accentPalette(accentHex);
	}
};
