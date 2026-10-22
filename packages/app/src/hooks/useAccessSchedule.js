import {useCallback, useEffect, useRef, useState} from 'react';
import {
	isAllowed, nextAccessStart, nextBoundary, readSchedules, readServerClock, serverWallClock
} from '../utils/accessSchedule';

const MAX_WAIT_MS = 60 * 1000;
const IDLE_WAIT_MS = 15 * 60 * 1000;
const BLOCKED_RECHECK_MS = 60 * 1000;
const RETRY_MS = 15 * 1000;

/**
 * Tells whether the signed-in user is outside the hours Jellyfin lets them use the server, which
 * is when nearly every request starts failing. The schedule is read from the user's policy and
 * checked at each moment it could change, and again before blocking, so an administrator's
 * extension is noticed. Jellyfin checks the schedule on its own clock, which can be in another
 * time zone, so for a user with a schedule the server is asked and its answer decides. A user
 * without one is read every 15 minutes. Administrators are exempt, as they are on the server.
 *
 * The hours are read on the server's clock when the plugin reports it, since that is the clock
 * the server judges them by, and on this device's otherwise. The server refuses every request
 * once the time is up, the clock included, so it is read while the user is let in and kept.
 *
 * @param {object} options
 * @param {string} [options.userId] the signed-in user, or none
 * @param {boolean} options.enabled false when the server isn't Jellyfin
 * @param {() => Promise<object>} options.fetchUser reads the user, with their Policy
 * @param {() => Promise<boolean|null>} [options.serverRefuses] whether the server is turning the
 *   user away right now, or null when it can't tell, which leaves it to this device's clock
 * @param {() => Promise<object|null>} [options.fetchServerTime] the plugin's Moonfin/Time, null
 *   when the server has none, which is not asked for again, and a rejection when it couldn't be
 *   read, which keeps the last clock
 * @param {() => Date} options.getNow the current time on this device, for when the server's isn't known
 * @param {() => number} [options.getDeviceUtcMs] this device's UTC clock in milliseconds
 * @param {() => void} [options.onBlocked] called once each time the time runs out
 * @returns {{blocked: boolean, nextAccess: Date|null, recheck: () => void, getScheduleNow: () => Date}}
 *   getScheduleNow is the current time on the clock the hours are judged by, to read as `nextAccess` is
 */
export const useAccessSchedule = ({
	userId, enabled, fetchUser, serverRefuses, fetchServerTime, getNow, getDeviceUtcMs = Date.now, onBlocked
}) => {
	const [state, setState] = useState({blocked: false, nextAccess: null});
	const checkRef = useRef(null);
	const serverClockRef = useRef(null);
	const latest = useRef({fetchUser, serverRefuses, fetchServerTime, getNow, getDeviceUtcMs, onBlocked});
	latest.current = {fetchUser, serverRefuses, fetchServerTime, getNow, getDeviceUtcMs, onBlocked};

	const getScheduleNow = useCallback(() => {
		const clock = serverClockRef.current;
		return clock ? serverWallClock(clock, latest.current.getDeviceUtcMs()) : latest.current.getNow();
	}, []);

	useEffect(() => {
		serverClockRef.current = null;
		setState((prev) => (prev.blocked || prev.nextAccess ? {blocked: false, nextAccess: null} : prev));
		checkRef.current = null;
		if (!userId || !enabled) return undefined;

		let cancelled = false;
		let timer = null;
		let schedules = [];
		let exempt = false;
		let blocked = false;
		let timeUnsupported = false;
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

		async function check () {
			clearTimeout(timer);
			const look = ++started;
			let user;
			try {
				user = await latest.current.fetchUser();
			} catch (e) {
				// Keep the last schedule, but a window that is already closed stays closed.
				if (!cancelled && look >= applied) schedule(RETRY_MS);
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
			// Not asked once the time is up, when the server refuses it too, nor of a server without it.
			let serverClock;
			const askTime = latest.current.fetchServerTime;
			if (!isExempt && fresh.length > 0 && askTime && !timeUnsupported && !blocked) {
				try {
					const time = await askTime();
					serverClock = time === null ? null : readServerClock(time, latest.current.getDeviceUtcMs());
				} catch (e) {
					// Keeps the last clock
				}
				if (cancelled || look < applied) return;
			}
			applied = look;
			exempt = isExempt;
			schedules = fresh;
			if (serverClock === null) timeUnsupported = true;
			if (serverClock !== undefined) serverClockRef.current = serverClock;
			const now = getScheduleNow();
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
	}, [userId, enabled, getScheduleNow]);

	const recheck = useCallback(() => {
		if (checkRef.current) checkRef.current();
	}, []);

	return {blocked: state.blocked, nextAccess: state.nextAccess, recheck, getScheduleNow};
};

export default useAccessSchedule;
