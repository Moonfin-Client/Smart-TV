import {useCallback, useEffect, useRef} from 'react';

import {LONG_PRESS_MS, isSelectKey} from '../../utils/longPress';

// How often a held press repeats, and how far a move goes: three at a tenth of a second, then
// six at half a second, then a second each. A hold of five seconds is worth about sixteen.
const REPEAT_MS = 200;
export const holdOffsetSeconds = (count) => (count <= 3 ? 0.1 : count <= 9 ? 0.5 : 1);

const clampToTenths = (seconds, limit) => Math.max(-limit, Math.min(limit, Math.round(seconds * 10) / 10));

/**
 * Steps a value while a button is held.
 *
 * The repeat is timed here rather than counted off the remote's own key repeat, which the oldest
 * sets don't send for OK. A press shorter than a hold is one step, and the click Spotlight raises
 * on the release is swallowed once a hold has moved, so letting go never adds a step of its own.
 *
 * shortcut: a key up the set never sends keeps this stepping until the overlay closes or the limit
 * stops it, since a set that doesn't repeat OK gives no gap to read the hold from. Stop counting
 * repeats instead if a lost release ever shows on a real set.
 */
const useOffsetHold = (value, onChange, limit) => {
	const holdRef = useRef(null);
	// A hold that moved leaves this set for the click its release raises.
	const movedRef = useRef(false);

	const stop = useCallback(() => {
		const hold = holdRef.current;
		holdRef.current = null;
		if (!hold) return;
		clearTimeout(hold.timeout);
		clearInterval(hold.interval);
	}, []);

	useEffect(() => {
		const release = (e) => {
			if (isSelectKey(e)) stop();
		};
		window.addEventListener('keyup', release, true);
		return () => {
			window.removeEventListener('keyup', release, true);
			stop();
		};
	}, [stop]);

	const buttonProps = (direction) => ({
		onKeyDown: (e) => {
			if (!isSelectKey(e) || holdRef.current) return;
			movedRef.current = false;
			const hold = {count: 1, value, timeout: null, interval: null};
			const tick = () => {
				movedRef.current = true;
				const next = clampToTenths(hold.value + (direction * holdOffsetSeconds(hold.count)), limit);
				hold.count += 1;
				// Already at the limit, so there is nothing to say and nothing to redraw.
				if (next === hold.value) return;
				hold.value = next;
				onChange(next);
			};
			hold.timeout = setTimeout(() => {
				tick();
				hold.interval = setInterval(tick, REPEAT_MS);
			}, LONG_PRESS_MS);
			holdRef.current = hold;
		},
		onClick: () => {
			if (movedRef.current) {
				movedRef.current = false;
				return;
			}
			onChange(clampToTenths(value + (direction * holdOffsetSeconds(1)), limit));
		}
	});

	return {buttonProps};
};

export default useOffsetHold;
