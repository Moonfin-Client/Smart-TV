import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import {isBackKey} from '../../utils/keys';
import {shouldAskStillWatching} from '../../utils/stillWatching';

// The next episode is offered once this little of the current one is left.
const NEAR_END_TICKS = 300000000;

// A segment shorter than this isn't offered, and one shorter than the second isn't skipped by itself.
const MIN_PROMPT_TICKS = 30000000;
const MIN_AUTO_SKIP_TICKS = 10000000;

// A seek the viewer makes holds prompts back this long, so the segment it lands in isn't offered.
const SEEK_PROMPT_HOLD_MS = 1200;
// A seek that reports where it lands holds them until it does, or until this long has passed.
const SEEK_LANDING_LIMIT_MS = 10000;
// Back right after Back took the prompt down is the same press, so it isn't passed on to the player.
const BACK_AFTER_DISMISS_MS = 500;

const SKIP_PROMPT_ID = 'skip-segment-btn';
export const isSkipPromptFocused = () => Boolean(document.activeElement?.closest?.(`[data-spotlight-id="${SKIP_PROMPT_ID}"]`));

// Right from the last button of the controls row reaches the prompt.
const onLastControlsButton = () => {
	const active = document.activeElement;
	const row = active?.closest?.('[data-player-controls-row]');
	if (!row) return false;
	const buttons = row.querySelectorAll('.spottable');
	return buttons[buttons.length - 1] === active;
};

const promptFor = (segment, ticks) => {
	const total = Math.max(1, (segment.end - segment.start) / 10000000);
	const remaining = Math.max(0, Math.round((segment.end - ticks) / 10000000));
	return {type: segment.type, start: segment.start, end: segment.end, remainingSeconds: remaining, progress: remaining / total};
};

/**
 * Drives the skip prompt for any segment the server marked up, plus the credits
 * and next episode prompts that follow an episode into the one after it.
 */
const useSegmentPopups = ({
	mediaSegments,
	nextEpisode,
	settings,
	runTimeRef,
	activeModal,
	controlsVisible,
	hideControls,
	showControls,
	onSeekToSegmentEnd,
	// Moves focus to the playback bar, for Left and Down from the prompt and after a skip taken by hand.
	onFocusSeekbar,
	onPlayNext,
	onPausePlayback,
	onStopPlayback,
	// A pre-roll runs straight into the feature, so it gets no credits or next-up prompt.
	currentIsPreroll = false
}) => {
	// The segment being offered right now, as {type, start, end, remainingSeconds, progress}.
	const [skipSegment, setSkipSegment] = useState(null);
	// Once its few seconds run out the prompt only shows along with the controls, until its segment ends.
	const [skipPromptLapsed, setSkipPromptLapsed] = useState(false);
	const [showSkipCredits, setShowSkipCredits] = useState(false);
	const [showNextEpisode, setShowNextEpisode] = useState(false);
	const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(null);
	// Only counts episodes that started themselves. Any sign of the viewer at the
	// remote, a seek, a skip, play or pause, or choosing the next one by hand,
	// answers the question the prompt was going to ask.
	const [askStillWatching, setAskStillWatching] = useState(false);
	const consecutiveRef = useRef(0);
	const noteViewerActivity = useCallback(() => {
		consecutiveRef.current = 0;
	}, []);

	// The segment playback is in, offered or not, so a prompt only comes up on the way into one.
	const activeSegmentRef = useRef(null);
	// A skip lands a frame short of the end, still inside the segment, so each one only skips itself once until
	// playback is back at its start.
	const autoSkippedRef = useRef(new Set());
	const holdPromptsUntilRef = useRef(0);
	// Only the newest seek's landing ends the hold, since an older one can land while a newer one is on its way.
	const newestLandingRef = useRef(null);
	const backHeldUntilRef = useRef(0);
	const autoHideTimerRef = useRef(null);
	const promptLapsedRef = useRef(false);
	// Mirrored so the skip handler can stay stable, because the players keep
	// checkSegments in a dependency array and it must not change every second.
	const skipSegmentRef = useRef(null);
	useEffect(() => {
		skipSegmentRef.current = skipSegment;
	}, [skipSegment]);
	const hasTriggeredNextEpisodeRef = useRef(false);
	const nextEpisodeTimerRef = useRef(null);
	const nextEpisodeTimeoutRef = useRef(null);
	// The episode plays to its end and the ended handler moves on, so the card counts down what's left of it.
	const advanceAtEnd = settings.autoPlay && settings.nextUpAdvance === 'end';

	// --- Countdown ---

	const cancelNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
		}
		if (nextEpisodeTimeoutRef.current) {
			clearTimeout(nextEpisodeTimeoutRef.current);
			nextEpisodeTimeoutRef.current = null;
		}
		hasTriggeredNextEpisodeRef.current = true;
		setNextEpisodeCountdown(null);
		setShowNextEpisode(false);
		setShowSkipCredits(false);
	}, []);

	// Counts an episode that starts by itself, or raises the prompt in its place and returns true.
	// The ended handler calls it too, so episodes that ran to their end count as well.
	const shouldHoldForStillWatching = useCallback(() => {
		cancelNextEpisodeCountdown();
		if (currentIsPreroll) return false;
		if (shouldAskStillWatching(consecutiveRef.current, settings.stillWatchingBehavior)) {
			setAskStillWatching(true);
			return true;
		}
		consecutiveRef.current += 1;
		return false;
	}, [currentIsPreroll, cancelNextEpisodeCountdown, settings.stillWatchingBehavior]);

	// The automatic path. A long enough run of these is what raises the prompt.
	const handlePlayNextEpisode = useCallback(async () => {
		if (!nextEpisode || !onPlayNext) return;
		if (shouldHoldForStillWatching()) {
			// The current episode is still running underneath, and the prompt says
			// playback has been paused, so it has to actually be paused.
			onPausePlayback?.();
			return;
		}
		await onPlayNext(nextEpisode);
	}, [nextEpisode, onPlayNext, onPausePlayback, shouldHoldForStillWatching]);

	// Pressing Play Next answers the question, so the run starts over.
	const handlePlayNextNow = useCallback(async () => {
		if (!nextEpisode || !onPlayNext) return;
		cancelNextEpisodeCountdown();
		consecutiveRef.current = 0;
		await onPlayNext(nextEpisode);
	}, [nextEpisode, onPlayNext, cancelNextEpisodeCountdown]);

	const handleStillWatchingContinue = useCallback(async () => {
		setAskStillWatching(false);
		consecutiveRef.current = 0;
		if (nextEpisode && onPlayNext) await onPlayNext(nextEpisode);
	}, [nextEpisode, onPlayNext]);

	const handleStillWatchingStop = useCallback(() => {
		setAskStillWatching(false);
		consecutiveRef.current = 0;
		onStopPlayback?.();
	}, [onStopPlayback]);

	const startNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimeoutRef.current) return;

		const timeout = settings.nextUpTimeout ?? 7;
		if (timeout === 0) {
			handlePlayNextEpisode();
			return;
		}
		setNextEpisodeCountdown(timeout);

		nextEpisodeTimeoutRef.current = setTimeout(() => {
			nextEpisodeTimeoutRef.current = null;
			handlePlayNextEpisode();
		}, timeout * 1000);

		// Both the timer text and the ring read this, so it ticks whichever the
		// viewer has chosen to see.
		let countdown = timeout;
		nextEpisodeTimerRef.current = setInterval(() => {
			countdown--;
			setNextEpisodeCountdown(countdown);
			if (countdown <= 0) {
				clearInterval(nextEpisodeTimerRef.current);
				nextEpisodeTimerRef.current = null;
			}
		}, 1000);
	}, [handlePlayNextEpisode, settings.nextUpTimeout]);

	// --- Skip segment ---

	const clearSkipPrompt = useCallback(() => {
		clearTimeout(autoHideTimerRef.current);
		autoHideTimerRef.current = null;
		promptLapsedRef.current = false;
		setSkipPromptLapsed(false);
		setSkipSegment(null);
	}, []);

	useEffect(() => () => clearTimeout(autoHideTimerRef.current), []);

	// The auto skip path passes the segment it matched. A button press hands this
	// its own click event instead, so anything without an end tick falls back to
	// whichever segment is on screen.
	const handleSkipSegment = useCallback((segment) => {
		const pressed = segment?.end == null;
		const target = pressed ? skipSegmentRef.current : segment;
		if (!target?.end) return;
		onSeekToSegmentEnd?.(target.end);
		clearSkipPrompt();
		if (!pressed) return;
		noteViewerActivity();
		showControls();
		onFocusSeekbar?.();
	}, [noteViewerActivity, onSeekToSegmentEnd, clearSkipPrompt, showControls, onFocusSeekbar]);

	// A seek the viewer makes takes the prompt down, and the segment it lands in isn't offered. A player that only
	// reports the new spot once the seek is done passes its landing, and the hold runs from there.
	const suppressSeekPrompts = useCallback((landing) => {
		const holdFor = landing ? SEEK_LANDING_LIMIT_MS : SEEK_PROMPT_HOLD_MS;
		holdPromptsUntilRef.current = Math.max(holdPromptsUntilRef.current, Date.now() + holdFor);
		clearSkipPrompt();
		if (!landing) return;
		newestLandingRef.current = landing;
		const landed = () => {
			if (newestLandingRef.current !== landing) return;
			holdPromptsUntilRef.current = Date.now() + SEEK_PROMPT_HOLD_MS;
		};
		landing.then(landed, landed);
	}, [clearSkipPrompt]);

	// --- Reset on new media ---

	const resetPopups = useCallback(() => {
		clearSkipPrompt();
		setShowSkipCredits(false);
		setShowNextEpisode(false);
		setNextEpisodeCountdown(null);
		setAskStillWatching(false);
		activeSegmentRef.current = null;
		autoSkippedRef.current.clear();
		holdPromptsUntilRef.current = 0;
		newestLandingRef.current = null;
		backHeldUntilRef.current = 0;
		hasTriggeredNextEpisodeRef.current = false;
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
		}
		if (nextEpisodeTimeoutRef.current) {
			clearTimeout(nextEpisodeTimeoutRef.current);
			nextEpisodeTimeoutRef.current = null;
		}
	}, [clearSkipPrompt]);

	// --- Segment checking (call from timeupdate) ---

	const checkSegments = useCallback((ticks) => {
		const introAction = settings.introAction || 'ask';
		const outroAction = settings.outroAction || 'ask';
		const creditsStart = mediaSegments?.creditsStart ?? null;
		const nearEndTicks = advanceAtEnd ? (settings.nextUpTimeout ?? 7) * 10000000 : NEAR_END_TICKS;

		const nextUpFrom = Math.min(
			creditsStart ?? Infinity,
			runTimeRef.current > 0 ? runTimeRef.current - nearEndTicks : Infinity
		);
		if (ticks < nextUpFrom) hasTriggeredNextEpisodeRef.current = false;

		// Set while a skip button is on screen, so the next episode card can hold back.
		let skipPromptVisible = false;

		if (mediaSegments) {
			// End credits are worth skipping on a normal episode too, so the outro
			// keeps its own prompt unless the viewer asked for the next episode card
			// in its place, and even then only when that card would really appear.
			const nextUpWouldShow = Boolean(nextEpisode) && !currentIsPreroll &&
				settings.nextUpBehavior !== 'disabled';
			const outroBecomesNextUp = settings.replaceSkipOutroWithNextUp === true && nextUpWouldShow;

			const actionFor = (seg) => {
				if (seg.type === 'intro') return introAction;
				if (seg.type === 'outro') return outroBecomesNextUp ? 'none' : outroAction;
				return 'ask';
			};

			// Back at or before a segment's start is a rewind into it on purpose, so it can skip itself again.
			for (const start of autoSkippedRef.current) {
				if (ticks <= start) autoSkippedRef.current.delete(start);
			}

			// A prompt comes up on the way into a segment. Once it's gone, by Back, a skip or a seek, it stays gone
			// until playback leaves the segment and comes back into it.
			const segment = (mediaSegments.list || []).find((seg) => seg.end != null && ticks >= seg.start && ticks < seg.end);
			const action = segment ? actionFor(segment) : 'none';
			const entered = Boolean(segment) && activeSegmentRef.current !== segment.start;
			activeSegmentRef.current = segment ? segment.start : null;
			const longEnough = Boolean(segment) &&
				segment.end - segment.start >= (action === 'auto' ? MIN_AUTO_SKIP_TICKS : MIN_PROMPT_TICKS);

			if (entered && action === 'auto' && longEnough && !autoSkippedRef.current.has(segment.start)) {
				autoSkippedRef.current.add(segment.start);
				handleSkipSegment(segment);
			} else if (Date.now() < holdPromptsUntilRef.current) {
				clearSkipPrompt();
			} else if (entered && action === 'ask' && longEnough) {
				skipPromptVisible = true;
				clearSkipPrompt();
				setSkipSegment(promptFor(segment, ticks));
				const seconds = {s5: 5, s10: 10}[settings.mediaSegmentAutoHide];
				if (seconds) {
					autoHideTimerRef.current = setTimeout(() => {
						autoHideTimerRef.current = null;
						promptLapsedRef.current = true;
						setSkipPromptLapsed(true);
					}, seconds * 1000);
				}
			} else if (segment && !entered && action === 'ask') {
				skipPromptVisible = skipSegmentRef.current?.start === segment.start && !promptLapsedRef.current;
				setSkipSegment((prev) => {
					if (!prev || prev.start !== segment.start) return prev;
					const next = promptFor(segment, ticks);
					return next.remainingSeconds === prev.remainingSeconds ? prev : next;
				});
			} else {
				clearSkipPrompt();
			}

			if (creditsStart != null && outroBecomesNextUp && !hasTriggeredNextEpisodeRef.current && outroAction !== 'none') {
				const inCredits = ticks >= creditsStart;
				if (inCredits) {
					setShowSkipCredits(prev => {
						if (!prev) {
							if (outroAction === 'auto') {
								setTimeout(() => handlePlayNextEpisode(), 0);
								return false;
							}
							return true;
						}
						return prev;
					});
				}
			}
		}

		// The next episode card takes the remote the moment it appears and keeps 5-way
		// movement to itself, so raising it over a skip button leaves that button
		// unpressable. An outro nearly always falls inside this window, so wait until
		// the segment is behind us or the viewer has dismissed it. An outro that runs
		// to the very end still moves on, because the ended handler plays the next one.
		if (nextEpisode && !currentIsPreroll && !skipPromptVisible && runTimeRef.current > 0 && settings.nextUpBehavior !== 'disabled') {
			const remaining = runTimeRef.current - ticks;
			const nearEnd = remaining < nearEndTicks;
			if (nearEnd && !hasTriggeredNextEpisodeRef.current) {
				setShowNextEpisode(true);
			}
			// Counts down what's left, and a seek back out of the window takes the card down.
			if (advanceAtEnd && !hasTriggeredNextEpisodeRef.current) {
				setNextEpisodeCountdown(nearEnd ? Math.ceil(remaining / 10000000) : null);
				if (!nearEnd) setShowNextEpisode(false);
			}
		}
	}, [mediaSegments, settings.introAction, settings.nextUpBehavior, settings.outroAction, settings.replaceSkipOutroWithNextUp, settings.mediaSegmentAutoHide, settings.nextUpTimeout, advanceAtEnd, nextEpisode, currentIsPreroll, runTimeRef, handlePlayNextEpisode, handleSkipSegment, clearSkipPrompt]);

	// --- Clearing the way for a popup ---

	// A new prompt clears the controls away and takes the remote. Keyed on which segment it is, not the object,
	// because that carries a countdown that ticks every second.
	const skipSegmentStart = skipSegment?.start ?? null;
	useEffect(() => {
		if (skipSegmentStart == null || activeModal) return;
		hideControls();
	}, [skipSegmentStart, activeModal, hideControls]);

	const skipPromptShown = skipSegmentStart != null && (!skipPromptLapsed || controlsVisible);

	useEffect(() => {
		if (!(showSkipCredits || showNextEpisode) || !nextEpisode || activeModal) return;
		clearSkipPrompt();
		hideControls();
		if (settings.autoPlay && !advanceAtEnd) startNextEpisodeCountdown();
	}, [showSkipCredits, showNextEpisode, nextEpisode, activeModal, settings.autoPlay, advanceAtEnd, startNextEpisodeCountdown, hideControls, clearSkipPrompt]);

	// --- Keydown handler (returns true if event was consumed) ---

	const handlePopupKeyDown = useCallback((e) => {
		const key = e.key || e.keyCode;
		const back = isBackKey(e) || key === 'GoBack';

		// The dialog owns every key while it is up. Enter presses the focused
		// button and the arrows move between them, both through Spotlight, so
		// the player only has to stay out of the way.
		if (askStillWatching) {
			if (back) {
				e.preventDefault();
				e.stopPropagation();
				handleStillWatchingContinue();
			}
			return true;
		}

		const nextEpisodeVisible = (showSkipCredits || showNextEpisode) && nextEpisode && !activeModal && !controlsVisible;
		const isEnter = key === 'Enter' || e.keyCode === 13;
		const isUp = key === 'ArrowUp' || e.keyCode === 38;
		const isDown = key === 'ArrowDown' || e.keyCode === 40;
		const isLeft = key === 'ArrowLeft' || e.keyCode === 37;
		const isRight = key === 'ArrowRight' || e.keyCode === 39;
		const consume = () => {
			e.preventDefault();
			e.stopPropagation();
		};

		if (back && Date.now() < backHeldUntilRef.current) {
			consume();
			return true;
		}

		// Up or Down with the controls away brings them up on the prompt, which comes back with them after its few
		// seconds have run out.
		if (skipSegmentStart != null && !activeModal && !controlsVisible && (isUp || isDown)) {
			consume();
			showControls();
			// After the render that brings the controls up, so it lands on the prompt rather than the bar.
			setTimeout(() => Spotlight.focus(SKIP_PROMPT_ID), 0);
			return true;
		}

		if (skipPromptShown && !activeModal) {
			const onPrompt = isSkipPromptFocused();
			// Back takes the prompt down before it closes the controls or leaves the player.
			if (back) {
				consume();
				backHeldUntilRef.current = Date.now() + BACK_AFTER_DISMISS_MS;
				clearSkipPrompt();
				return true;
			}
			if (onPrompt && isLeft) {
				consume();
				if (controlsVisible) onFocusSeekbar?.();
				return true;
			}
			if (onPrompt && isRight) {
				consume();
				showControls();
				return true;
			}
			if (isRight && controlsVisible && onLastControlsButton()) {
				consume();
				showControls();
				Spotlight.focus(SKIP_PROMPT_ID);
				return true;
			}
			if (onPrompt && (isUp || isDown)) {
				consume();
				showControls();
				if (isDown) onFocusSeekbar?.();
				return true;
			}
			return false;
		}

		if (!nextEpisodeVisible) return false;

		// Next episode / skip credits popup
		if (back) {
			consume();
			cancelNextEpisodeCountdown();
			return true;
		}
		if (isEnter) return false;
		// Allow Left/Right for navigation
		if (isLeft || isRight) return false;
		consume();
		return true;
	}, [askStillWatching, handleStillWatchingContinue, skipSegmentStart, skipPromptShown, clearSkipPrompt, onFocusSeekbar, showSkipCredits, showNextEpisode, nextEpisode, activeModal, controlsVisible, showControls, cancelNextEpisodeCountdown]);

	return {
		askStillWatching,
		handleStillWatchingContinue,
		handleStillWatchingStop,
		skipSegment,
		skipPromptShown,
		suppressSeekPrompts,
		showSkipCredits,
		showNextEpisode,
		nextEpisodeCountdown,
		handleSkipSegment,
		handlePlayNextNow,
		shouldHoldForStillWatching,
		cancelNextEpisodeCountdown,
		checkSegments,
		handlePopupKeyDown,
		resetPopups,
		noteViewerActivity
	};
};

export default useSegmentPopups;
