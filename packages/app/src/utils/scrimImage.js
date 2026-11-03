// Full-screen CSS gradients are slow to paint in the software raster on Samsung TVs, around 22 ms
// per 256px tile, and a scrim repaints wherever anything above it changes. Drawing the same layers
// once into a small canvas and stretching it costs about what a photo does and looks the same.
//
// Layers are listed top first, like background-image. Each is {to: 'right' | 'top' | 'bottom', rgb,
// stops} or {at: [x, y], rgb, stops}, an ellipse centered at that fraction of the box and sized to
// its farthest corner the way CSS sizes one by default. Given a `radius` too, it's a circle reaching
// that many times the box's shorter side out from its center. Stops are [offset, alpha], or [offset,
// alpha, rgb] where a stop changes color. Canvas blends stops unpremultiplied where CSS premultiplies,
// so a layer should keep one color or stay close to it.

const W = 240;
const H = 135;
const LINES = {right: [0, 0, W, 0], bottom: [0, 0, 0, H], top: [0, H, 0, 0]};
const cache = new Map();

// The first canvas a session makes costs most of a second on Tizen, and Details bakes its scrim as it
// draws, so each baked scrim is kept between launches. The number in the key changes if painting does.
const STORE_PREFIX = 'moonfin_scrim1_';

const hashOf = (text) => {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
	return hash.toString(36);
};

const readStored = (key) => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};

const keep = (key, url) => {
	try {
		localStorage.setItem(key, url);
	} catch {
		// A full or blocked store only means the next launch bakes it again.
	}
};

// Engines without custom properties paint the unscaled pass in the stylesheets, so they get the
// unscaled image to match.
const scaleApplies = () => Boolean(window.CSS && window.CSS.supports && window.CSS.supports('--a', '0'));

const paint = (ctx, layer, scale) => {
	let gradient;
	let rect = [0, 0, W, H];
	ctx.save();
	if (layer.at) {
		const cx = layer.at[0] * W;
		const cy = layer.at[1] * H;
		const rx = layer.radius ? layer.radius * Math.min(W, H) : Math.max(cx, W - cx) * Math.SQRT2;
		const squash = layer.radius ? 1 : (Math.max(cy, H - cy) * Math.SQRT2) / rx;
		ctx.translate(cx, cy);
		ctx.scale(1, squash);
		gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
		rect = [-cx, -cy / squash, W, H / squash];
	} else {
		const line = LINES[layer.to];
		gradient = ctx.createLinearGradient(line[0], line[1], line[2], line[3]);
	}
	layer.stops.forEach((stop) => {
		// Rounded so an old color parser never sees an exponent.
		const alpha = Math.round(stop[1] * scale * 1000) / 1000;
		gradient.addColorStop(stop[0], `rgba(${stop[2] || layer.rgb}, ${alpha})`);
	});
	ctx.fillStyle = gradient;
	ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
	ctx.restore();
};

const bake = (layers, scale) => {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		for (let i = layers.length - 1; i >= 0; i--) paint(ctx, layers[i], scale);
		return canvas.toDataURL('image/png');
	} catch {
		return null;
	}
};

// An inline style carrying the baked image, or null so the stylesheet's gradients show instead.
export const scrimStyle = (layers, scale = 1) => {
	const s = scale !== 1 && scaleApplies() ? scale : 1;
	let byScale = cache.get(layers);
	if (!byScale) {
		byScale = {};
		cache.set(layers, byScale);
	}
	if (!(s in byScale)) {
		const key = `${STORE_PREFIX}${hashOf(JSON.stringify(layers))}_${s}`;
		let url = readStored(key);
		if (!url) {
			url = bake(layers, s);
			if (url) keep(key, url);
		}
		byScale[s] = url ? {backgroundImage: `url(${url})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat'} : null;
	}
	return byScale[s];
};
