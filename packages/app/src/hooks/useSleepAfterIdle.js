import {useEffect} from 'react';

import * as remoteControl from '../services/remoteControl';
import {exitApp} from '../utils/appLifecycle';
import useInactivityTimer from './useInactivityTimer';

// The longest the app waits on the player's stop report before it closes anyway.
const STOP_REPORT_WAIT = 5000;

// Let TV Sleep After closes the app once nothing has been pressed for that many minutes, so the
// TV's own screensaver and sleep timer can take over. Whatever sits paused in the player reports
// its stop first, which keeps its resume point. The wait only runs while armed.
const useSleepAfterIdle = (minutes, armed, screensaverShown) => {
	const {isInactive: due, dismiss: restart} = useInactivityTimer(minutes * 60, minutes > 0 && armed);

	// The key that wakes the screensaver goes no further, so the wait starts over once it closes.
	useEffect(() => {
		if (!screensaverShown) restart();
	}, [screensaverShown, restart]);

	useEffect(() => {
		if (!due) return;
		// Behind another app or input, the app isn't what keeps the screen on.
		if (document.hidden || document.webkitHidden) {
			restart();
			return;
		}
		Promise.race([
			remoteControl.releasePlayer().catch(() => {}),
			new Promise((resolve) => setTimeout(resolve, STOP_REPORT_WAIT))
		]).then(exitApp);
	}, [due, restart]);
};

export default useSleepAfterIdle;
