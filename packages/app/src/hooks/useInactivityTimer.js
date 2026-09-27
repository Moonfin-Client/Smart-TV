import {useState, useEffect, useCallback, useRef} from 'react';

const useInactivityTimer = (timeoutSeconds = 90, enabled = true) => {
	const [isInactive, setIsInactive] = useState(false);
	const inactiveRef = useRef(false);
	const consumedRemoteKeys = useRef(new Set());
	inactiveRef.current = isInactive;
	const timerRef = useRef(null);
	const enabledRef = useRef(enabled);
	const timeoutRef = useRef(timeoutSeconds);

	enabledRef.current = enabled;
	timeoutRef.current = timeoutSeconds;

	const dismiss = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		inactiveRef.current = false;
		setIsInactive(false);
		if (enabledRef.current) {
			timerRef.current = setTimeout(() => {
				setIsInactive(true);
			}, timeoutRef.current * 1000);
		}
	}, []);

	useEffect(() => {
		if (!enabled) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setIsInactive(false);
			return;
		}

		const handleActivity = (event) => {
			const waking = event.type === 'keydown' && inactiveRef.current;
			const releasingWakeKey = event.type === 'keyup' &&
				event.fromRemote && consumedRemoteKeys.current.delete(event.keyCode);
			if (event.fromRemote && (waking || releasingWakeKey)) {
				if (event.type === 'keydown') consumedRemoteKeys.current.add(event.keyCode);
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			if (event.type === 'keyup') return;
			inactiveRef.current = false;
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
			setIsInactive(false);
			timerRef.current = setTimeout(() => {
				setIsInactive(true);
			}, timeoutRef.current * 1000);
		};

		const events = ['keydown', 'keyup', 'mousedown', 'touchstart'];
		events.forEach(event => window.addEventListener(event, handleActivity, {capture: true}));

		timerRef.current = setTimeout(() => {
			setIsInactive(true);
		}, timeoutRef.current * 1000);

		return () => {
			events.forEach(event => window.removeEventListener(event, handleActivity, true));
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [enabled]);

	return {isInactive, dismiss};
};

export default useInactivityTimer;
