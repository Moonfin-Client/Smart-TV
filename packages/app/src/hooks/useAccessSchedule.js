import {useCallback, useEffect, useRef, useState} from 'react';
import {isAllowed, nextAccessStart, nextBoundary, readSchedules} from '../utils/accessSchedule';

const MAX_WAIT_MS = 60 * 1000;
const IDLE_WAIT_MS = 15 * 60 * 1000;
const BLOCKED_RECHECK_MS = 60 * 1000;
const RETRY_MS = 15 * 1000;
// The transport's timeout ends once headers arrive, so a body that stalls after them would hold a
// check, and the next one it schedules, for good. The window read gives up after this instead: long
// enough for a wait in the media server queue, which the transport's timeout doesn't count, and no
// longer than the usual time between checks.
const WINDOW_TIMEOUT_MS = 60 * 1000;

const withDeadline = (promise, ms) => {
	let timer;
	const deadline = new Promise((resolve, reject) => {
		timer = setTimeout(() => reject(new Error('Access window read timed out')), ms);
	});
	return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
};

/**
 * Tells whether the signed-in user is outside the hours Jellyfin lets them use the server, which
 * is when nearly every request starts failing. The schedule is read from the user's policy and
 * checked at each moment it could change, and again before blocking, so an administrator's
 * extension is noticed. Jellyfin checks the schedule on its own clock, which can be in another
 * time zone. With a Moonfin plugin that answers it, the plugin works the schedule out on the
 * server's clock and says how long until it closes or opens, and that alone decides and times the
 * checks. Without one, for a user with a schedule the server is asked and its answer decides. A
 * user without one is read every 15 minutes. Administrators are exempt, as they are on the server.
 *
 * @param {object} options
 * @param {string} [options.userId] the signed-in user, or none
 * @param {boolean} options.enabled false when the server isn't Jellyfin
 * @param {() => Promise<object>} options.fetchUser reads the user, with their Policy
 * @param {() => Promise<boolean|null>} [options.serverRefuses] whether the server is turning the
 *   user away right now, or null when it can't tell, which leaves it to this device's clock
 * @param {() => Promise<object|null>} [options.fetchAccessWindow] the plugin's access window, as
 *   {@link readWindow} gives it, or null when the server can't say; rejects when it couldn't be read
 * @param {() => Date} options.getNow the current time
 * @param {() => void} [options.onBlocked] called once each time the time runs out
 * @returns {{blocked: boolean, nextAccess: Date|null, recheck: () => void}}
 */
export const useAccessSchedule = ({userId, enabled, fetchUser, serverRefuses, fetchAccessWindow, getNow, onBlocked}) => {
	const [state, setState] = useState({blocked: false, nextAccess: null});
	const checkRef = useRef(null);
	const latest = useRef({fetchUser, serverRefuses, fetchAccessWindow, getNow, onBlocked});
	latest.current = {fetchUser, serverRefuses, fetchAccessWindow, getNow, onBlocked};

	useEffect(() => {
		setState((prev) => (prev.blocked || prev.nextAccess ? {blocked: false, nextAccess: null} : prev));
		checkRef.current = null;
		if (!userId || !enabled) return undefined;

		let cancelled = false;
		let timer = null;
		let schedules = [];
		let exempt = false;
		let blocked = false;
		// Set when the server says it can't answer the access window, so this user's checks stop asking.
		let windowUnsupported = false;
		// When the allowed window the plugin last reported closes, in ms on this TV's clock.
		let windowCloses = null;
		// Checks can overlap, so each is numbered and none replaces the answer of one started after it.
		let started = 0;
		let applied = 0;

		const schedule = (ms) => {
			clearTimeout(timer);
			timer = setTimeout(check, ms);
		};

		const apply = (now, refused) => {
			const allowed = exempt || (refused === null ? isAllowed(schedules, now) : !refused);
			const wasBlocked = blocked;
			blocked = !allowed;
			if (!blocked && !wasBlocked) return;
			// Refreshed on every check while blocked so the screen tracks schedule edits and day rollover.
			// It's worked out on this device's clock, so it's null when that clock says the window is open.
			setState({blocked, nextAccess: blocked ? nextAccessStart(schedules, now) : null});
			if (blocked && !wasBlocked) latest.current.onBlocked?.();
		};

		// The plugin's answer alone decides and times the next check. It was worked out somewhere
		// between asked and now: the next check counts from asked, so it can only come early, and the
		// opening counts from now, which is nearest when it was worked out (a request can wait in the
		// media server queue before it is sent).
		const applyWindow = (answer, asked) => {
			const now = latest.current.getNow();
			// Counted from the answer, so a check with no answer can't end it early.
			windowCloses = answer.allowed && answer.untilCloseMs !== null ? now.getTime() + answer.untilCloseMs : null;
			const wasBlocked = blocked;
			blocked = !answer.allowed;
			// Named on this device's clock, as the moment it comes on it, to the nearest minute: a
			// schedule opens on a minute, and a clock a moment behind the server's would otherwise
			// name the minute before.
			const nextAccess = blocked && answer.untilOpenMs !== null
				? new Date(Math.round((now.getTime() + answer.untilOpenMs) / 60000) * 60000)
				: null;
			if (blocked || wasBlocked) setState({blocked, nextAccess});
			if (blocked && !wasBlocked) latest.current.onBlocked?.();
			// Allowed with nothing to close is a user with no schedule, or one open all week.
			let wait = !blocked && answer.untilCloseMs === null ? IDLE_WAIT_MS : MAX_WAIT_MS;
			const remaining = blocked ? answer.untilOpenMs : answer.untilCloseMs;
			if (remaining !== null) wait = Math.min(wait, remaining - (now.getTime() - asked.getTime()));
			schedule(Math.max(wait, 1000));
		};

		// A check with no answer from the server keeps the last decision and tries again, but an
		// allowed decision ends at the close the plugin reported for it, with no opening to name.
		const keepLastAnswer = () => {
			let wait = RETRY_MS;
			if (windowCloses !== null) {
				const left = windowCloses - latest.current.getNow().getTime();
				if (left <= 0) {
					windowCloses = null;
					if (!blocked) {
						blocked = true;
						setState({blocked: true, nextAccess: null});
						latest.current.onBlocked?.();
					}
				} else {
					wait = Math.min(wait, left);
				}
			}
			schedule(Math.max(wait, 1000));
		};

		async function check () {
			clearTimeout(timer);
			const look = ++started;
			let windowFailed = false;
			const loadWindow = latest.current.fetchAccessWindow;
			if (loadWindow && !windowUnsupported) {
				// The plugin works its durations out between now and its answer, so they count from
				// here: a slow answer can't push the next check past the change it names.
				const asked = latest.current.getNow();
				let answer;
				let failed = false;
				try {
					answer = await withDeadline(loadWindow(), WINDOW_TIMEOUT_MS);
				} catch (e) {
					failed = true;
				}
				if (cancelled || look < applied) return;
				if (answer) {
					applied = look;
					applyWindow(answer, asked);
					return;
				}
				// A plugin that can't answer it won't start to during this session; only the newest
				// check says so. A window that couldn't be read leaves the plugin asked again next
				// time, and the schedule and the server decide this check, so a failing endpoint
				// can't leave the user let in on a server that turns them away.
				if (!failed && look === started) windowUnsupported = true;
				windowFailed = failed;
			}
			let user;
			try {
				user = await latest.current.fetchUser();
			} catch (e) {
				// Keep the last schedule, but a window that is already closed stays closed.
				if (!cancelled && look >= applied) keepLastAnswer();
				return;
			}
			if (cancelled || look < applied) return;
			const isExempt = Boolean(user?.Policy?.IsAdministrator);
			const fresh = readSchedules(user?.Policy);
			let refused = null;
			const ask = latest.current.serverRefuses;
			if (!isExempt && fresh.length > 0 && ask) {
				refused = await ask().catch(() => null);
				if (cancelled || look < applied) return;
			}
			// With a plugin that judges the schedule, this TV's clock never decides: when its window
			// couldn't be read and the server gave no answer either, the last answer stays.
			if (windowFailed && !isExempt && fresh.length > 0 && refused === null) {
				keepLastAnswer();
				return;
			}
			applied = look;
			windowCloses = null;
			exempt = isExempt;
			schedules = fresh;
			const now = latest.current.getNow();
			apply(now, refused);
			if (exempt) return;
			const boundary = nextBoundary(schedules, now);
			let wait = blocked ? BLOCKED_RECHECK_MS : (schedules.length > 0 ? MAX_WAIT_MS : IDLE_WAIT_MS);
			if (boundary && !blocked) wait = Math.min(wait, boundary.getTime() - now.getTime());
			schedule(Math.max(wait, 1000));
		}

		checkRef.current = check;
		check();

		return () => {
			cancelled = true;
			clearTimeout(timer);
			checkRef.current = null;
		};
	}, [userId, enabled]);

	const recheck = useCallback(() => {
		if (checkRef.current) checkRef.current();
	}, []);

	return {blocked: state.blocked, nextAccess: state.nextAccess, recheck};
};

export default useAccessSchedule;
