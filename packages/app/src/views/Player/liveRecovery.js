// A live stream that stalls, ends or errors is recovered within a budget of
// three attempts: the first two re-resolve the channel, and the third escalates
// one step past the route it is on. A direct played channel hands the stream to
// the server, which normally means a remux that arrives as HLS with a real live
// window, and a channel the server already serves is forced to transcode. The
// next failure gives the channel up. A clean minute since the last attempt
// restores the budget, and so does a recovered channel playing for 20s.
//
// A stream the player turns away is still being made by the server, so short
// of the last attempt it's opened again as it is. Re-resolving would restart
// the tuner and the transcode only to send the same stream back.
//
// Gaps are measured from the end of the previous attempt, since a tune can
// itself take 17s or more: 4s before attempt 1 and the give up, then 10s and
// 20s so a restarting server can come back.
const LIVE_RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_DEBOUNCE_MS = 4000;
const GAP_BEFORE_ATTEMPT_2_MS = 10000;
const GAP_BEFORE_ATTEMPT_3_MS = 20000;
const RECOVERY_WINDOW_MS = 60000;
const PROVEN_AFTER_MS = 20000;

// A live stream can open and keep receiving bytes without ever showing a frame,
// since weak reception trickles data and nothing ever times out or errors. So a
// fresh stream that shows no frame in 30s counts as stalled, and so does one
// that stops showing frames for 8s after it played. The first frame gets the
// long wait because a tune through a relaying tuner and then the server's own
// remux can take 17s or more.
const FIRST_FRAME_TIMEOUT_MS = 30000;
const MID_STREAM_STALL_TIMEOUT_MS = 8000;

const gapBefore = (attempt) => {
	if (attempt === 2) return GAP_BEFORE_ATTEMPT_2_MS;
	if (attempt === 3) return GAP_BEFORE_ATTEMPT_3_MS;
	return RECOVERY_DEBOUNCE_MS;
};

/**
 * Runs the recovery for one live player.
 *
 * @param {Object} options
 * @param {Function} options.reResolve - asks the server for the channel again and opens the new
 *   stream, taking {disableDirectPlay, forceTranscode}. It throws when the channel cant be had.
 * @param {Function} [options.reload] - opens the stream the server is already making again, keeping the
 *   tuner and the transcode. Without it every attempt re-resolves.
 * @param {Function} options.release - stops the player and reports the stop, which frees the tuner
 * @param {Function} options.onLost - shows that the channel is gone and offers Retry
 * @param {Function} options.onStatus - receives {attempt, maxAttempts} while an attempt is under
 *   way, and null once the channel plays or is given up
 * @param {Function} options.isDirectPlay - whether the channel is direct played right now
 * @param {Function} [options.log]
 * @param {Function} [options.now]
 * @param {Function} [options.setTimer]
 * @param {Function} [options.clearTimer]
 */
export const createLiveRecovery = ({
	reResolve,
	reload,
	release,
	onLost,
	onStatus,
	isDirectPlay,
	log = () => {},
	now = Date.now,
	setTimer = setTimeout,
	clearTimer = clearTimeout
}) => {
	let attempts = 0;
	let lastAt = null;
	let inFlight = false;
	let retryTimer = null;
	let provenTimer = null;
	let watchdog = null;
	let watchActive = false;
	let frameSeen = false;
	let status = null;
	// Bumped whenever the viewer moves on. A recovery carries it across its own
	// awaits, so it can tell the viewer leaving from its own restart of the stream.
	let intent = 0;
	// What the player reports. Playing stays true through a stall while buffering
	// is what flips.
	const player = {playing: false, buffering: false};
	// Only a pause the viewer asked for tells a stall from a pause, since a video
	// element that fails to open reads as paused too.
	let viewerPaused = false;

	const actuallyPlaying = () => player.playing && !player.buffering;
	// Short of a viewer pause, only buffering or no frame yet counts. Not playing
	// with frames already shown cant be told apart from a pause made outside the app.
	const stallSuspected = () => !actuallyPlaying() && !viewerPaused && (player.buffering || !frameSeen);

	const setStatus = (next) => {
		if (status === next || (status && next && status.attempt === next.attempt)) return;
		status = next;
		onStatus(next);
	};

	const cancelRetry = () => {
		if (retryTimer) clearTimer(retryTimer);
		retryTimer = null;
	};

	const cancelProven = () => {
		if (provenTimer) clearTimer(provenTimer);
		provenTimer = null;
	};

	const disarm = () => {
		if (watchdog) clearTimer(watchdog);
		watchdog = null;
	};

	const resetBudget = () => {
		cancelProven();
		attempts = 0;
		lastAt = null;
		cancelRetry();
		setStatus(null);
	};

	const endWatch = () => {
		watchActive = false;
		disarm();
	};

	// Once a recovery has the channel playing again, the budget comes back after
	// 20s unless another attempt starts first. A channel that never plays still
	// gives up after the full budget.
	const armProven = () => {
		if (attempts === 0 || provenTimer) return;
		const armedFor = intent;
		provenTimer = setTimer(() => {
			provenTimer = null;
			if (armedFor !== intent || inFlight || !actuallyPlaying()) return;
			log(`Live recovery: playing for ${PROVEN_AFTER_MS / 1000}s after attempt ${attempts}, budget restored`);
			attempts = 0;
			lastAt = null;
		}, PROVEN_AFTER_MS);
	};

	let recover;

	const arm = () => {
		disarm();
		if (!watchActive) return;
		const armedFor = intent;
		const timeout = frameSeen ? MID_STREAM_STALL_TIMEOUT_MS : FIRST_FRAME_TIMEOUT_MS;
		watchdog = setTimer(() => {
			watchdog = null;
			if (!watchActive || armedFor !== intent || !stallSuspected()) return;
			log(`Live stall watchdog: no frame for ${timeout / 1000}s, recovering`);
			recover('stalled');
		}, timeout);
	};

	// The stop report frees the tuner, and the channel is reported lost only when
	// the viewer is still on it once that is done.
	const giveUp = async (armedFor) => {
		setStatus(null);
		endWatch();
		if (armedFor !== intent) {
			log('Live recovery: the viewer moved on before the channel was given up');
			return;
		}
		try {
			await release();
		} catch (err) {
			log(`Live recovery: releasing the channel failed: ${err?.message || err}`);
		}
		if (armedFor === intent) onLost();
	};

	const openStream = () => {
		frameSeen = false;
		player.playing = false;
		player.buffering = false;
		viewerPaused = false;
		watchActive = true;
		arm();
	};

	// A buffering flicker must not keep restarting the window.
	const evaluate = () => {
		if (!watchActive) return;
		if (!stallSuspected()) {
			disarm();
			return;
		}
		if (!watchdog) arm();
	};

	const scheduleRetry = (wait, trigger, armedFor) => {
		cancelRetry();
		retryTimer = setTimer(() => {
			retryTimer = null;
			recover(trigger, armedFor);
		}, wait);
	};

	recover = async (trigger, heldFor) => {
		// A held retry that comes due in the same turn playback resumed has nothing left to fix.
		if (heldFor != null && actuallyPlaying()) {
			log(`Live recovery: playback already resumed, dropping a held ${trigger}`);
			return;
		}
		// A recovery belongs to the channel that asked for it, and re-resolving
		// after the viewer tuned elsewhere would take the tuner from the channel
		// they asked for instead.
		const armedFor = heldFor ?? intent;
		if (armedFor !== intent) {
			log(`Live recovery: the viewer moved on, abandoning a held ${trigger}`);
			return;
		}
		const startedAt = now();
		const sinceLast = lastAt == null ? null : startedAt - lastAt;
		const windowExpired = sinceLast != null && sinceLast >= RECOVERY_WINDOW_MS;
		const gap = gapBefore(sinceLast == null || windowExpired ? 1 : attempts + 1);
		// A burst is held, never dropped. By the time a second failure arrives the
		// player is usually stopped, and nothing else would ever ask again.
		if (inFlight || (sinceLast != null && !windowExpired && sinceLast < gap)) {
			const wait = inFlight ? gap : gap - sinceLast;
			log(`Live recovery: holding a ${trigger} for ${wait}ms`);
			scheduleRetry(wait, trigger, armedFor);
			return;
		}
		if (windowExpired) attempts = 0;
		cancelProven();
		lastAt = startedAt;
		const attempt = ++attempts;
		inFlight = true;
		try {
			if (attempt > LIVE_RECOVERY_MAX_ATTEMPTS) {
				log(`Live recovery: ${trigger}, budget spent after ${LIVE_RECOVERY_MAX_ATTEMPTS} attempts, giving the channel up`);
				await giveUp(armedFor);
				return;
			}
			setStatus({attempt, maxAttempts: LIVE_RECOVERY_MAX_ATTEMPTS});
			// The attempt tears the old stream down, and neither engine says so, so
			// what it last reported would read as still playing.
			player.playing = false;
			player.buffering = false;
			const serverServed = attempt >= LIVE_RECOVERY_MAX_ATTEMPTS;
			if (reload && trigger === 'source-error' && !serverServed && !isDirectPlay()) {
				log(`Live recovery: ${trigger}, attempt ${attempt} of ${LIVE_RECOVERY_MAX_ATTEMPTS}, reopening the stream the server is already making`);
				await reload();
			} else {
				const forceTranscode = serverServed && !isDirectPlay();
				let route = '';
				if (forceTranscode) route = ', forcing a transcode since the server already serves it';
				else if (serverServed) route = ' without direct play, letting the server serve it';
				log(`Live recovery: ${trigger}, attempt ${attempt} of ${LIVE_RECOVERY_MAX_ATTEMPTS}, re-resolving the channel${route}`);
				await reResolve({disableDirectPlay: serverServed, forceTranscode});
			}
			if (armedFor === intent) openStream();
		} catch (err) {
			// The source is gone rather than stalled. Only the last attempt gives up,
			// and the channel may come back before the budget is spent.
			if (attempt < LIVE_RECOVERY_MAX_ATTEMPTS && armedFor === intent) {
				log(`Live recovery: attempt ${attempt} failed to re-resolve, retrying: ${err?.message || err}`);
				scheduleRetry(gapBefore(attempt + 1), 'retry-after-failure', armedFor);
			} else {
				log(`Live recovery: attempt ${attempt} failed, giving the channel up: ${err?.message || err}`);
				await giveUp(armedFor);
			}
		} finally {
			// Stamped again at the end, so a slow re-resolve doesnt eat the next attempt's gap.
			lastAt = now();
			inFlight = false;
		}
	};

	return {
		/**
		 * A channel was opened afresh, by a tune or by Retry, so it gets the whole
		 * budget back and its first frame window starts.
		 */
		tuned () {
			resetBudget();
			openStream();
		},

		/**
		 * What the player reports about itself. Any field left out keeps its last value.
		 * @param {{playing?: boolean, buffering?: boolean}} next
		 */
		update (next) {
			Object.assign(player, next);
			if (actuallyPlaying()) {
				frameSeen = true;
				setStatus(null);
				if (retryTimer) {
					log('Live recovery: playback resumed, dropping a held retry');
					cancelRetry();
				}
				armProven();
			}
			evaluate();
		},

		/**
		 * The viewer paused or resumed through the player.
		 * @param {boolean} paused
		 */
		setPaused (paused) {
			viewerPaused = paused;
			evaluate();
		},

		/**
		 * Starts a recovery, held for its gap when one ran too recently.
		 * @param {string} trigger - what asked, for the log
		 */
		recover (trigger) {
			return recover(trigger);
		},

		/**
		 * Whether this channel is past its tune, so a failure belongs to the recovery.
		 * @returns {boolean}
		 */
		engaged () {
			return frameSeen || attempts > 0 || inFlight || retryTimer != null;
		},

		/**
		 * The viewer moved on, by a stop or by tuning somewhere else, so nothing
		 * held or under way may touch the player again.
		 * @param {string} reason - for the log
		 */
		abandon (reason) {
			intent++;
			endWatch();
			if (retryTimer) log(`Live recovery: dropping a held retry, ${reason}`);
			resetBudget();
		}
	};
};
