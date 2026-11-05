import {memo, useEffect, useMemo, useRef} from 'react';

import {getPerfTier} from '../../utils/perfTier';
import {normalizeSeasonalDensity, normalizeSeasonalTheme} from '../../utils/seasonalEffects';
import {buildSeasonalParticles} from './seasonalParticles';
import SeasonalFollower from './SeasonalFollower';

import css from './SeasonalTheme.module.less';

// Every particle is a CSS animation on transform or opacity, which the compositor runs on
// its own, so the effect costs no JS per frame. A falling particle is a single element:
// its keyframes carry the fall and the sway together, since each animated element is a
// layer and layers are what the low tier pays for.
const Falling = ({particle}) => (
	<div
		className={`${css.particle} ${css[particle.path]} ${css[particle.shape]}`}
		style={particle.style}
	/>
);

// A flyer is two layers, the flight across the screen and the flap, buzz or float.
const Flyer = ({flyer}) => (
	<div className={`${css.flyer} ${css[flyer.path]}`} style={flyer.style}>
		<div className={css[flyer.sprite]} style={flyer.spriteStyle} />
	</div>
);

// The mover jumps to its next spot while the burst is dark. The sparks sit still inside
// one ring that grows, sags and fades, so a whole burst is four layers.
const Burst = ({burst}) => (
	<div className={`${css.mover} ${css[burst.mover]}`} style={burst.moverStyle}>
		<div className={css.rocket} style={burst.partStyle} />
		<div className={css.flash} style={{...burst.partStyle, backgroundImage: burst.flashBackground}} />
		<div className={css.ring} style={burst.partStyle}>
			{burst.sparks.map(spark => (
				<div key={spark.key} className={css.spark} style={spark.style} />
			))}
		</div>
	</div>
);

// While particles move the compositor redraws the whole screen every frame, which takes most
// of a frame's budget on the low and mid tiers. So the particles hold still while the remote
// is in use and carry on once it settles.
const PAUSE_TIERS = ['low', 'mid'];
export const RESUME_AFTER_MS = 700;
const INPUT_EVENTS = ['keydown', 'wheel', 'mousemove'];

const usePauseWhileNavigating = (ref, enabled) => {
	useEffect(() => {
		if (!enabled) return undefined;
		let timer = null;
		const resume = () => {
			timer = null;
			if (ref.current) ref.current.classList.remove(css.paused);
		};
		const pause = () => {
			if (ref.current) ref.current.classList.add(css.paused);
			clearTimeout(timer);
			timer = setTimeout(resume, RESUME_AFTER_MS);
		};
		for (const name of INPUT_EVENTS) window.addEventListener(name, pause, true);
		return () => {
			for (const name of INPUT_EVENTS) window.removeEventListener(name, pause, true);
			clearTimeout(timer);
		};
	}, [ref, enabled]);
};

const SeasonalTheme = ({theme, density, follower = true}) => {
	const effect = normalizeSeasonalTheme(theme);
	const level = normalizeSeasonalDensity(density);
	const tier = getPerfTier();
	const particles = useMemo(
		() => buildSeasonalParticles(effect, level, Math.floor(Math.random() * 0x7fffffff), tier),
		[effect, level, tier]
	);
	const overlayRef = useRef(null);
	const active = Boolean(effect) && effect !== 'none';
	usePauseWhileNavigating(overlayRef, active && PAUSE_TIERS.includes(tier));

	if (!active) return null;

	return (
		<>
			<div ref={overlayRef} className={css.overlay} aria-hidden="true">
				{particles.falling.map(particle => <Falling key={particle.key} particle={particle} />)}
				{particles.flyers.map(flyer => <Flyer key={flyer.key} flyer={flyer} />)}
				{particles.bursts.map(burst => <Burst key={burst.key} burst={burst} />)}
			</div>
			{follower && <SeasonalFollower key={effect} effect={effect} />}
		</>
	);
};

export default memo(SeasonalTheme);
