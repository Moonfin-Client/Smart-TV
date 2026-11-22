// Reconnecting a stream that lost its connection after it had played: it's opened again where it was, as it was,
// rather than taken for unplayable. Ported from Moonfin-Core's PlaybackManager reconnect (#2060).
//
// Attempts start a second after the loss and double up to 15 s apart, for about two minutes; then the stream counts as
// lost. A stream that plays on for 30 s gets the whole budget back. A pause or a stall restarts that count, so a
// reopened stream left paused proves nothing.

export const RECONNECT_BUDGET_MS = 2 * 60 * 1000;
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;
const PROVEN_AFTER_MS = 30000;

export const reconnectDelayBefore = (attempt) => Math.min(FIRST_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)), MAX_DELAY_MS);

/**
 * `reopen()` opens the stream again at the current position and rejects when it couldn't. `onReconnecting(bool)` hears
 * the state for the label; `onLost()` is called once the budget is spent. `now`, `setTimer` and `clearTimer` are
 * replaceable for tests.
 */
export const createStreamReconnect = ({
	reopen, onReconnecting = () => {}, onLost = () => {}, log = () => {},
	now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout
}) => {
	let startedAt = null;
	let attempts = 0;
	let reconnecting = false;
	let inFlight = false;
	let retryTimer = null;
	let provenTimer = null;
	// Bumped when a reconnect ends, so an attempt that outlives it neither blocks nor schedules the next one.
	let generation = 0;

	const setReconnecting = (value) => {
		if (reconnecting === value) return;
		reconnecting = value;
		onReconnecting(value);
	};

	const cancelProven = () => {
		clearTimer(provenTimer);
		provenTimer = null;
	};

	const end = () => {
		generation++;
		clearTimer(retryTimer);
		retryTimer = null;
		cancelProven();
		startedAt = null;
		attempts = 0;
		inFlight = false;
		setReconnecting(false);
	};

	let schedule = null;
	const run = async (attempt, gen) => {
		retryTimer = null;
		if (gen !== generation || !reconnecting) return;
		attempts = attempt;
		inFlight = true;
		log(`Reconnecting, attempt ${attempt}`);
		let failed = false;
		try {
			await reopen();
		} catch (err) {
			failed = true;
			log(`Reconnect attempt ${attempt} failed: ${err?.message || err}`);
		}
		if (gen !== generation) return;
		inFlight = false;
		if (failed && reconnecting) schedule();
	};

	schedule = () => {
		if (startedAt == null) return;
		const attempt = attempts + 1;
		const delay = reconnectDelayBefore(attempt);
		if (now() + delay - startedAt > RECONNECT_BUDGET_MS) {
			log(`Reconnect budget spent after ${attempts} attempts`);
			end();
			onLost();
			return;
		}
		const gen = generation;
		retryTimer = setTimer(() => run(attempt, gen), delay);
	};

	return {
		get reconnecting () {
			return reconnecting;
		},
		// The connection was lost, or an attempt's stream failed too. Starts reconnecting, or schedules the next attempt
		// when one isn't already on its way.
		lost: (trigger) => {
			cancelProven();
			if (startedAt == null) {
				startedAt = now();
				attempts = 0;
				log(`Connection lost (${trigger}), reconnecting`);
			}
			setReconnecting(true);
			if (inFlight || retryTimer) return;
			schedule();
		},
		// The stream plays. The label goes, and the budget comes back after a while of playing on.
		playing: () => {
			if (startedAt == null) return;
			setReconnecting(false);
			if (provenTimer) return;
			const gen = generation;
			provenTimer = setTimer(() => {
				provenTimer = null;
				if (gen !== generation || reconnecting) return;
				startedAt = null;
				attempts = 0;
			}, PROVEN_AFTER_MS);
		},
		// A pause or a stall: playing on has to start counting again.
		interrupted: cancelProven,
		// Another item, or the player closing: this stream's reconnect is over.
		end
	};
};
