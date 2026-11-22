import {useEffect, useRef} from 'react';

export const FADE_MS = 1000;

// What the viewer steps through: the photos and videos of the folder, or just the opened item.
export const viewerItems = (items, item) => {
	if (items && items.length > 0) {
		return items.filter(i => i.Type === 'Photo' || i.Type === 'Video');
	}
	return item ? [item] : [];
};

// A video only plays in a slideshow when videos are on, otherwise it counts as a still.
export const isSlideshowVideo = (entry, videos) => Boolean(entry) && entry.Type === 'Video' && videos !== false;

// A slideshow needs somewhere to go, so a folder with a lone photo has none.
export const canStartSlideshow = (list, index, videos) => {
	const current = list[index];
	if (!current || current.Type !== 'Photo') return false;
	return list.filter(entry => entry.Type === 'Photo' || isSlideshowVideo(entry, videos)).length > 1;
};

// The index one step on, wrapping. Auto advance passes `skipVideos` to pass over videos that are
// switched off. It can't loop forever, since the slideshow starts on a photo, and one that comes
// round to its start returns the index it was given.
export const stepIndex = (list, index, dir, {skipVideos = false} = {}) => {
	const count = list.length;
	if (count === 0) return -1;
	let next = index;
	for (let i = 0; i < count; i += 1) {
		next = (next + dir + count) % count;
		if (!skipVideos || list[next].Type !== 'Video') return next;
	}
	return index;
};

// Runs a photo's countdown: a single timeout started only once the photo has loaded (or failed) and
// faded in, and dropped whenever the photo changes, the slideshow stops or the viewer unmounts.
const usePhotoSlideshow = ({active, itemId, settled, fadeMs = FADE_MS, intervalMs, onAdvance}) => {
	const advanceRef = useRef(onAdvance);
	advanceRef.current = onAdvance;

	useEffect(() => {
		if (!active || !settled) return undefined;
		let advanceTimer = null;
		const fadeTimer = setTimeout(() => {
			advanceTimer = setTimeout(() => advanceRef.current && advanceRef.current(), intervalMs);
		}, fadeMs);
		return () => {
			clearTimeout(fadeTimer);
			clearTimeout(advanceTimer);
		};
	}, [active, itemId, settled, fadeMs, intervalMs]);
};

export default usePhotoSlideshow;
