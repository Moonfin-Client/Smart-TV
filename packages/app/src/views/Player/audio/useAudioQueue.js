import {useState, useEffect, useMemo, useRef, useCallback} from 'react';

const RESTART_THRESHOLD_SECONDS = 3;

const shuffleIds = (ids) => {
	const out = [...ids];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

// Owns shuffle, repeat and the order the queue is actually walked in. Shuffle
// builds a real order up front rather than picking at random on each skip, so
// every track plays once and Previous goes back to the track you just heard.
const useAudioQueue = (audioPlaylist, currentId) => {
	const [shuffleMode, setShuffleMode] = useState(false);
	const [repeatMode, setRepeatMode] = useState('off');
	const [shuffledOrder, setShuffledOrder] = useState([]);

	const currentIdRef = useRef(currentId);
	useEffect(() => { currentIdRef.current = currentId; }, [currentId]);

	// Keyed on the ids themselves, so a caller handing back an equal but freshly
	// built array doesn't look like a new queue and reshuffle mid playback.
	const playlistKey = (audioPlaylist || []).map((t) => t.Id).join(',');
	const playlistIds = useMemo(() => (playlistKey ? playlistKey.split(',') : []), [playlistKey]);

	// Rebuild only when shuffle flips or the queue itself changes, anchored on the
	// track playing now so Next walks away from it instead of maybe repeating it.
	useEffect(() => {
		if (!shuffleMode) {
			setShuffledOrder([]);
			return;
		}
		const anchor = currentIdRef.current;
		const rest = playlistIds.filter((id) => id !== anchor);
		setShuffledOrder(anchor && playlistIds.includes(anchor) ? [anchor, ...shuffleIds(rest)] : shuffleIds(rest));
	}, [shuffleMode, playlistIds]);

	const sequence = shuffleMode && shuffledOrder.length > 0 ? shuffledOrder : playlistIds;
	const position = sequence.indexOf(currentId);

	const trackById = useCallback(
		(id) => (audioPlaylist || []).find((t) => t.Id === id) || null,
		[audioPlaylist]
	);

	const hasNext = position >= 0 && (position < sequence.length - 1 || (repeatMode !== 'off' && sequence.length > 0));
	const hasPrev = position > 0 || (repeatMode === 'all' && sequence.length > 0);

	// Both return either a track to play or a restart, so the player stays in
	// charge of reporting playback and swapping the item.
	const getNext = useCallback(() => {
		if (repeatMode === 'one') return {type: 'restart'};
		if (position < 0) return null;
		if (position < sequence.length - 1) return {type: 'play', track: trackById(sequence[position + 1])};
		if (repeatMode === 'all' && sequence.length > 0) return {type: 'play', track: trackById(sequence[0])};
		return null;
	}, [repeatMode, position, sequence, trackById]);

	const getPrev = useCallback((positionSeconds) => {
		if (positionSeconds > RESTART_THRESHOLD_SECONDS) return {type: 'restart'};
		if (position < 0) return null;
		if (position > 0) return {type: 'play', track: trackById(sequence[position - 1])};
		if (repeatMode === 'all' && sequence.length > 0) return {type: 'play', track: trackById(sequence[sequence.length - 1])};
		return {type: 'restart'};
	}, [repeatMode, position, sequence, trackById]);

	const toggleShuffle = useCallback(() => setShuffleMode((prev) => !prev), []);
	const cycleRepeat = useCallback(() => setRepeatMode((prev) => {
		if (prev === 'off') return 'all';
		if (prev === 'all') return 'one';
		return 'off';
	}), []);

	return {shuffleMode, repeatMode, toggleShuffle, cycleRepeat, getNext, getPrev, hasNext, hasPrev};
};

export default useAudioQueue;
