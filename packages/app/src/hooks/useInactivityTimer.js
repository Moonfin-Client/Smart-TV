import {useState, useEffect, useCallback, useRef} from 'react';

const useInactivityTimer = (timeoutSeconds = 90, enabled = true) => {
	const [isInactive, setIsInactive] = useState(false);
	const inactiveRef = useRef(false);
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

	const wake = useCallback(() => {
		if (!inactiveRef.current) return false;
		dismiss();
		return true;
	}, [dismiss]);

	useEffect(() => {
		if (!enabled) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setIsInactive(false);
			return;
		}

		const handleActivity = () => {
			inactiveRef.current = false;
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
			setIsInactive(false);
			timerRef.current = setTimeout(() => {
				setIsInactive(true);
			}, timeoutRef.current * 1000);
		};

		const events = ['keydown', 'mousedown', 'touchstart'];
		events.forEach(event => window.addEventListener(event, handleActivity, {passive: true, capture: true}));

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

	return {isInactive, dismiss, wake};
};

export default useInactivityTimer;
