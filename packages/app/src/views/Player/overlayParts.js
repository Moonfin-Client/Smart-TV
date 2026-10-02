// Shared pieces of the playback overlays, so the countdown maths, the glyphs and
// the focus handling only exist once.

import {useEffect} from 'react';
import Spotlight from '@enact/spotlight';

// The player controls hold Spotlight focus even while they are hidden, so an
// overlay has to claim it or the remote carries on driving the controls
// underneath instead of the thing on screen.
export const useOverlayFocus = (spotlightId) => {
	useEffect(() => {
		// A preview has no id and must not take the remote from the settings screen it sits in.
		if (!spotlightId) return;
		window.requestAnimationFrame(() => Spotlight.focus(spotlightId));
	}, [spotlightId]);
};

export const formatRemaining = (seconds) => {
	const safe = Math.max(0, seconds);
	const rest = String(safe % 60).padStart(2, '0');
	return safe >= 60 ? `${Math.floor(safe / 60)}:${rest}` : `:${rest}`;
};

export const SkipGlyph = ({className, style}) => (
	<svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
		<path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
	</svg>
);

export const PlayGlyph = ({className}) => (
	<svg className={className} viewBox="0 0 24 24" aria-hidden="true">
		<path fill="currentColor" d="M8 5v14l11-7z" />
	</svg>
);

// Drains clockwise from the top as progress falls from 1 to 0. Sizes differ
// between the two overlays, so the geometry is worked out from the size given
// rather than baked into the stylesheet.
export const CountdownRing = ({size, stroke, progress, classes, trackStyle, valueStyle, children}) => {
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.min(1, Math.max(0, progress));
	const centre = size / 2;

	return (
		<span className={classes.ring}>
			<svg className={classes.svg} viewBox={`0 0 ${size} ${size}`}>
				<circle className={classes.track} style={trackStyle} cx={centre} cy={centre} r={radius} strokeWidth={stroke} fill="none" />
				<circle
					className={classes.value}
					style={valueStyle}
					cx={centre}
					cy={centre}
					r={radius}
					strokeWidth={stroke}
					fill="none"
					strokeDasharray={circumference}
					strokeDashoffset={circumference * (1 - clamped)}
				/>
			</svg>
			<span className={classes.center}>{children}</span>
		</span>
	);
};
