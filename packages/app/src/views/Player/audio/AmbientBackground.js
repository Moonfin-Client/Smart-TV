import {useState, useEffect, useMemo} from 'react';
import {getAmbientPalette, accentPalette} from '../../../utils/ambientPalette';

import css from './AmbientBackground.module.less';

// Three slow drifting colour blobs pulled from the artwork, over a scrim that
// keeps the player readable. Deliberately gradients rather than a blur, since a
// large blurred surface is far more than these TV GPUs want to redraw.
const readThemeAccent = () => {
	if (typeof window === 'undefined') return '';
	return window.getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim();
};

const AmbientBackground = ({artworkUrl, children}) => {
	const accentColor = useMemo(() => readThemeAccent() || '#00a4dc', []);
	const [palette, setPalette] = useState(() => accentPalette(accentColor));

	useEffect(() => {
		let cancelled = false;
		getAmbientPalette(artworkUrl, accentColor).then((next) => {
			if (!cancelled) setPalette(next);
		});
		return () => { cancelled = true; };
	}, [artworkUrl, accentColor]);

	// The colours are the only per track part, so they ride in as custom
	// properties and the geometry stays in the stylesheet.
	const paletteVars = useMemo(() => {
		const vars = {};
		palette.forEach((c, i) => { vars[`--ambient-c${i}`] = `${c.r}, ${c.g}, ${c.b}`; });
		return vars;
	}, [palette]);

	return (
		<div className={css.ambient} style={paletteVars}>
			<div className={`${css.blob} ${css.blob0}`} />
			<div className={`${css.blob} ${css.blob1}`} />
			<div className={`${css.blob} ${css.blob2}`} />
			<div className={css.scrim} />
			<div className={css.content}>{children}</div>
		</div>
	);
};

export default AmbientBackground;
