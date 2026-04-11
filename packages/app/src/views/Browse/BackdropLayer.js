import {useEffect, useRef, memo} from 'react';
import css from './Browse.module.less';

const BACKDROP_DEBOUNCE_MS = 500;

const BackdropLayer = memo(({targetUrl, blurAmount}) => {
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

	const blurFilter = blurAmount > 0 ? `blur(${blurAmount}px)` : 'none';

	return (
		<div className={css.globalBackdrop}>
			<div
				ref={layerARef}
				className={css.globalBackdropImage}
				style={{WebkitFilter: blurFilter, filter: blurFilter}}
			/>
			<div
				ref={layerBRef}
				className={css.globalBackdropImage}
				style={{WebkitFilter: blurFilter, filter: blurFilter}}
			/>
			<div className={css.globalBackdropOverlay} />
		</div>
	);
});

export default BackdropLayer;
