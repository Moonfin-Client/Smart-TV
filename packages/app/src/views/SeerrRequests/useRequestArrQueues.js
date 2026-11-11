// The arr's queue for each title on the requests screen that could be downloading, through
// Moonbase: one call per title, for approved HD requests whose title is on its way. Answers that
// come back unchanged keep their identity, so the cards they feed don't redraw on every poll.

import {useCallback, useEffect, useMemo, useState} from 'react';

import seerrApi from '../../services/seerrApi';
import {arrQueueTarget, requestWantsArrQueue} from '../../utils/seerrArrQueue';

const mediaTypeOf = (req) => (req.type === 'movie' || req.media?.mediaType === 'movie' ? 'movie' : 'tv');

// Which answer a request reads, or null when it asks for none.
export const requestQueueKey = (req) => {
	const target = requestWantsArrQueue(req) ? arrQueueTarget(mediaTypeOf(req), req.media) : null;
	return target ? `${target.service}:${target.id}` : null;
};

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const useRequestArrQueues = ({enabled, requests}) => {
	const [answers, setAnswers] = useState({});
	const keys = useMemo(() => {
		if (!enabled) return '';
		const unique = new Set(requests.map(requestQueueKey).filter(Boolean));
		return Array.from(unique).sort().join(',');
	}, [enabled, requests]);

	const refresh = useCallback(async () => {
		if (!keys) return;
		const list = keys.split(',');
		const results = await Promise.all(list.map((key) => {
			const [service, id] = key.split(':');
			return seerrApi.getArrQueue(service, id).catch(() => null);
		}));
		// Merged rather than rebuilt, so a slow refresh for an older list can't drop the
		// answers a newer one already brought in.
		setAnswers((prev) => {
			let changed = false;
			const next = {...prev};
			list.forEach((key, i) => {
				if (sameJson(prev[key], results[i])) return;
				next[key] = results[i];
				changed = true;
			});
			return changed ? next : prev;
		});
	}, [keys]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return {answers, refresh, asksAny: keys !== ''};
};

export default useRequestArrQueues;
