// Where Home's focus followers sit and how each move looks. The numbers are logical px on a 1150
// wide canvas, scaled up to this app's 1920 wide layout and again by the UI scale. Focus rects are
// screen px.

const CORE_SCALE = 1920 / 1150;

// Easter brings bunny ears for the cards and an egg for the nav, since the top bar leaves no
// room above its buttons for ears. One fades out as the other fades in.
export const FOLLOWERS = {
	halloween: ['planchette'],
	valentines: ['cupidArrow'],
	fireworks: ['sparkler'],
	christmas: ['sleigh'],
	easter: ['bunnyEars', 'easterEgg'],
	lunar: ['lantern'],
	diwali: ['diya'],
	pride: ['rainbow']
};

// Each drawing's size in logical px, and how far down it the anchor sits as a share of that size.
// The anchor is the point that sits on the spot and that the drawing turns about.
const DRAWINGS = {
	planchette: [48, 0.5],
	cupidArrow: [60, 0.5],
	sparkler: [40, 0.5],
	sleigh: [64, 0.55],
	bunnyEars: [40, 1],
	lantern: [46, 0],
	diya: [44, 0.94],
	easterEgg: [34, 0.96]
};

const POINTERS = ['planchette', 'cupidArrow', 'sparkler'];

// A move shorter than this along a row leaves the sleigh facing the way it was and the
// lantern hanging still. In logical px.
const STILL = 12;

export const HIDDEN = {shown: false, glide: false, x: 0, y: 0, angle: 0, facing: 1, width: 0, thickness: 0, swing: '', move: 0};

// Where a follower rests for what has focus. landing is card, below for a top bar button or
// right for the sidebar, whose right edge is navRight. Null when it should fade out.
export const followerSpot = (style, {landing, rect, navRight, screenWidth, screenHeight, scale = 1}) => {
	const onCard = landing === 'card';
	if (style === 'bunnyEars' ? !onCard : style === 'easterEgg' && onCard) return null;
	const {left, top, width, height} = rect;
	if (!(width > 0 && height > 0)) return null;
	// Anything that wide is the media bar rather than a card.
	if (onCard && width > screenWidth * 0.9) return null;
	if (left + width <= 0 || top + height <= 0 || left >= screenWidth || top >= screenHeight) return null;

	const px = (core) => core * CORE_SCALE * scale;
	const right = left + width;
	const bottom = top + height;
	const centerX = left + width / 2;
	const centerY = top + height / 2;
	const side = typeof navRight === 'number' ? navRight : right;

	if (style === 'rainbow') return {x: centerX, y: bottom + px(6), width, thickness: px(6)};

	const [extent, anchor] = DRAWINGS[style];
	const size = px(extent);
	const pointer = POINTERS.includes(style);
	let x;
	let y;
	if (pointer) {
		// Home parks the focused card at the start of its row under the row title, so the
		// free space is the margin to its left, and the tip reaches just onto the artwork.
		if (onCard) [x, y] = [left + px(4) - size / 2, centerY];
		else if (landing === 'below') [x, y] = [centerX, bottom + px(6) + size / 2];
		else [x, y] = [side + px(48), centerY];
	} else if (style === 'sleigh') {
		if (onCard) [x, y] = [left + px(6) - size / 2, centerY];
		else if (landing === 'below') [x, y] = [centerX, bottom + px(6) + size * 0.3];
		else [x, y] = [side + px(8) + size / 2, centerY];
	} else if (style === 'bunnyEars') {
		[x, y] = [right - Math.min(width * 0.3, px(40)), top];
	} else if (style === 'lantern') {
		if (onCard) [x, y] = [left - px(24), top + px(2)];
		else if (landing === 'below') [x, y] = [centerX, bottom + px(2)];
		else [x, y] = [side + px(40), top];
	} else if (onCard) {
		[x, y] = [left - px(26), bottom];
	} else if (landing === 'below') {
		[x, y] = [centerX, bottom + px(6) + size];
	} else {
		[x, y] = [side + px(40), centerY + px(20)];
	}

	// Keeps the whole drawing on screen, measured from its anchor.
	const margin = px(4);
	const above = size * anchor;
	x = Math.min(Math.max(x, size / 2 + margin), screenWidth - size / 2 - margin);
	y = Math.min(Math.max(y, above + margin), screenHeight - (size - above) - margin);
	if (!pointer) return {x, y};
	// The drawings point up, so this turns the tip toward the middle of what has focus.
	const angle = Math.atan2(centerY - y, centerX - x) * 180 / Math.PI + 90;
	return {x, y, angle: angle > 180 ? angle - 360 : angle};
};

// The swing or tilt to play for a move, named for which way it leans first.
const swingFor = (style, dx, dy, facing, still) => {
	if (style === 'lantern') {
		// It hangs from the top, so its bottom trails behind the move.
		return Math.abs(dx) > still ? (dx > 0 ? 'swingCw' : 'swingCcw') : '';
	}
	if (style === 'easterEgg') return dx < 0 ? 'rockCw' : 'rockCcw';
	if (style === 'bunnyEars') return Math.abs(dx) > still ? (dx < 0 ? 'rockCw' : 'rockCcw') : '';
	if (style === 'sleigh' && Math.abs(dy) > still) return dy * facing > 0 ? 'tiltCw' : 'tiltCcw';
	return '';
};

// The next state of one follower, given what has focus now, or null for nothing on Home.
// It appears where it lands, then glides from spot to spot, turning the short way around.
export const placeFollower = (style, focus, prev = HIDDEN) => {
	const spot = focus && followerSpot(style, focus);
	if (!spot) return prev.shown ? {...prev, shown: false} : prev;

	const glide = prev.shown;
	const dx = spot.x - prev.x;
	const dy = spot.y - prev.y;
	const moved = Math.abs(dx) >= 1 || Math.abs(dy) >= 1 || Math.abs((spot.width || 0) - prev.width) >= 1;
	if (glide && !moved) return prev;

	const still = STILL * CORE_SCALE * (focus.scale || 1);
	let facing = 1;
	if (focus.landing === 'right') facing = -1;
	else if (focus.landing === 'below') facing = glide && Math.abs(dx) > still ? Math.sign(dx) : prev.facing;

	let angle = spot.angle || 0;
	if (glide && spot.angle !== undefined) {
		const turn = ((spot.angle - prev.angle) % 360 + 540) % 360 - 180;
		angle = prev.angle + turn;
	}

	const swing = glide ? swingFor(style, dx, dy, facing, still) : '';
	return {
		shown: true,
		glide,
		x: spot.x,
		y: spot.y,
		angle,
		facing,
		width: spot.width || 0,
		thickness: spot.thickness || 0,
		swing,
		// A new number starts the swing's keyframes over.
		move: swing ? prev.move + 1 : prev.move
	};
};
