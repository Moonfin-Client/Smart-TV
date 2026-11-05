import {useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import {programEnd, programStart, seriesChoiceFlags, seriesChoiceOf} from '../../utils/liveTvGuide';
import {recordAiring, recordAiringMessage} from '../../utils/recordAiring';

const MINUTE = 60000;

const sameId = (a, b) => a != null && b != null && String(a).replace(/-/g, '') === String(b).replace(/-/g, '');

// The timer recording this showing, a running one ahead of one still waiting. Cancelled and
// finished timers don't count.
const timerFor = (program, timers) => {
	const matching = timers.filter((timer) => sameId(timer.Id, program.TimerId) || sameId(timer.ProgramId, program.Id));
	return matching.find((timer) => timer.Status === 'InProgress') || matching.find((timer) => timer.Status === 'New') || null;
};

// The airing program's recording state for the player's Record button and dialog. The program the
// OSD holds can be a minute old, so this fetches it again along with the timer list, as the
// controls come up and once a minute while they stay up.
const useLiveRecording = ({api, program, controlsVisible, onChanged}) => {
	const [fetched, setFetched] = useState(null);
	const [toast, setToast] = useState(null);
	const programRef = useRef(program);
	programRef.current = program;
	const busyRef = useRef(false);

	const refresh = useCallback(async () => {
		const target = programRef.current;
		if (!api || !target?.Id) return;
		const [fresh, timerList] = await Promise.all([api.getLiveTvProgram(target.Id), api.getLiveTvTimers()]);
		if (programRef.current?.Id === target.Id) setFetched({program: fresh || target, timers: timerList?.Items || []});
	}, [api]);

	// Asked again just before the dialog opens, so it shows what the server has now.
	const prepare = useCallback(() => refresh().then(() => true, () => {
		setToast({message: $L('Failed to load recordings'), key: Date.now()});
		return false;
	}), [refresh]);

	const now = Date.now();
	const airing = Boolean(api && program?.Id && programStart(program) <= now && now < programEnd(program));
	const programId = airing ? program.Id : null;

	useEffect(() => {
		if (!programId || !controlsVisible) return undefined;
		refresh().catch(() => {});
		const interval = setInterval(() => refresh().catch(() => {}), MINUTE);
		return () => clearInterval(interval);
	}, [programId, controlsVisible, refresh]);

	const showToast = (message) => setToast({message, key: Date.now()});
	const clearToast = () => setToast(null);
	if (!airing) return {available: false, toast, clearToast, prepare};

	const current = fetched?.program?.Id === program.Id ? fetched.program : program;
	const timers = fetched?.program?.Id === program.Id ? fetched.timers : [];
	const timer = timerFor(current, timers);
	const seriesTimerId = timer?.SeriesTimerId || current.SeriesTimerId || null;
	const nextSeriesRecording = seriesTimerId
		? timers
			.filter((t) => t.Status === 'New' && sameId(t.SeriesTimerId, seriesTimerId) && new Date(t.StartDate).getTime() > now)
			.sort((a, b) => new Date(a.StartDate) - new Date(b.StartDate))[0] || null
		: null;

	// An action can answer with its own message in place of the usual one.
	const run = async (action, success, failure) => {
		if (busyRef.current) return;
		busyRef.current = true;
		try {
			const message = await action();
			showToast(typeof message === 'string' ? message : success);
			onChanged?.();
		} catch {
			showToast(failure);
		}
		busyRef.current = false;
		refresh().catch(() => {});
	};

	return {
		available: true,
		program: current,
		timer,
		seriesTimerId,
		// The dot only turns red while the recording runs, and a series rule's mark is grey on a
		// showing it passes over.
		mark: seriesTimerId
			? (timer ? 'series' : 'skipped')
			: timer && (timer.Status === 'InProgress' ? 'record' : 'scheduled'),
		nextSeriesRecording,
		toast,
		clearToast,
		prepare,
		// The Record workflow with the prompt host the dialog passes in. Back on the prompt records
		// nothing and says nothing.
		record: async ({prompt, setLoading, channel}) => {
			if (busyRef.current) return;
			busyRef.current = true;
			let message = null;
			try {
				const outcome = await recordAiring({
					program: current,
					start: new Date(programStart(current)),
					createTimer: () => api.createLiveTvTimer(current.Id),
					prompt,
					setLoading,
					stillValid: () => programRef.current?.Id === current.Id,
					channel
				});
				message = recordAiringMessage(outcome);
				if (message) onChanged?.();
			} catch {
				message = $L('Unable to create recording');
			}
			busyRef.current = false;
			if (message) showToast(message);
			refresh().catch(() => {});
		},
		cancel: () => run(() => api.cancelLiveTvTimer(timer.Id), $L('Recording cancelled'), $L('Failed to cancel recording')),
		recordSeries: (key) => run(
			() => api.createLiveTvSeriesTimer(current.Id, seriesChoiceFlags(key)),
			$L('Series set to record'),
			$L('Unable to create series recording')
		),
		cancelSeries: () => run(
			() => api.cancelLiveTvSeriesTimer(seriesTimerId),
			$L('Series recording cancelled'),
			$L('Failed to cancel series recording')
		),
		loadSeriesRule: () => api.getLiveTvSeriesTimer(seriesTimerId).catch(() => {
			showToast($L('Unable to update series recording'));
			return null;
		}),
		updateSeries: (rule, key) => {
			if (seriesChoiceOf(rule) === key) return;
			run(
				() => api.updateLiveTvSeriesTimer(rule.Id, {...rule, ...seriesChoiceFlags(key)}),
				$L('Series recording updated'),
				$L('Unable to update series recording')
			);
		}
	};
};

export default useLiveRecording;
