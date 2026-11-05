// The first thing a new user sees after signing in.
//
// A few questions about how the app should look, then a screen showing what
// else is in here. It only ever asks about things it cant work out on its
// own, and only about things a person can answer by looking.

import {Fragment, useState, useEffect, useRef, useCallback, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import {useAuth} from '../../context/AuthContext';
import {useSettings, isServerSyncInitialized} from '../../context/SettingsContext';
import {getActiveServer} from '../../services/multiServerManager';
import {isBuiltInThemeId, resolveThemeById} from '../../theme/themeRegistry';
import {toCssColor} from '../../theme/themeSpec';
import LoadingSpinner from '../../components/LoadingSpinner';
import {remainingSteps, markComplete, deferThisLaunch} from '../../utils/setupWizardGate';
import {ModalContainer} from '../../utils/spotlightContainers';
import {keepFocusInView, pointerHover} from '../../utils/focusScroll';
import {getAudioLanguageOptions, getSubtitleLanguageOptions, getSubtitleModeOptions, getLabel} from '../Settings/settingsOptions';
import {ensurePreviewItemsLoaded} from './setupPreviewData';
import {MediaBarPreview, NavbarPreview, HomeRowsPreview, DetailStylePreview, SetupIcon, usePreviewPalette} from './SetupPreviews';
import {STEP_INFO, LANGUAGE_PATH, tourDescription} from './setupSteps';
import css from './SetupWizard.module.less';

const SpottableDiv = Spottable('div');

// Spotlight goes to whatever is nearest in a direction. These keep the option
// list one straight line: Up from its top to Skip, Right and Down out of it to
// Next, and Left from Next to Back.
const NEXT_TARGET = '[data-spotlight-id="setup-wizard-next"]';
const BACK_TARGET = '[data-spotlight-id="setup-wizard-back"]';
const SKIP_TARGET = '[data-spotlight-id="setup-wizard-skip"]';

const rowIdFor = (step, value) => `setup-opt-${step}-${value}`;

// The languages path sits under the last row of the tour, so reaching that row
// scrolls the column right to the end to bring the path in with it.
const keepColumnInView = (ev) => {
	keepFocusInView(ev);
	if (pointerHover()) return;
	const spots = ev.currentTarget.querySelectorAll('.spottable');
	if (ev.target === spots[spots.length - 1]) ev.currentTarget.scrollTop = ev.currentTarget.scrollHeight;
};

const subtitleModeDescription = (mode) => {
	switch (mode) {
		case 'always': return $L('Automatically loads and displays subtitles every time a video starts.');
		case 'foreign': return $L('Automatically turns on subtitles if the default audio track is in a foreign language.');
		case 'forced': return $L('Only loads subtitles explicitly tagged with the forced metadata flag.');
		case 'none': return $L('Completely disables automatic subtitle loading.');
		default: return $L("Plays tracks internally flagged in the media file's metadata as \"default\" or \"forced\".");
	}
};

const questionFor = (step) => {
	switch (step) {
		case 'navbar': return $L('Where should navigation go?');
		case 'mediaBar': return $L('How should the top of your Home screen look?');
		case 'homeRows': return $L('How should your rows look?');
		case 'detailStyle': return $L('How should a movie or show look when you open it?');
		default: return $L("You're set. Here's what else is in here.");
	}
};

// The tour shows the media bar that was picked, in whichever theme is on.
const stagePreview = (step, value, mediaBarMode) => {
	switch (step) {
		case 'navbar': return <NavbarPreview position={value} />;
		case 'mediaBar': return <MediaBarPreview mode={value} />;
		case 'homeRows': return <HomeRowsPreview modern={value === 'v2'} />;
		case 'detailStyle': return <DetailStylePreview variant={value} />;
		default: return <MediaBarPreview mode={mediaBarMode} />;
	}
};

// One choice in the list. Focusing it previews it on the stage, OK picks it.
const OptionRow = ({spotlightId, value, label, selected, swatch, onPick, onPreview, t, ...rest}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => {
		setFocused(true);
		onPreview(value);
	}, [onPreview, value]);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleClick = useCallback(() => onPick(value), [onPick, value]);
	let ring = t.onSurfaceA(0.4);
	if (selected) ring = t.accent;
	else if (focused) ring = 'rgba(16, 16, 16, 0.5)';
	return (
		<SpottableDiv
			{...rest}
			spotlightId={spotlightId}
			className={css.optionRow}
			style={{
				backgroundColor: focused ? t.onSurface : 'transparent',
				color: focused ? '#101010' : t.onSurfaceA(0.82),
				fontWeight: focused ? 600 : 400
			}}
			onClick={handleClick}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div className={css.radio} style={{borderColor: ring}}>
				{selected && <div className={css.radioDot} style={{backgroundColor: t.accent}} />}
			</div>
			<div className={css.optionLabel}>{label}</div>
			{selected && (
				<div className={css.currentTag} style={{color: focused ? 'rgba(16, 16, 16, 0.6)' : t.onSurfaceA(0.55)}}>
					{$L('Current')}
				</div>
			)}
			{swatch}
		</SpottableDiv>
	);
};

const ThemeSwatch = ({themeId, t}) => {
	const colors = resolveThemeById(themeId).colors;
	return (
		<div
			className={css.swatch}
			style={{
				background: `radial-gradient(circle, ${toCssColor(colors.accent)} 40%, ${toCssColor(colors.surface)} 43%)`,
				boxShadow: `0 0 0 2px ${t.onSurfaceA(0.2)}`
			}}
		/>
	);
};

const SettingsPath = ({crumbs, name, className, t}) => (
	<div className={className ? `${css.path} ${className}` : css.path}>
		<span className={css.pathGear}><SetupIcon name='settings' size={24} color={t.onSurfaceA(0.55)} /></span>
		{crumbs.map((crumb) => (
			<Fragment key={crumb}>
				<span style={{color: t.onSurfaceA(0.6)}}>{crumb}</span>
				<span className={css.pathChevron}><SetupIcon name='chevron_right' size={18} color={t.onSurfaceA(0.4)} /></span>
			</Fragment>
		))}
		<span style={{color: t.onSurface, fontWeight: 600}}>{name}</span>
	</div>
);

const TextButton = ({spotlightId, label, onSelect, onFocusChange, t, ...rest}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => {
		setFocused(true);
		if (onFocusChange) onFocusChange(true);
	}, [onFocusChange]);
	const handleBlur = useCallback(() => {
		setFocused(false);
		if (onFocusChange) onFocusChange(false);
	}, [onFocusChange]);
	return (
		<SpottableDiv
			{...rest}
			spotlightId={spotlightId}
			className={css.textButton}
			style={{
				color: t.onSurfaceA(focused ? 1 : 0.62),
				borderBottomColor: focused ? t.onSurface : 'transparent'
			}}
			onClick={onSelect}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			{label}
		</SpottableDiv>
	);
};

const PrimaryButton = ({spotlightId, label, onSelect, t, ...rest}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	return (
		<SpottableDiv
			{...rest}
			spotlightId={spotlightId}
			className={css.primaryButton}
			style={{
				backgroundColor: t.accent,
				color: t.onAccent,
				borderColor: focused ? t.onSurface : 'transparent',
				boxShadow: focused ? `0px 0px 36px 2px ${t.accentA(0.5)}` : 'none'
			}}
			onClick={onSelect}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			{label}
		</SpottableDiv>
	);
};

// The box a playback row sits in, lit up while focused.
const panelStyle = (t, focused, radius) => ({
	borderRadius: radius,
	backgroundColor: t.onSurfaceA(focused ? 0.1 : 0.04),
	border: `2px solid ${focused ? t.onSurface : t.onSurfaceA(0.14)}`
});

// The answer on a row that opens a list.
const ChosenValue = ({label, t}) => (
	<div className={css.chosenValue}>
		<div className={css.chosenLabel} style={{color: t.onSurface}}>{label}</div>
		<SetupIcon name='chevron_right' size={32} color={t.onSurfaceA(0.55)} />
	</div>
);

// The row takes the press and the focus, the switch only shows the state.
const SwitchValue = ({on, t}) => (
	<div className={css.switchTrack} style={{backgroundColor: on ? t.accent : t.onSurfaceA(0.25)}}>
		<div className={css.switchKnob} style={{backgroundColor: on ? t.onAccent : t.onSurface, transform: on ? 'translateX(28px)' : 'translateX(0)'}} />
	</div>
);

// One playback setting: its name, an optional line under it, and its current
// answer on the right.
const SettingRow = ({spotlightId, label, hint, trailing, onSelect, t, ...rest}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	return (
		<SpottableDiv
			{...rest}
			spotlightId={spotlightId}
			className={css.settingRow}
			style={panelStyle(t, focused, 16)}
			onClick={onSelect}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div className={css.settingRowText}>
				<div className={css.settingRowLabel} style={{color: t.onSurfaceA(0.7)}}>{label}</div>
				{hint && <div className={css.settingRowHint} style={{color: t.onSurfaceA(0.5)}}>{hint}</div>}
			</div>
			{trailing}
		</SpottableDiv>
	);
};

// A header that shows the current answers while folded, opening downwards
// into its children when pressed.
const CollapsibleSection = ({spotlightId, expanded, icon, title, badge, summary, onToggle, t, children, ...rest}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	return (
		<div className={css.collapsible}>
			<SpottableDiv
				{...rest}
				spotlightId={spotlightId}
				className={css.collapsibleHeader}
				style={panelStyle(t, focused, 20)}
				onClick={onToggle}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<SetupIcon name={icon} size={30} color={t.onSurface} style={{marginRight: 16, flexShrink: 0}} />
				<div className={css.collapsibleText}>
					<div className={css.collapsibleTitle} style={{color: t.onSurface}}>
						{title}
						<span className={css.collapsibleBadge} style={{color: t.onSurfaceA(0.55)}}>{badge}</span>
					</div>
					{!expanded && <div className={css.collapsibleSummary} style={{color: t.onSurfaceA(0.65)}}>{summary}</div>}
				</div>
				<SetupIcon name='keyboard_arrow_down' size={40} color={t.onSurfaceA(0.7)} style={{flexShrink: 0, transition: 'transform 180ms', transform: expanded ? 'rotate(180deg)' : 'none'}} />
			</SpottableDiv>
			{expanded && children}
		</div>
	);
};

const PickerOption = ({option, selected, description, onPick, t}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleClick = useCallback(() => onPick(option.value), [onPick, option.value]);
	return (
		<SpottableDiv
			className={css.pickerOption}
			style={{backgroundColor: focused ? t.onSurfaceA(0.12) : 'transparent'}}
			data-selected={selected ? 'true' : undefined}
			onClick={handleClick}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div className={css.pickerOptionText}>
				<div className={css.pickerOptionLabel} style={{color: t.onSurface}}>{option.label}</div>
				{description && <div className={css.pickerOptionHint} style={{color: t.onSurfaceA(0.6)}}>{description}</div>}
			</div>
			{selected && <SetupIcon name='check' size={36} color={t.accent} />}
		</SpottableDiv>
	);
};

// The list a row opens: every value, the current one ticked, and an optional
// line under each. Opens on the current value and hands focus back on close.
const OptionPicker = ({title, options, current, descriptionOf, onPick, onClose, t}) => {
	const stopPropagation = useCallback((ev) => ev.stopPropagation(), []);
	return (
		<div className={css.pickerOverlay} style={{backgroundColor: t.scrimA(0.6)}} onClick={onClose}>
			<ModalContainer
				className={css.pickerPanel}
				style={{backgroundColor: t.surface, border: `2px solid ${t.onSurfaceA(0.22)}`, boxShadow: `0px 0px 60px 2px ${t.scrimA(0.4)}`}}
				onClick={stopPropagation}
				spotlightId='setup-wizard-picker'
			>
				<div className={css.pickerTitle} style={{color: t.onSurface}}>{title}</div>
				<div className={css.pickerList} onFocus={keepFocusInView}>
					{options.map((option) => (
						<PickerOption
							key={String(option.value)}
							option={option}
							selected={option.value === current}
							description={descriptionOf ? descriptionOf(option.value) : null}
							onPick={onPick}
							t={t}
						/>
					))}
				</div>
			</ModalContainer>
		</div>
	);
};

const SetupWizard = ({onDone, backHandlerRef}) => {
	const {api, serverUrl, user} = useAuth();
	const {settings, initialSyncSettled, updateSettings, activeThemeId, availableThemes, selectThemeById} = useSettings();
	const t = usePreviewPalette();

	const [steps, setSteps] = useState([]);
	const [index, setIndex] = useState(0);
	const [ready, setReady] = useState(false);
	// The option on the stage, which follows focus down the list.
	const [previewed, setPreviewed] = useState(null);
	const [answers, setAnswers] = useState({});
	const [playbackExpanded, setPlaybackExpanded] = useState(false);
	const [picker, setPicker] = useState(null);

	const syncSettledRef = useRef(initialSyncSettled);
	syncSettledRef.current = initialSyncSettled;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const skipFocusedRef = useRef(false);
	const leavingRef = useRef(false);
	const pickerRef = useRef(picker);
	pickerRef.current = picker;
	const pickerOpenerRef = useRef(null);
	const answersRef = useRef(answers);
	answersRef.current = answers;
	const stepsRef = useRef(steps);
	stepsRef.current = steps;
	const indexRef = useRef(index);
	indexRef.current = index;

	const leave = useCallback(() => {
		if (leavingRef.current) return;
		leavingRef.current = true;
		onDone();
	}, [onDone]);

	const completeAndLeave = useCallback(async () => {
		const active = await getActiveServer().catch(() => null);
		await markComplete(active?.id, serverUrl, user?.Id).catch(() => null);
		leave();
	}, [serverUrl, user?.Id, leave]);

	const finish = useCallback(async () => {
		const held = answersRef.current;
		const batch = {};
		for (const key of Object.keys(held)) {
			if (held[key] != null) batch[key] = held[key];
		}
		// With subtitles off the language stays as it was.
		const subtitleMode = held.subtitleMode != null ? held.subtitleMode : settingsRef.current.subtitleMode;
		if (subtitleMode === 'none') delete batch.subtitleLanguage;
		// Held rather than written as they are chosen. Each write kicks off a
		// profile push that the plugin then echoes back, so the answers across
		// the steps land as one batch at the end.
		if (Object.keys(batch).length > 0) updateSettings(batch);
		await completeAndLeave();
	}, [updateSettings, completeAndLeave]);

	// Skipping leaves without answering anything, and without being asked
	// again. What it must not do is write the defaults, which would mark them
	// as deliberate choices and stop any future device from asking either.
	const skip = completeAndLeave;

	const advance = useCallback(() => {
		if (indexRef.current >= stepsRef.current.length - 1) {
			finish();
			return;
		}
		// Costs nothing once artwork is in, and gives a slow server another
		// chance to fill the previews before the next step shows them.
		ensurePreviewItemsLoaded(api);
		setIndex((value) => value + 1);
	}, [api, finish]);

	const goBack = useCallback(() => {
		if (indexRef.current === 0) return;
		setIndex((value) => value - 1);
	}, []);

	const closePicker = useCallback(() => {
		setPicker(null);
		window.requestAnimationFrame(() => {
			if (pickerOpenerRef.current) Spotlight.focus(pickerOpenerRef.current);
		});
	}, []);

	// BACK never leaves the wizard on the first press. It moves to Skip, so
	// the way out is always something the user chose to press twice.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => {
			if (pickerRef.current) {
				closePicker();
				return;
			}
			if (skipFocusedRef.current) {
				skip();
				return;
			}
			Spotlight.focus('setup-wizard-skip');
		};
		return () => {
			backHandlerRef.current = null;
		};
	}, [backHandlerRef, skip, closePicker]);

	useEffect(() => {
		let cancelled = false;
		const prepare = async () => {
			// The plugin resolves a profile shortly after sign in and applies it
			// whole. Answering before that lands means watching the answers get
			// overwritten a second later.
			const deadline = Date.now() + 3000;
			let settled = false;
			while (Date.now() < deadline) {
				if (syncSettledRef.current) {
					settled = true;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 120));
			}
			if (cancelled) return;
			if (!settled) {
				// A server with no plugin on it has no profile coming, so there is
				// nothing left to wait for. One that has it is still going to push,
				// and it would land on top of anything chosen here.
				const noProfileComing = !settingsRef.current.useMoonfinPlugin &&
					await isServerSyncInitialized(serverUrl).catch(() => false);
				if (cancelled) return;
				if (!noProfileComing) {
					deferThisLaunch();
					leave();
					return;
				}
			}
			// Kicked off now so the previews carry real artwork by the time the
			// user reaches them.
			ensurePreviewItemsLoaded(api);
			const remaining = remainingSteps();
			if (remaining.length === 0) {
				// Everything here was answered on another device or an earlier
				// visit. Nothing to show, and nothing to ask again.
				await completeAndLeave();
				return;
			}
			if (cancelled) return;
			setSteps(remaining);
			setReady(true);
		};
		prepare();
		return () => {
			cancelled = true;
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const step = ready ? steps[index] : null;

	// The held answer when there is one, the current setting otherwise, which
	// always exists because the provider merges the defaults in.
	const selectedFor = useCallback((settingKey) => {
		const held = answers[settingKey];
		return held != null ? held : settings[settingKey];
	}, [answers, settings]);

	const info = step ? STEP_INFO[step] : null;

	// The tour's choices are the built-in themes, with the same line under each.
	const options = useMemo(() => {
		if (!info) return [];
		if (info.options) return info.options();
		const desc = tourDescription();
		return availableThemes
			.filter((theme) => isBuiltInThemeId(theme.id))
			.map((theme) => ({value: theme.id, label: theme.displayName, desc}));
	}, [info, availableThemes]);

	const selected = info && info.settingKey ? selectedFor(info.settingKey) : activeThemeId;
	const shownValue = previewed && previewed.step === step ? previewed.value : selected;
	const shown = options.find((option) => option.value === shownValue) || options[0];

	// Land focus on the choice already in effect, the way every step opens. A
	// value the list doesnt carry, like a custom theme, lands on the first row.
	useEffect(() => {
		if (!step || options.length === 0) return undefined;
		const timer = setTimeout(() => {
			if (!Spotlight.focus(rowIdFor(step, selected))) Spotlight.focus(rowIdFor(step, options[0].value));
		}, 50);
		return () => clearTimeout(timer);
	}, [step]); // eslint-disable-line react-hooks/exhaustive-deps

	const pick = useCallback((settingKey, value) => {
		setAnswers((prev) => ({...prev, [settingKey]: value}));
	}, []);

	// Theme is written straight away rather than held back with the rest,
	// because the point is that the wizard restyles around you.
	const pickOption = useCallback((value) => {
		if (info.settingKey) pick(info.settingKey, value);
		else selectThemeById(value);
	}, [info, pick, selectThemeById]);

	const previewOption = useCallback((value) => setPreviewed({step, value}), [step]);

	const openPicker = useCallback((next) => {
		pickerOpenerRef.current = document.activeElement;
		setPicker(next);
		window.requestAnimationFrame(() => Spotlight.focus('setup-wizard-picker'));
	}, []);

	const handlePicked = useCallback((value) => {
		const open = pickerRef.current;
		if (open && value !== open.current) pick(open.settingKey, value);
		closePicker();
	}, [pick, closePicker]);

	const togglePlayback = useCallback(() => setPlaybackExpanded((value) => !value), []);
	const togglePreferDefaultAudio = useCallback(() => {
		pick('preferDefaultAudioTrack', !selectedFor('preferDefaultAudioTrack'));
	}, [pick, selectedFor]);

	// The optional playback languages under the themes. Sign-in has already
	// filled these in from the server or the device, so it starts folded up
	// with those answers showing. The same lists the audio and subtitle
	// settings offer, and a language the server brought in that isnt in them
	// shows as its code, the way the settings show it.
	const playbackSection = useMemo(() => {
		if (step !== 'tour') return null;
		const audioOptions = getAudioLanguageOptions();
		const subtitleOptions = getSubtitleLanguageOptions();
		const modeOptions = getSubtitleModeOptions();
		const audio = selectedFor('audioLanguage');
		const subtitle = selectedFor('subtitleLanguage');
		const mode = selectedFor('subtitleMode');
		const audioLabel = getLabel(audioOptions, audio, audio);
		const subtitleLabel = getLabel(subtitleOptions, subtitle, subtitle);
		const modeLabel = getLabel(modeOptions, mode, $L('Flagged'));
		const subtitlesOn = mode !== 'none';
		return (
			<CollapsibleSection
				spotlightId='setup-wizard-playback'
				expanded={playbackExpanded}
				icon='translate'
				title={$L('Playback languages')}
				badge={$L('Optional')}
				summary={[audioLabel, subtitlesOn ? subtitleLabel : null, modeLabel].filter(Boolean).join(' · ')}
				onToggle={togglePlayback}
				t={t}
				data-spot-right={NEXT_TARGET}
				data-spot-down={playbackExpanded ? undefined : NEXT_TARGET}
			>
				<SettingRow
					spotlightId='setup-wizard-audioLanguage'
					label={$L('Default Audio Language')}
					trailing={<ChosenValue label={audioLabel} t={t} />}
					onSelect={() => openPicker({settingKey: 'audioLanguage', title: $L('Default Audio Language'), options: audioOptions, current: audio})} // eslint-disable-line react/jsx-no-bind
					t={t}
					data-spot-right={NEXT_TARGET}
				/>
				<SettingRow
					spotlightId='setup-wizard-preferDefaultAudioTrack'
					label={$L('Prefer Default Audio Track')}
					hint={$L('Pick the track the file marks as default before matching languages')}
					trailing={<SwitchValue on={Boolean(selectedFor('preferDefaultAudioTrack'))} t={t} />}
					onSelect={togglePreferDefaultAudio}
					t={t}
					data-spot-right={NEXT_TARGET}
				/>
				{/* Mode stays above the language so hiding the language doesnt move the focused row. */}
				<SettingRow
					spotlightId='setup-wizard-subtitleMode'
					label={$L('Subtitle Mode')}
					trailing={<ChosenValue label={modeLabel} t={t} />}
					onSelect={() => openPicker({settingKey: 'subtitleMode', title: $L('Subtitle Mode'), options: modeOptions, current: mode, descriptionOf: subtitleModeDescription})} // eslint-disable-line react/jsx-no-bind
					t={t}
					data-spot-right={NEXT_TARGET}
					data-spot-down={subtitlesOn ? undefined : NEXT_TARGET}
				/>
				{subtitlesOn && (
					<SettingRow
						spotlightId='setup-wizard-subtitleLanguage'
						label={$L('Default Subtitle Language')}
						trailing={<ChosenValue label={subtitleLabel} t={t} />}
						onSelect={() => openPicker({settingKey: 'subtitleLanguage', title: $L('Default Subtitle Language'), options: subtitleOptions, current: subtitle})} // eslint-disable-line react/jsx-no-bind
						t={t}
						data-spot-right={NEXT_TARGET}
						data-spot-down={NEXT_TARGET}
					/>
				)}
			</CollapsibleSection>
		);
	}, [step, selectedFor, playbackExpanded, togglePlayback, togglePreferDefaultAudio, openPicker, t]);

	const handleSkipFocusChange = useCallback((focused) => {
		skipFocusedRef.current = focused;
	}, []);

	const mediaBarMode = selectedFor('featuredBarStyle');
	// Kept as one element so a render that leaves the stage alone, like focus
	// moving between buttons, doesnt rebuild the preview.
	const stage = useMemo(() => (shown ? stagePreview(step, shown.value, mediaBarMode) : null), [step, shown, mediaBarMode]);

	const isLast = ready && index >= steps.length - 1;
	const lastOption = options.length - 1;

	return (
		<div className={css.root} style={{backgroundColor: t.background}}>
			{!ready && (
				<div className={css.loadingBox}>
					<LoadingSpinner />
				</div>
			)}
			{ready && info && (
				<>
					<div className={css.header}>
						<div className={css.segments}>
							{steps.map((name, i) => {
								let color = t.onSurfaceA(0.18);
								if (i < index) color = t.onSurface;
								else if (i === index) color = t.accent;
								return <div key={name} className={css.segment} style={{backgroundColor: color}} />;
							})}
						</div>
						<div className={css.stepText} style={{color: t.onSurfaceA(0.6)}}>
							{$L('Step {n} of {total}').replace('{n}', String(index + 1)).replace('{total}', String(steps.length))}
						</div>
						<div className={css.chip} style={{backgroundColor: t.onSurfaceA(0.08), borderColor: t.onSurfaceA(0.16), color: t.onSurface}}>
							{info.settingName()}
						</div>
						<div className={css.headerSpacer} />
						<TextButton
							spotlightId='setup-wizard-skip'
							label={$L('Skip setup')}
							onSelect={skip}
							onFocusChange={handleSkipFocusChange}
							t={t}
						/>
					</div>
					<div className={css.column} onFocus={keepColumnInView}>
						<div className={css.question} style={{color: t.onSurface}}>
							{questionFor(step)}
						</div>
						<div className={css.optionList}>
							{options.map((option, i) => (
								<OptionRow
									key={option.value}
									spotlightId={rowIdFor(step, option.value)}
									value={option.value}
									label={option.label}
									selected={option.value === selected}
									swatch={info.settingKey ? null : <ThemeSwatch themeId={option.value} t={t} />}
									onPick={pickOption}
									onPreview={previewOption}
									t={t}
									data-spot-up={i === 0 ? SKIP_TARGET : undefined}
									data-spot-down={i === lastOption && step !== 'tour' ? NEXT_TARGET : undefined}
									data-spot-right={NEXT_TARGET}
								/>
							))}
						</div>
						{playbackSection}
						{playbackSection && (
							<SettingsPath crumbs={LANGUAGE_PATH.crumbs()} name={LANGUAGE_PATH.settingName()} className={css.languagePath} t={t} />
						)}
					</div>
					<div className={css.stage} style={{backgroundColor: t.surface, borderColor: t.onSurfaceA(0.2)}}>
						{stage}
					</div>
					{shown && (
						<div className={css.caption}>
							<div className={css.captionName} style={{color: t.onSurface}}>{shown.label}</div>
							<div className={css.captionDesc} style={{color: t.onSurfaceA(0.62)}}>{shown.desc}</div>
							<SettingsPath crumbs={info.crumbs()} name={info.settingName()} t={t} />
						</div>
					)}
					<div className={css.footer}>
						<div className={css.footerSlot}>
							{index > 0 && (
								<TextButton spotlightId='setup-wizard-back' label={$L('Back')} onSelect={goBack} t={t} data-spot-right={NEXT_TARGET} />
							)}
						</div>
						<div className={css.hint} style={{color: t.onSurfaceA(0.5)}}>
							{$L('Up and down to preview · OK to choose · Back twice to skip')}
						</div>
						<div className={`${css.footerSlot} ${css.footerSlotEnd}`}>
							<PrimaryButton
								spotlightId='setup-wizard-next'
								label={isLast ? $L('Done') : $L('Next')}
								onSelect={advance}
								t={t}
								data-spot-left={index > 0 ? BACK_TARGET : `[data-spotlight-id="${rowIdFor(step, shown ? shown.value : '')}"]`}
							/>
						</div>
					</div>
				</>
			)}
			{picker && (
				<OptionPicker
					title={picker.title}
					options={picker.options}
					current={picker.current}
					descriptionOf={picker.descriptionOf}
					onPick={handlePicked}
					onClose={closePicker}
					t={t}
				/>
			)}
		</div>
	);
};

export default SetupWizard;
