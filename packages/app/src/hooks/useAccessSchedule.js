import {useCallback, useEffect, useRef, useState} from 'react';
import {isAllowed, nextAccessStart, nextBoundary, readSchedules} from '../utils/accessSchedule';

const MAX_WAIT_MS = 60 * 1000;
const IDLE_WAIT_MS = 15 * 60 * 1000;
const BLOCKED_RECHECK_MS = 60 * 1000;
const RETRY_MS = 15 * 1000;
// A window read that stalls (the transport's timeout ends once headers arrive) gives up after this.
const WINDOW_TIMEOUT_MS = 60 * 1000;

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
		// When the window the plugin last reported as closed opens again, in ms on this TV's clock.
		let windowOpens = null;
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

		// The plugin's answer alone decides and times the next check.
		const applyWindow = (answer) => {
			const now = latest.current.getNow();
			windowCloses = answer.allowed && answer.untilCloseMs !== null ? now.getTime() + answer.untilCloseMs : null;
			windowOpens = !answer.allowed && answer.untilOpenMs !== null ? now.getTime() + answer.untilOpenMs : null;
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
			if (remaining !== null) wait = Math.min(wait, remaining);
			schedule(Math.max(wait, 1000));
		};

		async function check () {
			clearTimeout(timer);
			const look = ++started;
			const loadWindow = latest.current.fetchAccessWindow;
			if (loadWindow && !windowUnsupported) {
				let answer;
				let failed = false;
				try {
					answer = await Promise.race([
						loadWindow(),
						new Promise((resolve, reject) => setTimeout(reject, WINDOW_TIMEOUT_MS))
					]);
				} catch (e) {
					// This check falls back to the schedule and the server; the plugin is asked again next time.
					failed = true;
				}
				if (cancelled || look < applied) return;
				if (answer) {
					applied = look;
					applyWindow(answer);
					return;
				}
				// A plugin that can't answer it won't start to during this session.
				if (!failed) windowUnsupported = true;
			}
			let user;
			try {
				user = await latest.current.fetchUser();
			} catch (e) {
				// Keep the last schedule, but a window that is already closed stays closed. Offline, where
				// the server can't stop a download, an allowed window ends at the close the plugin reported,
				// and a block at the opening it reported.
				if (cancelled || look < applied) return;
				const nowMs = latest.current.getNow().getTime();
				if (!blocked && windowCloses !== null && nowMs >= windowCloses) {
					windowCloses = null;
					blocked = true;
					setState({blocked: true, nextAccess: null});
					latest.current.onBlocked?.();
				} else if (blocked && windowOpens !== null && nowMs >= windowOpens) {
					windowOpens = null;
					blocked = false;
					setState({blocked: false, nextAccess: null});
				}
				schedule(RETRY_MS);
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
			applied = look;
			exempt = isExempt;
			schedules = fresh;
			windowCloses = null;
			windowOpens = null;
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
