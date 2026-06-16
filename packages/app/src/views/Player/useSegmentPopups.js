import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import {isBackKey} from '../../utils/keys';

/**
 * Shared hook for skip-intro, skip-credits, and next-episode popup logic.
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
	onSeekToIntroEnd,
	onPlayNext
}) => {
	const [showSkipIntro, setShowSkipIntro] = useState(false);
	const [showSkipCredits, setShowSkipCredits] = useState(false);
	const [showNextEpisode, setShowNextEpisode] = useState(false);
	const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(null);

	const skipIntroDismissedRef = useRef(false);
	const hasTriggeredNextEpisodeRef = useRef(false);
	const nextEpisodeTimerRef = useRef(null);
	const nextEpisodeTimeoutRef = useRef(null);

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

	const handlePlayNextEpisode = useCallback(async () => {
		if (nextEpisode && onPlayNext) {
			cancelNextEpisodeCountdown();
			await onPlayNext(nextEpisode);
		}
	}, [nextEpisode, onPlayNext, cancelNextEpisodeCountdown]);

	const startNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimeoutRef.current) return;

		const timeout = settings.nextUpTimeout ?? 7;
		if (timeout === 0) {
			handlePlayNextEpisode();
			return;
		}
		setNextEpisodeCountdown(timeout);

		// A single timer drives the auto-advance; the progress bar animates purely
		// in CSS, so no per-second re-render is needed for it.
		nextEpisodeTimeoutRef.current = setTimeout(() => {
			nextEpisodeTimeoutRef.current = null;
			handlePlayNextEpisode();
		}, timeout * 1000);

		// Tick the numeric countdown only when the timer text is actually shown.
		const style = settings.nextUpCountdownStyle ?? 'both';
		if (style === 'timer' || style === 'both') {
			let countdown = timeout;
			nextEpisodeTimerRef.current = setInterval(() => {
				countdown--;
				setNextEpisodeCountdown(countdown);
				if (countdown <= 0) {
					clearInterval(nextEpisodeTimerRef.current);
					nextEpisodeTimerRef.current = null;
				}
			}, 1000);
		}
	}, [handlePlayNextEpisode, settings.nextUpTimeout, settings.nextUpCountdownStyle]);

	// --- Skip Intro ---

	const handleSkipIntro = useCallback(() => {
		if (skipIntroDismissedRef.current) return;
		skipIntroDismissedRef.current = true;
		onSeekToIntroEnd?.();
		setShowSkipIntro(false);
	}, [onSeekToIntroEnd]);

	// --- Reset on new media ---

	const resetPopups = useCallback(() => {
		setShowSkipIntro(false);
		setShowSkipCredits(false);
		setShowNextEpisode(false);
		setNextEpisodeCountdown(null);
		skipIntroDismissedRef.current = false;
		hasTriggeredNextEpisodeRef.current = false;
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
		}
		if (nextEpisodeTimeoutRef.current) {
			clearTimeout(nextEpisodeTimeoutRef.current);
			nextEpisodeTimeoutRef.current = null;
		}
	}, []);

	// --- Segment checking (call from timeupdate) ---

	const checkSegments = useCallback((ticks) => {
		const introAction = settings.introAction || 'ask';
		const outroAction = settings.outroAction || 'ask';

		if (mediaSegments) {
			const {introStart, introEnd, creditsStart} = mediaSegments;

			if (introStart != null && introEnd != null && introAction !== 'none') {
				const inIntro = ticks >= introStart && ticks < introEnd;
				const nearIntro = ticks >= (introStart - 1) && ticks < (introEnd + 1);
				if (inIntro && introAction === 'auto' && !skipIntroDismissedRef.current) {
					handleSkipIntro();
				}
				if (inIntro && introAction === 'ask' && !skipIntroDismissedRef.current) {
					setShowSkipIntro(true);
				}
				if (!nearIntro) {
					skipIntroDismissedRef.current = false;
					setShowSkipIntro(false);
				}
			}

			if (creditsStart != null && nextEpisode && !hasTriggeredNextEpisodeRef.current && outroAction !== 'none' && settings.stillWatchingPrompt !== false) {
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

		if (nextEpisode && runTimeRef.current > 0 && settings.nextUpBehavior !== 'disabled' && settings.stillWatchingPrompt !== false) {
			const remaining = runTimeRef.current - ticks;
			const nearEnd = remaining < 300000000;
			if (nearEnd && !hasTriggeredNextEpisodeRef.current) {
				setShowNextEpisode(true);
			}
		}
	}, [mediaSegments, settings.introAction, settings.nextUpBehavior, settings.outroAction, settings.stillWatchingPrompt, nextEpisode, runTimeRef, handlePlayNextEpisode, handleSkipIntro]);

	// --- Auto-focus effects ---

	useEffect(() => {
		if (showSkipIntro && !activeModal) {
			hideControls();
			window.requestAnimationFrame(() => {
				Spotlight.focus('skip-intro-btn');
			});
		}
	}, [showSkipIntro, activeModal, hideControls]);

	useEffect(() => {
		if (showSkipCredits && nextEpisode && !activeModal) {
			hideControls();
			if (settings.autoPlay) {
				startNextEpisodeCountdown();
			}
			window.requestAnimationFrame(() => {
				const defaultBtn = document.querySelector('[data-spot-default="true"]');
				if (defaultBtn) {
					Spotlight.focus(defaultBtn);
				}
			});
		}
	}, [showSkipCredits, nextEpisode, activeModal, settings.autoPlay, startNextEpisodeCountdown, hideControls]);

	useEffect(() => {
		if (showNextEpisode && !showSkipCredits && nextEpisode && !activeModal) {
			hideControls();
			if (settings.autoPlay) {
				startNextEpisodeCountdown();
			}
			window.requestAnimationFrame(() => {
				const defaultBtn = document.querySelector('[data-spot-default="true"]');
				if (defaultBtn) {
					Spotlight.focus(defaultBtn);
				}
			});
		}
	}, [showNextEpisode, showSkipCredits, nextEpisode, activeModal, settings.autoPlay, startNextEpisodeCountdown, hideControls]);

	// --- Keydown handler (returns true if event was consumed) ---

	const handlePopupKeyDown = useCallback((e) => {
		const key = e.key || e.keyCode;
		const skipIntroVisible = showSkipIntro && !activeModal && !controlsVisible;
		const nextEpisodeVisible = (showSkipCredits || showNextEpisode) && nextEpisode && !activeModal && !controlsVisible;

		if (!skipIntroVisible && !nextEpisodeVisible) return false;

		const back = isBackKey(e) || key === 'GoBack';

		// Skip intro popup
		if (skipIntroVisible) {
			if (back) {
				e.preventDefault();
				e.stopPropagation();
				skipIntroDismissedRef.current = true;
				setShowSkipIntro(false);
				return true;
			}
			if (key === 'Enter' || e.keyCode === 13) return false;
			// Any other key: dismiss and show controls
			e.preventDefault();
			e.stopPropagation();
			skipIntroDismissedRef.current = true;
			setShowSkipIntro(false);
			showControls();
			return true;
		}

		// Next episode / skip credits popup
		if (nextEpisodeVisible) {
			if (back) {
				e.preventDefault();
				e.stopPropagation();
				cancelNextEpisodeCountdown();
				return true;
			}
			if (key === 'Enter' || e.keyCode === 13) return false;
			// Allow Left/Right for navigation
			if (key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39) {
				return false;
			}
			e.preventDefault();
			e.stopPropagation();
			return true;
		}

		return false;
	}, [showSkipIntro, showSkipCredits, showNextEpisode, nextEpisode, activeModal, controlsVisible, showControls, cancelNextEpisodeCountdown]);

	return {
		showSkipIntro,
		showSkipCredits,
		showNextEpisode,
		nextEpisodeCountdown,
		handleSkipIntro,
		handlePlayNextEpisode,
		cancelNextEpisodeCountdown,
		checkSegments,
		handlePopupKeyDown,
		resetPopups
	};
};

export default useSegmentPopups;
