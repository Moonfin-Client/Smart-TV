// Every game works on a 480 x 270 virtual screen that the arcade scales to the TV. g.ai plays
// the attract demo, and g.sfx, when set, hears the events that make a sound.
import $L from '@enact/i18n/$L';
import {drawRunner} from '../../components/Screensaver/ScreensaverRunner';

export const W = 480;
export const H = 270;
const TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const onScreen = o => !o.dead && o.x > -60;
const K = {night: '#0c0a1f', blue: '#00a4dc', purple: '#aa5cc3', gold: '#ffc94a', coral: '#ff6b85', mint: '#5ef2c0', ink: '#ece8ff', muted: '#a8a2cf'};
const MONO = "'JetBrains Mono', monospace";
const DISP = "'Jersey 10', Impact, sans-serif";
const HUD_FONT = `700 13px ${MONO}`;
const sfx = (g, name) => g.sfx && g.sfx(name);

function linear (c, x0, y0, x1, y1, stops) {
	const gr = c.createLinearGradient(x0, y0, x1, y1);
	for (const [at, col] of stops) gr.addColorStop(at, col);
	return gr;
}

// Chrome 38 and Tizen 2.4 have no roundRect, and the oldest WebKit has no ellipse or line dash.
function roundRect (c, x, y, w, h, r) {
	if (c.roundRect) {
		c.roundRect(x, y, w, h, r);
		return;
	}
	r = Math.min(r, w / 2, h / 2);
	c.moveTo(x + r, y);
	c.arcTo(x + w, y, x + w, y + h, r);
	c.arcTo(x + w, y + h, x, y + h, r);
	c.arcTo(x, y + h, x, y, r);
	c.arcTo(x, y, x + w, y, r);
	c.closePath();
}
function ellipse (c, x, y, rx, ry, rot, a0, a1) {
	if (c.ellipse) {
		c.ellipse(x, y, rx, ry, rot, a0, a1);
		return;
	}
	c.save();
	c.translate(x, y);
	c.rotate(rot);
	c.scale(rx, ry);
	c.arc(0, 0, 1, a0, a1);
	c.restore();
}
const dash = (c, d) => c.setLineDash && c.setLineDash(d);

function circle (c, x, y, r, fill) {c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill();}
function ring (c, x, y, r, col, w) {c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = col; c.lineWidth = w; c.stroke();}
function rr (c, x, y, w, h, r, fill) {c.beginPath(); roundRect(c, x, y, w, h, r); c.fillStyle = fill; c.fill();}

const S = {
	lagBat (c, t) {
		const f = Math.sin(t * 14) * 5; c.fillStyle = K.purple;
		for (const s of [-1, 1]) {c.beginPath(); c.moveTo(3 * s, 0); c.lineTo(13 * s, -5 - f); c.lineTo(10 * s, 2); c.lineTo(6 * s, 1); c.closePath(); c.fill();}
		circle(c, 0, 0, 5.5, '#7d3f97'); circle(c, -2, -1, 1.3, K.gold); circle(c, 2, -1, 1.3, K.gold);
		c.fillStyle = 'rgba(0,164,220,.7)'; c.fillRect(-9 + ((t * 24 | 0) % 6), 4, 7, 1.5);
	},
	gremlin (c, t) {
		const n = t * 12 | 0;
		for (let i = 0; i < 26; i++) {const a = i * 2.39, r = 2 + (i * 7 % 8); c.fillStyle = ((i + n) % 3) ? '#8b86a8' : '#e6e2f7'; c.fillRect(Math.cos(a) * r - 1.5, Math.sin(a) * r - 1.5, 3, 3);}
		c.fillStyle = K.coral; c.fillRect(-4.5, -3, 3, 3); c.fillRect(1.5, -3, 3, 3);
	},
	cable (c) {
		c.lineWidth = 3; c.strokeStyle = '#5d559a';
		for (let i = 0; i < 3; i++) {c.beginPath(); ellipse(c, 0, 5 - i * 4.5, 12, 4.5, 0, 0, TAU); c.stroke();}
		c.strokeStyle = K.blue; c.lineWidth = 1.2; c.beginPath(); ellipse(c, 0, -4, 12, 4.5, 0, Math.PI, TAU); c.stroke();
		rr(c, 9, -12, 8, 5, 1.5, '#d9dcef');
	},
	banner (c, t) {
		c.fillStyle = '#4b4380'; c.fillRect(-1.5, -32, 3, 20);
		rr(c, -17, -13, 34, 26, 5, '#1d1840'); c.strokeStyle = K.coral; c.lineWidth = 1.5; c.beginPath(); roundRect(c, -16.25, -12.25, 32.5, 24.5, 4.5); c.stroke();
		c.lineCap = 'round'; c.strokeStyle = K.ink; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 6.5, t * 7, t * 7 + 4.4); c.stroke();
	},
	directPlay (c, t) {
		c.globalAlpha = 0.22 + 0.08 * Math.sin(t * 4); circle(c, 0, 0, 11, K.mint); c.globalAlpha = 1; ring(c, 0, 0, 9.5, K.mint, 2);
		c.fillStyle = K.mint; c.beginPath(); c.moveTo(-3, -5.5); c.lineTo(5.5, 0); c.lineTo(-3, 5.5); c.closePath(); c.fill();
	},
	skipIntro (c) {
		rr(c, -13, -7.5, 26, 15, 7.5, K.gold); c.fillStyle = K.night;
		for (const x of [-6, 1]) {c.beginPath(); c.moveTo(x, -4.5); c.lineTo(x + 5.5, 0); c.lineTo(x, 4.5); c.closePath(); c.fill();}
	},
	popcorn (c) {
		c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-5, -1); c.lineTo(5, -1); c.lineTo(3.8, 7); c.lineTo(-3.8, 7); c.closePath(); c.fill();
		c.fillStyle = K.coral; c.fillRect(-2.8, -1, 1.8, 8); c.fillRect(1, -1, 1.8, 8);
		circle(c, -3, -3, 2.7, '#fff3c9'); circle(c, 1, -4.5, 3, '#fff3c9'); circle(c, 4, -2.5, 2.4, '#fff3c9'); circle(c, -0.5, -2, 1.6, K.gold);
	},
	plug (c) {
		c.fillStyle = '#1b1838'; c.beginPath(); c.moveTo(-10, -2.5); c.lineTo(-7, -5); c.lineTo(-7, 5); c.lineTo(-10, 2.5); c.closePath(); c.fill();
		rr(c, -7, -5.5, 9, 11, 2, '#2b2456'); c.fillStyle = K.blue; c.fillRect(-5, -5.5, 1.6, 11);
		c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(-1.5, -4.5, 0.9, 9); c.fillRect(0.3, -4.5, 0.9, 9);
		c.fillStyle = '#d9dcef'; c.beginPath(); c.moveTo(2, -4.5); c.lineTo(7.5, -4.5); c.lineTo(9, -3); c.lineTo(9, 3); c.lineTo(7.5, 4.5); c.lineTo(2, 4.5); c.closePath(); c.fill();
		c.strokeStyle = '#9aa1bd'; c.lineWidth = 0.8; c.stroke();
		c.fillStyle = K.night; c.fillRect(3.5, -2, 5, 4); c.fillStyle = K.gold; for (const x of [4.2, 5.6, 7]) c.fillRect(x, -1.2, 0.8, 2.4);
	},
	signal (c, t) {c.fillStyle = K.gold; c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6); c.fillRect(-6, 1, 3, 4.5); c.fillRect(-1.5, -2.5, 3, 8); c.fillRect(3, -6, 3, 11.5); c.globalAlpha = 1;},
	staticBlock (c, t) {
		c.fillStyle = '#262145'; c.fillRect(-7, -7, 14, 14); const n = t * 20 | 0;
		for (let i = 0; i < 14; i++) {const h = (i * 73 + n * 31) % 144; c.fillStyle = (i + n) % 2 ? '#8b86a8' : '#e6e2f7'; c.fillRect(-7 + (h % 12), -7 + ((h / 12 | 0) % 12), 2, 2);}
	},
	brick (c) {
		rr(c, -14, -14, 28, 28, 4, '#2f2a55'); c.strokeStyle = '#4d4688'; c.lineWidth = 1.5; c.strokeRect(-10.5, -10.5, 21, 21);
		c.fillStyle = '#4d4688'; c.fillRect(-7, 2, 14, 2); c.fillRect(-7, 6, 14, 2); circle(c, 6.5, -6.5, 2, K.mint);
	},
	bug (c, t) {
		c.strokeStyle = K.coral; c.lineWidth = 1.2; for (let i = -1; i <= 1; i++) {const l = Math.sin(t * 20 + i) * 1.5; c.beginPath(); c.moveTo(-6.5, i * 3 + l); c.lineTo(6.5, i * 3 - l); c.stroke();}
		circle(c, 0, 0.5, 4.5, '#d23f5c'); circle(c, 0, -4, 2.6, '#ff9fb1'); c.beginPath(); c.moveTo(-1, -6); c.lineTo(-3, -8.5); c.moveTo(1, -6); c.lineTo(3, -8.5); c.stroke();
	},
	tangle (c, t) {
		c.strokeStyle = '#9a78e6'; c.lineWidth = 1.8; for (let i = 0; i < 4; i++) {const a = t * 3 + i * 1.6; c.beginPath(); ellipse(c, Math.cos(a) * 2, Math.sin(a) * 2, 6.5, 3, a, 0, TAU); c.stroke();}
		circle(c, -2, -1, 1.4, K.gold); circle(c, 2, -1, 1.4, K.gold);
	},
	ghost (c, t) {dash(c, [3, 2]); ring(c, 0, 0, 8.5, K.mint, 1.5); dash(c, []); c.globalAlpha = 0.55; c.save(); c.scale(0.75, 0.75); S.plug(c, t); c.restore(); c.globalAlpha = 1;},
	snip (c) {
		c.strokeStyle = K.gold; c.lineWidth = 1.8; c.beginPath(); c.arc(-3.5, 4.5, 2.6, 0, TAU); c.stroke(); c.beginPath(); c.arc(3.5, 4.5, 2.6, 0, TAU); c.stroke();
		c.beginPath(); c.moveTo(-2, 2.2); c.lineTo(4, -8); c.moveTo(2, 2.2); c.lineTo(-4, -8); c.stroke();
	},
	ticket (c) {
		c.save(); c.rotate(-0.2); rr(c, -8, -5, 16, 10, 2, K.gold); circle(c, -8, 0, 2.2, K.night); circle(c, 8, 0, 2.2, K.night);
		c.fillStyle = 'rgba(12,10,31,.5)'; c.fillRect(-2, -4, 1, 8); c.restore();
	},
	velvetRope (c) {
		c.strokeStyle = '#d23f5c'; c.lineWidth = 3; c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(0, 4, 12, -6); c.stroke();
		for (const x of [-12, 12]) {c.fillStyle = K.gold; c.fillRect(x - 1.5, -8, 3, 17); circle(c, x, -9, 2.5, K.gold); rr(c, x - 4, 8, 8, 3, 1, K.gold);}
	},
	popcornCart (c) {
		rr(c, -14, -4, 28, 20, 3, K.coral); c.fillStyle = '#fff'; c.fillRect(-14, 2, 28, 3);
		c.fillStyle = 'rgba(191,230,255,.25)'; c.fillRect(-12, -22, 24, 18); c.strokeStyle = '#d9dcef'; c.lineWidth = 1.5; c.strokeRect(-12, -22, 24, 18);
		for (let i = 0; i < 9; i++) circle(c, -9 + (i % 5) * 4.5, -8 - (i / 5 | 0) * 4 - (i % 2) * 1.5, 2.4, '#fff3c9');
		rr(c, -15, -26, 30, 5, 2, K.coral); circle(c, -8, 19, 3.5, '#2c2756'); circle(c, 8, 19, 3.5, '#2c2756');
	},
	rollingReel (c, t) {
		c.save(); c.rotate(-t * 10); circle(c, 0, 0, 11, '#8a83b5'); circle(c, 0, 0, 3, '#1d1840');
		for (let i = 0; i < 5; i++) {const a = i * TAU / 5; circle(c, Math.cos(a) * 6.5, Math.sin(a) * 6.5, 2.4, '#2c2756');} c.restore(); ring(c, 0, 0, 11, '#cfd3e6', 1);
	},
	usher (c, t) {
		c.globalAlpha = 0.25 + 0.1 * Math.sin(t * 7); c.fillStyle = K.gold; c.beginPath(); c.moveTo(-8, -5); c.lineTo(-24, -13); c.lineTo(-24, 3); c.closePath(); c.fill(); c.globalAlpha = 1;
		rr(c, -6, -10, 12, 20, 3, '#7d3f97'); c.fillStyle = K.gold; c.fillRect(-6, -4, 12, 1.5); circle(c, 0, -15, 5, '#e8c9a8'); rr(c, -6, -21, 12, 4, 1.5, '#7d3f97');
		c.fillStyle = '#2c2756'; c.fillRect(-5, 10, 4, 9); c.fillRect(1, 10, 4, 9); rr(c, -10, -7, 5, 4, 1, '#cfd3e6');
	},
	magnet (c) {
		c.lineWidth = 5; c.strokeStyle = K.coral; c.beginPath(); c.moveTo(-6.5, 6); c.lineTo(-6.5, 0); c.arc(0, 0, 6.5, Math.PI, TAU); c.lineTo(6.5, 6); c.stroke();
		c.fillStyle = '#d9dcef'; c.fillRect(-9, 5, 5, 4); c.fillRect(4, 5, 5, 4);
	},
	frontRowPass (c) {
		c.strokeStyle = K.purple; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-5, -12); c.lineTo(0, -5); c.lineTo(5, -12); c.stroke();
		rr(c, -8, -6, 16, 18, 2.5, K.mint); c.fillStyle = K.night; c.fillRect(-5, -2, 10, 2); c.fillRect(-5, 2, 7, 1.5); c.fillRect(-5, 5, 8, 1.5);
	},
	bluCase (c) {rr(c, -9, -12, 18, 24, 2, K.blue); c.fillStyle = '#0b6f96'; c.fillRect(-9, -12, 3, 24); rr(c, -4, -8, 10, 3, 1, 'rgba(255,255,255,.75)'); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(-4, -2, 10, 9);},
	steelbook (c) {
		rr(c, -9, -12, 18, 24, 2, linear(c, -9, -12, 9, 12, [[0, '#eef0fa'], [0.5, '#9aa1bd'], [1, '#d9dcef']]));
		c.fillStyle = '#6d7090'; c.fillRect(-9, -12, 3, 24); c.strokeStyle = '#6d7090'; c.lineWidth = 1; c.strokeRect(-3.5, -6.5, 9, 13);
	},
	boxSet (c) {
		for (const [x, col] of [[-9, K.purple], [-3, K.blue], [3, K.coral]]) {rr(c, x, -11, 6, 22, 1.5, col); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x + 1.5, -7, 3, 2);}
		rr(c, -11, 11, 22, 3, 1, '#3a2f6b');
	},
	macroblock (c) {
		const k = [K.blue, K.purple, K.coral, '#5d559a']; for (let i = 0; i < 4; i++) {c.fillStyle = k[i]; c.fillRect(-12 + (i % 2) * 12, -12 + (i / 2 | 0) * 12, 12, 12);}
		c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(-12, -12, 6, 6); c.fillRect(6, 0, 6, 6); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, -6, 6, 6); c.fillRect(-6, 6, 6, 6);
	},
	keyframe (c) {
		rr(c, -12, -9, 24, 18, 2, '#2a2152'); c.strokeStyle = K.gold; c.lineWidth = 2; c.strokeRect(-11, -8, 22, 16);
		c.fillStyle = K.gold; c.beginPath(); c.moveTo(0, -5); c.lineTo(5, 0); c.lineTo(0, 5); c.lineTo(-5, 0); c.closePath(); c.fill();
	},
	shelfCat (c, t) {
		const e = Math.sin(t * 3) > 0.9 ? 0.5 : 2; c.fillStyle = '#43367a';
		c.beginPath(); c.moveTo(-10, -3); c.lineTo(-8, -13); c.lineTo(-3, -7); c.lineTo(3, -7); c.lineTo(8, -13); c.lineTo(10, -3); c.closePath(); c.fill();
		c.beginPath(); ellipse(c, 0, 1, 10.5, 9, 0, 0, TAU); c.fill();
		c.fillStyle = K.gold; c.beginPath(); ellipse(c, -4, 0, 2, e, 0, 0, TAU); c.moveTo(6, 0); ellipse(c, 4, 0, 2, e, 0, 0, TAU); c.fill();
		c.fillStyle = K.coral; c.beginPath(); c.moveTo(-1.5, 4); c.lineTo(1.5, 4); c.lineTo(0, 5.5); c.closePath(); c.fill();
	},
	perfect (c, t) {
		c.save(); c.rotate(t * 0.8); c.fillStyle = K.gold; c.beginPath(); for (let i = 0; i < 8; i++) {const r = i % 2 ? 4 : 12, a = i * TAU / 8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r);} c.closePath(); c.fill(); c.restore(); circle(c, 0, 0, 3, '#fff6d8');
	},
	deadPixel (c, t) {
		c.globalAlpha = 0.3 + 0.2 * Math.sin(t * 8); c.fillStyle = K.coral; c.fillRect(-8, -8, 16, 16); c.globalAlpha = 1;
		c.fillStyle = '#000'; c.fillRect(-5, -5, 10, 10); c.fillStyle = K.coral; c.fillRect(-5, -5, 3, 3); c.fillRect(2, 2, 3, 3);
	},
	hdr (c) {rr(c, -14, -8, 28, 16, 4, K.gold); c.fillStyle = K.night; c.font = `700 9px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HDR', 0, 0.5);},
	bufferNet (c) {
		c.strokeStyle = K.mint; c.lineWidth = 2; dash(c, [3, 2.5]); c.beginPath(); c.moveTo(-13, 3); c.quadraticCurveTo(0, 12, 13, 3); c.stroke(); dash(c, []);
		rr(c, -7, -8, 14, 5, 2.5, K.ink); circle(c, 0, -12, 2.6, '#fff');
	}
};

function put (c, k, x, y, t, s = 1, rot = 0) {c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (s !== 1) c.scale(s, s); S[k](c, t); c.restore();}

// The 24 frames are one full stride. Cadence follows time and speed, so the legs keep up with the ground.
function stride (g) {
	const dt = Math.max(0, g.t - (g._st ?? g.t)); g._st = g.t;
	g._ph = ((g._ph || 0) + dt * 24 * (1.2 + g.speed / 650)) % 24; return Math.floor(g._ph);
}

// The runner has no slide pose, so it's drawn in the same style: feet first, leaning back, one hand on the floor.
function slidePose (c, t) {
	const w = Math.sin(t * 18) * 1.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 2.8;
	const limb = (col, pts) => {c.strokeStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();};
	c.globalAlpha = 0.35; for (let i = 0; i < 3; i++) circle(c, -19 - i * 6 - (t * 40 % 6), -1.5 - i, 2.4 - i * 0.5, '#cfc9f0'); c.globalAlpha = 1;
	limb(K.purple, [[-9, -15], [-14, -9], [-17, -1.5]]);
	limb(K.purple, [[-3, -5], [4, -1.5], [-1, -0.5]]);
	limb(K.blue, [[-3, -5], [7, -3], [17, -1.5]]);
	limb(K.blue, [[-3, -5], [-9, -15]]);
	limb(K.blue, [[-9, -15], [-3, -17 + w], [3, -19 + w]]);
	circle(c, -12, -21, 4.4, '#fff');
}

// Frame f of the loading screen's runner, painted at 110 px and scaled to 54 px with its feet on (x, y).
function runner (c, x, y, f, {slide = false, flip = false, s = 1} = {}) {
	c.save(); c.translate(x, y); c.scale(s, flip ? -s : s);
	if (slide) slidePose(c, Date.now() / 1000);
	else {c.translate(-27, -47); c.scale(54 / 110, 54 / 110); drawRunner(c, 110, (f % 24) / 24, false);}
	c.restore();
}

function hud (c, score, icons, t) {
	c.save(); rr(c, 8, 7, 92, 21, 6, 'rgba(8,6,22,.6)');
	c.font = HUD_FONT; c.fillStyle = K.ink; c.textBaseline = 'middle'; c.fillText(String(score).padStart(7, '0'), 15, 18);
	icons.filter(Boolean).forEach((k, i) => put(c, k, W - 20 - i * 28, 18, t, 0.85)); c.restore();
}

// Things on the ceiling are built in floor space and mirrored with H-y.
function BufferRun () {
	const G = 232, C = H - G, JUMP = 540, GRAVITY = 1500, g = {};
	let sky = null;
	const stars = Array.from({length: 40}, () => ({x: R(0, W), y: R(C + 4, 170), s: R(0.5, 1.6)}));
	const blds = Array.from({length: 9}, (_, i) => ({w: R(40, 68), h: R(30, 84), off: i * 72}));
	// p.y is the runner's middle, 20 px off its feet, so a flip turns it over in place.
	const feet = p => p.y + 20 * p.grav;
	const box = p => {
		const f = feet(p), s = p.slide > 0, w = s ? 26 : 18, a = f - (s ? 20 : 40) * p.grav, b = f - (s ? 0 : 2) * p.grav;
		return {x: p.x - w / 2, y: Math.min(a, b), w, h: Math.abs(b - a)};
	};
	const world = o => (o.side > 0 ? o : {x: o.x, y: H - o.y - o.h, w: o.w, h: o.h});
	g.reset = () => Object.assign(g, {over: false, t: 0, dist: 0, bonus: 0, score: 0, speed: 170, next: 1.2, things: [], inv: 0, flipAt: 3,
		p: {x: 72, y: G - 20, vy: 0, grav: 1, ground: true, jumps: 0, slide: 0, slideQ: 0, shield: 0, dash: 0, wantFlip: 0}});
	function spawn () {
		const r = Math.random(), x = W + 20, T = g.things, side = Math.random() < 0.7 ? g.p.grav : -g.p.grav;
		if (g.t > 5 && Math.random() < 0.12) {T.push({k: Math.random() < 0.55 ? 'directPlay' : 'skipIntro', x, y: G - R(58, 84), w: 22, h: 22, pick: 1, side}); return 0;}
		if (r < 0.3) T.push({k: 'cable', x, y: G - 18, w: 26, h: 18, side});
		else if (r < 0.48 && g.t > 4) T.push({k: 'banner', x, y: C, w: 34, h: G - 30 - C, side: Math.random() < 0.5 ? 1 : -1});
		else if (r < 0.64 && g.t > 8) T.push({k: 'lagBat', x, y: 0, y0: R(150, 168), ph: R(0, TAU), w: 22, h: 14, side});
		else if (r < 0.8 && g.t > 12) T.push({k: 'gremlin', x, y: G - 18, w: 18, h: 18, vy: 0, hop: R(0.3, 0.8), side});
		else return popcornArc(x, side);
		return 0;
	}
	// The five pieces sit along 80 percent of a jump's path at the current speed, so one jump can take them all.
	// Returns how long the arc takes to pass, so the next spawn waits for it.
	function popcornArc (x, side) {
		const air = 2 * JUMP / GRAVITY, span = 0.8 * air;
		for (let i = 0; i < 5; i++) {
			const t = air / 2 + (i - 2) * span / 4, f = JUMP * t - GRAVITY / 2 * t * t;
			g.things.push({k: 'popcorn', x: x + i * g.speed * span / 4, y: G - 27 - f, w: 12, h: 12, pick: 1, side});
		}
		return span;
	}
	g.update = dt => {
		const p = g.p; g.t += dt; g.speed = Math.min(520, 170 + g.t * 4.5);
		const v = g.speed * (p.dash > 0 ? 1.5 : 1); g.dist += v * dt; g.score = Math.floor(g.dist / 8) + g.bonus;
		p.vy += GRAVITY * p.grav * dt; p.y += p.vy * dt;
		const rest = p.grav > 0 ? G - 20 : C + 20;
		if ((p.y - rest) * p.grav >= 0) {p.y = rest; p.vy = 0; p.jumps = 0; p.ground = true; if (p.slideQ) {p.slide = 0.6; p.slideQ = 0;}}
		p.slide = Math.max(0, p.slide - dt); p.dash -= dt; p.shield -= dt; g.inv -= dt;
		if ((g.next -= dt) <= 0) {const pass = spawn(); g.next = Math.max(0.45, R(0.8, 1.4) * 260 / g.speed) + pass;}
		const pb = box(p);
		for (const o of g.things) {
			o.x -= v * dt;
			if (o.k === 'lagBat') {o.x -= 70 * dt; o.y = o.y0 + Math.sin(g.t * 5 + o.ph) * 14;}
			if (o.k === 'gremlin') {o.x -= 40 * dt; o.vy += 1200 * dt; o.y += o.vy * dt; if (o.y >= G - 18) {o.y = G - 18; o.vy = 0; if ((o.hop -= dt) <= 0) {o.vy = -R(260, 360); o.hop = R(0.5, 1.1);}}}
			if (o.dead || !hit(pb, world(o))) continue;
			if (o.pick) {
				o.dead = 1;
				if (o.k === 'popcorn') {g.bonus += 25; sfx(g, 'pickup');} else {sfx(g, 'powerup'); if (o.k === 'directPlay') p.shield = 10; else p.dash = 3;}
			} else if (p.dash > 0) {o.dead = 1; g.bonus += 50; sfx(g, 'break');}
			else if (p.shield > 0) {o.dead = 1; p.shield = 0; g.inv = 1; sfx(g, 'break');}
			else if (g.inv <= 0) g.over = true;
		}
		g.things = g.things.filter(onScreen);
	};
	g.jump = () => {
		const p = g.p;
		if (p.jumps === 0) {p.vy = -JUMP * p.grav; p.jumps = 1; p.ground = false; p.slide = 0; sfx(g, 'jump');}
		else if (p.jumps === 1) {p.grav *= -1; p.vy = 300 * p.grav; p.jumps = 2; sfx(g, 'whoosh');}
	};
	g.duck = () => {
		const p = g.p; sfx(g, 'swish');
		if (p.ground) p.slide = 0.6; else {p.vy = p.grav * Math.max(p.vy * p.grav, 650); p.slideQ = 1;}
	};
	g.ai = () => {
		const p = g.p;
		if (p.wantFlip && p.jumps === 1 && p.vy * p.grav > -400) {p.wantFlip = 0; g.jump(); return;}
		if (!p.ground) return;
		const near = g.things.filter(o => !o.pick && !o.dead && o.x + o.w > p.x - 14 && o.x - (p.x + 10) < g.speed * 1.1);
		if (!near.length && g.t > g.flipAt) {g.flipAt = g.t + R(3, 6); p.wantFlip = 1; g.jump(); return;}
		// A flip takes about a third of a second, so cross to a banner's sign side early.
		const wall = near.find(o => o.k === 'banner' && o.side !== p.grav && o.x - (p.x + 10) > g.speed * 0.5 && !near.some(b => b.k === 'banner' && b.side === p.grav && b.x < o.x));
		if (wall) {p.wantFlip = 1; g.jump(); return;}
		for (const o of near) {
			const d = o.x - (p.x + 10); if (d < -4) continue;
			if (o.side !== p.grav || d > g.speed * 0.45) continue;
			if (o.k === 'lagBat' && o.y0 <= 154) continue;
			if (o.k === 'banner' || o.k === 'lagBat') {if (d < g.speed * 0.22 && p.slide < 0.15) g.duck();}
			else if (d < g.speed * 0.2 + 8) g.jump();
			return;
		}
	};
	g.draw = (c, t) => {
		const p = g.p;
		c.fillStyle = sky || (sky = linear(c, 0, C, 0, G, [[0, '#0c0a1f'], [1, '#2a1d4f']])); c.fillRect(0, 0, W, H);
		c.fillStyle = K.ink; for (const s of stars) {c.globalAlpha = 0.3 + 0.4 * s.s / 1.6; c.fillRect(((s.x - g.dist * 0.02 * s.s) % W + W) % W, s.y, s.s, s.s);} c.globalAlpha = 1;
		c.globalAlpha = 0.18; circle(c, 404, 84, 26, '#f3eecf'); c.globalAlpha = 1; circle(c, 404, 84, 16, '#f3eecf'); circle(c, 398, 80, 3, '#ddd6b4'); circle(c, 410, 90, 2.2, '#ddd6b4');
		for (const b of blds) {
			const x = ((b.off - g.dist * 0.25) % 648 + 648) % 648 - 80; c.fillStyle = '#1b1538'; c.fillRect(x, G - b.h, b.w, b.h);
			c.fillStyle = 'rgba(255,201,74,.45)'; for (let j = 0; j < 3; j++) if ((b.off / 72 + j) % 3) c.fillRect(x + 8 + j * 14, G - b.h + 10, 4, 5);
		}
		c.fillStyle = '#1d1840'; c.fillRect(0, 0, W, C); c.fillRect(0, G, W, H - G);
		c.fillStyle = '#0c0a1f'; c.beginPath();
		for (const [y0, y1] of [[0, C], [G, H]]) for (let x = -(g.dist % 24); x < W; x += 24) {c.rect(x + 4, y0 + 6, 12, 7); c.rect(x + 4, y1 - 13, 12, 7);}
		c.fill(); c.fillStyle = K.purple; c.fillRect(0, C - 2, W, 2); c.fillRect(0, G, W, 2);
		for (const o of g.things) {
			const up = o.side < 0;
			if (o.k === 'banner') {
				c.save(); if (up) {c.translate(0, H); c.scale(1, -1);}
				c.fillStyle = '#4b4380'; c.fillRect(o.x + 15.5, o.y, 3, o.h - 24); put(c, 'banner', o.x + 17, o.y + o.h - 13, t); c.restore(); continue;
			}
			const cy = up ? H - o.y - o.h / 2 : o.y + o.h / 2;
			if (up && !o.pick && o.k !== 'lagBat') {c.save(); c.translate(o.x + o.w / 2, cy); c.scale(1, -1); S[o.k](c, t); c.restore();}
			else put(c, o.k, o.x + o.w / 2, cy, t);
		}
		const fr = stride(g);
		if (!(g.inv > 0 && (t * 16 | 0) % 2)) {
			const f = feet(p);
			if (p.dash > 0) {c.fillStyle = 'rgba(255,201,74,.55)'; for (let i = 0; i < 4; i++) c.fillRect(p.x - 44 - i * 10, f - (38 - i * 9) * p.grav, 26, 2);}
			runner(c, p.x, f, p.ground ? fr : 7, {slide: p.slide > 0, flip: p.grav < 0});
			if (p.shield > 0) {c.globalAlpha = 0.75; ring(c, p.x, p.y, 27, K.mint, 2); c.globalAlpha = 1;}
		}
		hud(c, g.score, [p.shield > 0 && 'directPlay', p.dash > 0 && 'skipIntro'], t);
	};
	return g;
}

function CableCrawl () {
	const CS = 15, COLS = 32, ROWS = 16, OY = 30, g = {}, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
	const key = (x, y) => x + ',' + y;
	g.blockedAt = (x, y) => g.blocks.some(b => x >= b.x && x < b.x + b.s && y >= b.y && y < b.y + b.s);
	g.bodyAt = (x, y, from = 0, skipTail = false) => {const n = g.body.length - (skipTail ? 1 : 0); for (let i = from; i < n; i++) if (g.body[i].x === x && g.body[i].y === y) return true; return false;};
	g.foeAt = (x, y) => g.foes.some(f => f.x === x && f.y === y);
	g.free = (s = 1) => {
		const h = g.body[0];
		for (let i = 0; i < 300; i++) {
			const x = RI(0, COLS - s), y = RI(0, ROWS - s); let ok = Math.abs(x - h.x) + Math.abs(y - h.y) > 4;
			for (let dx = 0; dx < s && ok; dx++) {
				for (let dy = 0; dy < s && ok; dy++) {
					const X = x + dx, Y = y + dy;
					if (g.bodyAt(X, Y) || g.blockedAt(X, Y) || g.foeAt(X, Y) || (g.food && g.food.x === X && g.food.y === Y) || g.items.some(it => it.x === X && it.y === Y)) ok = false;
				}
			}
			if (ok) return {x, y};
		}
		return {x: 0, y: 0};
	};
	g.reset = () => {
		Object.assign(g, {over: false, t: 0, score: 0, eaten: 0, tick: 0, n: 0, step: 0.13, dir: [1, 0], queue: [], grow: 2, ghost: 0, food: null,
			body: [{x: 8, y: 8}, {x: 7, y: 8}, {x: 6, y: 8}], blocks: [], foes: [], items: []}); g.food = g.free();
	};
	g.update = dt => {
		g.t += dt; g.ghost -= dt; for (const it of g.items) it.life -= dt; g.items = g.items.filter(it => it.life > 0);
		if ((g.tick += dt) < g.step) return; g.tick = 0; g.n++;
		if (g.queue.length) g.dir = g.queue.shift();
		const h = g.body[0], nx = h.x + g.dir[0], ny = h.y + g.dir[1], ghost = g.ghost > 0;
		if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {g.over = true; return;}
		if (!ghost && (g.bodyAt(nx, ny, 0, g.grow === 0) || g.blockedAt(nx, ny) || g.foeAt(nx, ny))) {g.over = true; return;}
		g.body.unshift({x: nx, y: ny}); if (g.grow > 0) g.grow--; else g.body.pop();
		if (nx === g.food.x && ny === g.food.y) {
			g.eaten++; g.score += 10 + g.body.length; g.grow += 2; g.step = Math.max(0.065, 0.13 - g.eaten * 0.002); sfx(g, 'pickup');
			if (g.eaten % 3 === 0) g.blocks.push({...g.free(), s: 1, k: 'staticBlock'});
			if (g.eaten % 5 === 0) g.blocks.push({...g.free(2), s: 2, k: 'brick'});
			if (g.eaten === 4 || (g.eaten % 12 === 0 && g.foes.length < 3)) g.foes.push({...g.free(), k: 'bug'});
			if (g.eaten === 8) g.foes.push({...g.free(), k: 'tangle'});
			if (g.eaten % 6 === 0) g.items.push({...g.free(), k: Math.random() < 0.5 ? 'ghost' : 'snip', life: 8});
			g.food = g.free();
		}
		const item = g.items.find(i => i.x === nx && i.y === ny);
		if (item) {
			item.life = 0;
			if (item.k === 'ghost') {g.ghost = 5; sfx(g, 'powerup');}
			else {const keep = Math.max(3, Math.ceil(g.body.length / 2)); g.score += 5 * (g.body.length - keep); g.body.length = keep; g.grow = 0; sfx(g, 'break');}
		}
		const head = g.body[0];
		for (const f of g.foes) {
			if (f.k === 'bug' && g.n % 2) continue; if (f.k === 'tangle' && g.n % 3) continue;
			const opts = D.map(d => ({x: f.x + d[0], y: f.y + d[1]})).filter(q => q.x >= 0 && q.y >= 0 && q.x < COLS && q.y < ROWS && !g.blockedAt(q.x, q.y) && !g.bodyAt(q.x, q.y, 1) && !g.foeAt(q.x, q.y) && !(q.x === g.food.x && q.y === g.food.y));
			if (!opts.length) continue;
			const to = f.k === 'tangle' ? opts.sort((a, b) => Math.abs(a.x - head.x) + Math.abs(a.y - head.y) - Math.abs(b.x - head.x) - Math.abs(b.y - head.y))[0] : opts[RI(0, opts.length - 1)];
			f.x = to.x; f.y = to.y;
			if (!ghost && f.x === head.x && f.y === head.y) g.over = true;
		}
	};
	g.press = b => {
		const d = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]}[b]; if (!d) return;
		const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
		if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
		if (g.queue.length < 2) g.queue.push(d);
	};
	g.ai = () => {
		if (g.tick < g.step * 0.8) return; const h = g.body[0];
		const blocked = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || g.bodyAt(x, y) || g.blockedAt(x, y) || g.foes.some(f => Math.abs(f.x - x) + Math.abs(f.y - y) <= 1);
		const prev = new Map([[key(h.x, h.y), null]]), q = [[h.x, h.y]], goals = new Set([key(g.food.x, g.food.y), ...g.items.map(i => key(i.x, i.y))]);
		let end = null;
		while (q.length) {
			const [x, y] = q.shift(); if (goals.has(key(x, y))) {end = key(x, y); break;}
			for (const d of D) {const X = x + d[0], Y = y + d[1], k = key(X, Y); if (prev.has(k) || blocked(X, Y)) continue; prev.set(k, [x, y, d]); q.push([X, Y]);}
		}
		let dir = null;
		for (let k = end; k;) {const pv = prev.get(k); if (!pv) break; if (pv[0] === h.x && pv[1] === h.y) {dir = pv[2]; break;} k = key(pv[0], pv[1]);}
		if (!dir) {
			let most = -1;
			for (const d of D) {
				const X = h.x + d[0], Y = h.y + d[1]; if (blocked(X, Y)) continue;
				const n = D.filter(e => !blocked(X + e[0], Y + e[1])).length; if (n > most) {most = n; dir = d;}
			}
		}
		if (dir) g.queue = [dir];
	};
	g.draw = (c, t) => {
		const cx = x => x * CS + CS / 2, cy = y => OY + y * CS + CS / 2;
		c.fillStyle = '#0c0a1f'; c.fillRect(0, 0, W, H); c.fillStyle = '#120f2b'; c.fillRect(0, OY, W, ROWS * CS);
		// The 512 grid dots go out as one path, since a fillRect each is too many draw calls for an old TV.
		c.fillStyle = '#262050'; c.beginPath(); for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) c.rect(x * CS + 7, OY + y * CS + 7, 1.5, 1.5); c.fill();
		c.strokeStyle = K.purple; c.lineWidth = 1; c.strokeRect(0.5, OY + 0.5, W - 1, ROWS * CS - 1);
		for (const b of g.blocks) put(c, b.k, b.x * CS + b.s * CS / 2, OY + b.y * CS + b.s * CS / 2, b.k === 'staticBlock' ? t : 0);
		put(c, 'signal', cx(g.food.x), cy(g.food.y), t);
		for (const it of g.items) if (it.life > 2 || (t * 8 | 0) % 2) put(c, it.k, cx(it.x), cy(it.y), t);
		for (const f of g.foes) put(c, f.k, cx(f.x), cy(f.y), t);
		if (g.ghost > 0) c.globalAlpha = 0.5;
		c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); g.body.forEach((s, i) => (i ? c.lineTo(cx(s.x), cy(s.y)) : c.moveTo(cx(s.x), cy(s.y))));
		c.strokeStyle = K.blue; c.lineWidth = 10; c.stroke(); c.strokeStyle = K.purple; c.lineWidth = 2.5; c.stroke();
		const h = g.body[0]; put(c, 'plug', cx(h.x), cy(h.y), t, 1, Math.atan2(g.dir[1], g.dir[0]));
		c.globalAlpha = 1; c.lineCap = 'butt';
		hud(c, g.score, [g.ghost > 0 && 'ghost'], t);
	};
	return g;
}

function FastForward () {
	const LY = [158, 198, 240], g = {}, FOOT = {velvetRope: 11, popcornCart: 22, rollingReel: 11, usher: 19, ticket: 30, magnet: 34, frontRowPass: 34};
	let posters = null;
	const depth = y => 0.78 + (y - LY[0]) / (LY[2] - LY[0]) * 0.22;
	const nearest = y => LY.reduce((b, l, i) => (Math.abs(l - y) < Math.abs(LY[b] - y) ? i : b), 0);
	const laneOf = o => nearest(o.fy ?? LY[o.lane]);
	g.reset = () => Object.assign(g, {over: false, t: 0, dist: 0, bonus: 0, score: 0, speed: 230, next: 1, things: [], inv: 0,
		p: {x: 90, lane: 1, ly: LY[1], jy: 0, jv: 0, pass: 0, mag: 0}});
	function spawn () {
		const T = g.things, x = W + 30, lane = RI(0, 2), r = Math.random();
		if (g.t > 5 && Math.random() < 0.1) {T.push({k: Math.random() < 0.5 ? 'magnet' : 'frontRowPass', x, lane, w: 20, pick: 1}); return;}
		let k = r < 0.3 ? 'popcornCart' : r < 0.5 ? 'velvetRope' : r < 0.64 && g.t > 6 ? 'rollingReel' : r < 0.76 && g.t > 10 ? 'usher' : null;
		if (!k) {for (let i = 0; i < 4; i++) T.push({k: 'ticket', x: x + i * 22, lane, w: 14, pick: 1}); return;}
		// Never wall off all three lanes at once.
		if ((k === 'popcornCart' || k === 'usher') && new Set(T.filter(o => o.tall && o.lane !== lane && Math.abs(o.x - x) < 110).map(o => o.lane)).size >= 2) k = 'velvetRope';
		T.push({k, x, lane, w: {popcornCart: 30, velvetRope: 30, rollingReel: 22, usher: 16}[k], tall: k === 'popcornCart' || k === 'usher', sw: R(0.5, 1.3)});
	}
	g.update = dt => {
		const p = g.p; g.t += dt; g.speed = Math.min(500, 230 + g.t * 6); const v = g.speed;
		g.dist += v * dt; g.score = Math.floor(g.dist / 8) + g.bonus;
		p.ly += clamp(LY[p.lane] - p.ly, -420 * dt, 420 * dt);
		if (p.jy > 0 || p.jv > 0) {p.jv -= 1400 * dt; p.jy += p.jv * dt; if (p.jy <= 0) {p.jy = 0; p.jv = 0;}}
		p.mag -= dt; g.inv -= dt;
		if ((g.next -= dt) <= 0) {spawn(); g.next = Math.max(0.35, R(0.55, 1) * 260 / v);}
		const cl = nearest(p.ly);
		for (const o of g.things) {
			o.x -= v * dt;
			if (o.k === 'rollingReel') o.x -= 120 * dt;
			if (o.k === 'usher') {o.x -= 30 * dt; if ((o.sw -= dt) <= 0) {o.lane = o.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1; o.sw = 99;}}
			o.fy = o.fy == null ? LY[o.lane] : o.fy + clamp(LY[o.lane] - o.fy, -160 * dt, 160 * dt);
			if (o.k === 'ticket' && p.mag > 0 && o.x - p.x < 150) {o.lane = cl; o.fy = p.ly; o.x -= 180 * dt;}
			if (o.dead || laneOf(o) !== cl || o.x > p.x + 9 || o.x + o.w < p.x - 9) continue;
			if (o.pick) {
				o.dead = 1;
				if (o.k === 'ticket') {g.bonus += 25; sfx(g, 'pickup');} else {sfx(g, 'powerup'); if (o.k === 'magnet') p.mag = 8; else p.pass = 1;}
			} else if ((o.tall || p.jy <= 16) && g.inv <= 0) {
				if (p.pass) {p.pass = 0; g.inv = 1.2; o.dead = 1; sfx(g, 'break');} else g.over = true;
			}
		}
		g.things = g.things.filter(onScreen);
	};
	g.press = b => {
		const p = g.p;
		if (b === 'up' && p.lane > 0) {p.lane--; sfx(g, 'swish');}
		else if (b === 'down' && p.lane < 2) {p.lane++; sfx(g, 'swish');}
		else if (b === 'ok' && p.jy === 0 && p.jv === 0) {p.jv = 420; sfx(g, 'jump');}
	};
	g.ai = () => {
		const p = g.p, v = g.speed; let h = null;
		for (const o of g.things) {if (o.pick || o.dead || laneOf(o) !== p.lane) continue; const gap = o.x - p.x - 9; if (gap < -o.w || gap > v * 0.6) continue; if (!h || o.x < h.x) h = o;}
		if (!h) return;
		const d = h.x - p.x - 9, cl = v + (h.k === 'rollingReel' ? 120 : h.k === 'usher' ? 30 : 0);
		if (!h.tall) {if (d < cl * 0.16 && p.jy === 0) g.press('ok'); return;}
		if (d < cl * 0.45) {
			const free = l => l >= 0 && l <= 2 && !g.things.some(o => o.tall && !o.dead && laneOf(o) === l && o.x - p.x > -40 && o.x - p.x < cl * 0.6);
			if (free(p.lane - 1)) g.press('up'); else if (free(p.lane + 1)) g.press('down');
		}
	};
	g.draw = (c, t) => {
		const p = g.p;
		c.fillStyle = '#140f2e'; c.fillRect(0, 0, W, 134);
		posters = posters || [K.blue, K.purple, K.coral].map(col => linear(c, 0, 26, 0, 104, [[0, col], [1, '#1d1840']]));
		for (let i = 0; i < 6; i++) {
			const x = ((i * 110 - g.dist * 0.4) % 660 + 660) % 660 - 90; rr(c, x, 22, 62, 86, 4, '#2a2152'); rr(c, x + 5, 27, 52, 76, 2, posters[i % 3]);
			for (let j = 0; j < 6; j++) circle(c, x + 6 + j * 10, 16, 1.6, (j + i + (t * 5 | 0)) % 2 ? K.gold : '#6b4f1c');
		}
		c.fillStyle = '#211a45'; c.fillRect(0, 134, W, H - 134); c.fillStyle = '#2a2152'; c.fillRect(0, 134, W, 4);
		c.fillStyle = 'rgba(255,201,74,.45)'; c.beginPath(); for (const y of [178, 219]) for (let x = -(g.dist % 28); x < W; x += 28) c.rect(x, y, 14, 2); c.fill();
		const items = g.things.map(o => ({y: o.fy ?? LY[o.lane], o})).concat([{y: p.ly, me: 1}]).sort((a, b) => a.y - b.y);
		for (const it of items) {
			const s = depth(it.y);
			c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); ellipse(c, it.me ? p.x : it.o.x + it.o.w / 2, it.y + 1, 12 * s, 3 * s, 0, 0, TAU); c.fill();
			if (it.me) {
				if (g.inv > 0 && (t * 16 | 0) % 2) continue;
				runner(c, p.x, p.ly - p.jy, p.jy > 0 ? 7 : stride(g), {s});
				if (p.pass) {c.globalAlpha = 0.75; ring(c, p.x, p.ly - p.jy - 20 * s, 26 * s, K.mint, 2); c.globalAlpha = 1;}
				continue;
			}
			put(c, it.o.k, it.o.x + it.o.w / 2, it.y - FOOT[it.o.k] * s, t, s);
		}
		hud(c, g.score, [p.pass && 'frontRowPass', p.mag > 0 && 'magnet'], t);
	};
	return g;
}

// shelf is the case spines as {title, col, dark}.
function CaseStack (shelf) {
	const CH = 14, BASE = 244, FULL = 150, g = {}, PERFECT = $L('Perfect').toUpperCase(), BOX_SET = $L('Box Set').toUpperCase();
	let bg = null;
	const yOf = i => BASE - (i + 1) * CH;
	// off is how far this piece's left edge sits from the case's own, so a trimmed piece keeps its part of the title.
	// The caller sets the font once, since setting it per case is slow on an old TV.
	function slab (c, x, y, w, s, off = 0) {
		if (w <= 0) return; const col = s.steel ? '#b8bdd6' : s.col; rr(c, x, y + 1, w, CH - 2, 2, col);
		if (!off) {c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y + 1, Math.min(4, w), CH - 2);}
		c.save(); c.beginPath(); c.rect(x, y, w, CH); c.clip();
		c.fillStyle = s.steel || s.dark ? K.night : '#fff'; c.fillText(s.title, x - off + 7, y + CH / 2 + 0.5); c.restore();
	}
	const pick = n => shelf[(g.seed + n) % shelf.length];
	g.spawn = () => {
		const n = g.stack.length, top = g.stack[n - 1], steel = n % 10 === 9, cat = n > 8 && !steel && Math.random() < 0.12, left = Math.random() < 0.5;
		const {title, col, dark} = pick(n);
		g.cur = {x: left ? 12 : W - 12 - top.w, w: top.w, dir: left ? 1 : -1, v: Math.min(330, 110 + n * 6) * (steel ? 1.6 : 1) * (cat ? 1.5 : 1), steel, title, col, dark};
		g.paw = cat ? 0.5 : 0; g.pawX = left ? 16 : W - 16;
		if (cat) sfx(g, 'whoosh');
		g.aim = Math.random() < 0.3 ? 0 : R(-1, 1) * (4 + n * 0.15);
	};
	g.reset = () => {
		g.seed = RI(0, shelf.length - 1); const {title, col, dark} = pick(0); g.seed++;
		Object.assign(g, {over: false, t: 0, score: 0, bonus: 0, combo: 0, cam: 0, flash: 0, fx: [], stack: [{x: (W - FULL) / 2, tx: (W - FULL) / 2, w: FULL, title, col, dark}]}); g.spawn();
	};
	g.drop = () => {
		const c = g.cur; if (!c) return;
		const top = g.stack[g.stack.length - 1], y = yOf(g.stack.length), dx = c.x - top.x, same = {title: c.title, col: c.col, dark: c.dark, steel: c.steel, tx: c.x};
		sfx(g, 'thud');
		if (Math.abs(dx) < 3) {
			g.combo++; const w = Math.min(FULL, top.w + (g.combo % 3 ? 6 : 30)), x = top.x - (w - top.w) / 2;
			g.stack.push({...same, x, tx: x, w}); g.bonus += g.combo * 5; g.flash = 0.6; sfx(g, g.combo % 3 ? 'pickup' : 'powerup');
		} else {
			g.combo = 0; const l = Math.max(c.x, top.x), r = Math.min(c.x + c.w, top.x + top.w);
			if (r <= l) {g.fx.push({...same, x: c.x, w: c.w, y, vy: 0, rot: 0, vr: dx > 0 ? 2 : -2}); g.cur = null; g.over = true; return;}
			g.stack.push({...same, x: l, w: r - l}); sfx(g, 'break');
			g.fx.push({...same, x: dx > 0 ? r : c.x, w: c.w - (r - l), y, vy: 0, rot: 0, vr: dx > 0 ? 2.5 : -2.5});
		}
		g.score = g.stack.length - 1 + g.bonus; g.spawn();
	};
	g.update = dt => {
		g.t += dt; g.paw -= dt; g.flash -= dt; const c = g.cur;
		if (c) {c.x += c.dir * c.v * dt; if (c.x < 12) {c.x = 12; c.dir = 1;} if (c.x + c.w > W - 12) {c.x = W - 12 - c.w; c.dir = -1;}}
		for (const f of g.fx) {f.vy += 900 * dt; f.y += f.vy * dt; f.rot += f.vr * dt;}
		g.fx = g.fx.filter(f => f.y + g.cam < H + 40);
		g.cam += (Math.max(0, (g.stack.length - 9) * CH) - g.cam) * Math.min(1, dt * 5);
	};
	g.ai = () => {
		const c = g.cur; if (!c) return;
		const target = clamp(g.stack[g.stack.length - 1].x + g.aim, 12, W - 12 - c.w), next = c.x + c.dir * c.v / 60;
		if ((c.x - target) * (next - target) <= 0) g.drop();
	};
	g.draw = (c, t) => {
		c.fillStyle = bg || (bg = linear(c, 0, 0, 0, H, [[0, '#120e2c'], [1, '#241a4a']])); c.fillRect(0, 0, W, H);
		c.fillStyle = 'rgba(170,92,195,.1)'; for (let i = 0; i < 5; i++) c.fillRect(0, ((i * 64 + g.cam * 0.4) % 320) - 20, W, 5);
		c.save(); c.translate(0, g.cam); c.font = `700 7.5px ${MONO}`; c.textBaseline = 'middle';
		c.fillStyle = '#3a2f6b'; c.fillRect(70, BASE, W - 140, 7); c.fillStyle = '#2a2152'; c.fillRect(84, BASE + 7, 9, 60); c.fillRect(W - 93, BASE + 7, 9, 60);
		const n = g.stack.length; for (let i = Math.max(0, n - 16); i < n; i++) {const s = g.stack[i]; slab(c, s.x, yOf(i), s.w, s, s.x - s.tx);}
		if (g.cur) slab(c, g.cur.x, yOf(n), g.cur.w, g.cur);
		for (const f of g.fx) {c.save(); c.translate(f.x + f.w / 2, f.y + CH / 2); c.rotate(f.rot); slab(c, -f.w / 2, -CH / 2, f.w, f, f.x - f.tx); c.restore();}
		c.restore();
		const y = yOf(n) + g.cam;
		if (g.paw > 0) {c.globalAlpha = Math.min(1, g.paw * 4); put(c, 'shelfCat', g.pawX, y + CH / 2, t, 0.9); c.globalAlpha = 1;}
		if (g.flash > 0) {
			c.globalAlpha = Math.min(1, g.flash * 3); c.font = `26px ${DISP}`; c.textAlign = 'center'; c.fillStyle = K.gold;
			c.fillText(g.combo % 3 ? PERFECT : BOX_SET, W / 2, y - 10); c.globalAlpha = 1; c.textAlign = 'left';
		}
		hud(c, g.score, [g.combo > 0 && 'perfect'], t);
	};
	return g;
}

function PixelPurge () {
	const BW = 36, BH = 12, GAP = 3, N = 12, OX = (W - N * (BW + GAP) + GAP) / 2, TOP = 34, PY = 248, LIMIT = 232, TONE = [K.blue, K.purple, K.coral], g = {};
	let bg = null;
	const row = y => {for (let i = 0; i < N; i++) if (Math.random() < 0.72) {const hp = Math.random() < 0.1 ? 3 : 1; g.blocks.push({x: OX + i * (BW + GAP), y, hp, max: hp, c: RI(0, 2), seed: RI(0, 7)});}};
	g.reset = () => {
		Object.assign(g, {over: false, t: 0, score: 0, blocks: [], drops: [], fx: [], rowY: TOP, aimOff: 0,
			p: {x: W / 2, tx: W / 2, cw: 60, hdr: 0, shrink: 0, net: false}, b: {x: W / 2, y: PY - 12, vx: 110, vy: -200}});
		for (let r = 4; r >= 0; r--) row(TOP + r * (BH + GAP));
	};
	function smash (k) {
		k.dead = 1; g.score += k.max > 1 ? 30 : 10; sfx(g, 'break');
		for (let i = 0; i < 6; i++) g.fx.push({x: k.x + R(0, BW), y: k.y + R(0, BH), vx: R(-60, 60), vy: R(-40, 60), l: R(0.25, 0.5), col: k.max > 1 ? K.gold : TONE[k.c]});
		if (k.max > 1) g.drops.push({k: Math.random() < 0.5 ? 'hdr' : 'bufferNet', x: k.x + BW / 2, y: k.y + BH / 2});
		else if (Math.random() < 0.08) g.drops.push({k: 'deadPixel', x: k.x + BW / 2, y: k.y + BH / 2});
	}
	g.update = dt => {
		const p = g.p, b = g.b; g.t += dt; p.hdr -= dt; p.shrink -= dt;
		const drift = 2 + g.t * 0.025; for (const k of g.blocks) {k.y += drift * dt; k.flash = (k.flash || 0) - dt;} g.rowY += drift * dt;
		if (g.rowY >= TOP + BH + GAP) {g.rowY -= BH + GAP; row(g.rowY);}
		p.cw = 60 * (p.hdr > 0 ? 2 : 1) * (p.shrink > 0 ? 0.65 : 1);
		p.x += clamp(p.tx - p.x, -330 * dt, 330 * dt); p.x = clamp(p.x, p.cw / 2, W - p.cw / 2);
		const spd = Math.min(360, 220 + g.t * 2), m = Math.hypot(b.vx, b.vy); b.vx *= spd / m; b.vy *= spd / m;
		// Two sub-steps keep a fast ball from skipping through a block.
		for (let s = 0; s < 2; s++) {
			b.x += b.vx * dt / 2; b.y += b.vy * dt / 2;
			if (b.x < 4) {b.x = 4; b.vx = Math.abs(b.vx);} else if (b.x > W - 4) {b.x = W - 4; b.vx = -Math.abs(b.vx);}
			if (b.y < TOP) {b.y = TOP; b.vy = Math.abs(b.vy);}
			if (b.vy > 0 && b.y >= PY - 4 && b.y <= PY + 6 && Math.abs(b.x - p.x) <= p.cw / 2 + 4) {
				const a = clamp((b.x - p.x) / (p.cw / 2), -1, 1) * 1.05;
				b.vx = Math.sin(a) * spd; b.vy = -Math.cos(a) * spd; b.y = PY - 4; g.aimOff = R(-0.4, 0.4) * p.cw; sfx(g, 'tick');
			}
			if (p.net && b.vy > 0 && b.y >= PY + 14) {b.vy = -Math.abs(b.vy); b.y = PY + 14; p.net = false; sfx(g, 'thud');}
			for (const k of g.blocks) {
				if (k.dead || b.x + 4 < k.x || b.x - 4 > k.x + BW || b.y + 4 < k.y || b.y - 4 > k.y + BH) continue;
				const ox = Math.min(b.x + 4 - k.x, k.x + BW - b.x + 4), oy = Math.min(b.y + 4 - k.y, k.y + BH - b.y + 4);
				if (ox < oy) b.vx = b.x < k.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); else b.vy = b.y < k.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
				if (--k.hp <= 0) smash(k); else {k.flash = 0.1; sfx(g, 'thud');}
				break;
			}
		}
		g.blocks = g.blocks.filter(k => !k.dead);
		for (const d of g.drops) {
			d.y += 90 * dt;
			if (!d.got && d.y >= PY - 6 && d.y <= PY + 6 && Math.abs(d.x - p.x) <= p.cw / 2 + 6) {
				d.got = 1;
				if (d.k === 'hdr') p.hdr = 8; else if (d.k === 'bufferNet') p.net = true; else p.shrink = 6;
				sfx(g, d.k === 'deadPixel' ? 'back' : 'powerup');
			}
		}
		g.drops = g.drops.filter(d => !d.got && d.y < H + 10);
		for (const f of g.fx) {f.x += f.vx * dt; f.y += f.vy * dt; f.l -= dt;} g.fx = g.fx.filter(f => f.l > 0);
		if (b.y > H + 6 || g.blocks.some(k => k.y + BH > LIMIT)) g.over = true;
	};
	// Unfold the wall bounces to find where the ball will cross the bar, then aim off-center for a new angle.
	g.ai = () => {
		const p = g.p, b = g.b; if (b.vy <= 0) {p.tx = b.x; return;}
		const span = W - 8; let x = b.x + b.vx * (PY - 4 - b.y) / b.vy - 4; x = ((x % (2 * span)) + 2 * span) % (2 * span); if (x > span) x = 2 * span - x;
		p.tx = x + 4 - g.aimOff;
	};
	g.draw = (c, t) => {
		const p = g.p, b = g.b;
		c.fillStyle = bg || (bg = linear(c, 0, 0, W, H, [[0, '#1a1238'], [1, '#0b1f38']])); c.fillRect(0, 0, W, H);
		c.strokeStyle = 'rgba(255,107,133,.35)'; c.lineWidth = 1; dash(c, [4, 4]); c.beginPath(); c.moveTo(0, LIMIT + 0.5); c.lineTo(W, LIMIT + 0.5); c.stroke(); dash(c, []);
		for (const k of g.blocks) {
			if (k.max > 1) {
				rr(c, k.x, k.y, BW, BH, 2, '#2a2152'); c.strokeStyle = K.gold; c.lineWidth = 1.5; c.strokeRect(k.x + 0.75, k.y + 0.75, BW - 1.5, BH - 1.5);
				for (let i = 0; i < k.hp; i++) circle(c, k.x + BW / 2 - 6 + i * 6, k.y + BH / 2, 1.6, K.gold);
			} else {
				c.fillStyle = TONE[k.c]; c.fillRect(k.x, k.y, BW, BH);
			}
			if (k.flash > 0) {c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(k.x, k.y, BW, BH);}
		}
		// Only a keyframe flashes, so the plain blocks' tiles can go out as one light and one dark path.
		const tiles = (col, dark) => {
			c.fillStyle = col; c.beginPath();
			for (const k of g.blocks) if (k.max === 1) for (let i = 0; i < 6; i++) if (((i + k.seed) % 3 === 0) === dark) c.rect(k.x + i * 6, k.y + ((i + k.seed) % 2) * 6, 6, 6);
			c.fill();
		};
		tiles('rgba(255,255,255,.16)', false); tiles('rgba(0,0,0,.22)', true);
		for (const d of g.drops) put(c, d.k, d.x, d.y, t, 0.75);
		for (const f of g.fx) {c.globalAlpha = Math.min(1, f.l * 3); c.fillStyle = f.col; c.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);} c.globalAlpha = 1;
		c.fillStyle = '#2c2756'; c.fillRect(8, PY + 3, W - 16, 3); c.fillStyle = K.blue; c.fillRect(8, PY + 3, Math.max(0, p.x - 8), 3);
		if (p.net) {c.strokeStyle = K.mint; c.lineWidth = 1.5; dash(c, [3, 3]); c.beginPath(); c.moveTo(8, PY + 15); c.lineTo(W - 8, PY + 15); c.stroke(); dash(c, []);}
		rr(c, p.x - p.cw / 2, PY - 3, p.cw, 9, 4.5, p.hdr > 0 ? K.gold : p.shrink > 0 ? K.coral : K.ink);
		circle(c, b.x, b.y, 5, '#fff'); c.fillStyle = K.night; c.beginPath(); c.moveTo(b.x - 1.5, b.y - 2.5); c.lineTo(b.x + 2.5, b.y); c.lineTo(b.x - 1.5, b.y + 2.5); c.closePath(); c.fill();
		hud(c, g.score, [p.hdr > 0 && 'hdr', p.net && 'bufferNet'], t);
	};
	return g;
}

// The lineup, in the order the arcade shows it. The ids are the ones the server and storage use.
const MAKERS = {'buffer-run': BufferRun, 'fast-forward': FastForward, 'cable-crawl': CableCrawl, 'case-stack': CaseStack, 'pixel-purge': PixelPurge};
export const GAME_IDS = Object.keys(MAKERS);
export const makeGame = (id, shelf) => MAKERS[id](shelf);

// Plays a fresh game on its own for a few seconds, so a demo or a thumbnail opens mid-run.
export const simulate = (g, sec) => {
	g.reset();
	for (let i = 0; i < sec * 60; i++) {
		if (g.over) g.reset();
		g.ai(); g.update(1 / 60);
	}
	if (g.over) g.reset();
	return g;
};

// Each How to play entry is [sprite, scale, nudge down, nudge right].
export const CAST = {
	'buffer-run': {enemy: [['lagBat', 1.6], ['gremlin', 1.6]], obstacle: [['cable', 1.25], ['banner', 0.95, 9]], power: [['directPlay', 1.5], ['skipIntro', 1.3], ['popcorn', 1.8]]},
	'fast-forward': {enemy: [['rollingReel', 1.5], ['usher', 0.95, 1, 8]], obstacle: [['velvetRope', 1.2], ['popcornCart', 0.8, 2]], power: [['frontRowPass', 1.3, 1], ['magnet', 1.5, -1], ['ticket', 1.8]]},
	'cable-crawl': {enemy: [['bug', 1.8], ['tangle', 1.8]], obstacle: [['staticBlock', 1.8], ['brick', 1.1]], power: [['ghost', 1.8], ['snip', 1.8], ['signal', 2]]},
	'case-stack': {enemy: [['shelfCat', 1.2]], obstacle: [['bluCase', 1.2], ['steelbook', 1.2]], power: [['perfect', 1.3], ['boxSet', 1.3]]},
	'pixel-purge': {enemy: [['deadPixel', 1.3]], obstacle: [['macroblock', 1.2], ['keyframe', 1.3]], power: [['hdr', 1.3], ['bufferNet', 1.4]]}
};

// One still sprite in an 88 px square.
export const drawIcon = (c, k, s = 1, dy = 0, dx = 0) => {
	c.save(); c.scale(2, 2); c.translate(22 + dx, 22 + dy); c.scale(s, s); S[k](c, 0.35); c.restore();
};

// The top stays fully dark down past the HUD, so the frozen run's score doesn't show through the text.
export const drawDim = (c) => {
	c.fillStyle = linear(c, 0, 0, 0, H, [[0, 'rgba(8,6,22,1)'], [0.11, 'rgba(8,6,22,1)'], [0.2, 'rgba(8,6,22,.8)'], [1, 'rgba(8,6,22,.8)']]);
	c.fillRect(0, 0, W, H);
};

// The menu's shade over the demo, dark where its text and row sit. The top is held dark past the HUD,
// so the demo's score doesn't show behind the brand. A gradient doesn't belong to the canvas that made
// it, so the three are made once.
let shade = null;
export const drawShade = (c) => {
	shade = shade || [
		linear(c, 0, 0, 0, H, [[0, 'rgba(10,8,28,1)'], [0.11, 'rgba(10,8,28,1)'], [0.22, 'rgba(10,8,28,0)']]),
		linear(c, 0, 0, W, 0, [[0, 'rgba(10,8,28,.94)'], [0.45, 'rgba(10,8,28,.6)'], [0.78, 'rgba(10,8,28,.1)'], [1, 'rgba(10,8,28,.1)']]),
		linear(c, 0, H, 0, 0, [[0, 'rgba(10,8,28,.96)'], [0.46, 'rgba(10,8,28,0)']])
	];
	for (const fill of shade) {c.fillStyle = fill; c.fillRect(0, 0, W, H);}
};
