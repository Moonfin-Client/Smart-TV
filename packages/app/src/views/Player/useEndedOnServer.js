import {useCallback, useEffect, useRef} from 'react';

import * as playback from '../../services/playback';

/**
 * An admin ended the playing item's Silo session from the dashboard (`playback.onEndedOnServer`). `stop()` ends
 * playback here: the player's own teardown, which reports the stop and cancels Next Up. Then, unless the viewer moved
 * on to another item meanwhile, `close()` leaves the player, and `onEndedOnServer()` says why when it did (it answers
 * false when Back already closed it). Once per end. The item stays held from playing again until the player closes.
 *
 * `askedItemId()` is the item App asked for, which can be ahead of `itemId` while Player checks it.
 */
const useEndedOnServer = ({itemId, askedItemId, stop, close, onEndedOnServer}) => {
	const itemRef = useRef(itemId);
	itemRef.current = itemId;
	const handlersRef = useRef(null);
	handlersRef.current = {askedItemId, stop, close, onEndedOnServer};
	const mountedRef = useRef(true);
	// The item whose end is being handled. Another item clears it, so a later end of the same title is heard again.
	const endingRef = useRef(null);
	if (endingRef.current != null && endingRef.current !== itemId) endingRef.current = null;

	const playing = (id) => mountedRef.current && itemRef.current === id && (handlersRef.current.askedItemId?.() ?? id) === id;

	const endedOnServer = useCallback(async (endedId) => {
		if (endedId == null || !playing(endedId) || endingRef.current === endedId) return;
		endingRef.current = endedId;
		try {
			await handlersRef.current.stop();
		} catch (err) {
			console.warn('[Player] Stopping after Silo ended the session failed:', err?.message || err);
		}
		// A Next or another title picked while it stopped plays on; the same title again closes like the rest.
		if (!playing(endedId)) return;
		if (handlersRef.current.close() !== false) handlersRef.current.onEndedOnServer?.();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => playback.onEndedOnServer(endedOnServer), [endedOnServer]);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			playback.releaseEndedOnServer();
		};
	}, []);
};

export default useEndedOnServer;
