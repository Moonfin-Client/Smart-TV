import {useCallback, useMemo} from 'react';
import * as playback from '../../../services/playback';
import useAudioQueue from './useAudioQueue';
import {focusAudioRow} from './audioFocus';

// The transport both players share. Everything platform specific arrives as a
// callback, so this knows how to walk the queue without knowing whether the
// track is playing through a video element or the AVPlay layer.
//
// restartCurrent is separate from seekTo because repeat one has to start the
// track playing again after it ended, while stepping back from the first few
// seconds of a track should leave it exactly as it was.
const useAudioTransport = ({
	item,
	audioPlaylist,
	isAudioMode,
	onPlayNext,
	positionRef,
	restartCurrent,
	seekTo,
	getPositionSeconds,
	setFocusRow
}) => {
	const queue = useAudioQueue(audioPlaylist, item?.Id);

	const audioPlaylistIndex = useMemo(() => {
		if (!audioPlaylist || !item) return -1;
		return audioPlaylist.findIndex((t) => t.Id === item.Id);
	}, [audioPlaylist, item]);

	// Video keeps its plain playlist stepping, so only audio walks the queue.
	const playlistHasNext = Boolean(audioPlaylist) && audioPlaylistIndex >= 0 && audioPlaylistIndex < audioPlaylist.length - 1;
	const playlistHasPrev = Boolean(audioPlaylist) && audioPlaylistIndex > 0;

	const playQueueTrack = useCallback(async (track) => {
		if (!track || !onPlayNext) return;
		await playback.reportStop(positionRef.current);
		onPlayNext(track);
	}, [onPlayNext, positionRef]);

	const handleNextTrack = useCallback(async () => {
		if (!audioPlaylist || !onPlayNext) return;
		if (!isAudioMode) {
			if (playlistHasNext) await playQueueTrack(audioPlaylist[audioPlaylistIndex + 1]);
			return;
		}
		const step = queue.getNext();
		if (!step) return;
		if (step.type === 'restart') restartCurrent();
		else await playQueueTrack(step.track);
	}, [audioPlaylist, onPlayNext, isAudioMode, playlistHasNext, audioPlaylistIndex, queue, playQueueTrack, restartCurrent]);

	const handlePrevTrack = useCallback(async () => {
		if (!audioPlaylist || !onPlayNext) return;
		if (!isAudioMode) {
			if (playlistHasPrev) await playQueueTrack(audioPlaylist[audioPlaylistIndex - 1]);
			return;
		}
		const step = queue.getPrev(getPositionSeconds());
		if (!step) return;
		if (step.type === 'restart') seekTo(0);
		else await playQueueTrack(step.track);
	}, [audioPlaylist, onPlayNext, isAudioMode, playlistHasPrev, audioPlaylistIndex, queue, playQueueTrack, getPositionSeconds, seekTo]);

	const handleSelectQueueTrack = useCallback((track) => {
		if (track?.Id === item?.Id) return;
		playQueueTrack(track);
	}, [playQueueTrack, item]);

	const handleEnterAudioPanel = useCallback(() => {
		setFocusRow('panel');
		focusAudioRow('panel');
	}, [setFocusRow]);

	return {
		shuffleMode: queue.shuffleMode,
		repeatMode: queue.repeatMode,
		hasNextTrack: isAudioMode ? queue.hasNext : playlistHasNext,
		hasPrevTrack: isAudioMode ? queue.hasPrev : playlistHasPrev,
		handleToggleShuffle: queue.toggleShuffle,
		handleToggleRepeat: queue.cycleRepeat,
		// A track running out has to walk the same order the skip button does,
		// but the players tear the media down first so they advance themselves.
		getNextStep: queue.getNext,
		handleNextTrack,
		handlePrevTrack,
		handleSelectQueueTrack,
		handleSeekToLyric: seekTo,
		handleEnterAudioPanel
	};
};

export default useAudioTransport;
