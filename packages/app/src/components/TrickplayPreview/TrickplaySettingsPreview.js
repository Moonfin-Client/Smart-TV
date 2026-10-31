import {useCallback, useState, useLayoutEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';

import {useSettings} from '../../context/SettingsContext';
import {VERTICAL_TRAVEL_TOP_MARGIN, planTrickplayPreview, trackXForPosition} from '../../utils/trickplayLayout';
import {coverSize} from './TrickplayPreview';

import css from './TrickplaySettingsPreview.module.less';

const SpottableDiv = Spottable('div');

const FAKE_DURATION_MS = 3600000;
const SLIDER_INSET = 8;
// What the player's bar and its row of buttons take under the preview, scaled to the frame
const PLAYER_SLIDER_HEIGHT = 28;
const PLAYER_CONTROLS_ROW = 48;
const PLAYER_WIDTH = 1920;
const TILE_SPACING = 4;
const SHOT_LENGTH = 3;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;

const pseudoRandom = (seed) => {
	let x = seed | 0;
	x = Math.imul((x >>> 16) ^ x, 0x45d9f3b);
	x = Math.imul((x >>> 16) ^ x, 0x45d9f3b);
	x = (x >>> 16) ^ x;
	return (x & 0xFFFFFF) / 0xFFFFFF;
};

// A stand in for a thumbnail: the logo drifting about the frame, settling somewhere new
// every few steps the way a cut would, with the step's number in the corner.
const FakeTile = ({index, width, height, large = false}) => {
	const shot = Math.floor(index / SHOT_LENGTH);
	const wiggle = 0.08;
	const clamp = (value) => Math.min(1, Math.max(-1, value));
	const bounceX = clamp((pseudoRandom(shot * 2 + 1) * 2 - 1) + Math.sin(index * 2.7) * wiggle);
	const bounceY = clamp((pseudoRandom(shot * 2 + 2) * 2 - 1) + Math.sin(index * 3.3 + 1.5) * wiggle);
	const logoSize = Math.min(width, height) * (large ? 0.6 : 0.7);
	return (
		<div className={css.fakeTile} style={{width, height}}>
			<img
				src="resources/banner-dark.png"
				alt=""
				className={css.fakeLogo}
				style={{width: logoSize, height: logoSize, left: ((1 + bounceX) / 2) * (width - logoSize), top: ((1 + bounceY) / 2) * (height - logoSize)}}
			/>
			<span className={`${css.fakeIndex} ${large ? css.fakeIndexLarge : ''}`}>{index}</span>
		</div>
	);
};

// The scrub thumbnails at [progress] along a seek bar that starts [trackLeft] into a picture
// [frameWidth] by [frameHeight], runs [trackWidth], and has its top [floor] up from the bottom.
// [scale] is the share of the TV's size the picture is drawn at. Full Screen covers the picture.
export const ScrubThumbnails = ({frameWidth, frameHeight, trackLeft, trackWidth, floor, scale, progress}) => {
	const {settings} = useSettings();
	const mode = settings.trickPlayMode;
	if (mode === 'disabled' || !frameWidth) return null;
	const positionMs = progress * FAKE_DURATION_MS;
	const stepMs = Math.max(1, (settings.seekStep || 10) * 1000);
	const stepIndex = (ms) => Math.round(ms / stepMs);

	if (mode === 'full') {
		const cover = coverSize({width: 16, height: 9}, frameWidth, frameHeight, settings.playerZoomMode);
		return (
			<div className={css.frameCover}>
				<FakeTile index={stepIndex(positionMs)} width={cover.width} height={cover.height} large />
			</div>
		);
	}

	const plan = planTrickplayPreview({
		trackWidth,
		scalePercent: settings.trickPlayPreviewScale,
		aspect: 9 / 16,
		maxHeightBudget: Math.max(frameHeight - floor - VERTICAL_TRAVEL_TOP_MARGIN * scale, 32),
		positionMs,
		durationMs: FAKE_DURATION_MS,
		followScrub: settings.trickPlayFollowScrub,
		verticalPositionPercent: settings.trickPlayVerticalPosition,
		isStrip: mode === 'strip',
		spacing: TILE_SPACING,
		overflowMargin: SLIDER_INSET,
		stepMs
	});
	return (
		<div className={css.strip} style={{left: trackLeft + plan.leftOffset, bottom: floor + plan.verticalTravel}}>
			{plan.slots.map((slot, i) => (
				<div
					key={slot.slotIndex}
					className={`${css.tile} ${slot.slotIndex === 0 ? css.tileActive : ''} ${slot.targetMs === null ? css.tileEmpty : ''}`}
					style={{width: plan.tileWidth, height: plan.tileHeight, marginLeft: i > 0 ? TILE_SPACING : 0}}
				>
					{slot.targetMs !== null && <FakeTile index={stepIndex(slot.targetMs)} width={plan.tileWidth} height={plan.tileHeight} />}
				</div>
			))}
		</div>
	);
};

// The scrub preview as the player would show it, in a small picture in settings, so a change
// to its size, distance or style can be judged without starting playback to find out. Left and
// right move the fake scrub.
const TrickplaySettingsPreview = () => {
	const {settings} = useSettings();
	const [positionMs, setPositionMs] = useState(FAKE_DURATION_MS / 2);
	const [frameWidth, setFrameWidth] = useState(0);
	const frameRef = useRef(null);

	// The panel may still be sliding in when this mounts, so a frame with no width yet is
	// measured again a moment later.
	useLayoutEffect(() => {
		let timer;
		const measure = () => {
			const width = frameRef.current?.clientWidth || 0;
			if (width) setFrameWidth(width);
			else timer = setTimeout(measure, 100);
		};
		measure();
		window.addEventListener('resize', measure);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('resize', measure);
		};
	}, []);

	const stepMs = Math.max(1, (settings.seekStep || 10) * 1000);

	const onKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		if (code !== KEY_LEFT && code !== KEY_RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		setPositionMs((current) => Math.min(FAKE_DURATION_MS, Math.max(0, current + (code === KEY_LEFT ? -stepMs : stepMs))));
	}, [stepMs]);

	if (settings.trickPlayMode === 'disabled') return null;

	const frameHeight = frameWidth * (9 / 16);
	const trackWidth = Math.max(frameWidth - SLIDER_INSET * 2, 0);
	const previewScale = Math.min(1, Math.max(0.2, trackWidth / PLAYER_WIDTH));
	const controlsGap = TILE_SPACING * previewScale;
	const floorReserved = PLAYER_SLIDER_HEIGHT + controlsGap + PLAYER_CONTROLS_ROW * previewScale;
	const thumbX = trackXForPosition({positionMs, durationMs: FAKE_DURATION_MS, trackWidth});

	return (
		<div className={css.preview}>
			<SpottableDiv className={css.frame} style={{height: frameHeight}} onKeyDown={onKeyDown} spotlightDisabled={!frameWidth}>
				<div className={css.frameBackdrop} ref={frameRef}>
					<svg viewBox="0 -960 960 960" className={css.playIcon}><path d="M320-200v-560l440 280-440 280Z" /></svg>
				</div>
				<ScrubThumbnails
					frameWidth={frameWidth}
					frameHeight={frameHeight}
					trackLeft={SLIDER_INSET}
					trackWidth={trackWidth}
					floor={floorReserved}
					scale={previewScale}
					progress={positionMs / FAKE_DURATION_MS}
				/>
				<div className={css.bar} style={{left: SLIDER_INSET, right: SLIDER_INSET, bottom: floorReserved - PLAYER_SLIDER_HEIGHT / 2}}>
					<div className={css.barFill} style={{width: thumbX}} />
					<div className={css.barThumb} style={{left: thumbX}} />
				</div>
			</SpottableDiv>
			<div className={css.hint}>{$L('Press left and right to preview scrubbing')}</div>
		</div>
	);
};

export default TrickplaySettingsPreview;
