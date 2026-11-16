// Sizes in this app are written for a 1920 wide screen with a 24px root font, and the build turns
// the stylesheets' px into rem. Sizes set from script go through here so they follow the same root
// font, which the UI scale setting changes.

const BASE_FONT_PX = 24;

export const rem = (px) => `${px / BASE_FONT_PX}rem`;

// Screen pixels per design pixel.
export const rootScale = () => {
	if (typeof document === 'undefined' || !window.getComputedStyle) return 1;
	const size = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
	return size > 0 ? size / BASE_FONT_PX : 1;
};

// A length from an inline style in screen pixels, whether it was set in px or through rem().
export const stylePx = (length, scale = rootScale()) => (parseFloat(length) || 0) * (/rem$/.test(length) ? BASE_FONT_PX * scale : 1);
