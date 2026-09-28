import {useEffect, useRef} from 'react';

// Reports each press and release on the first connected gamepad as (button index, pressed).
// Browsers only expose pads by polling, so this checks once a frame.
const useGamepadButtons = (onButton) => {
	const handler = useRef(onButton);
	handler.current = onButton;

	useEffect(() => {
		if (typeof navigator === 'undefined' || !navigator.getGamepads) return undefined;
		let frame = null;
		let previous = [];
		const poll = () => {
			const pads = navigator.getGamepads() || [];
			let pad = null;
			for (let i = 0; i < pads.length && !pad; i++) pad = pads[i];
			if (pad) {
				for (let index = 0; index < pad.buttons.length; index++) {
					const pressed = Boolean(pad.buttons[index].pressed);
					if (Boolean(previous[index]) !== pressed) {
						previous[index] = pressed;
						handler.current(index, pressed);
					}
				}
			} else {
				previous = [];
			}
			frame = window.requestAnimationFrame(poll);
		};
		frame = window.requestAnimationFrame(poll);
		return () => window.cancelAnimationFrame(frame);
	}, []);
};

export default useGamepadButtons;
