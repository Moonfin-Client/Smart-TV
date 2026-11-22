import {useCallback, useEffect, useRef, useState} from 'react';

// Art that has been decoded once shows straight away after that, so a card that remounts, or
// swaps to art fetched ahead of it, doesn't blink.
const DECODED_MEMORY = 600;
const decoded = new Set();

export const markDecoded = (url) => {
	if (!url) return;
	decoded.delete(url);
	decoded.add(url);
	if (decoded.size > DECODED_MEMORY) decoded.delete(decoded.values().next().value);
};

export const isDecoded = (url) => decoded.has(url);

/**
 * Keeps a card's image out of sight from the moment its art arrives until it has been decoded, and only
 * then shows it. A TV decodes art it hasn't decoded yet on the main thread the first time it
 * draws it, which stalls whatever is moving on screen, and art kept out of sight isn't drawn.
 * `img.decode()` does the work off that thread where the engine has it, and older engines show the
 * art once it has loaded, as before. Spread `bind` onto the img.
 */
const useImageReveal = (url) => {
	const imgRef = useRef(null);
	const [readyUrl, setReadyUrl] = useState(null);

	const reveal = useCallback((img) => {
		const loaded = img.currentSrc || img.src;
		const show = () => {
			// The image moved on to other art while this one was decoding.
			if ((img.currentSrc || img.src) !== loaded) return;
			markDecoded(url);
			setReadyUrl(url);
		};
		if (!loaded || !img.decode) {
			show();
			return;
		}
		img.decode().then(show, show);
	}, [url]);

	// Art already in the cache can finish loading before the handler is attached.
	useEffect(() => {
		const img = imgRef.current;
		if (url && img && img.complete && img.naturalWidth > 0 && !decoded.has(url)) reveal(img);
	}, [url, reveal]);

	const onLoad = useCallback((e) => reveal(e.currentTarget), [reveal]);

	const shown = !url || readyUrl === url || decoded.has(url);
	return {shown, bind: {ref: imgRef, onLoad}};
};

// The style that keeps art out of sight until it's shown. The picture is placed far outside its
// box rather than the element hidden, since the card's frame and focus border are drawn on the
// image element and have to stay. Art drawn wholly outside its box is never rasterised, so it
// isn't decoded on the main thread either.
export const pendingArtStyle = {objectPosition: '-10000px 0'};

export default useImageReveal;
