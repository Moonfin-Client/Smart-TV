import {useState, useEffect, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import GameCard from '../../components/GameCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import * as gamesApi from '../../services/gamesApi';
import {isSupported, unsupportedMessage} from '../../utils/emulatorjs';
import {boxartUrl, snapUrl, titleScreenUrl, gameDisplayTitle, gameFallbackColor} from '../../utils/gameArt';

import css from './GameDetails.module.less';

const metaLine = (game) => [
	game.system,
	game.year,
	game.genre,
	game.players ? (game.players === 1 ? $L('1 player') : $L('{count} players').replace('{count}', game.players)) : null
].filter(Boolean).join('  ·  ');

const GameDetails = ({library, gameId, initialGame, onPlay, onSelectGame, backHandlerRef}) => {
	const [game, setGame] = useState(initialGame || null);
	const [loading, setLoading] = useState(!initialGame);
	const [hasSave, setHasSave] = useState(false);
	const [related, setRelated] = useState([]);
	const [showUnsupported, setShowUnsupported] = useState(false);

	const libraryId = library?.Id;

	useEffect(() => {
		let cancelled = false;
		if (!libraryId || !gameId) return undefined;
		gamesApi.getGame(libraryId, gameId).then((g) => {
			if (cancelled) return;
			setGame(g);
			setLoading(false);
			if (g) {
				gamesApi.getStateBytes(g.id).then((b) => { if (!cancelled) setHasSave(b != null); });
				gamesApi.getGames(libraryId, g.system).then((all) => {
					if (cancelled) return;
					setRelated((all || []).filter((x) => x.id !== g.id).slice(0, 20));
				});
			}
		}).catch(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [libraryId, gameId]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		// While the unsupported dialog is open it handles BACK itself, otherwise the app pops the panel.
		backHandlerRef.current = () => showUnsupported;
		return () => { backHandlerRef.current = null; };
	}, [backHandlerRef, showUnsupported]);

	useEffect(() => {
		if (game) setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, [game]);

	const play = useCallback((fresh) => {
		if (!isSupported()) {
			setShowUnsupported(true);
			return;
		}
		if (onPlay) onPlay(library, game, {fresh});
	}, [onPlay, library, game]);
	const handlePlay = useCallback(() => play(false), [play]);
	const handleRestart = useCallback(() => play(true), [play]);
	const dismissUnsupported = useCallback(() => {
		setShowUnsupported(false);
		setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, []);
	const openRelated = useCallback((g) => onSelectGame && onSelectGame(library, g), [onSelectGame, library]);

	if (loading) return <div className={css.center}><LoadingSpinner /></div>;
	if (!game) return <div className={css.center}><div>{$L('Game not found.')}</div></div>;

	const backdrop = snapUrl(game.core, game.fileName) || titleScreenUrl(game.core, game.fileName);
	const poster = boxartUrl(game.core, game.fileName);
	const title = gameDisplayTitle(game.title, game.fileName);

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
						<Button spotlightId="game-play-btn" onClick={handlePlay}>
							{hasSave ? $L('Continue') : $L('Play')}
						</Button>
						{hasSave ? (
							<Button onClick={handleRestart}>{$L('Restart')}</Button>
						) : null}
					</div>
				</div>
			</div>
			{related.length ? (
				<div className={css.related}>
					<div className={css.relatedTitle}>{$L('More in {system}').replace('{system}', game.system)}</div>
					<div className={css.relatedRow}>
						{related.map((g) => (
							<GameCard key={g.id} game={g} width={150} onSelect={openRelated} />
						))}
					</div>
				</div>
			) : null}
			<AdminMessageDialog
				open={showUnsupported}
				title={$L('Games')}
				message={showUnsupported ? unsupportedMessage() : null}
				onDismiss={dismissUnsupported}
			/>
		</div>
	);
};

export default GameDetails;
