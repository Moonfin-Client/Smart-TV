import {memo, useState, useEffect, useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import LoadingSpinner from '../../components/LoadingSpinner';
import {GAME_ICON_PATHS} from '../../components/icons/gameIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import useGamepadButtons from '../../hooks/useGamepadButtons';
import * as gamesApi from '../../services/gamesApi';
import serverLogger from '../../services/serverLogger';
import {initVideo, keepScreenOn, setupVisibilityHandler} from '../../services/video';
import * as ejs from '../../utils/emulatorjs';
import {gameStateKey, loadGameStateWithMigration} from '../../utils/gameSaves';
import {KEYS, isBackKey} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from '../Details/detailIcons';

import css from './GamePlayer.module.less';

const SpottableRow = Spottable('div');
const OverlayContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// The longest Exit waits on the save before leaving anyway. The upload keeps going after the
// player closes.
const EXIT_SAVE_TIMEOUT = 3000;

// What the remote means on the controller screen. Left to EmulatorJS, these keys would be recorded
// as keyboard bindings.
const CONTROL_KEYS = {
	[KEYS.UP]: 'DPAD_UP',
	[KEYS.DOWN]: 'DPAD_DOWN',
	[KEYS.LEFT]: 'DPAD_LEFT',
	[KEYS.RIGHT]: 'DPAD_RIGHT',
	[KEYS.ENTER]: 'BUTTON_2'
};

// Standard Gamepad API buttons, the layout browsers report pads in.
const PAD = {CONFIRM: 0, CANCEL: 1, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15};
const PAD_KEYS = {
	[PAD.UP]: KEYS.UP,
	[PAD.DOWN]: KEYS.DOWN,
	[PAD.LEFT]: KEYS.LEFT,
	[PAD.RIGHT]: KEYS.RIGHT,
	[PAD.CONFIRM]: KEYS.ENTER
};

// How long Start and Select have to be held together to open the pause menu.
const MENU_COMBO_HOLD = 5000;

// Sends a remote key through the path the remote takes, so a gamepad moves and selects in the
// menus exactly like it.
const pressKey = (keyCode) => {
	const target = document.activeElement || document.body;
	['keydown', 'keyup'].forEach((type) => {
		const ev = new window.KeyboardEvent(type, {bubbles: true, cancelable: true});
		Object.defineProperty(ev, 'keyCode', {get: () => keyCode});
		Object.defineProperty(ev, 'which', {get: () => keyCode});
		target.dispatchEvent(ev);
	});
};

const focusSoon = (spotlightId) => setTimeout(() => Spotlight.focus(spotlightId), 0);

// Sends focus to a fixed row instead of wherever Spotlight would move it.
const jumpTo = (ev, spotlightId) => {
	ev.stopPropagation();
	Spotlight.focus(spotlightId);
};

const choiceIndex = (opt) => Math.max(0, opt.choices.findIndex((c) => c.value === opt.current));

const Icon = ({path, className}) => (
	<svg className={className} viewBox={iconViewBox(path)} fill="currentColor">
		<path d={path} />
	</svg>
);

// Left and right step through the values and stop at either end. OK opens the full list.
const SettingRow = memo(({opt, index, onStep, onOpen, onWrapDown}) => {
	const current = choiceIndex(opt);
	const prev = useCallback(() => onStep(opt, -1), [onStep, opt]);
	const next = useCallback(() => onStep(opt, 1), [onStep, opt]);
	const open = useCallback(() => onOpen(index), [onOpen, index]);
	return (
		<SpottableRow
			spotlightId={`game-setting-${index}`}
			className={css.settingRow}
			onClick={open}
			onSpotlightLeft={prev}
			onSpotlightRight={next}
			onSpotlightDown={onWrapDown}
		>
			<span className={css.settingLabel}>{opt.label}</span>
			<Icon className={current > 0 ? css.chevron : css.chevronOff} path={GAME_ICON_PATHS.chevronLeft} />
			<span className={css.settingValue}>{opt.choices[current].label}</span>
			<Icon className={current < opt.choices.length - 1 ? css.chevron : css.chevronOff} path={GAME_ICON_PATHS.chevronRight} />
		</SpottableRow>
	);
});

const HoldIndicator = () => (
	<div className={css.holdPill}>
		<svg className={css.holdRing} viewBox="0 0 20 20">
			<circle cx="10" cy="10" r="8" />
		</svg>
		{$L('Hold to open menu')}
	</div>
);

const ListPanel = ({header, children}) => (
	<div className={css.scrim}>
		<OverlayContainer className={`${css.panel} ${css.listPanel}`}>
			<div className={css.panelHeader}>{header}</div>
			<div className={css.panelBody}>{children}</div>
		</OverlayContainer>
	</div>
);

const ChoiceRow = memo(({choice, index, current, onPick, onWrapUp, onWrapDown}) => {
	const pick = useCallback(() => onPick(index), [onPick, index]);
	return (
		<SpottableRow
			spotlightId={`game-choice-${index}`}
			className={css.settingRow}
			onClick={pick}
			onSpotlightUp={onWrapUp}
			onSpotlightDown={onWrapDown}
		>
			<span className={css.settingLabel}>{choice.label}</span>
			{current ? <Icon className={css.check} path={GAME_ICON_PATHS.check} /> : null}
		</SpottableRow>
	);
});

const GamePlayer = ({library, game, startFresh, onBack, backHandlerRef}) => {
	const [ready, setReady] = useState(false);
	const [error, setError] = useState(null);
	const [unsupported, setUnsupported] = useState(false);
	const [overlayOpen, setOverlayOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [options, setOptions] = useState([]);
	const [pickerIndex, setPickerIndex] = useState(null);
	const [fastForward, setFastForward] = useState(false);
	const [hasSave, setHasSave] = useState(false);
	const [confirmingExit, setConfirmingExit] = useState(false);
	const [controlsOpen, setControlsOpen] = useState(false);
	const [comboActive, setComboActive] = useState(false);
	const [toast, setToast] = useState(null);

	const blobs = useRef([]);
	const exiting = useRef(false);
	const padHeld = useRef({start: false, select: false});
	const comboTimer = useRef(null);
	const stateRef = useRef({overlayOpen: false, settingsOpen: false});
	stateRef.current = {overlayOpen, settingsOpen, pickerOpen: pickerIndex !== null, controlsOpen, confirmingExit, error, unsupported};

	const showMessage = useCallback((message) => setToast({message, key: Date.now()}), []);

	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timer);
	}, [toast]);

	// Fire-and-forget state upload for paths that can't await, like unmount and backgrounding.
	const flushState = useCallback(() => {
		try {
			const bytes = ejs.getState();
			if (bytes && bytes.length) gamesApi.putStateBytes(gameStateKey(game.id, game.core), bytes).catch(() => {});
		} catch (e) { /* emulator never booted */ }
	}, [game]);

	useEffect(() => {
		if (!ejs.isSupported()) {
			setUnsupported(true);
			return undefined;
		}
		let cancelled = false;
		const libraryId = library?.Id;
		// Arcade cores find a game by its zip name, which EmulatorJS takes from the ROM URL, or
		// from the game name when the ROM is a Blob.
		const arcadeFileName = game.core === 'mame' || game.core === 'arcade' ? game.fileName : null;
		(async () => {
			try {
				const [rom, settingsJson, existing, dataPath] = await Promise.all([
					gamesApi.getRomUrl(libraryId, game.id, arcadeFileName),
					gamesApi.getSettingsBlob(),
					// Read on Restart too so Load state is still offered. A failed read counts as
					// no save instead of stopping the game.
					loadGameStateWithMigration(game.id, game.core).catch(() => null),
					gamesApi.getEmulatorDataPath()
				]);
				if (cancelled) return;
				const {url: romUrl, isBlob} = rom;
				if (isBlob) blobs.current.push(romUrl);
				let biosUrl;
				if (game.bios && game.bios.length) {
					biosUrl = await gamesApi.getBiosBlobUrl(libraryId, game.bios[0].id);
					if (cancelled) return;
					blobs.current.push(biosUrl);
				}
				setHasSave(existing != null);
				await ejs.startEmulator({
					selector: '#game',
					core: game.core,
					gameUrl: romUrl,
					biosUrl,
					gameName: isBlob && arcadeFileName ? arcadeFileName : game.title,
					settingsJson,
					stateBytes: startFresh ? null : existing,
					dataPath
				});
				if (cancelled) return;
				setReady(true);
			} catch (e) {
				// Backing out mid-load lands here too, and that is not worth reporting.
				if (cancelled) return;
				// EmulatorJS leaves its own error text up, which would sit under this message.
				ejs.destroyEmulator();
				serverLogger.error(serverLogger.LOG_CATEGORIES.APP, '[Games] could not start game', {
					core: game.core,
					system: game.system,
					status: e.status || null,
					totalBytes: e.totalBytes || null,
					message: e.message || String(e)
				}, false);
				if (e.romTooLarge) setError($L('This game is too large to run on this TV.'));
				else setError(e.status === 404 ? $L('Game file not found.') : $L('Could not start this game on this device.'));
			}
		})();
		return () => {
			cancelled = true;
			// Best-effort save on unmount, skipped when the Exit action already saved.
			if (!exiting.current) {
				flushState();
				gamesApi.putSettingsBlob(ejs.getSettingsJson());
			}
			ejs.destroyEmulator();
			blobs.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e2) { /* ignore */ } });
			blobs.current = [];
		};
	}, [library, game, startFresh, flushState]);

	// True only when a state reached the server. A game with nothing to save yet gives false, and
	// a failed upload throws so the caller can say so.
	const saveState = useCallback(async () => {
		let bytes = null;
		try { bytes = ejs.getState(); } catch (e) { /* no game loaded yet */ }
		if (!bytes || !bytes.length) return false;
		await gamesApi.putStateBytes(gameStateKey(game.id, game.core), bytes);
		setHasSave(true);
		return true;
	}, [game]);

	const exit = useCallback(async ({stateSaved = false} = {}) => {
		if (exiting.current) return;
		exiting.current = true;
		const persist = async () => {
			if (!stateSaved) await saveState();
			await gamesApi.putSettingsBlob(ejs.getSettingsJson());
		};
		let timer;
		const cap = new Promise((resolve) => { timer = setTimeout(resolve, EXIT_SAVE_TIMEOUT); });
		try {
			await Promise.race([persist(), cap]);
		} catch (e) { /* leaving either way */ }
		clearTimeout(timer);
		if (onBack) onBack();
	}, [saveState, onBack]);

	// While playing, Spotlight is paused so the arrow/OK keys reach EmulatorJS instead of moving
	// focus; it resumes only while the overlay is open.
	const openOverlay = useCallback(() => {
		clearTimeout(comboTimer.current);
		comboTimer.current = null;
		setComboActive(false);
		ejs.setPaused(true);
		Spotlight.resume();
		setOverlayOpen(true);
		focusSoon('game-overlay-first');
	}, []);
	const closeOverlay = useCallback(() => {
		setOverlayOpen(false);
		setSettingsOpen(false);
		setPickerIndex(null);
		setConfirmingExit(false);
		Spotlight.pause();
		ejs.setPaused(false);
	}, []);

	// The game stays paused behind the controller screen, like it does behind the pause menu.
	const openControllerSettings = useCallback(() => {
		if (!ejs.openControls()) {
			showMessage($L('Could not reach the game to open controller settings.'));
			return;
		}
		setOverlayOpen(false);
		setConfirmingExit(false);
		Spotlight.pause();
		setControlsOpen(true);
	}, [showMessage]);

	// Back returns to the pause menu. The screen's own Close goes straight back to the game.
	const closeControls = useCallback((reason) => {
		setControlsOpen(false);
		if (reason === 'back') openOverlay();
		else ejs.setPaused(false);
	}, [openOverlay]);

	const cancelExitConfirmation = useCallback(() => {
		setConfirmingExit(false);
		focusSoon('game-overlay-first');
	}, []);

	const closeSettings = useCallback(() => {
		setPickerIndex(null);
		setSettingsOpen(false);
		focusSoon('game-overlay-settings');
	}, []);

	const closePicker = useCallback(() => {
		focusSoon(`game-setting-${pickerIndex}`);
		setPickerIndex(null);
	}, [pickerIndex]);

	// BACK toggles the overlay (a TV remote has no Start/Select); Exit lives in the overlay.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			const s = stateRef.current;
			if (s.unsupported) { /* the unsupported dialog dismisses itself on BACK */ }
			else if (s.error) { if (onBack) onBack(); }
			else if (s.confirmingExit) { cancelExitConfirmation(); }
			else if (s.pickerOpen) { closePicker(); }
			else if (s.controlsOpen) {
				const reason = ejs.controlInput('BACK');
				if (reason) closeControls(reason);
			}
			else if (s.settingsOpen) { closeSettings(); }
			else if (s.overlayOpen) { closeOverlay(); }
			else { openOverlay(); }
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, openOverlay, closeOverlay, cancelExitConfirmation, closePicker, closeControls, closeSettings, onBack]);

	// Arrows and OK drive the controller screen, and they and Back never reach EmulatorJS. This runs
	// in capture so it gets there first. Back itself still goes through the handler above.
	useEffect(() => {
		if (!controlsOpen) return undefined;
		const onKey = (ev) => {
			const label = CONTROL_KEYS[ev.keyCode];
			if (!label && !isBackKey(ev)) return;
			ev.preventDefault();
			ev.stopPropagation();
			if (!label || ev.type !== 'keydown') return;
			const reason = ejs.controlInput(label);
			if (reason) closeControls(reason);
		};
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('keyup', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('keyup', onKey, true);
		};
	}, [controlsOpen, closeControls]);

	const updateCombo = useCallback(() => {
		const s = stateRef.current;
		const active = padHeld.current.start && padHeld.current.select && !s.overlayOpen && !s.settingsOpen && !s.controlsOpen;
		setComboActive(active);
		if (!active) {
			clearTimeout(comboTimer.current);
			comboTimer.current = null;
		} else if (!comboTimer.current) {
			comboTimer.current = setTimeout(() => {
				comboTimer.current = null;
				openOverlay();
			}, MENU_COMBO_HOLD);
		}
	}, [openOverlay]);

	useEffect(() => () => clearTimeout(comboTimer.current), []);

	// In the game and on the controller screen EmulatorJS reads the pad itself, so only the menus
	// take it from here.
	const onPadButton = useCallback((index, pressed) => {
		if (index === PAD.START || index === PAD.SELECT) {
			padHeld.current[index === PAD.START ? 'start' : 'select'] = pressed;
			updateCombo();
		}
		const s = stateRef.current;
		if (!pressed || s.controlsOpen || !(s.overlayOpen || s.settingsOpen)) return;
		if (index === PAD.CANCEL) {
			if (s.pickerOpen) closePicker();
			else if (s.settingsOpen) closeSettings();
			else closeOverlay();
		} else if (PAD_KEYS[index]) {
			pressKey(PAD_KEYS[index]);
		}
	}, [updateCombo, closePicker, closeSettings, closeOverlay]);

	useGamepadButtons(onPadButton);

	// Pause Spotlight once the game is running (resumed by the overlay).
	useEffect(() => {
		if (ready) Spotlight.pause();
		return () => Spotlight.resume();
	}, [ready]);

	// Keep the TV screen awake while the game runs. initVideo() loads the platform module
	// first, since keepScreenOn throws before it loads.
	useEffect(() => {
		if (!ready) return undefined;
		let released = false;
		initVideo().then(() => { if (!released) return keepScreenOn(true); }).catch(() => {});
		return () => {
			released = true;
			try { keepScreenOn(false); } catch (e) { /* impl never loaded */ }
		};
	}, [ready]);

	// Pause the emulator when the app is backgrounded and save defensively, since Tizen
	// may kill backgrounded apps.
	useEffect(() => {
		if (!ready) return undefined;
		let remove;
		initVideo().then(() => {
			remove = setupVisibilityHandler(
				() => {
					ejs.setPaused(true);
					flushState();
				},
				() => {
					const s = stateRef.current;
					if (!s.overlayOpen && !s.settingsOpen && !s.controlsOpen && !s.error) ejs.setPaused(false);
				}
			);
		}).catch(() => {});
		return () => { if (remove) remove(); };
	}, [ready, flushState]);

	const openSettings = useCallback(() => {
		const list = ejs.getOptions();
		setOptions(list);
		setSettingsOpen(true);
		focusSoon(list.length ? 'game-setting-0' : 'game-settings-close');
	}, []);

	const setChoice = useCallback((opt, index) => {
		const value = opt.choices[index].value;
		ejs.setOption(opt.id, value);
		setOptions((prev) => prev.map((o) => (o.id === opt.id ? {...o, current: value} : o)));
	}, []);

	const stepOption = useCallback((opt, dir) => {
		const current = choiceIndex(opt);
		const next = Math.min(opt.choices.length - 1, Math.max(0, current + dir));
		if (next !== current) setChoice(opt, next);
	}, [setChoice]);

	const openPicker = useCallback((index) => {
		setPickerIndex(index);
		focusSoon(`game-choice-${choiceIndex(options[index])}`);
	}, [options]);

	const pickChoice = useCallback((index) => {
		setChoice(options[pickerIndex], index);
		closePicker();
	}, [options, pickerIndex, setChoice, closePicker]);

	// Up and down wrap around each list, and the close button counts as the top of the settings.
	const lastSetting = options.length - 1;
	const wrapToClose = useCallback((ev) => jumpTo(ev, 'game-settings-close'), []);
	const closeUp = useCallback((ev) => {
		if (lastSetting >= 0) jumpTo(ev, `game-setting-${lastSetting}`);
	}, [lastSetting]);
	const closeDown = useCallback((ev) => {
		if (lastSetting >= 0) jumpTo(ev, 'game-setting-0');
	}, [lastSetting]);
	const pickerOption = pickerIndex === null ? null : options[pickerIndex];
	const pickerCurrent = pickerOption ? choiceIndex(pickerOption) : -1;
	const lastChoice = pickerOption ? pickerOption.choices.length - 1 : 0;
	const wrapToLastChoice = useCallback((ev) => jumpTo(ev, `game-choice-${lastChoice}`), [lastChoice]);
	const wrapToFirstChoice = useCallback((ev) => jumpTo(ev, 'game-choice-0'), []);

	const toggleFF = useCallback(() => {
		setFastForward((prev) => { ejs.toggleFastForward(!prev); return !prev; });
	}, []);

	const runAndClose = useCallback(async (action, failure) => {
		try {
			await action();
		} catch (e) {
			showMessage(failure);
		}
		closeOverlay();
	}, [showMessage, closeOverlay]);

	const loadSave = useCallback(async () => {
		const bytes = await loadGameStateWithMigration(game.id, game.core);
		if (bytes) ejs.loadState(bytes);
	}, [game]);

	// A game that never got going has nothing to lose, so it leaves without asking.
	const requestExit = useCallback(() => {
		if (error || !ready) {
			exit();
			return;
		}
		setConfirmingExit(true);
		focusSoon('game-overlay-first');
	}, [error, ready, exit]);

	// Leaves only once the state is stored. Leaving on a failed save is what the confirmation is
	// there to prevent, so the game stays and says so.
	const saveAndExit = useCallback(async () => {
		const saved = await saveState().catch(() => false);
		if (saved) exit({stateSaved: true});
		else showMessage($L('Could not save state. Still playing.'));
	}, [saveState, exit, showMessage]);

	// Back comes first so the highlight a confirmation opens on can't end the game. It returns
	// to the pause menu, which stays paused.
	const actions = confirmingExit ? [
		{label: $L('Back'), icon: GAME_ICON_PATHS.arrowBack, fn: cancelExitConfirmation},
		{label: $L('Save & exit'), icon: GAME_ICON_PATHS.save, fn: saveAndExit},
		{label: $L('Exit'), icon: GAME_ICON_PATHS.close, fn: () => exit(), danger: true}
	] : [
		{label: $L('Resume'), icon: DETAIL_ICON_PATHS.play, fn: closeOverlay},
		{label: $L('Save state'), icon: GAME_ICON_PATHS.save, fn: () => runAndClose(saveState, $L('Could not save state.'))},
		hasSave ? {label: $L('Load state'), icon: GAME_ICON_PATHS.download, fn: () => runAndClose(loadSave, $L('Could not load state.'))} : null,
		{label: $L('Restart'), icon: GAME_ICON_PATHS.refresh, fn: () => runAndClose(ejs.restart, $L('Could not restart.'))},
		{label: $L('Fast-forward'), icon: GAME_ICON_PATHS.fastForward, trailing: fastForward ? $L('On') : $L('Off'), fn: toggleFF},
		{label: $L('Controller settings'), icon: GAME_ICON_PATHS.gamepad, fn: openControllerSettings},
		{label: $L('Emulator settings'), icon: GAME_ICON_PATHS.tune, fn: openSettings, spotlightId: 'game-overlay-settings'},
		{label: $L('Exit'), icon: GAME_ICON_PATHS.close, fn: requestExit, danger: true}
	].filter(Boolean);

	return (
		<div className={css.root}>
			<div id="game" className={css.game} />
			{!ready && !error && !unsupported ? <div className={css.center}><LoadingSpinner /></div> : null}
			{error ? <div className={css.center}><div className={css.message}>{error}</div></div> : null}
			<AdminMessageDialog
				open={unsupported}
				title={$L('Games')}
				message={unsupported ? ejs.unsupportedMessage() : null}
				onDismiss={onBack}
			/>

			{overlayOpen && !settingsOpen ? (
				<div className={css.scrim}>
					<OverlayContainer className={css.panel}>
						<div className={css.panelTitle}>
							{game.title}
							<div className={css.panelSubtitle}>{$L('Paused')}</div>
						</div>
						{actions.map((a, i) => (
							<SpottableRow
								key={a.label}
								spotlightId={i === 0 ? 'game-overlay-first' : a.spotlightId}
								className={a.danger ? `${css.row} ${css.danger}` : css.row}
								onClick={a.fn}
							>
								<Icon className={css.rowIcon} path={a.icon} />
								{a.label}
								{a.trailing ? <span className={css.trailing}>{a.trailing}</span> : null}
							</SpottableRow>
						))}
					</OverlayContainer>
				</div>
			) : null}

			{settingsOpen && pickerOption ? (
				<ListPanel
					header={<>
						{/* Pointer only, like Core's. The remote's Back does the same. */}
						<div className={css.headerButton} onClick={closePicker}>
							<Icon className={css.headerIcon} path={GAME_ICON_PATHS.arrowBack} />
						</div>
						<div className={css.panelTitle}>{pickerOption.label}</div>
					</>}
				>
					{pickerOption.choices.map((c, i) => (
						<ChoiceRow
							key={c.value}
							choice={c}
							index={i}
							current={i === pickerCurrent}
							onPick={pickChoice}
							onWrapUp={i === 0 ? wrapToLastChoice : undefined}
							onWrapDown={i === lastChoice ? wrapToFirstChoice : undefined}
						/>
					))}
				</ListPanel>
			) : settingsOpen ? (
				<ListPanel
					header={<>
						<div className={css.panelTitle}>{$L('Emulator settings')}</div>
						<SpottableRow
							spotlightId="game-settings-close"
							className={css.headerButton}
							aria-label={$L('Close')}
							onClick={closeSettings}
							onSpotlightUp={closeUp}
							onSpotlightDown={closeDown}
						>
							<Icon className={css.headerIcon} path={GAME_ICON_PATHS.close} />
						</SpottableRow>
					</>}
				>
					{options.length === 0 ? (
						<div className={css.empty}>{$L('This core has no adjustable options.')}</div>
					) : options.map((opt, i) => (
						<SettingRow
							key={opt.id}
							opt={opt}
							index={i}
							onStep={stepOption}
							onOpen={openPicker}
							onWrapDown={i === lastSetting ? wrapToClose : undefined}
						/>
					))}
				</ListPanel>
			) : null}

			{comboActive ? <HoldIndicator /> : null}

			{toast ? <div key={toast.key} className={css.toast}>{toast.message}</div> : null}
		</div>
	);
};

export default GamePlayer;
