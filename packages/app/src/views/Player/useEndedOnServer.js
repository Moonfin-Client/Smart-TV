import {useCallback, useEffect, useRef} from 'react';

import * as playback from '../../services/playback';

/**
 * An admin ended the playing item's Silo session from the dashboard (`playback.onEndedOnServer`). `stop()` ends
 * playback here: the player's own teardown, which reports the stop and cancels Next Up. Then, unless the viewer moved
 * on to another item meanwhile, `close()` leaves the player and `onEndedOnServer()` says why, once per end. The item
 * stays held from playing again until the player closes.
 *
 * Returns `endedOnServer(itemId)`, for a load or fallback whose request heard the end itself.
 */
const useEndedOnServer = ({itemId, stop, close, onEndedOnServer}) => {
	const itemRef = useRef(itemId);
	itemRef.current = itemId;
	const handlersRef = useRef(null);
	handlersRef.current = {stop, close, onEndedOnServer};
	// The item whose end is being handled. Another item clears it, so a later end of the same title is heard again.
	const endingRef = useRef(null);
	if (endingRef.current != null && endingRef.current !== itemId) endingRef.current = null;

	const endedOnServer = useCallback(async (endedId) => {
		if (endedId == null || endedId !== itemRef.current || endingRef.current === endedId) return;
		endingRef.current = endedId;
		try {
			await handlersRef.current.stop();
		} catch (err) {
			console.warn('[Player] Stopping after Silo ended the session failed:', err?.message || err);
		}
		// A Next or another title picked while it stopped plays on; the same title again closes like the rest.
		if (itemRef.current !== endedId) return;
		handlersRef.current.onEndedOnServer?.();
		handlersRef.current.close?.();
	}, []);

	useEffect(() => playback.onEndedOnServer(endedOnServer), [endedOnServer]);
	useEffect(() => () => playback.releaseEndedOnServer(), []);

	return endedOnServer;
};

export default useEndedOnServer;
