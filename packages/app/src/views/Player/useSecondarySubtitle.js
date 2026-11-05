import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as playback from '../../services/playback';
import {getItemSecondarySubtitlePref, saveSecondarySubtitlePref} from '../../services/subtitlePrefs';
import {
	clampSecondaryDelay, isSecondaryEligible, restoreSecondaryIndex, secondaryCandidates, secondaryCueText, secondarySelection
} from './secondarySubtitle';
import useSubtitleFetch from './useSubtitleFetch';

/**
 * The second subtitle track, shared by both players. A pick is remembered per item, a new
 * item starts with none and no delay, and a fresh resolve of the same item keeps both.
 */
const useSecondarySubtitle = ({subtitleStreams, primaryIndex, preferExternal, preferredLanguage, available, enabled}) => {
	const [index, setIndex] = useState(null);
	const [events, setEvents] = useState(null);
	const [delay, setDelayState] = useState(0);
	const [text, setText] = useState(null);
	const indexRef = useRef(null);
	const eventsRef = useRef(null);
	const delayRef = useRef(0);
	const itemIdRef = useRef(null);
	// Bumped by every pick, item and unmount, so a track that lands late is dropped.
	const generationRef = useRef(0);
	const {loading, track: trackFetch, clear: clearFetch} = useSubtitleFetch();

	useEffect(() => () => { generationRef.current++; }, []);

	const streams = useMemo(
		() => secondaryCandidates(subtitleStreams, primaryIndex, {preferExternal, preferredLanguage}),
		[subtitleStreams, primaryIndex, preferExternal, preferredLanguage]
	);
	// The Subtitles button asks which slot first only while the setting is on and there's something
	// for the second one. A track that's already showing keeps the step so it can still be turned off.
	const offered = available && (index != null || (enabled && streams.length > 0));

	const clearTrack = useCallback(() => {
		generationRef.current++;
		clearFetch();
		indexRef.current = null;
		eventsRef.current = null;
		setIndex(null);
		setEvents(null);
		setText(null);
	}, [clearFetch]);

	// Nothing waits on the fetch. The server may still be pulling the track out of the
	// file, and the lines fill in once it answers.
	const loadTrack = useCallback((stream) => {
		const generation = ++generationRef.current;
		indexRef.current = stream.index;
		eventsRef.current = null;
		setIndex(stream.index);
		setEvents(null);
		setText(null);
		trackFetch(playback.fetchSubtitleData(stream)).then((data) => {
			if (generation !== generationRef.current) return;
			eventsRef.current = data?.TrackEvents || null;
			setEvents(eventsRef.current);
		});
	}, [trackFetch]);

	const select = useCallback((item, streamList, nextIndex) => {
		const stream = nextIndex >= 0 ? streamList.find((s) => s.index === nextIndex) : null;
		if (stream && isSecondaryEligible(stream)) loadTrack(stream);
		else clearTrack();
		saveSecondarySubtitlePref(item, secondarySelection(streamList, stream ? stream.index : -1));
	}, [clearTrack, loadTrack]);

	const prepareForItem = useCallback((itemId) => {
		if (itemIdRef.current === itemId) return;
		itemIdRef.current = itemId;
		clearTrack();
		delayRef.current = 0;
		setDelayState(0);
	}, [clearTrack]);

	// Puts back the track remembered for this item, unless it's now the primary.
	const restore = useCallback(async (item, streamList, primary) => {
		if (!enabled) return;
		const saved = await getItemSecondarySubtitlePref(item.Id);
		if (itemIdRef.current !== item.Id) return;
		const restored = restoreSecondaryIndex(saved, streamList);
		const stream = restored >= 0 && restored !== primary ? streamList.find((s) => s.index === restored) : null;
		if (stream) loadTrack(stream);
		else clearTrack();
	}, [enabled, clearTrack, loadTrack]);

	// Picking the second track's file as the primary takes it over.
	const releaseIfPrimary = useCallback((item, streamList, primary) => {
		if (primary >= 0 && primary === indexRef.current) select(item, streamList, -1);
	}, [select]);

	const update = useCallback((ticks) => {
		if (!eventsRef.current) return;
		setText(secondaryCueText(eventsRef.current, ticks, delayRef.current));
	}, []);

	const setDelay = useCallback((seconds) => {
		const value = clampSecondaryDelay(seconds);
		delayRef.current = value;
		setDelayState(value);
	}, []);

	return {
		index, events, delay, text, streams, offered, loading, loaded: events != null,
		select, prepareForItem, restore, releaseIfPrimary, update, setDelay
	};
};

export default useSecondarySubtitle;
