// The arr's queue for each title on the requests screen that could be downloading, through
// Moonbase: one call per title, for approved HD requests whose title is on its way. Every such
// title is asked on each load (a new `loadToken`), titles that turn up later through load more
// or a status change are asked as they appear, and the screen's poll asks again only for the
// titles it names. Nothing here holds up the page. Answers that come back unchanged keep their
// identity, so the cards they feed don't redraw.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import seerrApi from '../../services/seerrApi';
import {arrQueueTarget, requestWantsArrQueue} from '../../utils/seerrArrQueue';

const mediaTypeOf = (req) => (req.type === 'movie' || req.media?.mediaType === 'movie' ? 'movie' : 'tv');

// Which answer a request reads, or null when it asks for none.
export const requestQueueKey = (req) => {
	const target = requestWantsArrQueue(req) ? arrQueueTarget(mediaTypeOf(req), req.media) : null;
	return target ? `${target.service}:${target.id}` : null;
};

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const useRequestArrQueues = ({enabled, requests, loadToken}) => {
	const [answers, setAnswers] = useState({});
	// Titles already asked about, so load more only asks for the new ones.
	const asked = useRef(new Set());
	const lastLoad = useRef(null);

	const keys = useMemo(() => {
		if (!enabled) return '';
		const unique = new Set(requests.map(requestQueueKey).filter(Boolean));
		return Array.from(unique).sort().join(',');
	}, [enabled, requests]);

	const fetchKeys = useCallback(async (list) => {
		if (!list.length) return;
		list.forEach((key) => asked.current.add(key));
		const results = await Promise.all(list.map((key) => {
			const [service, id] = key.split(':');
			return seerrApi.getArrQueue(service, id).catch(() => null);
		}));
		// Merged rather than rebuilt, so a slow answer for some titles can't drop the answers
		// another call already brought in for others.
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
	}, []);

	useEffect(() => {
		const list = keys ? keys.split(',') : [];
		const reload = lastLoad.current !== loadToken;
		lastLoad.current = loadToken;
		fetchKeys(reload ? list : list.filter((key) => !asked.current.has(key)));
	}, [keys, loadToken, fetchKeys]);

	// The poll's refresh, for the titles it names. Ones no longer on the screen are left out.
	const refresh = useCallback((only) => {
		const current = new Set(keys ? keys.split(',') : []);
		fetchKeys((only || []).filter((key) => current.has(key)));
	}, [keys, fetchKeys]);

	return {answers, refresh};
};

export default useRequestArrQueues;
