import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import {isBackKey} from '../../utils/keys';

/**
 * Shared hook for skip-intro, skip-credits, and next-episode popup logic.
 *
 * @param {Object} options
 * @param {Object|null}  options.mediaSegments     - {introStart, introEnd, creditsStart}
 * @param {Object|null}  options.nextEpisode       - next episode item (null if none)
 * @param {Object}       options.settings          - {skipIntro, skipCredits, autoPlay}
 * @param {React.MutableRefObject<number>} options.runTimeRef - total runtime in ticks
 * @param {boolean}      options.activeModal       - whether a modal is open
 * @param {boolean}      options.controlsVisible   - whether player controls are showing
 * @param {Function}     options.hideControls      - hide player controls
 * @param {Function}     options.showControls       - show player controls
 * @param {Function}     options.onSeekToIntroEnd  - platform-specific seek to intro end
 * @param {Function}     options.onPlayNext        - platform-specific play-next handler
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

	// --- Countdown ---

	const cancelNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
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
		if (nextEpisodeTimerRef.current) return;

		let countdown = 15;
		setNextEpisodeCountdown(countdown);

		nextEpisodeTimerRef.current = setInterval(() => {
			countdown--;
			setNextEpisodeCountdown(countdown);

			if (countdown <= 0) {
				clearInterval(nextEpisodeTimerRef.current);
				nextEpisodeTimerRef.current = null;
				handlePlayNextEpisode();
			}
		}, 1000);
	}, [handlePlayNextEpisode]);

	// --- Skip Intro ---

	const handleSkipIntro = useCallback(() => {
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
	}, []);

	// --- Segment checking (call from timeupdate) ---

	const checkSegments = useCallback((ticks) => {
		if (mediaSegments) {
			const {introStart, introEnd, creditsStart} = mediaSegments;

			if (introStart != null && introEnd != null) {
				const inIntro = ticks >= introStart && ticks < introEnd;
				const nearIntro = ticks >= (introStart -1) && ticks < (introEnd + 1);
				if (inIntro && settings.skipIntro && !skipIntroDismissedRef.current) {
				  handleSkipIntro();
          skipIntroDismissedRef.current = true;
				}
				if (inIntro && !settings.skipIntro && !skipIntroDismissedRef.current) {
					setShowSkipIntro(true);
				}
				if (!nearIntro) {
				  skipIntroDismissedRef.current = false;
					setShowSkipIntro(false);
				}
			}

			if (creditsStart != null && nextEpisode && !hasTriggeredNextEpisodeRef.current) {
				const inCredits = ticks >= creditsStart;
				if (inCredits) {
					setShowSkipCredits(prev => {
						if (!prev) {
							if (settings.skipCredits) {
								// Auto-skip: defer to avoid setState-during-render
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

		if (nextEpisode && runTimeRef.current > 0) {
			const remaining = runTimeRef.current - ticks;
			const nearEnd = remaining < 300000000;
			if (nearEnd && !hasTriggeredNextEpisodeRef.current) {
				setShowNextEpisode(true);
			}
		}
	}, [mediaSegments, settings.skipIntro, settings.skipCredits, nextEpisode, runTimeRef, handlePlayNextEpisode]);

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
