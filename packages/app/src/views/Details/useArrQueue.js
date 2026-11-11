// The arr's queue for the HD track of the title on screen, through Moonbase, or null when there is
// nothing to ask or the plugin can't see the arr. It asks again each time the details change,
// which the page's status poll and every action's reload already do, so the two never drift.

import {useEffect, useRef, useState} from 'react';

import seerrApi from '../../services/seerrApi';
import {arrQueueTarget, wantsArrQueue} from '../../utils/seerrArrQueue';

const useArrQueue = ({enabled, mediaType, details}) => {
	const media = details?.mediaInfo;
	const target = enabled && wantsArrQueue(media) ? arrQueueTarget(mediaType, media) : null;
	const key = target ? `${target.service}:${target.id}` : null;
	// The answer is kept with the title it is for, so moving to another title never shows the
	// last one's queue while the new one loads.
	const [answer, setAnswer] = useState({key: null, response: null});
	// Only another title makes an answer stale. A refresh of the same one doesn't, so an arr
	// slower than the page's poll still gets its answer shown.
	const currentKey = useRef(key);
	currentKey.current = key;

	useEffect(() => {
		if (!key) return;
		const [service, id] = key.split(':');
		seerrApi.getArrQueue(service, id)
			.catch(() => null)
			.then((response) => {
				if (currentKey.current === key) setAnswer({key, response});
			});
	}, [key, details]);

	return answer.key === key ? answer.response : null;
};

export default useArrQueue;
