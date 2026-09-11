import {useEffect, useRef, memo} from 'react';
import {getPerfTier} from '../../utils/perfTier';

import css from './BackdropLayer.module.less';

const BACKDROP_DEBOUNCE_MS = 500;

const TIER_BLUR_CAPS = {low: 0, mid: 8, high: 20};

const clampBlur = (amount) => {
	const cap = TIER_BLUR_CAPS[getPerfTier()];
	return Math.min(amount || 0, cap);
};

const BackdropLayer = memo(({targetUrl, blurAmount, overlayOpacity}) => {
	const layerARef = useRef(null);
	const layerBRef = useRef(null);
	const activeLayerRef = useRef('a');
	const currentUrlRef = useRef('');
	const timeoutRef = useRef(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	useEffect(() => {
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
				const isA = activeLayerRef.current === 'a';
				const incoming = isA ? layerBRef.current : layerARef.current;
				const outgoing = isA ? layerARef.current : layerBRef.current;
				if (!incoming || !outgoing) return;

				incoming.style.transition = 'none';
				incoming.style.opacity = '0';
				incoming.style.backgroundImage = `url(${targetUrl})`;

				incoming.offsetHeight; // eslint-disable-line @babel/no-unused-expressions
				incoming.style.transition = '';
				incoming.style.opacity = '1';
				outgoing.style.opacity = '0';

				activeLayerRef.current = isA ? 'b' : 'a';
				currentUrlRef.current = targetUrl;
			};
			img.onload = apply;
			img.onerror = apply;
			img.src = targetUrl;
		}, BACKDROP_DEBOUNCE_MS);
	}, [targetUrl]);

	const effectiveBlur = clampBlur(blurAmount);
	const layerStyle = effectiveBlur > 0
		? {WebkitFilter: `blur(${effectiveBlur}px)`, filter: `blur(${effectiveBlur}px)`}
		: {WebkitFilter: 'none', filter: 'none', top: 0, left: 0, width: '100%', height: '100%'};

	// How much picture shows through is the screen's own call, since a page laying
	// a grid over the whole thing needs more of it covered than one that only
	// wants the colour.
	const overlayStyle = typeof overlayOpacity === 'number' ? {opacity: overlayOpacity} : undefined;

	return (
		<div className={css.globalBackdrop}>
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
			<div className={css.globalBackdropOverlay} style={overlayStyle} />
		</div>
	);
});

export default BackdropLayer;
