import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import GameCard from '../../components/GameCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import TrackOptionRow, {TrackDivider} from '../../components/TrackOptionRow';
import {GAME_ICON_PATHS} from '../../components/icons/gameIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import * as gamesApi from '../../services/gamesApi';
import {isSupported, needsThreads, unsupportedMessage} from '../../utils/emulatorjs';
import {gameDisplayTitle, gameFallbackColor} from '../../utils/gameArt';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import {ModalContainer} from '../../utils/spotlightContainers';
import {DETAIL_ICON_PATHS} from '../Details/detailIcons';
import {coreChoices, coreLabel} from './coreChoices';

import css from './GameDetails.module.less';

// Adds a class to the Sandstone button's background layer, which is where its fill is drawn.
const CORE_BUTTON_CSS = {bg: css.coreBg};

const focusCoreButton = () => setTimeout(() => Spotlight.focus('game-core-btn'), 0);

const metaLine = (game) => [
	game.system,
	game.year,
	game.genre,
	game.players ? (game.players === 1 ? $L('1 player') : $L('{count} players').replace('{count}', game.players)) : null
].filter(Boolean).join('  ·  ');

const ButtonIcon = ({path}) => (
	<svg className={css.buttonIcon} viewBox={iconViewBox(path)} fill="currentColor">
		<path d={path} />
	</svg>
);

const primaryAction = (saveReadiness) => {
	if (saveReadiness === 'checking') return {icon: GAME_ICON_PATHS.hourglassTop, label: $L('Checking for save…')};
	if (saveReadiness === 'failed') return {icon: GAME_ICON_PATHS.refresh, label: $L('Retry save check')};
	return {icon: DETAIL_ICON_PATHS.play, label: saveReadiness === 'available' ? $L('Continue') : $L('Play')};
};

const GameDetails = ({library, gameId, initialGame, onPlay, onSelectGame, backHandlerRef}) => {
	const [game, setGame] = useState(initialGame || null);
	const [loading, setLoading] = useState(!initialGame);
	// Play waits for a definite answer, since booting fresh after a failed read would overwrite
	// the save on exit.
	const [saveReadiness, setSaveReadiness] = useState('checking');
	const saveCheck = useRef(0);
	const [related, setRelated] = useState([]);
	// Why this game can't run here, shown in place of starting it.
	const [unsupported, setUnsupported] = useState(null);
	const [corePickerOpen, setCorePickerOpen] = useState(false);
	const [toast, setToast] = useState(null);
	const currentGameId = useRef(gameId);
	currentGameId.current = gameId;

	const libraryId = library?.Id;
	const choices = useMemo(() => coreChoices(game), [game]);

	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timer);
	}, [toast]);

	const checkSave = useCallback((g) => {
		const generation = ++saveCheck.current;
		const current = () => saveCheck.current === generation;
		setSaveReadiness('checking');
		loadGameStateWithMigration(g.id, g.core)
			.then((b) => { if (current()) setSaveReadiness(b ? 'available' : 'absent'); })
			.catch(() => { if (current()) setSaveReadiness('failed'); })
			.then(() => { if (current()) setTimeout(() => Spotlight.focus('game-play-btn'), 0); });
	}, []);

	useEffect(() => {
		let cancelled = false;
		if (!libraryId || !gameId) return undefined;
		// Drops a check still running for the previous game.
		saveCheck.current++;
		setSaveReadiness('checking');
		gamesApi.getGame(libraryId, gameId).then((g) => {
			if (cancelled) return;
			setGame(g);
			setLoading(false);
			if (g) {
				checkSave(g);
				gamesApi.getGames(libraryId, g.system).then((all) => {
					if (cancelled) return;
					setRelated((all || []).filter((x) => x.id !== g.id).slice(0, 20));
				});
			}
		}).catch(() => {
			if (cancelled) return;
			setLoading(false);
			// The summary still has the id and core the save key needs.
			if (initialGame) checkSave(initialGame);
		});
		return () => { cancelled = true; };
	}, [libraryId, gameId, initialGame, checkSave]);

	const openCorePicker = useCallback(() => {
		setCorePickerOpen(true);
		setTimeout(() => Spotlight.focus('game-core-modal'), 0);
	}, []);
	const closeCorePicker = useCallback(() => {
		setCorePickerOpen(false);
		focusCoreButton();
	}, []);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		// BACK closes the core picker first. While the unsupported dialog is open it handles BACK
		// itself, otherwise the app pops the panel.
		const handler = () => {
			if (!corePickerOpen) return unsupported !== null;
			closeCorePicker();
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, unsupported, corePickerOpen, closeCorePicker]);

	useEffect(() => {
		if (game) setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, [game]);

	const play = useCallback((fresh) => {
		if (saveReadiness !== 'absent' && saveReadiness !== 'available') return;
		if (!isSupported()) {
			setUnsupported(unsupportedMessage());
			return;
		}
		if (needsThreads(game.core)) {
			setUnsupported($L("PSP games can't run on this TV. The PSP emulator needs multithreading, which isn't available here."));
			return;
		}
		if (onPlay) onPlay(library, game, {fresh});
	}, [saveReadiness, onPlay, library, game]);
	const handlePrimary = useCallback(() => {
		if (saveReadiness === 'failed') checkSave(game);
		else play(false);
	}, [saveReadiness, checkSave, game, play]);
	const handleRestart = useCallback(() => play(true), [play]);
	const dismissUnsupported = useCallback(() => {
		setUnsupported(null);
		setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, []);
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);
	// The save key includes the core, so the save is checked again for the one picked.
	const pickCore = useCallback((e) => {
		const core = e.currentTarget.dataset.core;
		setCorePickerOpen(false);
		gamesApi.setGameCoreOverride(libraryId, game.id, core)
			.then((updated) => {
				if (!updated || updated.id !== currentGameId.current) return;
				setGame(updated);
				checkSave(updated);
			})
			.catch(() => {
				setToast({message: $L('Could not change the core.'), key: Date.now()});
				focusCoreButton();
			});
	}, [libraryId, game, checkSave]);
	const openRelated = useCallback((g) => onSelectGame && onSelectGame(library, g), [onSelectGame, library]);

	if (loading) return <div className={css.center}><LoadingSpinner /></div>;
	if (!game) return <div className={css.center}><div>{$L('Game not found.')}</div></div>;

	const backdrop = gamesApi.gameThumbUrl(libraryId, game.id, 'snap');
	const poster = gamesApi.gameThumbUrl(libraryId, game.id);
	const title = gameDisplayTitle(game.title, game.fileName);
	const primary = primaryAction(saveReadiness);

	return (
		<div className={css.root}>
			<div
				className={css.backdrop}
				style={backdrop ? {backgroundImage: `url(${backdrop})`} : {background: gameFallbackColor(game.id)}}
			/>
			<div className={css.scrim} />
			<div className={css.content}>
				<div
					className={css.poster}
					style={poster ? {backgroundImage: `url(${poster})`} : {background: gameFallbackColor(game.id)}}
				/>
				<div className={css.info}>
					<h1 className={css.title}>{title}</h1>
					<div className={css.meta}>{metaLine(game)}</div>
					{game.overview ? <div className={css.overview}>{game.overview}</div> : null}
					<div className={css.actions}>
						<Button
							spotlightId="game-play-btn"
							className={css.actionButton}
							disabled={saveReadiness === 'checking'}
							onClick={handlePrimary}
						>
							<ButtonIcon path={primary.icon} />
							{primary.label}
						</Button>
						{saveReadiness === 'available' ? (
							<Button className={css.actionButton} onClick={handleRestart}>
								<ButtonIcon path={GAME_ICON_PATHS.refresh} />
								{$L('Restart')}
							</Button>
						) : null}
						{choices.length > 1 ? (
							<Button
								spotlightId="game-core-btn"
								className={`${css.actionButton} ${css.coreButton}`}
								css={CORE_BUTTON_CSS}
								onClick={openCorePicker}
							>
								<ButtonIcon path={GAME_ICON_PATHS.memory} />
								{coreLabel(game.core)}
							</Button>
						) : null}
					</div>
				</div>
			</div>
			{related.length ? (
				<div className={css.related}>
					<div className={css.relatedTitle}>{$L('More in {system}').replace('{system}', game.system)}</div>
					<div className={css.relatedRow}>
						{related.map((g) => (
							<GameCard key={g.id} game={g} artUrl={gamesApi.gameThumbUrl(libraryId, g.id)} width={150} onSelect={openRelated} />
						))}
					</div>
				</div>
			) : null}
			{corePickerOpen ? (
				<div className={css.coreModal} onClick={closeCorePicker}>
					<ModalContainer className={css.coreModalPanel} onClick={stopPropagation} spotlightId="game-core-modal">
						<h2 className={css.coreModalTitle}>{$L('Choose core')}</h2>
						<div className={css.coreList}>
							{choices.map((choice) => (
								<TrackOptionRow
									key={choice.core}
									label={choice.label}
									detail={choice.detail}
									selected={choice.core === game.core}
									data-core={choice.core}
									onClick={pickCore}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeCorePicker} />
						</div>
					</ModalContainer>
				</div>
			) : null}
			{toast ? <div key={toast.key} className={css.toast}>{toast.message}</div> : null}
			<AdminMessageDialog
				open={unsupported !== null}
				title={$L('Games')}
				message={unsupported}
				onDismiss={dismissUnsupported}
			/>
		</div>
	);
};

export default GameDetails;
