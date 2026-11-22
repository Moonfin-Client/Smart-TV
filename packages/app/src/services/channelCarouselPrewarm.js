// Keeps the channel carousel's guide data loaded while the carousel is closed, so the first Up
// press opens onto real cards instead of placeholders.

import {createLiveTvGuideStore} from './liveTvGuideStore';
import {guideLeftEdge} from '../utils/liveTvGuide';

// A tune is often one step of channel surfing, so the fetch waits for the lineup to settle
// rather than firing on every step.
const SETTLE_DELAY_MS = 1000;
const HOURLY_REFRESH_MS = 60 * 60 * 1000;

export const createChannelCarouselPrewarm = (api, {sortBy} = {}) => {
	const store = createLiveTvGuideStore(api, {sortBy});
	let channels = [];
	let settleTimer = null;
	let hourlyTimer = null;
	let hourlyDueAt = null;
	let inFlight = null;
	let warmPending = false;
	let hourlyPending = false;
	let disposed = false;
	// Counts the recording changes the player reports, so a load can tell one landed while it ran.
	let recordingRevision = 0;
	// Assigned below. The pending queue reaches back to them once a fetch finishes.
	let warm = null;
	let refreshHourly = null;

	const isWarm = () => store.state === 'ready';

	const drainPending = () => {
		if (disposed || inFlight) return;
		if (warmPending) {
			warmPending = false;
			warm();
		} else if (hourlyPending) {
			hourlyPending = false;
			refreshHourly();
		}
	};

	// One fetch at a time. A caller arriving while one runs waits on it instead of starting another.
	const runExclusive = async (work) => {
		if (inFlight) {
			await inFlight.catch(() => {});
			return;
		}
		const tracked = Promise.resolve().then(work);
		inFlight = tracked;
		try {
			await tracked;
		} catch {
			// A failed warm or refresh keeps the last good data.
		} finally {
			if (inFlight === tracked) {
				inFlight = null;
				drainPending();
			}
		}
	};

	const waitForExclusiveWork = async () => {
		while (!disposed && inFlight) {
			await inFlight.catch(() => {});
		}
	};

	const armHourly = () => {
		if (disposed) return;
		clearTimeout(hourlyTimer);
		hourlyDueAt = Date.now() + HOURLY_REFRESH_MS;
		hourlyTimer = setTimeout(() => {
			hourlyTimer = null;
			hourlyDueAt = null;
			refreshHourly();
		}, HOURLY_REFRESH_MS);
	};

	refreshHourly = async () => {
		if (disposed) return;
		if (inFlight) {
			hourlyPending = true;
			await waitForExclusiveWork();
			return;
		}
		await runExclusive(() => store.refreshCarouselPrograms());
		if (!disposed) armHourly();
	};

	const warmPrograms = (ids) => {
		if (isWarm()) return store.ensureProgramsForChannels(ids);
		return store.load({initialChannelIds: ids, windowStart: guideLeftEdge(Date.now()), livePosition: true});
	};

	warm = async () => {
		if (disposed || !channels.length) return;
		const ids = Array.from(new Set(channels.map((channel) => channel.Id)));
		const wasCold = !isWarm();
		await runExclusive(async () => {
			const revision = recordingRevision;
			await warmPrograms(ids);
			// A recording changed during the first load was ignored, since nothing was warm yet to refresh.
			if (wasCold && isWarm() && revision !== recordingRevision) await store.refreshRecordings();
		});
		if (disposed) return;
		store.scheduleBoundaryRefresh();
		if (hourlyDueAt == null) armHourly();
	};

	const requestWarm = () => {
		if (disposed) return;
		if (inFlight) {
			warmPending = true;
			return;
		}
		warm();
	};

	return {
		store,
		get isWarm () { return isWarm(); },

		// Called on every tune. The load covers the whole lineup once surfing settles.
		tuned: (lineup) => {
			if (disposed || !lineup?.length) return;
			channels = lineup;
			clearTimeout(settleTimer);
			settleTimer = setTimeout(requestWarm, SETTLE_DELAY_MS);
		},

		ensureVisibleChannels: async (ids) => {
			if (disposed || inFlight) return;
			await runExclusive(() => store.ensureProgramsForChannels(ids));
			if (!disposed) store.scheduleBoundaryRefresh();
		},

		refresh: () => {
			recordingRevision++;
			if (!disposed && isWarm()) refreshHourly();
		},

		ensureReady: async () => {
			if (disposed) return;
			if (isWarm()) {
				if (hourlyDueAt == null || hourlyDueAt <= Date.now()) {
					await refreshHourly();
					await waitForExclusiveWork();
				}
				if (!disposed) store.scheduleBoundaryRefresh();
				return;
			}
			clearTimeout(settleTimer);
			settleTimer = null;
			requestWarm();
			if (inFlight) await inFlight.catch(() => {});
		},

		dispose: () => {
			disposed = true;
			clearTimeout(settleTimer);
			clearTimeout(hourlyTimer);
			hourlyTimer = null;
			hourlyDueAt = null;
			store.cancelBoundaryRefresh();
			store.dispose();
		}
	};
};
