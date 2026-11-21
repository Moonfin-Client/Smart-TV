import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {SpottableButton} from './PlayerConstants';
import {CountdownRing, SkipGlyph, formatRemaining, useOverlayFocus} from './overlayParts';
import {registerThemeSheet} from '../../theme/themeOverrides';

import css from './SkipSegmentOverlay.module.less';

registerThemeSheet('skipSegment', css);

const RING_SIZE = 52;
const RING_STROKE = 4;

const SEGMENT_LABELS = {
	intro: 'Intro',
	outro: 'Outro',
	preview: 'Preview',
	recap: 'Recap',
	commercial: 'Commercial'
};

// The prompt sits just clear of the controls' bottom bar, which stays laid out while it's hidden, so the prompt keeps its
// place as the controls come and go. Without the bar the stylesheet's place stands.
const CONTROLS_BAR_GAP = 6;
const clearOfControls = () => {
	const bar = document.querySelector('[data-player-controls-bottom]');
	return bar && bar.offsetHeight > 0 ? bar.offsetHeight + CONTROLS_BAR_GAP : null;
};

const ringClasses = {ring: css.ring, svg: css.ringSvg, track: css.ringTrack, value: css.ringValue, center: css.ringCenter};

/**
 * Offers to jump past a segment the server marked up. The ring drains for as long
 * as the segment has left to run, so the prompt going away is never a surprise.
 */
const SkipSegmentOverlay = ({type, label, remainingSeconds, progress, countdownStyle, onSkip, spotlightId, controlsVisible = false}) => {
	// It takes the remote while the controls are away, and leaves focus where it is while they're up.
	useOverlayFocus(controlsVisible ? null : spotlightId);

	// Measured again each time the controls come or go, since the bar's rows can change in between.
	const [bottom, setBottom] = useState(clearOfControls);
	useLayoutEffect(() => setBottom(clearOfControls()), [controlsVisible]);

	// Holding focus when it ends with the controls up would leave the remote on nothing, so it goes back to them.
	const heldFocusRef = useRef(false);
	const controlsUpRef = useRef(controlsVisible);
	controlsUpRef.current = controlsVisible;
	useEffect(() => () => {
		if (!heldFocusRef.current || !controlsUpRef.current) return;
		window.requestAnimationFrame(() => {
			if (!Spotlight.getCurrent() && !Spotlight.focus('progress-bar')) Spotlight.focus('play-pause-btn');
		});
	}, []);

	const handleFocus = useCallback(() => {
		heldFocusRef.current = true;
	}, []);
	const handleBlur = useCallback(() => {
		heldFocusRef.current = false;
	}, []);

	const showRing = countdownStyle === 'progressBar' || countdownStyle === 'both';
	const showTimer = countdownStyle === 'timer' || countdownStyle === 'both';
	const numberInRing = showTimer && showRing && remainingSeconds < 60;

	return (
		<div className={css.overlay} style={bottom == null ? undefined : {bottom: `${bottom}px`}}>
			<SpottableButton
				className={css.button}
				onClick={onSkip}
				spotlightId={spotlightId}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<SkipGlyph className={css.icon} />
				<span className={css.label}>
					{label || $L('Skip {segment}').replace('{segment}', $L(SEGMENT_LABELS[type] || SEGMENT_LABELS.intro))}
				</span>
				{showTimer && !numberInRing && (
					<span className={css.timer}>
						{$L('Ends in {time}').replace('{time}', formatRemaining(remainingSeconds))}
					</span>
				)}
				{showRing && (
					<CountdownRing size={RING_SIZE} stroke={RING_STROKE} progress={progress} classes={ringClasses}>
						{numberInRing
							? <span className={css.ringNumber}>{Math.max(0, remainingSeconds)}</span>
							: <SkipGlyph className={css.ringIcon} />}
					</CountdownRing>
				)}
			</SpottableButton>
		</div>
	);
};

export default SkipSegmentOverlay;
