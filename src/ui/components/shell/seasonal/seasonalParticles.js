// Builds the particles for one seasonal effect. Everything random is decided here, once, from the
// seed, and each particle comes back as CSS style boxes and timings that scene.js reads to place
// and move its nodes. `tint` and `glow` carry a particle's color and glow strength, since the white
// shapes are tinted by the node color instead of drawn per color.

// Every falling particle adds to each frame's drawing, so the counts follow the performance tier.
const FALL_COUNTS = {
	low: {light: 8, normal: 14, heavy: 22},
	mid: {light: 12, normal: 22, heavy: 32},
	high: {light: 16, normal: 32, heavy: 48}
};

// Fireflies, Halloween and Lunar New Year draw a share of the falling count. A flyer is two
// nodes, so Halloween's leaves and candy leave room for its bats and ghosts.
const COUNT_SHARE = {fireflies: 0.5, halloween: 0.6, lunar: 0.5};
const FLYER_COUNTS = {
	petals: {light: 1, normal: 2, heavy: 3},
	halloween: {light: 2, normal: 3, heavy: 5}
};
const BURST_COUNTS = {light: 1, normal: 2, heavy: 3};
const SPARKS_PER_BURST = 32;

// One firework from launch to the last spark fading. The movers step through their
// five spots over five of these.
const BURST_SECONDS = 3.2;

const LEAF_COLORS = ['#d2691e', '#b5451b', '#e08a1e', '#c9a227', '#8b4513', '#a63d20', '#7a8b2a'];
const HALLOWEEN_COLORS = ['#ff7518', '#e65100', '#ffa000', '#8e24aa', '#6a1b9a'];
const CONFETTI_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#d81b60', '#fb8c00', '#8e24aa', '#00acc1'];
const PETAL_COLORS = ['#ffb7c5', '#f8bbd0', '#ffd1dc', '#fce4ec', '#ffffff', '#f48fb1'];
const BAUBLE_COLORS = ['#d32f2f', '#2e7d32', '#ffc107', '#1565c0', '#c0c0c0'];
const FIREFLY_COLORS = ['#e6ff70', '#fff59d', '#d4ff4f'];
const FIREWORK_COLORS = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ff6e40'];
const HEART_COLORS = ['#e53950', '#d81b60', '#ff4d6d', '#ff8fab', '#c2185b', '#ffb3c6'];
const EASTER_COLORS = ['#b3e5fc', '#f8bbd0', '#fff59d', '#c5e1a5', '#d1c4e9', '#ffccbc'];
// The six rainbow stripes, then the light blue, pink and white of the transgender flag.
const PRIDE_COLORS = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787', '#5bcefa', '#f5a9b8', '#ffffff'];
const EMBER_COLORS = ['#ffd54f', '#ffb300', '#ff8f00', '#ffe082', '#ff7043'];

// mulberry32, small and good enough to scatter particles.
const seededRandom = (seed) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const lerp = (a, b, t) => a + (b - a) * t;
const round = (value, places = 3) => Number(value.toFixed(places));
const pick = (list, random) => list[Math.floor(random() * list.length)];

// A pulse is a second animation on the same particle, [seconds, delay], so a flickering
// particle is still one node.
const timing = (duration, delay, pulse) => {
	const durations = pulse ? `${duration}s, ${pulse[0]}s` : `${duration}s`;
	const delays = pulse ? `${delay}s, ${pulse[1]}s` : `${delay}s`;
	return {animationDuration: durations, animationDelay: delays};
};

// Seconds for one fade of an ember's flicker or a star's twinkle, which runs back and forth.
const PULSE_SECONDS = {Flicker: 0.45, Twinkle: 0.63};

// Seconds to fall the height of the screen, from the nearest particle to the farthest.
const FALL_SECONDS = {
	snow: [12, 27],
	christmas: [12, 27],
	leaves: [18, 35],
	halloween: [18, 35],
	confetti: [9.5, 18],
	pride: [9.5, 18],
	petals: [16, 30],
	valentines: [16, 30],
	easter: [16, 30],
	// These two rise instead.
	lunar: [20.5, 41],
	diwali: [20.5, 41]
};

// The keyframe family each falling effect uses, four variants each.
const PATHS = {
	snow: 'snow',
	christmas: 'snow',
	leaves: 'leaves',
	halloween: 'leaves',
	confetti: 'confetti',
	pride: 'confetti',
	petals: 'petals',
	valentines: 'petals',
	easter: 'petals',
	lunar: 'rise',
	diwali: 'rise'
};

const fallParticle = (effect, random) => {
	// Depth ties size, speed and opacity together, so far particles are small, slow and
	// faint and near ones the opposite.
	const depth = random();
	const [near, far] = FALL_SECONDS[effect];
	const fall = round(lerp(far, near, depth), 2);
	const shapeRoll = random();
	const drift = Math.floor(random() * 2);
	let family = PATHS[effect];
	// For snow the odd variants sway wider, so nearer flakes take those.
	const odd = family === 'snow' ? depth > 0.5 : random() < 0.5;
	const variant = drift * 2 + (odd ? 1 : 0);

	let shape;
	let pulse = '';
	let size;
	let opacity;
	let color = null;
	let widthScale = 1;
	let heightScale = 1;
	let tint = null;
	let glowAlpha = 1;
	if (effect === 'christmas' && shapeRoll < 0.28) {
		// About one in four is a bauble or a star.
		const star = random() < 0.4;
		shape = star ? 'star' : 'bauble';
		size = lerp(1.4, 2.4, depth);
		opacity = lerp(0.85, 1, depth);
		if (!star) color = pick(BAUBLE_COLORS, random);
	} else if (effect === 'halloween' && shapeRoll < 0.4) {
		shape = 'candy';
		size = lerp(1.8, 2.8, depth);
		opacity = 1;
	} else if (effect === 'valentines') {
		shape = 'heart';
		size = lerp(1.2, 2.4, depth);
		opacity = lerp(0.75, 1, depth);
		tint = pick(HEART_COLORS, random);
	} else if (effect === 'easter' && shapeRoll < 0.35) {
		// About one in three is a painted egg, which sways without turning over.
		shape = 'egg';
		family = 'leaves';
		size = lerp(1.6, 2.6, depth);
		opacity = lerp(0.85, 1, depth);
		tint = pick(EASTER_COLORS, random);
	} else if (effect === 'lunar' && shapeRoll < 0.45) {
		shape = 'lantern';
		size = lerp(1.8, 3.4, depth);
		opacity = lerp(0.8, 1, depth);
	} else if (effect === 'diwali' && shapeRoll < 0.2) {
		shape = random() < 0.5 ? 'star' : 'paleStar';
		size = lerp(1, 1.8, depth);
		pulse = 'Twinkle';
	} else if (family === 'rise') {
		shape = 'ember';
		const lunar = effect === 'lunar';
		size = lunar ? lerp(0.7, 1.5, depth) : lerp(0.85, 2, depth);
		tint = pick(EMBER_COLORS, random);
		glowAlpha = lunar ? lerp(0.5, 0.95, depth) : lerp(0.65, 1, depth);
		pulse = 'Flicker';
	} else if (effect === 'petals' && shapeRoll < 0.3) {
		// About one in three is a whole blossom.
		shape = 'blossom';
		size = lerp(2, 3.2, depth);
		opacity = lerp(0.85, 1, depth);
	} else if (family === 'snow') {
		const crystal = depth > 0.55 && shapeRoll < 0.45;
		shape = crystal ? 'flake' : 'dot';
		size = crystal ? lerp(0.85, 1.6, depth) : lerp(0.4, 1.3, depth);
		opacity = lerp(0.35, 0.95, depth);
	} else if (family === 'leaves') {
		shape = shapeRoll < 0.5 ? 'leaf' : 'leafMirror';
		size = lerp(1.3, 2.6, depth);
		opacity = lerp(0.7, 1, depth);
		color = pick(effect === 'halloween' ? HALLOWEEN_COLORS : LEAF_COLORS, random);
	} else if (family === 'petals') {
		shape = 'petal';
		size = lerp(1.2, 2, depth);
		opacity = lerp(0.75, 1, depth);
		color = pick(effect === 'easter' ? EASTER_COLORS : PETAL_COLORS, random);
		widthScale = 0.75;
	} else {
		shape = shapeRoll < 0.6 ? 'strip' : 'disc';
		size = lerp(0.65, 1.2, depth);
		opacity = lerp(0.85, 1, depth);
		color = pick(effect === 'pride' ? PRIDE_COLORS : CONFETTI_COLORS, random);
		if (shape === 'strip') heightScale = 0.55;
	}

	const left = `${round(random() * 100, 2)}%`;
	const delay = -round(random() * fall, 2);
	const pulseSeconds = PULSE_SECONDS[pulse];
	return {
		shape,
		tint: tint || color,
		glow: glowAlpha,
		path: `${family}${pulse}${variant}`,
		style: {
			left,
			width: `${round(size * widthScale)}vh`,
			height: `${round(size * heightScale)}vh`,
			// An ember's flicker or a star's twinkle sets its opacity instead.
			...(pulse ? null : {opacity: round(opacity, 2)}),
			// A negative delay starts the particle part way down, so the screen starts full.
			...timing(fall, delay, pulse ? [pulseSeconds, -round(random() * pulseSeconds * 2, 2)] : null)
		}
	};
};

// A firefly loops around one spot and pulses as it goes. Its opacity lives in the
// keyframes, so it has none inline.
const firefly = (random) => {
	const size = lerp(1.2, 2.2, random());
	const duration = round(lerp(14, 24, random()), 2);
	const path = `fireflies${Math.floor(random() * 4)}`;
	const left = `${round(lerp(8, 92, random()), 2)}%`;
	const top = `${round(lerp(25, 92, random()), 2)}%`;
	const tint = pick(FIREFLY_COLORS, random);
	return {
		shape: 'firefly',
		tint,
		path,
		style: {left, top, width: `${round(size)}vh`, height: `${round(size)}vh`, ...timing(duration, -round(random() * duration, 2))}
	};
};

// Seconds for one flap, buzz or float, which runs back and forth.
const MOTION_SECONDS = {bat: [0.18, 0.26], bee: [0.1, 0.14], ghost: [2, 2.8]};

// Spring sends bees, and Halloween sends bats with every third one a ghost, which drifts slower.
const flyer = (effect, random, key) => {
	const kind = effect === 'petals' ? 'bee' : (key % 3 === 2 ? 'ghost' : 'bat');
	const size = round(kind === 'ghost' ? lerp(3.4, 4.8, random()) : lerp(1.8, 2.8, random()));
	const flight = round(kind === 'ghost' ? lerp(18, 28, random()) : lerp(8, 14, random()), 2);
	const motion = round(lerp(...MOTION_SECONDS[kind], random()), 3);
	const leftward = key % 2 === 1;
	return {
		sprite: kind === 'bee' ? (leftward ? 'beeLeft' : 'beeRight') : kind,
		path: `${leftward ? 'flyLeft' : 'flyRight'}${Math.floor(random() * 2)}`,
		style: {
			top: `${round(lerp(8, 55, random()), 2)}%`,
			...timing(flight, -round(random() * flight, 2))
		},
		spriteStyle: {
			width: `${round(kind === 'bat' ? size * 1.6 : size)}vh`,
			height: `${size}vh`,
			...timing(motion, -round(random() * motion, 3))
		}
	};
};

const burst = (index, count, random) => {
	const delay = -round((index * BURST_SECONDS) / count + random() * 0.4, 2);
	const first = pick(FIREWORK_COLORS, random);
	const second = random() < 0.4 ? pick(FIREWORK_COLORS, random) : first;
	const sparks = [];
	for (let k = 0; k < SPARKS_PER_BURST; k++) {
		const angle = (2 * Math.PI * k) / SPARKS_PER_BURST + (random() - 0.5) * 0.12;
		// How far out the spark ends, as a share of the ring's radius.
		const reach = lerp(0.65, 1, random());
		const size = round(lerp(0.7, 1.1, random()));
		const roll = random();
		const color = roll < 0.2 ? '#fff6e5' : (roll < 0.6 ? first : second);
		sparks.push({
			tint: color,
			style: {
				left: `${round(50 + 50 * reach * Math.cos(angle), 2)}%`,
				top: `${round(50 + 50 * reach * Math.sin(angle), 2)}%`,
				width: `${size}vh`
			}
		});
	}
	// The mover and its parts share the delay, so scene.js reads it once, from partStyle.
	return {
		mover: ['moveA', 'moveB', 'moveC'][index % 3],
		moverStyle: {animationDuration: `${BURST_SECONDS * 5}s`},
		partStyle: timing(BURST_SECONDS, delay),
		tint: first,
		sparks
	};
};

// Returns {falling, flyers, bursts}. Fireflies come back in falling, since each is a single
// element on a keyframe path just like a falling particle.
export const buildSeasonalParticles = (effect, density, seed, tier = 'high') => {
	const random = seededRandom(seed);
	const empty = {falling: [], flyers: [], bursts: []};
	if (effect === 'fireworks') {
		const burstCount = BURST_COUNTS[density] || BURST_COUNTS.normal;
		const bursts = [];
		for (let i = 0; i < burstCount; i++) bursts.push(burst(i, burstCount, random));
		return {...empty, bursts};
	}
	if (!FALL_SECONDS[effect] && effect !== 'fireflies') return empty;
	const counts = FALL_COUNTS[tier] || FALL_COUNTS.high;
	const fallCount = Math.round((counts[density] || counts.normal) * (COUNT_SHARE[effect] || 1));
	const falling = [];
	for (let i = 0; i < fallCount; i++) {
		falling.push(effect === 'fireflies' ? firefly(random) : fallParticle(effect, random));
	}
	const flyers = [];
	const flyerCounts = FLYER_COUNTS[effect];
	if (flyerCounts) {
		const flyerCount = flyerCounts[density] || flyerCounts.normal;
		for (let i = 0; i < flyerCount; i++) flyers.push(flyer(effect, random, i));
	}
	return {...empty, falling, flyers};
};
