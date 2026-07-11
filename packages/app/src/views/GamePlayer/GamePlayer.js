import {memo, useState, useEffect, useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import LoadingSpinner from '../../components/LoadingSpinner';
import * as gamesApi from '../../services/gamesApi';
import {initVideo, keepScreenOn, setupVisibilityHandler} from '../../services/video';
import * as ejs from '../../utils/emulatorjs';

import css from './GamePlayer.module.less';

const SpottableRow = Spottable('div');
const OverlayContainer = SpotlightContainerDecorator({enterTo: 'default-element', restrict: 'self-only'}, 'div');

// One emulator-setting row. OK / right cycles the value forward, left cycles back.
const SettingRow = memo(({opt, first, onChange}) => {
	const cur = opt.choices.find((c) => c.value === opt.current);
	const next = useCallback(() => onChange(opt, 1), [onChange, opt]);
	const prev = useCallback(() => onChange(opt, -1), [onChange, opt]);
	return (
		<SpottableRow
			spotlightId={first ? 'game-setting-0' : undefined}
			className={css.settingRow}
			onClick={next}
			onSpotlightLeft={prev}
			onSpotlightRight={next}
		>
			<span className={css.settingLabel}>{opt.label}</span>
			<span className={css.settingValue}>{cur ? cur.label : opt.current}</span>
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
	const [fastForward, setFastForward] = useState(false);
	const [hasSave, setHasSave] = useState(false);

	const blobs = useRef([]);
	const exiting = useRef(false);
	const stateRef = useRef({overlayOpen: false, settingsOpen: false});
	stateRef.current = {overlayOpen, settingsOpen, error, unsupported};

	// Fire-and-forget state upload for paths that can't await, like unmount and backgrounding.
	const flushState = useCallback(() => {
		try {
			const bytes = ejs.getState();
			if (bytes && bytes.length) gamesApi.putStateBytes(game.id, bytes).catch(() => {});
		} catch (e) { /* emulator never booted */ }
	}, [game]);

	useEffect(() => {
		if (!ejs.isSupported()) {
			setUnsupported(true);
			return undefined;
		}
		let cancelled = false;
		const libraryId = library?.Id;
		(async () => {
			try {
				const [romUrl, settingsJson, existing] = await Promise.all([
					gamesApi.getRomBlobUrl(libraryId, game.id),
					gamesApi.getSettingsBlob(),
					startFresh ? Promise.resolve(null) : gamesApi.getStateBytes(game.id)
				]);
				if (cancelled) return;
				blobs.current.push(romUrl);
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
					gameName: game.title,
					settingsJson
				});
				if (cancelled) return;
				if (existing) { try { ejs.loadState(existing); } catch (e) { /* ignore */ } }
				setReady(true);
			} catch (e) {
				if (!cancelled) setError(e.status === 404 ? $L('Game file not found.') : $L('Could not start this game on this device.'));
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

	const saveState = useCallback(async () => {
		try {
			const bytes = ejs.getState();
			if (bytes && bytes.length) { await gamesApi.putStateBytes(game.id, bytes); setHasSave(true); }
		} catch (e) { /* ignore */ }
	}, [game]);

	const exit = useCallback(async () => {
		if (exiting.current) return;
		exiting.current = true;
		await saveState();
		try { gamesApi.putSettingsBlob(ejs.getSettingsJson()); } catch (e) { /* ignore */ }
		if (onBack) onBack();
	}, [saveState, onBack]);

	// While playing, Spotlight is paused so the arrow/OK keys reach EmulatorJS instead of moving
	// focus; it resumes only while the overlay is open.
	const openOverlay = useCallback(() => {
		ejs.setPaused(true);
		Spotlight.resume();
		setOverlayOpen(true);
		setTimeout(() => Spotlight.focus('game-overlay-first'), 0);
	}, []);
	const closeOverlay = useCallback(() => {
		setOverlayOpen(false);
		setSettingsOpen(false);
		Spotlight.pause();
		ejs.setPaused(false);
	}, []);

	// BACK toggles the overlay (a TV remote has no Start/Select); Exit lives in the overlay.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => {
			const s = stateRef.current;
			if (s.unsupported) { /* the unsupported dialog dismisses itself on BACK */ }
			else if (s.error) { if (onBack) onBack(); }
			else if (s.settingsOpen) { setSettingsOpen(false); setTimeout(() => Spotlight.focus('game-overlay-first'), 0); }
			else if (s.overlayOpen) { closeOverlay(); }
			else { openOverlay(); }
			return true;
		};
		return () => { backHandlerRef.current = null; };
	}, [backHandlerRef, openOverlay, closeOverlay, onBack]);

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
					if (!s.overlayOpen && !s.settingsOpen && !s.error) ejs.setPaused(false);
				}
			);
		}).catch(() => {});
		return () => { if (remove) remove(); };
	}, [ready, flushState]);

	const openSettings = useCallback(() => {
		setOptions(ejs.getOptions());
		setSettingsOpen(true);
		setTimeout(() => Spotlight.focus('game-setting-0'), 0);
	}, []);

	const changeOption = useCallback((opt, dir) => {
		const idx = opt.choices.findIndex((c) => c.value === opt.current);
		const next = ((idx < 0 ? 0 : idx) + dir + opt.choices.length) % opt.choices.length;
		const value = opt.choices[next].value;
		ejs.setOption(opt.id, value);
		setOptions((prev) => prev.map((o) => (o.id === opt.id ? {...o, current: value} : o)));
	}, []);

	const toggleFF = useCallback(() => {
		setFastForward((prev) => { ejs.toggleFastForward(!prev); return !prev; });
	}, []);

	const loadSave = useCallback(async () => {
		const bytes = await gamesApi.getStateBytes(game.id);
		if (bytes) ejs.loadState(bytes);
		closeOverlay();
	}, [game, closeOverlay]);

	const actions = [
		{label: $L('Resume'), fn: closeOverlay},
		{label: $L('Save state'), fn: async () => { await saveState(); closeOverlay(); }},
		hasSave ? {label: $L('Load state'), fn: loadSave} : null,
		{label: $L('Restart'), fn: () => { ejs.restart(); closeOverlay(); }},
		{label: `${$L('Fast-forward')}  ${fastForward ? $L('On') : $L('Off')}`, fn: toggleFF},
		{label: $L('Emulator settings'), fn: openSettings},
		{label: $L('Exit'), fn: exit, danger: true}
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
						<div className={css.panelTitle}>{game.title}</div>
						{actions.map((a, i) => (
							<SpottableRow
								key={a.label}
								spotlightId={i === 0 ? 'game-overlay-first' : undefined}
								className={a.danger ? `${css.row} ${css.danger}` : css.row}
								onClick={a.fn}
							>
								{a.label}
							</SpottableRow>
						))}
					</OverlayContainer>
				</div>
			) : null}

			{settingsOpen ? (
				<div className={css.scrim}>
					<OverlayContainer className={css.panel}>
						<div className={css.panelTitle}>{$L('Emulator settings')}</div>
						{options.length === 0 ? (
							<div className={css.empty}>{$L('This core has no adjustable options.')}</div>
						) : options.map((opt, i) => (
							<SettingRow key={opt.id} opt={opt} first={i === 0} onChange={changeOption} />
						))}
					</OverlayContainer>
				</div>
			) : null}
		</div>
	);
};

export default GamePlayer;
