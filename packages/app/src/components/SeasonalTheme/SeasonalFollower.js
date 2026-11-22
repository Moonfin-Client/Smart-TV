import {useEffect, useRef, useState} from 'react';

import {rootScale} from '../../utils/rootScale';
import {FOLLOWERS, HIDDEN, placeFollower} from './followerPlacement';

import css from './SeasonalFollower.module.less';

// Rows and the page scroll into place a frame or two after focus lands, and a held key moves
// focus every few dozen ms, so positions are read once, after focus has rested this long.
export const SETTLE_MS = 100;

const NONE = [];

// What has focus on Home, or null when focus is anywhere else, like a dialog over Home.
const readFocus = () => {
	const focused = document.activeElement;
	if (!focused || !focused.closest) return null;
	const nav = focused.closest('[data-spotlight-id="navbar"]');
	if (!nav && !focused.closest('[data-pointer-rows]')) return null;
	const target = nav ? focused : (focused.querySelector('[data-card-art]') || focused);
	const focus = {
		landing: 'card',
		rect: target.getBoundingClientRect(),
		target,
		screenWidth: window.innerWidth,
		screenHeight: window.innerHeight,
		scale: rootScale()
	};
	if (nav) {
		const bar = nav.getBoundingClientRect();
		// The sidebar is a tall rail down the left and the top bar a wide strip.
		focus.landing = bar.height > bar.width ? 'right' : 'below';
		focus.navRight = bar.right;
		focus.nav = nav;
	}
	return focus;
};

// The card the settings preview holds in focus, in the px of the follower's [layer], since the
// preview draws Home scaled down.
const readHeldFocus = (layer) => {
	const target = layer && document.querySelector('[data-held-focus]');
	const box = layer && layer.getBoundingClientRect();
	if (!target || !box.width) return null;
	const k = layer.offsetWidth / box.width;
	const rect = target.getBoundingClientRect();
	return {
		landing: 'card',
		rect: {left: (rect.left - box.left) * k, top: (rect.top - box.top) * k, width: rect.width * k, height: rect.height * k},
		target,
		screenWidth: layer.offsetWidth,
		screenHeight: layer.offsetHeight,
		scale: rootScale()
	};
};

const useFollowers = (styles, layerRef) => {
	const [places, setPlaces] = useState(() => styles.map(() => HIDDEN));

	useEffect(() => {
		if (!styles.length) return undefined;
		let timer = null;
		let watcher = null;
		let watched = NONE;
		const seen = [];
		const measure = () => {
			timer = null;
			const focus = layerRef ? readHeldFocus(layerRef.current) : readFocus();
			const watch = focus ? [focus.target, focus.nav].filter(Boolean) : NONE;
			if (watcher && (watch[0] !== watched[0] || watch[1] !== watched[1])) {
				watcher.disconnect();
				seen.length = 0;
				watch.forEach((element) => watcher.observe(element));
				watched = watch;
			}
			setPlaces((previous) => {
				const next = styles.map((style, i) => placeFollower(style, focus, previous[i]));
				return next.every((place, i) => place === previous[i]) ? previous : next;
			});
		};
		const schedule = () => {
			clearTimeout(timer);
			timer = setTimeout(measure, SETTLE_MS);
		};
		// A card that grows once its art arrives, a nav button opening its label and the
		// sidebar opening out all change size after focus rests, so those are watched too.
		// The first call after watching only reports the size it started at.
		if (typeof window.ResizeObserver === 'function') {
			watcher = new window.ResizeObserver((entries) => {
				let changed = false;
				for (const entry of entries) {
					if (seen.indexOf(entry.target) >= 0) changed = true;
					else seen.push(entry.target);
				}
				if (changed) schedule();
			});
		}

		document.addEventListener('focusin', schedule, true);
		document.addEventListener('focusout', schedule, true);
		// Scroll doesn't bubble, so this catches the rows and the page in the capture phase.
		window.addEventListener('scroll', schedule, true);
		window.addEventListener('resize', schedule);
		schedule();
		return () => {
			clearTimeout(timer);
			if (watcher) watcher.disconnect();
			document.removeEventListener('focusin', schedule, true);
			document.removeEventListener('focusout', schedule, true);
			window.removeEventListener('scroll', schedule, true);
			window.removeEventListener('resize', schedule);
		};
	}, [styles, layerRef]);

	return places;
};

// It appears where it lands rather than gliding over from its last spot.
const gliderStyle = (transform, glide) => ({
	transform,
	WebkitTransform: transform,
	...(glide ? null : {transition: 'none', WebkitTransition: 'none'})
});

// The bar's width before it's stretched to fit, in screen px.
const RAINBOW_BASE = 100;

// Three layers: a striped bar stretched to the width with a transform, and a round end on each
// side, so the ends stay round at any width.
const Rainbow = ({place}) => {
	const {x, y, width, thickness, glide} = place;
	const radius = thickness / 2;
	const reach = Math.max(0, width - thickness) / 2;
	const end = {left: -radius, top: -radius, width: thickness, height: thickness};
	return (
		<div className={css.follower} style={{opacity: place.shown ? 1 : 0}}>
			<div
				className={`${css.glider} ${css.rainbowBar}`}
				style={{
					left: -RAINBOW_BASE / 2,
					top: -radius,
					width: RAINBOW_BASE,
					height: thickness,
					...gliderStyle(`translate3d(${x}px, ${y}px, 0) scaleX(${(reach * 2) / RAINBOW_BASE})`, glide)
				}}
			/>
			<div className={`${css.glider} ${css.rainbowStart}`} style={{...end, ...gliderStyle(`translate3d(${x - reach}px, ${y}px, 0)`, glide)}} />
			<div className={`${css.glider} ${css.rainbowEnd}`} style={{...end, ...gliderStyle(`translate3d(${x + reach}px, ${y}px, 0)`, glide)}} />
		</div>
	);
};

const Follower = ({kind, place}) => {
	if (kind === 'rainbow') return <Rainbow place={place} />;
	const {x, y, angle, glide, swing, move} = place;
	const drawing = kind === 'sleigh' && place.facing < 0 ? 'sleighLeft' : kind;
	return (
		<div className={css.follower} style={{opacity: place.shown ? 1 : 0}}>
			<div className={css.glider} style={gliderStyle(`translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`, glide)}>
				<div key={move} className={swing ? `${css.sway} ${css[swing]}` : css.sway}>
					{kind === 'lantern' && <div className={css.lanternGlow} />}
					<div className={`${css.drawing} ${css[drawing]}`} />
					{kind === 'sparkler' && <div className={css.sparks} />}
					{kind === 'diya' && <div className={css.flame} />}
				</div>
			</div>
		</div>
	);
};

// Something on Home that follows focus for some effects, like Halloween's planchette. It moves
// only when focus rests somewhere new, on a transform transition, and its flickers and swings
// are keyframes, so it costs no script per frame. In the settings [preview] it follows the card
// the preview holds in focus.
const SeasonalFollower = ({effect, preview = false}) => {
	const styles = FOLLOWERS[effect] || NONE;
	const layerRef = useRef(null);
	const places = useFollowers(styles, preview ? layerRef : null);
	if (!styles.length) return null;
	return (
		<div ref={layerRef} className={css.layer} aria-hidden="true">
			{styles.map((kind, i) => <Follower key={kind} kind={kind} place={places[i] || HIDDEN} />)}
		</div>
	);
};

export default SeasonalFollower;
