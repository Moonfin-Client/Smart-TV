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

// Sizes and offsets in points on a 1150 wide layout, which this app draws 1920 wide.
const HERO_SIZE = 168;
const NEAR_SIZE = 100;
const FAR_SIZE = 72;
const NEAR_OFFSET = 188;
const FAR_OFFSET = 314;
const FAR_GAP = 40;
export const FAR_STEP = FAR_SIZE + FAR_GAP;

// How many steps either side of the middle fit in the width. The steps past the second keep
// a gap from the edge for TVs that overscan. A width not measured yet gets two.
export const reachFor = (width) => {
	if (!(width > 0) || !isFinite(width)) return 2;
	const room = width / 2 - FAR_OFFSET - FAR_SIZE / 2;
	if (room < 0) return 1;
	const extra = room - FAR_GAP;
	return extra < 0 ? 2 : 2 + Math.floor(extra / FAR_STEP);
};

const offsetAt = (distance) => {
	if (distance === 0) return 0;
	if (distance === 1) return NEAR_OFFSET;
	return FAR_OFFSET + (distance - 2) * FAR_STEP;
};

// Where an item sits relative to the selected one. The hidden ones wait one step past the
// last visible one, so they slide in from just outside it.
export const slotOf = (index, selected, reach) => {
	const offset = index - selected;
	const distance = Math.abs(offset);
	const visible = distance <= reach;
	const sign = offset < 0 ? -1 : 1;
	const size = distance === 0 ? HERO_SIZE : distance === 1 ? NEAR_SIZE : FAR_SIZE;
	return {
		distance,
		visible,
		x: distance === 0 ? 0 : offsetAt(visible ? distance : reach + 1) * sign,
		scale: size / HERO_SIZE,
		opacity: !visible ? 0 : distance === 0 ? 1 : distance === 1 ? 0.55 : 0.3
	};
};
