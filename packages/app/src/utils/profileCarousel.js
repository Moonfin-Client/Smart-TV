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

// Where an item sits relative to the selected one. Two either side are shown,
// and the rest wait just past the edge so they slide in from there.
export const slotOf = (index, selected) => Math.max(-3, Math.min(3, index - selected));
