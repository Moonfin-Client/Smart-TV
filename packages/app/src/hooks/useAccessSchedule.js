import {useCallback, useEffect, useRef, useState} from 'react';
import {isAllowed, nextAccessStart, nextBoundary, readSchedules} from '../utils/accessSchedule';

const MAX_WAIT_MS = 60 * 1000;
const BLOCKED_RECHECK_MS = 60 * 1000;
const RETRY_MS = 15 * 1000;

/**
 * Tells whether the signed-in user is outside the hours Jellyfin lets them use the server, which
 * is when nearly every request starts failing. The schedule is read from the user's policy and
 * checked at each moment it could change, and again before blocking, so an administrator's
 * extension is noticed. Administrators are exempt, as they are on the server.
 *
 * @param {object} options
 * @param {string} [options.userId] the signed-in user, or none
 * @param {boolean} options.enabled false when the server isn't Jellyfin
 * @param {() => Promise<object>} options.fetchUser reads the user, with their Policy
 * @param {() => Date} options.getNow the current time
 * @param {() => void} [options.onBlocked] called once each time the time runs out
 * @returns {{blocked: boolean, nextAccess: Date|null, recheck: () => void}}
 */
export const useAccessSchedule = ({userId, enabled, fetchUser, getNow, onBlocked}) => {
	const [state, setState] = useState({blocked: false, nextAccess: null});
	const checkRef = useRef(null);
	const latest = useRef({fetchUser, getNow, onBlocked});
	latest.current = {fetchUser, getNow, onBlocked};

	useEffect(() => {
		setState((prev) => (prev.blocked || prev.nextAccess ? {blocked: false, nextAccess: null} : prev));
		checkRef.current = null;
		if (!userId || !enabled) return undefined;

		let cancelled = false;
		let timer = null;
		let schedules = [];
		let exempt = false;
		let blocked = false;

		const schedule = (ms) => {
			clearTimeout(timer);
			timer = setTimeout(check, ms);
		};

		const apply = (now) => {
			const allowed = exempt || isAllowed(schedules, now);
			const wasBlocked = blocked;
			blocked = !allowed;
			if (!blocked && !wasBlocked) return;
			// Refreshed on every check while blocked so the screen tracks schedule edits and day rollover.
			setState({blocked, nextAccess: blocked ? nextAccessStart(schedules, now) : null});
			if (blocked && !wasBlocked) latest.current.onBlocked?.();
		};

		async function check () {
			clearTimeout(timer);
			try {
				const user = await latest.current.fetchUser();
				if (cancelled) return;
				exempt = Boolean(user?.Policy?.IsAdministrator);
				schedules = readSchedules(user?.Policy);
			} catch (e) {
				// Keep the last schedule, but a window that is already closed stays closed.
				if (!cancelled) schedule(RETRY_MS);
				return;
			}
			const now = latest.current.getNow();
			apply(now);
			if (exempt) return;
			const boundary = nextBoundary(schedules, now);
			let wait = blocked ? BLOCKED_RECHECK_MS : MAX_WAIT_MS;
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
