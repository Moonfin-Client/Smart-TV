import {pickedAccent} from '../../theme/accentSurfaces';
import {ensureVisible, isValidHexColor, toRgbTriplet} from '../../theme/themeSpec';

// Where the skip prompt has always sat, in the 1920x1080 pixels its stylesheet is written in,
// and the fill and ink it wears. A setting left at these values changes nothing, so the
// stylesheet keeps drawing the prompt exactly as before.
export const SKIP_LAYOUTS = ['capsule', 'rectangle', 'sweep'];

// The fill and ink each layout wears when nothing is picked. Only the rectangle is light, so it is
// the one that writes dark text; the rest sit on the dark fill or straight on the picture.
const LIGHT_FILL = {rgb: '244, 244, 246', hex: '#f4f4f6', text: '#14161c'};
const DARK_FILL_HEX = '#1e1e28';
export const skipDefaultFill = (layout) => (layout === 'rectangle' ? LIGHT_FILL.hex : DARK_FILL_HEX);
export const skipDefaultText = (layout) => (layout === 'rectangle' ? LIGHT_FILL.text : '#ffffff');

export const SKIP_DEFAULTS = {
	layout: 'capsule',
	position: 'bottomRight',
	size: 'medium',
	opacity: 88,
	backgroundRgb: '30, 30, 40',
	backgroundHex: '#1e1e28',
	textRgb: '255, 255, 255'
};

// A capsule that shrinks or grows about the corner it is pinned to.
export const SKIP_SIZE_SCALE = {thumbnail: 0.65, small: 0.8, medium: 1, large: 1.3};

const EDGE = 35;
const TOP_EDGE = 60;
const BOTTOM_EDGE = 174;

const HORIZONTAL = {Left: 'left', Center: 'center', Right: 'right'};

// 'topLeft' -> ['top', 'Left'], 'middle' -> ['middle', 'Center'], 'middleRight' -> ['middle', 'Right'].
const splitPosition = (position) => {
	if (position === 'middle') return ['middle', 'Center'];
	const match = /^(top|middle|bottom)(Left|Center|Right)$/.exec(position);
	return match ? [match[1], match[2]] : ['bottom', 'Right'];
};

const withPrefix = (style) => ({
	...style,
	WebkitTransform: style.transform,
	WebkitTransformOrigin: style.transformOrigin
});

// The placement of the wrapper, or nothing when it sits where it always has.
const placement = (position, size) => {
	const scale = SKIP_SIZE_SCALE[size] ?? 1;
	if (position === SKIP_DEFAULTS.position && scale === 1) return undefined;

	const [vertical, horizontal] = splitPosition(position);
	const style = {left: 'auto', right: 'auto', top: 'auto', bottom: 'auto'};
	const shift = [];

	if (horizontal === 'Left') style.left = `${EDGE}px`;
	else if (horizontal === 'Right') style.right = `${EDGE}px`;
	else {
		style.left = '50%';
		shift.push('translateX(-50%)');
	}

	if (vertical === 'top') style.top = `${TOP_EDGE}px`;
	else if (vertical === 'bottom') style.bottom = `${BOTTOM_EDGE}px`;
	else {
		style.top = '50%';
		shift.push('translateY(-50%)');
	}

	if (scale !== 1) shift.push(`scale(${scale})`);
	if (shift.length) {
		style.transform = shift.join(' ');
		style.transformOrigin = `${HORIZONTAL[horizontal]} ${vertical === 'middle' ? 'center' : vertical}`;
	}
	return withPrefix(style);
};

const rgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;

const colorOf = (value) => (isValidHexColor(value) ? value : '');

/**
 * Everything the skip prompt draws from settings, as inline styles. Only what differs from the
 * stylesheet is returned, which is why an untouched setup comes back with nothing in it.
 *
 * The accent is the one exception in spirit: leaving it unset means the prompt takes whatever
 * the Accent Colors page gave the Skip surface, and that already reaches the stylesheet
 * through themeOverrides, so only a color picked here needs to be written inline.
 *
 * @param {Object} settings
 * @returns {Object} styles for the wrapper, button, icon, timer and ring
 */
export const resolveSkipOverlayLook = (settings = {}) => {
	const layout = SKIP_LAYOUTS.includes(settings.skipOverlayLayout) ? settings.skipOverlayLayout : SKIP_DEFAULTS.layout;
	const position = settings.skipOverlayPosition || SKIP_DEFAULTS.position;
	const size = settings.skipOverlaySize || SKIP_DEFAULTS.size;
	const opacity = Number.isFinite(settings.skipOverlayOpacity) ? settings.skipOverlayOpacity : SKIP_DEFAULTS.opacity;
	const background = colorOf(settings.skipOverlayBackground);
	// Text and accent are drawn on the prompt's own fill, so a pick that would blend into it,
	// black text on a black fill, is nudged just far enough to be read.
	const fill = background || (layout === 'rectangle' ? LIGHT_FILL.hex : SKIP_DEFAULTS.backgroundHex);
	const chosenText = colorOf(settings.skipOverlayText);
	const chosenAccent = colorOf(settings.skipOverlayAccent);
	const text = chosenText ? ensureVisible(chosenText, [fill]) : '';
	const accent = chosenAccent ? ensureVisible(chosenAccent, [fill]) : '';

	const button = {};
	if (background || opacity !== SKIP_DEFAULTS.opacity) {
		const rgb = background ? toRgbTriplet(background) : (layout === 'rectangle' ? LIGHT_FILL.rgb : SKIP_DEFAULTS.backgroundRgb);
		button.background = rgba(rgb, Math.min(1, Math.max(0, opacity / 100)));
	}
	if (text) button.color = text;

	return {
		layout,
		overlay: placement(position, size),
		button,
		accent,
		icon: accent ? {color: accent} : undefined,
		timer: text ? {color: rgba(toRgbTriplet(text), 0.5)} : undefined,
		ringTrack: text ? {stroke: rgba(toRgbTriplet(text), 0.16)} : undefined,
		ringValue: accent ? {stroke: accent} : undefined,
		// The bar and the sweep are the countdown drawn as a fill, in the layouts that have one.
		bar: accent ? {background: accent} : undefined,
		sweep: accent ? {background: rgba(toRgbTriplet(accent), 0.38)} : undefined
	};
};

// The color the Skip surface shows when nothing is picked on this page: the one chosen on the
// Accent Colors page, else the cyan the prompt ships with.
export const skipAccentDefault = (settings) => pickedAccent(settings, 'skip') || '#00a4dc';

/**
 * The prompts the player can raise during an episode, given how intros, credits and the next
 * episode are set. The preview cycles through exactly these, so it shows what will really appear.
 *
 * An intro or credits set to skip by itself never puts a button up, and one set to none has no
 * prompt either. Credits give way to the next episode card when it is set to replace them.
 * Recaps are offered whenever the server marks one, so the list is never empty.
 *
 * @param {Object} settings
 * @returns {Array<{kind: string, type?: string}>} kind is 'segment' or 'nextUp'
 */
export const skipPromptKinds = (settings = {}) => {
	const introAction = settings.introAction || 'ask';
	const outroAction = settings.outroAction || 'ask';
	const nextUpOn = settings.nextUpBehavior !== 'disabled';
	const creditsBecomeNextUp = settings.replaceSkipOutroWithNextUp === true && nextUpOn;

	const prompts = [];
	if (introAction === 'ask') prompts.push({kind: 'segment', type: 'intro'});
	prompts.push({kind: 'segment', type: 'recap'});
	if (outroAction === 'ask' && !creditsBecomeNextUp) prompts.push({kind: 'segment', type: 'outro'});
	if (nextUpOn) prompts.push({kind: 'nextUp'});
	return prompts;
};
