import {useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import {useSettings} from '../../context/SettingsContext';
import NextUpOverlay from '../../views/Player/NextUpOverlay';
import SkipSegmentOverlay from '../../views/Player/SkipSegmentOverlay';
import {skipPromptKinds} from '../../views/Player/skipOverlayLook';

import css from './SkipSegmentPreview.module.less';

// The prompt is written in the pixels of a 1920x1080 screen. The preview lays it out on a
// canvas that size and shrinks the whole thing to fit, so where it lands and how big it is
// match what the video will show.
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const FALLBACK_SCALE = 0.375;
const CYCLE_MS = 2600;

const SAMPLE_REMAINING = 24;
const SAMPLE_PROGRESS = 0.65;
const SAMPLE_TIMEOUT = 7;
const SAMPLE_COUNTDOWN = 5;

// A plain still for the next episode card to show, since the preview has no artwork of its own.
const SAMPLE_STILL = 'data:image/svg+xml;utf8,' + encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='400' height='225'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#2b3a55'/><stop offset='1' stop-color='#111826'/></linearGradient></defs><rect width='400' height='225' fill='url(#g)'/></svg>"
);

const SEGMENT_NAMES = {intro: 'Intro', recap: 'Recap', outro: 'Outro', preview: 'Preview', commercial: 'Commercial'};

const SkipSegmentPreview = () => {
	const {settings} = useSettings();
	const stageRef = useRef(null);
	const [scale, setScale] = useState(FALLBACK_SCALE);
	const [step, setStep] = useState(0);
	// Only the prompts the intro, credits and next episode settings can actually raise.
	const prompts = skipPromptKinds(settings);
	const prompt = prompts[step % prompts.length];

	useEffect(() => {
		const measure = () => {
			if (stageRef.current && stageRef.current.clientWidth > 0) {
				setScale(stageRef.current.clientWidth / CANVAS_WIDTH);
			}
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => setStep((current) => current + 1), CYCLE_MS);
		return () => clearInterval(timer);
	}, []);

	const transform = `scale(${scale})`;
	const countdownStyle = settings.nextUpCountdownStyle ?? 'both';
	const promptName = prompt.kind === 'nextUp' ? $L('Up Next') : $L(SEGMENT_NAMES[prompt.type]);

	return (
		<div className={css.preview}>
			<div className={css.stage} ref={stageRef} style={{height: `${Math.round(CANVAS_HEIGHT * scale)}px`}}>
				<div
					className={css.canvas}
					style={{width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, transform, WebkitTransform: transform}}
				>
					{prompt.kind === 'nextUp' ? (
						<NextUpOverlay
							preview
							minimal={settings.nextUpBehavior === 'minimal'}
							episode={{Name: `${$L('Episode')} 2`, ParentIndexNumber: 1, IndexNumber: 2}}
							imageUrl={SAMPLE_STILL}
							countdown={SAMPLE_COUNTDOWN}
							timeout={SAMPLE_TIMEOUT}
							countdownStyle={countdownStyle}
						/>
					) : (
						<SkipSegmentOverlay
							preview
							type={prompt.type}
							remainingSeconds={SAMPLE_REMAINING}
							progress={SAMPLE_PROGRESS}
							countdownStyle={countdownStyle}
						/>
					)}
				</div>
				<div className={css.badge}>
					<div className={css.badgeDot} />
					<div className={css.badgeLabel}>{`${$L('Preview').toUpperCase()} · ${promptName.toUpperCase()}`}</div>
				</div>
			</div>
		</div>
	);
};

export default SkipSegmentPreview;
