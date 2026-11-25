import {onCleanup} from 'solid-js';

// Long enough that a normal press never trips it, short enough that the menu still
// feels like a response to holding the button rather than a delay.
export const LONG_PRESS_MS = 600;

// OK held on one target. Held for LONG_PRESS_MS it runs the long action once, and the release
// after that does nothing. Released sooner it runs the short action. Key repeats during the hold
// are dropped, and the timer stops with the component.
export const holdPress = () => {
	let held = null;
	let fired = false;
	let timer = null;
	const cancel = () => {
		clearTimeout(timer);
		held = null;
	};
	onCleanup(() => clearTimeout(timer));
	return {
		cancel,
		start: (target, onLong) => {
			if (held) return;
			held = target;
			fired = false;
			timer = setTimeout(() => {
				fired = true;
				onLong(target);
			}, LONG_PRESS_MS);
		},
		// False when nothing is held, so the release goes on to whatever handles it next.
		end: (onShort) => {
			const target = held;
			if (!target) return false;
			cancel();
			if (!fired) onShort(target);
			return true;
		}
	};
};
