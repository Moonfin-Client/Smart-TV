import {useState, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import {formatClockTime, shiftedNow} from '../../utils/clock';
import ScreensaverGradient, {isGradientBackdrop} from './ScreensaverGradient';
import ScreensaverRunner from './ScreensaverRunner';
import {resolveLayout, startBounce} from './screensaverLayout';
import css from './ScreensaverPreview.module.less';

const STAGE_HEIGHT = 200;
const BOUNCE_MARGIN = 20;
const RUNNER_BASE_SIZE = 40;

const COMPONENT_SIZE = {
	moonfinLogo: {width: 100, height: 44},
	clock: {width: 80, height: 26},
	runner: {width: 44, height: 44}
};

const MOVIE_ICON = 'm140-800 74 152h130l-74-152h89l74 152h130l-74-152h89l74 152h130l-74-152h112q24 0 42 18t18 42v520q0 24-18 42t-42 18H140q-24 0-42-18t-18-42v-520q0-24 18-42t42-18Zm0 212v368h680v-368H140Zm0 0v368-368Z';

const ScreensaverPreview = ({
	backdrop = 'library',
	component = 'moonfinLogo',
	movement = 'moderate',
	position = 'middle',
	size = 'medium',
	dimmingLevel = 50,
	clockDisplay = '24-hour',
	timeOffsetHours = 0
}) => {
	const stageRef = useRef(null);
	const boxRef = useRef(null);
	const boxAnimRef = useRef(null);
	const facingRef = useRef(false);
	const [stageWidth, setStageWidth] = useState(0);
	const [clockText, setClockText] = useState(() => formatClockTime(shiftedNow(timeOffsetHours), clockDisplay));

	const showClock = component === 'clock';
	const {scale, speedMultiplier, bounces, box, boxStyle, anchorClass} = resolveLayout({
		component,
		movement,
		position,
		size,
		sizes: COMPONENT_SIZE
	});

	useEffect(() => {
		if (!stageRef.current) return;
		setStageWidth(stageRef.current.clientWidth);
	}, []);

	useEffect(() => {
		if (!showClock) return;
		const interval = setInterval(() => {
			setClockText(formatClockTime(shiftedNow(timeOffsetHours), clockDisplay));
		}, 1000);
		return () => clearInterval(interval);
	}, [showClock, clockDisplay, timeOffsetHours]);

	useEffect(() => {
		if (!bounces || !box || !stageWidth || !boxRef.current) return;
		return startBounce({
			boxRef,
			animRef: boxAnimRef,
			facingRef,
			bounds: {width: stageWidth, height: STAGE_HEIGHT},
			width: box.width * scale,
			height: box.height * scale,
			speedMultiplier,
			margin: BOUNCE_MARGIN
		});
	}, [bounces, box, scale, speedMultiplier, stageWidth]);

	const dimmingAlpha = Math.max(0, Math.min(100, dimmingLevel)) / 100;

	const renderComponent = () => {
		if (component === 'moonfinLogo') {
			return <img src="resources/banner-dark.png" alt="Moonfin" className={css.componentLogo} />;
		}
		if (component === 'clock') {
			return (
				<div className={css.componentClock} style={{fontSize: Math.round(16 * scale) + 'px'}}>
					{clockText}
				</div>
			);
		}
		if (component === 'runner') {
			return (
				<ScreensaverRunner
					size={Math.round(RUNNER_BASE_SIZE * scale)}
					speedMultiplier={bounces ? speedMultiplier : 1}
					facingRef={facingRef}
				/>
			);
		}
		return null;
	};

	return (
		<div className={css.preview}>
			<div className={css.stage} ref={stageRef}>
				{backdrop === 'library' && (
					<div className={css.libraryBackdrop}>
						<svg className={css.libraryIcon} viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
							<path d={MOVIE_ICON} />
						</svg>
					</div>
				)}

				{isGradientBackdrop(backdrop) && <ScreensaverGradient backdrop={backdrop} />}

				{dimmingLevel > 0 && <div className={css.dimming} style={{opacity: dimmingAlpha}} />}

				{box && (
					<div className={bounces ? css.bounceLayer : css.staticLayer}>
						<div
							ref={bounces ? boxRef : null}
							className={css.componentBox + (bounces ? '' : ' ' + css[anchorClass])}
							style={boxStyle}
						>
							{renderComponent()}
						</div>
					</div>
				)}

				<div className={css.badge}>
					<div className={css.badgeDot} />
					<div className={css.badgeLabel}>{$L('Preview').toUpperCase()}</div>
				</div>
			</div>
		</div>
	);
};

export default ScreensaverPreview;
