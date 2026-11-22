// The arr's queue for the HD track of the title on screen, through Moonbase, or null when there is
// nothing to ask or the plugin can't see the arr. It asks again each time the details change,
// which the page's status poll and every action's reload already do, so the two never drift.

import {useCallback, useEffect, useRef, useState} from 'react';

import seerrApi from '../../services/seerrApi';
import {arrQueueTarget, wantsArrQueue} from '../../utils/seerrArrQueue';

const useArrQueue = ({enabled, mediaType, details}) => {
	const media = details?.mediaInfo;
	// Seerr can leave the media info's TVDB id empty, and the series' external ids carry it then.
	const tvdbId = media?.tvdbId ?? details?.externalIds?.tvdbId;
	const target = enabled && wantsArrQueue(media) ? arrQueueTarget(mediaType, {...media, tvdbId}) : null;
	const key = target ? `${target.service}:${target.id}` : null;
	// The answer is kept with the title it is for, so moving to another title never shows the
	// last one's queue while the new one loads.
	const [answer, setAnswer] = useState({key: null, response: null});
	// Bumped by a removal, to ask the queue again even when the details reload fails.
	const [asks, setAsks] = useState(0);
	const currentKey = useRef(key);
	currentKey.current = key;
	// Each call is numbered. An answer counts only when it set off after the one on screen and
	// after the last removal, so an older call that comes back late can't replace a newer
	// answer or bring a removed download and its button back. A refresh of the same title
	// doesn't cancel the one before it, so an arr slower than the page's poll still gets its
	// answer shown.
	const lastCall = useRef(0);
	const floor = useRef(0);

	useEffect(() => {
		if (!key) return;
		lastCall.current += 1;
		const call = lastCall.current;
		const [service, id] = key.split(':');
		seerrApi.getArrQueue(service, id)
			.catch(() => null)
			.then((response) => {
				if (currentKey.current !== key || call <= floor.current) return;
				floor.current = call;
				setAnswer({key, response});
			});
	}, [key, details, asks]);

	const invalidate = useCallback(() => {
		floor.current = lastCall.current;
		setAnswer({key: null, response: null});
		setAsks((n) => n + 1);
	}, []);

	return {response: answer.key === key ? answer.response : null, invalidate};
};

export default useArrQueue;
