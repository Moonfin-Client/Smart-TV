import css from './Screensaver.module.less';

const PALETTE_CLASS = {
	moonfin: css.gradientMoonfin,
	calm: css.gradientCalm,
	neonPulse: css.gradientNeonPulse,
	aurora: css.gradientAurora
};

export const isGradientBackdrop = (backdrop) => Boolean(PALETTE_CLASS[backdrop]);

const ScreensaverGradient = ({backdrop}) => {
	const palette = PALETTE_CLASS[backdrop];
	if (!palette) return null;

	return (
		<div className={css.gradient + ' ' + palette}>
			<div className={css.gradientOrbit}>
				{backdrop === 'neonPulse' ? <div className={css.gradientFlash} /> : null}
			</div>
			<div className={css.gradientAccent}>
				<div className={css.gradientAccentInner} />
			</div>
		</div>
	);
};

export default ScreensaverGradient;
