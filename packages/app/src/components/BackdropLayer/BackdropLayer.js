import {useEffect, useRef, memo} from 'react';
import {getPerfTier} from '../../utils/perfTier';
import {whenStill} from '../../utils/focusScroll';
import {serverBlurredUrl} from '../../utils/serverBlur';

import css from './BackdropLayer.module.less';

const BACKDROP_DEBOUNCE_MS = 500;

const TIER_BLUR_CAPS = {low: 0, mid: 8, high: 20};

const clampBlur = (amount) => {
	const cap = TIER_BLUR_CAPS[getPerfTier()];
	return Math.min(amount || 0, cap);
};

const FADE_CLASS = {corner: css.cornerFadeDown, top: css.topFade};

const BackdropLayer = memo(({targetUrl: requestedUrl, blurAmount, overlayOpacity, placement, fadeMs}) => {
	const blurredUrl = serverBlurredUrl(requestedUrl, blurAmount);
	const targetUrl = blurredUrl || requestedUrl;
	const layerARef = useRef(null);
	const layerBRef = useRef(null);
	const activeLayerRef = useRef('a');
	const currentUrlRef = useRef('');
	const wantedUrlRef = useRef('');
	const timeoutRef = useRef(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	useEffect(() => {
		wantedUrlRef.current = targetUrl || '';
		if (!targetUrl) {
			if (currentUrlRef.current) {
				currentUrlRef.current = '';
				if (layerARef.current) layerARef.current.style.opacity = '0';
				if (layerBRef.current) layerBRef.current.style.opacity = '0';
			}
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
			return;
		}

		if (targetUrl === currentUrlRef.current) return;

		if (timeoutRef.current) clearTimeout(timeoutRef.current);

		timeoutRef.current = setTimeout(() => {
			const img = new window.Image();
			const apply = () => {
				// A picture that took its time to come in is dropped if focus has moved on since.
				if (wantedUrlRef.current !== targetUrl) return;
				const isA = activeLayerRef.current === 'a';
				const incoming = isA ? layerBRef.current : layerARef.current;
				const outgoing = isA ? layerARef.current : layerBRef.current;
				if (!incoming || !outgoing) return;

				incoming.style.transition = 'none';
				incoming.style.opacity = '0';
				incoming.style.backgroundImage = `url(${targetUrl})`;

				incoming.offsetHeight; // eslint-disable-line @babel/no-unused-expressions
				// A screen can ask for its own fade, and the stylesheet's stands otherwise.
				const fade = fadeMs ? `opacity ${fadeMs}ms ease` : '';
				incoming.style.transition = fade;
				outgoing.style.transition = fade;
				incoming.style.opacity = '1';
				outgoing.style.opacity = '0';

				activeLayerRef.current = isA ? 'b' : 'a';
				currentUrlRef.current = targetUrl;
			};
			// Decoded before it goes up, so the frame that shows it doesn't stall on it, and swapped in once the
			// rows have stopped gliding, so the fade and the scroll don't fight over the same frames.
			const settle = () => whenStill(apply);
			img.onload = () => (img.decode ? img.decode().then(settle, settle) : settle());
			img.onerror = settle;
			img.src = targetUrl;
		}, BACKDROP_DEBOUNCE_MS);
	}, [targetUrl, fadeMs]);

	const effectiveBlur = blurredUrl ? 0 : clampBlur(blurAmount);
	const filter = effectiveBlur > 0 ? `blur(${effectiveBlur}px)` : 'none';
	// A server blur darkens the edges like a CSS one, so both keep the oversize that hides them.
	const layerStyle = blurredUrl || effectiveBlur > 0
		? {WebkitFilter: filter, filter}
		: {WebkitFilter: 'none', filter: 'none', top: 0, left: 0, width: '100%', height: '100%'};

	// How much picture shows through is the screen's own call, since a page laying
	// a grid over the whole thing needs more of it covered than one that only
	// wants the colour.
	const overlayStyle = typeof overlayOpacity === 'number' ? {opacity: overlayOpacity} : undefined;

	return (
		<div className={css.globalBackdrop}>
			{/* The frames stay mounted either way, so the layers keep the picture they hold */}
			<div className={placement === 'corner' ? css.cornerFadeLeft : css.fill}>
				<div className={FADE_CLASS[placement] || css.fill}>
					<div
						ref={layerARef}
						className={css.globalBackdropImage}
						style={layerStyle}
					/>
					<div
						ref={layerBRef}
						className={css.globalBackdropImage}
						style={layerStyle}
					/>
				</div>
			</div>
			<div className={css.globalBackdropOverlay} style={overlayStyle} />
		</div>
	);
});

export default BackdropLayer;
