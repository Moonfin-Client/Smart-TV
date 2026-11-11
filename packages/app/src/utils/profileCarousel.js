const INITIALS_COLORS = ['#2B6CB0', '#9C4221', '#2F855A', '#6B46C1', '#B83280', '#2C7A7B'];

// Picked by the sum of the id's UTF-16 code units, the same rule Core uses, so a
// user without a picture gets one color on every client.
export const initialsColor = (id) => {
	const text = String(id ?? '');
	let sum = 0;
	for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
	return INITIALS_COLORS[sum % INITIALS_COLORS.length];
};

export const initialOf = (name) => String(name ?? '').trim().charAt(0).toUpperCase();

export const clampIndex = (index, count) => Math.max(0, Math.min(count - 1, index));

// The middle face, its neighbors and the ones past them, in canvas units, the same
// geometry Core uses.
const HERO_SIZE = 168;
const FAR_SIZE = 72;
const FAR_OFFSET = 314;
const FAR_GAP = 40;
export const FAR_STEP = FAR_SIZE + FAR_GAP;
// The stylesheet has slots this far out.
export const MAX_REACH = 5;

// How many steps either side of the middle fit in a strip this many units wide. The
// steps past the second keep a gap from the edge, for TVs that overscan. A strip not
// measured yet gets two.
export const reachFor = (width) => {
	if (!(width > 0) || !Number.isFinite(width)) return 2;
	const room = width / 2 - FAR_OFFSET - FAR_SIZE / 2;
	if (room < 0) return 1;
	const extra = room - FAR_GAP;
	return extra < 0 ? 2 : Math.min(MAX_REACH, 2 + Math.floor(extra / FAR_STEP));
};

// The face is drawn at the middle one's size, so its width gives the units' size in pixels.
export const unitsWide = (stageWidth, itemWidth) => (itemWidth > 0 ? stageWidth * HERO_SIZE / itemWidth : 0);

// Where an item sits relative to the selected one. As many as reach either side are
// shown, and the rest wait one step past the last shown one so they slide in from there.
export const slotOf = (index, selected, reach = 2) => Math.max(-reach - 1, Math.min(reach + 1, index - selected));
