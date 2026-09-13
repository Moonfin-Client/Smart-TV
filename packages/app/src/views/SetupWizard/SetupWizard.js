// The first thing a new user sees after signing in.
//
// A few questions about how the app should look, then a screen showing what
// else is in here. It only ever asks about things it cant work out on its
// own, and only about things a person can answer by looking.

import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import {useAuth} from '../../context/AuthContext';
import {useSettings, isServerSyncInitialized} from '../../context/SettingsContext';
import {getActiveServer} from '../../services/multiServerManager';
import {isBuiltInThemeId, resolveThemeById} from '../../theme/themeRegistry';
import {toCssColor, toRgbTriplet} from '../../theme/themeSpec';
import LoadingSpinner from '../../components/LoadingSpinner';
import {remainingSteps, markComplete, deferThisLaunch, SETUP_QUESTION_STEPS} from '../../utils/setupWizardGate';
import {ensurePreviewItemsLoaded} from './setupPreviewData';
import {MediaBarPreview, NavbarPreview, HomeRowsPreview, DetailStylePreview, SetupIcon, usePreviewPalette} from './SetupPreviews';
import css from './SetupWizard.module.less';

const SpottableDiv = Spottable('div');

const MEDIA_BAR_MODES = ['moonfin', 'makd', 'bookshelf', 'gallery', 'banner', 'aya', 'off'];

// Seven styles in one line would leave each too small to judge, so they sit
// four across and wrap onto a second row.
const MEDIA_BAR_COLUMNS = 4;

// What each card adds to its own width, from the margin the card carries.
const CARD_GUTTER = 24;

const mediaBarLabel = (mode) => {
	switch (mode) {
		case 'makd': return $L('MakD');
		case 'bookshelf': return $L('Bookshelf');
		case 'gallery': return $L('Gallery');
		case 'banner': return $L('Banner');
		case 'aya': return $L('Aya');
		case 'off': return $L('Off');
		default: return $L('Moonfin');
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

const useBodySize = () => {
	const ref = useRef(null);
	const [size, setSize] = useState({width: 0, height: 0});
	useEffect(() => {
		const measure = () => {
			const node = ref.current;
			if (!node) return;
			setSize((prev) => (
				prev.width === node.offsetWidth && prev.height === node.offsetHeight
					? prev
					: {width: node.offsetWidth, height: node.offsetHeight}
			));
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	});
	return [ref, size];
};

// One pickable layout, shown rather than described.
const OptionCard = ({spotlightId, label, hint, selected, preview, onSelect, width, t}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	const borderColor = focused ? t.onSurface : t.onSurfaceA(selected ? 0.34 : 0.14);
	return (
		<SpottableDiv
			spotlightId={spotlightId}
			className={css.optionCard}
			style={{width}}
			onClick={onSelect}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div
				className={css.optionPreviewBorder}
				style={{
					border: `${focused ? 4 : 2}px solid ${borderColor}`,
					boxShadow: focused ? `0px 0px 44px 2px ${t.onSurfaceA(0.34)}` : 'none',
					transform: focused ? 'scale(1.035)' : 'scale(1)'
				}}
			>
				<div className={css.optionPreviewFrame} style={{backgroundColor: t.surface}}>
					{preview}
				</div>
			</div>
			<div className={css.optionLabelRow}>
				{selected && <div className={css.selectedDot} style={{backgroundColor: t.onSurface}} />}
				<div className={css.optionLabel} style={{color: selected ? t.onSurface : t.onSurfaceA(0.7), fontWeight: selected ? 600 : 400}}>
					{label}
				</div>
			</div>
			{hint && <div className={css.optionHint} style={{color: t.onSurfaceA(0.55)}}>{hint}</div>}
		</SpottableDiv>
	);
};

const TextButton = ({spotlightId, label, onSelect, onFocusChange, t}) => {
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

const PrimaryButton = ({spotlightId, label, onSelect, t}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	return (
		<SpottableDiv
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

const ThemeSwatch = ({theme, selected, onSelect, t}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	const spec = resolveThemeById(theme.id);
	return (
		<SpottableDiv
			spotlightId={`setup-wizard-theme-${theme.id}`}
			className={css.themeSwatch}
			onClick={onSelect}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div
				className={css.swatchBox}
				style={{
					background: `linear-gradient(to bottom right, ${toCssColor(spec.colors.surface)}, ${toCssColor(spec.colors.background)})`,
					border: `${focused ? 4 : 2}px solid ${focused ? t.onSurface : t.onSurfaceA(selected ? 0.4 : 0.16)}`,
					boxShadow: focused ? `0px 0px 36px ${t.onSurfaceA(0.3)}` : 'none'
				}}
			>
				<div className={css.swatchInner}>
					<div className={css.swatchAccentDot} style={{backgroundColor: toCssColor(spec.colors.accent)}} />
					<div className={css.swatchBar} style={{backgroundColor: `rgba(${toRgbTriplet(spec.colors.onSurface)}, 0.7)`}} />
				</div>
			</div>
			<div className={css.swatchLabel} style={{color: t.onSurfaceA(selected ? 1 : 0.62)}}>
				{theme.displayName}
			</div>
		</SpottableDiv>
	);
};

// The closing screen. Pick a look, then a list of what else lives in
// Settings. Only the theme writes anything.
const TourStep = ({t}) => {
	const {availableThemes, activeThemeId, selectThemeById} = useSettings();
	const builtIns = availableThemes.filter((theme) => isBuiltInThemeId(theme.id));
	const bullets = [
		$L('Seerr requests'),
		$L('SyncPlay watch parties'),
		$L('Live TV'),
		$L('Custom themes'),
		$L('And plenty more')
	];
	return (
		<div className={css.tourScroll}>
			<div className={css.tourLabel} style={{color: t.onSurfaceA(0.62)}}>{$L('Pick a look')}</div>
			<div className={css.swatchRow}>
				{builtIns.map((theme) => (
					<ThemeSwatch
						key={theme.id}
						theme={theme}
						selected={activeThemeId === theme.id}
						// Written straight away rather than held back with the rest,
						// because the point is that the wizard restyles around you as
						// you move across the row.
						onSelect={() => selectThemeById(theme.id)} // eslint-disable-line react/jsx-no-bind
						t={t}
					/>
				))}
			</div>
			<div className={css.tourMoreBox} style={{backgroundColor: t.onSurfaceA(0.04), border: `2px solid ${t.onSurfaceA(0.14)}`}}>
				<div className={css.tourMoreHeader} style={{color: t.onSurface}}>
					<SetupIcon name='settings' size={36} color={t.onSurface} style={{marginRight: 16}} />
					{$L('There is more waiting in Settings')}
				</div>
				{bullets.map((entry) => (
					<div key={entry} className={css.tourBullet} style={{color: t.onSurfaceA(0.65)}}>
						<div className={css.tourBulletMark}>{'•'}</div>
						<div>{entry}</div>
					</div>
				))}
			</div>
		</div>
	);
};

const SetupWizard = ({onDone, backHandlerRef}) => {
	const {api, serverUrl, user} = useAuth();
	const {settings, initialSyncSettled, updateSettings, activeThemeId} = useSettings();
	const t = usePreviewPalette();

	const [steps, setSteps] = useState([]);
	const [index, setIndex] = useState(0);
	const [ready, setReady] = useState(false);
	const [advancing, setAdvancing] = useState(true);
	const [answers, setAnswers] = useState({});

	const syncSettledRef = useRef(initialSyncSettled);
	syncSettledRef.current = initialSyncSettled;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const skipFocusedRef = useRef(false);
	const leavingRef = useRef(false);
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
		setAdvancing(true);
		setIndex((value) => value + 1);
	}, [api, finish]);

	const goBack = useCallback(() => {
		if (indexRef.current === 0) return;
		setAdvancing(false);
		setIndex((value) => value - 1);
	}, []);

	// BACK never leaves the wizard on the first press. It moves to Skip, so
	// the way out is always something the user chose to press twice.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => {
			if (skipFocusedRef.current) {
				skip();
				return;
			}
			Spotlight.focus('setup-wizard-skip');
		};
		return () => {
			backHandlerRef.current = null;
		};
	}, [backHandlerRef, skip]);

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

	// Land focus on the choice already in effect, the way every step opens.
	useEffect(() => {
		if (!step) return;
		const question = SETUP_QUESTION_STEPS.find((entry) => entry.step === step);
		const target = question
			? `setup-card-${step}-${selectedFor(question.settingKey)}`
			: `setup-wizard-theme-${activeThemeId}`;
		const timer = setTimeout(() => Spotlight.focus(target), 50);
		return () => clearTimeout(timer);
	}, [step]); // eslint-disable-line react-hooks/exhaustive-deps

	const [bodyRef, bodySize] = useBodySize();

	// Sized from the width the row gives each card and from the height the
	// body can hold, so a focused card grows without running out of the step.
	// labelAllowance is the room the text under the preview needs.
	const cardWidthFor = useCallback((columns, rows, labelAllowance) => {
		if (!bodySize.width) return 240;
		const byWidth = (bodySize.width - CARD_GUTTER * columns) / columns;
		const byHeight = ((bodySize.height / rows) - labelAllowance - 24) * (16 / 9);
		return Math.min(840, Math.max(160, Math.min(byWidth, byHeight)));
	}, [bodySize]);

	const pick = useCallback((settingKey, value) => {
		setAnswers((prev) => ({...prev, [settingKey]: value}));
	}, []);

	const handleSkipFocusChange = useCallback((focused) => {
		skipFocusedRef.current = focused;
	}, []);

	const stepContent = useMemo(() => {
		if (!step) return null;
		if (step === 'navbar') {
			const selected = selectedFor('navbarPosition');
			const width = cardWidthFor(2, 1, 60);
			return (
				<div className={css.optionRow}>
					<OptionCard spotlightId='setup-card-navbar-top' label={$L('Top Bar')} selected={selected === 'top'} preview={<NavbarPreview position='top' />} onSelect={() => pick('navbarPosition', 'top')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
					<OptionCard spotlightId='setup-card-navbar-left' label={$L('Left Sidebar')} selected={selected === 'left'} preview={<NavbarPreview position='left' />} onSelect={() => pick('navbarPosition', 'left')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
				</div>
			);
		}
		if (step === 'mediaBar') {
			const selected = selectedFor('featuredBarStyle');
			const width = cardWidthFor(MEDIA_BAR_COLUMNS, 2, 60);
			// Capping the row keeps the wrap at four. A card sized down to fit
			// the height would otherwise let a fifth slip onto the line.
			const rowStyle = {
				maxWidth: MEDIA_BAR_COLUMNS * (width + CARD_GUTTER),
				margin: '0 auto'
			};
			return (
				<div className={css.optionRow} style={rowStyle}>
					{MEDIA_BAR_MODES.map((mode) => (
						<OptionCard
							key={mode}
							spotlightId={`setup-card-mediaBar-${mode}`}
							label={mediaBarLabel(mode)}
							selected={selected === mode}
							preview={<MediaBarPreview mode={mode} />}
							onSelect={() => pick('featuredBarStyle', mode)} // eslint-disable-line react/jsx-no-bind
							width={width}
							t={t}
						/>
					))}
				</div>
			);
		}
		if (step === 'homeRows') {
			const selected = selectedFor('homeRowsStyle');
			const width = cardWidthFor(2, 1, 110);
			return (
				<div className={css.optionRow}>
					<OptionCard spotlightId='setup-card-homeRows-v1' label={$L('Classic')} hint={$L('Compact. More rows on screen at once.')} selected={selected === 'v1'} preview={<HomeRowsPreview modern={false} />} onSelect={() => pick('homeRowsStyle', 'v1')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
					<OptionCard spotlightId='setup-card-homeRows-v2' label={$L('Modern')} hint={$L('Larger cards with titles underneath.')} selected={selected === 'v2'} preview={<HomeRowsPreview modern />} onSelect={() => pick('homeRowsStyle', 'v2')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
				</div>
			);
		}
		if (step === 'detailStyle') {
			const selected = selectedFor('detailScreenStyle');
			const width = cardWidthFor(3, 1, 110);
			return (
				<div className={css.optionRow}>
					<OptionCard spotlightId='setup-card-detailStyle-v1' label={$L('Classic')} hint={$L('Everything centred in one stack.')} selected={selected === 'v1'} preview={<DetailStylePreview variant='v1' />} onSelect={() => pick('detailScreenStyle', 'v1')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
					<OptionCard spotlightId='setup-card-detailStyle-v2' label={$L('Modern')} hint={$L('Cinematic, with tabs for cast and extras.')} selected={selected === 'v2'} preview={<DetailStylePreview variant='v2' />} onSelect={() => pick('detailScreenStyle', 'v2')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
					<OptionCard spotlightId='setup-card-detailStyle-v3' label={$L('Spotlight')} hint={$L('Artwork first, with cards that open what they name.')} selected={selected === 'v3'} preview={<DetailStylePreview variant='v3' />} onSelect={() => pick('detailScreenStyle', 'v3')} width={width} t={t} /> {/* eslint-disable-line react/jsx-no-bind */}
				</div>
			);
		}
		return <TourStep t={t} />;
	}, [step, selectedFor, cardWidthFor, pick, t]);

	const isLast = ready && index >= steps.length - 1;

	return (
		<div className={css.root} style={{backgroundColor: t.background}}>
			<div
				className={css.surface}
				style={{
					background: `linear-gradient(to bottom right, ${t.backgroundA(0.97)}, ${t.surfaceA(0.96)})`,
					border: `2px solid ${t.onSurfaceA(0.22)}`,
					boxShadow: `0px 0px 80px 2px ${t.scrimA(0.35)}`
				}}
			>
				{!ready && (
					<div className={css.loadingBox}>
						<LoadingSpinner />
					</div>
				)}
				{ready && (
					<>
						<div className={css.topBar}>
							<div className={css.stepDots}>
								{steps.map((name, i) => (
									<div key={name} className={css.stepDot} style={{backgroundColor: i === index ? t.onSurface : t.onSurfaceA(0.24)}} />
								))}
							</div>
							<TextButton
								spotlightId='setup-wizard-skip'
								label={$L('Skip setup')}
								onSelect={skip}
								onFocusChange={handleSkipFocusChange}
								t={t}
							/>
						</div>
						<div className={css.question} style={{color: t.onSurface}}>
							{questionFor(step)}
						</div>
						<div className={css.stepBody} ref={bodyRef}>
							<div key={step} className={`${css.stepInner} ${advancing ? css.stepEnterForward : css.stepEnterBackward}`}>
								{stepContent}
							</div>
						</div>
						<div className={css.actions}>
							{index > 0 && (
								<TextButton spotlightId='setup-wizard-back' label={$L('Back')} onSelect={goBack} t={t} />
							)}
							<div className={css.actionsSpacer} />
							<PrimaryButton
								spotlightId='setup-wizard-next'
								label={isLast ? $L('Done') : $L('Next')}
								onSelect={advance}
								t={t}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default SetupWizard;
