/* eslint-disable react/jsx-no-bind */
import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {SettingsOverride, useSettings} from '../../../context/SettingsContext';
import ScreensaverPreview from '../../../components/Screensaver/ScreensaverPreview';
import {KEYS} from '../../../utils/keys';
import {
	DetailStylePreview,
	KeyboardPreview,
	MediaBarPreview,
	PlayerPreview,
	SettingsHomePreview,
	usePreviewPalette
} from '../../SetupWizard/SetupPreviews';
import {getPreviewItems} from '../../SetupWizard/setupPreviewData';
import {FOCUSED_CARD_KEYS, MEDIA_BAR_KEYS, SUBTITLE_HDR_KEYS, sceneOfRow} from './previewRows';

import css from './SettingsLivePreview.module.less';

export const SCENES = ['home', 'details', 'player', 'search'];

export const sceneChipId = (scene) => `preview-scene-${scene}`;

// Down would drop into the settings list, and the layout takes Left off the first chip.
const ChipRow = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	leaveFor: {left: '', right: '', down: ''}
}, 'div');

const Chip = Spottable('div');

// A clipped row doesn't scroll to its focused item on its own, so the item is brought inside
// the [row]'s padding, which holds a focus glow.
export const keepInView = (item, row = item.parentNode) => {
	const pad = parseFloat(window.getComputedStyle(row).paddingRight) || 0;
	const box = row.getBoundingClientRect();
	const rect = item.getBoundingClientRect();
	if (rect.right > box.right - pad) row.scrollLeft += rect.right - (box.right - pad);
	else if (rect.left < box.left + pad) row.scrollLeft -= (box.left + pad) - rect.left;
};

// The inspector keeps the height its text and choices need, and the stage gives up width so
// both stay on screen at every UI scale. Every scene is 16:9, so only the inspector's [row],
// the choice being tried and the UI scale change the fit.
const useStageWidth = (frameRef, row, trying) => {
	const {settings} = useSettings();
	const uiScale = settings.uiScale;
	const [width, setWidth] = useState(null);
	useLayoutEffect(() => {
		const fit = () => {
			const frame = frameRef.current;
			const box = frame && frame.getBoundingClientRect();
			if (!box || !box.height) return;
			const root = frame.parentNode;
			const inspector = frame.nextSibling;
			const below = inspector ? inspector.offsetHeight + (parseFloat(window.getComputedStyle(inspector).marginTop) || 0) : 0;
			const room = root.getBoundingClientRect().bottom - box.top - below;
			const next = Math.max(0, Math.floor(Math.min(root.clientWidth, room * box.width / box.height)));
			// The frame's height rounds a little differently at each width, so a pixel either way
			// is left alone, or the two would keep asking for each other.
			setWidth((prev) => (prev !== null && Math.abs(prev - next) < 2 ? prev : next));
		};
		fit();
		// A new UI scale reaches the root font size after this renders, so it's measured again then.
		const timer = setTimeout(fit, 0);
		window.addEventListener('resize', fit);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('resize', fit);
		};
	}, [frameRef, row, trying, uiScale]);
	return width;
};

const resetChipRow = (ev) => {
	if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.scrollLeft = 0;
};

const SCENE_LABELS = {
	home: () => $L('Home'),
	details: () => $L('Details Page'),
	player: () => $L('Player'),
	search: () => $L('Search')
};

// Read inside the override, so a picker's option shows before it's saved.
const MediaBarScene = () => {
	const {settings} = useSettings();
	return <MediaBarPreview mode={settings.featuredBarStyle || 'moonfin'} />;
};

const DetailsScene = () => {
	const {settings} = useSettings();
	return <DetailStylePreview variant={settings.detailScreenStyle || 'v2'} />;
};

// The screensaver as it comes up over home, or nothing while it's switched off.
const ScreensaverScene = () => {
	const {settings} = useSettings();
	if (settings.screensaverEnabled === false) return null;
	const item = getPreviewItems()[0];
	return (
		<ScreensaverPreview
			fill
			backdropUrl={item ? item.backdropUrl : null}
			backdrop={settings.screensaverBackdrop}
			component={settings.screensaverComponent}
			movement={settings.screensaverMovement}
			position={settings.screensaverPosition}
			size={settings.screensaverSize}
			dimmingLevel={settings.screensaverDimmingLevel}
			clockDisplay={settings.clockDisplay}
			timeOffsetHours={settings.timeOffsetHours}
		/>
	);
};

const PLAYER_MOMENTS = {introAction: 'intro', nextUpBehavior: 'end', showDescriptionOnPause: 'paused'};
// The subtitle look is judged with the controls away, the way most of a film is watched.
const STAGE_MOMENTS = {loading: 'loading', trickplay: 'seek', subtitles: 'watching'};

const SceneView = ({scene, row, hasLiveTv}) => {
	const focusKey = row ? row.key : null;
	// A screen that keeps one look on the stage draws it on its own scene.
	const stage = row && row.stage && sceneOfRow(row) === scene ? row.stage : null;
	if (scene === 'details') return <DetailsScene />;
	if (scene === 'search') return <KeyboardPreview />;
	if (scene === 'player') {
		return <PlayerPreview moment={STAGE_MOMENTS[stage] || PLAYER_MOMENTS[focusKey] || 'middle'} hdr={SUBTITLE_HDR_KEYS.indexOf(focusKey) >= 0} />;
	}
	if (MEDIA_BAR_KEYS.indexOf(focusKey) >= 0) return <MediaBarScene />;
	// The left rail only paints its color and shows its clock while it's open.
	const railOpen = ['navbarColor', 'navbarOpacity', 'showClock', 'clockDisplay'].indexOf(focusKey) >= 0;
	return (
		<>
			<SettingsHomePreview railOpen={railOpen} focusCard={FOCUSED_CARD_KEYS.indexOf(focusKey) >= 0} hasLiveTv={hasLiveTv} />
			{stage === 'screensaver' && <ScreensaverScene />}
		</>
	);
};

// The live preview beside the settings list: scene chips, a mock of the screen the focused
// setting changes, and that setting spelled out with every choice a picker offers. Focusing a
// chip shows its scene, and [onLeaveChips] takes Left off the first one.
const SettingsLivePreview = ({scene, row, trying, onPickScene, onLeaveChips, hasLiveTv}) => {
	const t = usePreviewPalette();
	const overrides = useMemo(() => (trying ? {[trying.key]: trying.value} : null), [trying]);
	const tryingHere = !!(trying && row && trying.key === row.key);
	const live = tryingHere ? trying.index : (row ? row.saved : -1);
	const frameRef = useRef(null);
	const frameWidth = useStageWidth(frameRef, row, trying);

	return (
		<div className={css.preview}>
			<div className={css.header}>
				<div className={css.heading}>
					<span className={css.dot} style={{backgroundColor: t.accent}} />
					<span className={css.label}>{$L('Live preview')}</span>
				</div>
				<ChipRow className={css.chips} spotlightId='preview-scene-chips' onBlur={resetChipRow}>
					{SCENES.map((id, index) => (
						<Chip
							key={id}
							spotlightId={sceneChipId(id)}
							data-selected={id === scene}
							className={id === scene ? `${css.chip} ${css.chipSelected}` : css.chip}
							onFocus={(ev) => {
								keepInView(ev.currentTarget);
								onPickScene(id);
							}}
							onClick={() => onPickScene(id)}
							onKeyDown={(ev) => {
								if (index !== 0 || ev.keyCode !== KEYS.LEFT) return;
								ev.preventDefault();
								ev.stopPropagation();
								onLeaveChips();
							}}
						>
							{SCENE_LABELS[id]()}
						</Chip>
					))}
				</ChipRow>
			</div>
			<div ref={frameRef} className={css.frame} style={frameWidth === null ? null : {width: frameWidth}}>
				<SettingsOverride overrides={overrides}>
					<SceneView scene={scene} row={row} hasLiveTv={hasLiveTv} />
				</SettingsOverride>
			</div>
			{row && (
				<div className={css.inspector}>
					{/* A link opens a screen of its own settings, so it only has a status when the preview draws what that screen edits. */}
					{row.key && (
						<div className={css.status}>
							<span className={css.statusDot} style={{backgroundColor: row.scene ? t.accent : 'rgba(255, 255, 255, 0.4)'}} />
							<span className={row.scene ? css.statusOn : css.statusOff}>
								{row.scene
									? $L('Shows on the {screen} preview').replace('{screen}', SCENE_LABELS[row.scene]())
									: $L('Not shown in the preview')}
							</span>
						</div>
					)}
					<div className={css.title}>{row.title}</div>
					{(row.description || row.path) && <div className={css.description}>{row.description || row.path}</div>}
					{row.options.length > 0 && row.options.length <= 8 && (
						<div className={css.options}>
							{row.options.map((option, index) => {
								const isLive = index === live;
								const isSaved = tryingHere && index === row.saved && !isLive;
								return (
									<span
										key={String(option.value)}
										className={isLive ? `${css.option} ${css.optionLive}` : css.option}
										style={isSaved ? {borderColor: t.accent} : null}
									>
										{option.label}
										{isSaved && <span className={css.savedTag}>{$L('Saved')}</span>}
									</span>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default SettingsLivePreview;
