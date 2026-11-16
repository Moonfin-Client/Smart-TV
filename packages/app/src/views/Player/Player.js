import {getPlatform} from '../../platform';
import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import {isBlocked, isBlockedNow} from '../../services/blockedContentGate';
import LoadingAnimationLayer from '../../components/LoadingAnimation';

const PlatformPlayer = lazy(() =>
	getPlatform() === 'tizen'
		? import('./TizenPlayer')
		: import('./WebOSPlayer')
);

const WAITING_STYLE = {position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#000'};

// Blocked ratings are refused here rather than in each player, since every way of starting
// playback, SyncPlay and the next episode included, ends up handing this an item.
const strain = (queue) => (Array.isArray(queue) ? queue.filter((entry) => !isBlockedNow(entry)) : queue);

const Player = ({item, videoQueue, audioPlaylist, ...rest}) => {
	const {onEnded} = rest;
	// A new item waits here until it's checked, so a refusal never gets a frame on screen.
	const [clearedItem, setClearedItem] = useState(null);
	// The resume point, tracks and queue change along with the item, so the item on screen keeps
	// its own props while the next one is checked rather than reloading with the next one's.
	const shownRef = useRef(null);
	// The item asked for, which can be ahead of the one on screen while it's checked.
	const askedRef = useRef(item);
	askedRef.current = item;
	const askedItemId = useCallback(() => askedRef.current?.Id, []);

	useEffect(() => {
		if (!item) return undefined;
		let cancelled = false;
		// Ending before anything starts closes the player, which is the whole refusal.
		if (isBlockedNow(item)) {
			onEnded?.();
			return undefined;
		}
		isBlocked(item).then((blocked) => {
			if (cancelled) return;
			if (blocked) {
				onEnded?.();
			} else {
				setClearedItem(item);
			}
		});
		return () => { cancelled = true; };
	}, [item]); // eslint-disable-line react-hooks/exhaustive-deps

	const strainedVideoQueue = useMemo(() => strain(videoQueue), [videoQueue]);
	const strainedAudioPlaylist = useMemo(() => strain(audioPlaylist), [audioPlaylist]);

	if (item && item === clearedItem) {
		shownRef.current = {...rest, item, videoQueue: strainedVideoQueue, audioPlaylist: strainedAudioPlaylist, askedItemId};
	}

	const waiting = (
		<div style={WAITING_STYLE}>
			<LoadingAnimationLayer dimmed label={$L('Loading Stream...')} />
		</div>
	);

	if (!shownRef.current) return waiting;

	return (
		<Suspense fallback={waiting}>
			<PlatformPlayer {...shownRef.current} />
		</Suspense>
	);
};

export default Player;
