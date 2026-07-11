import {useState, useEffect, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Scroller from '@enact/sandstone/Scroller';

import GameCard from '../../components/GameCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import * as gamesApi from '../../services/gamesApi';

import css from './Games.module.less';

const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const Games = ({library, onSelectGame, onHome, backHandlerRef}) => {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [systems, setSystems] = useState([]);
	const [gamesBySystem, setGamesBySystem] = useState({});

	const libraryId = library?.Id;

	useEffect(() => {
		let cancelled = false;
		if (!libraryId) return undefined;
		setLoading(true);
		Promise.all([gamesApi.getSystems(libraryId), gamesApi.getGames(libraryId)])
			.then(([sys, all]) => {
				if (cancelled) return;
				const grouped = {};
				(all || []).forEach((g) => {
					if (!grouped[g.system]) grouped[g.system] = [];
					grouped[g.system].push(g);
				});
				setSystems(sys || []);
				setGamesBySystem(grouped);
				setLoading(false);
			})
			.catch((e) => {
				if (cancelled) return;
				setError(e.message || $L('Failed to load games'));
				setLoading(false);
			});
		return () => { cancelled = true; };
	}, [libraryId]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => { if (onHome) onHome(); return true; };
		return () => { backHandlerRef.current = null; };
	}, [backHandlerRef, onHome]);

	useEffect(() => {
		if (!loading && systems.length) {
			setTimeout(() => Spotlight.focus('games-first-card'), 0);
		}
	}, [loading, systems.length]);

	const handleSelect = useCallback((game) => onSelectGame && onSelectGame(library, game), [onSelectGame, library]);

	if (loading) {
		return <div className={css.center}><LoadingSpinner /></div>;
	}
	if (error) {
		return <div className={css.center}><div className={css.message}>{error}</div></div>;
	}

	const rows = systems.filter((s) => (gamesBySystem[s.id] || []).length > 0);
	if (!rows.length) {
		return <div className={css.center}><div className={css.message}>{$L('No games found.')}</div></div>;
	}

	let firstCard = true;
	return (
		<div className={css.root}>
			<h1 className={css.heading}>{library?.Name || $L('Games')}</h1>
			<Scroller className={css.scroller} focusableScrollbar="byEnter">
				{rows.map((system) => {
					const games = gamesBySystem[system.id] || [];
					return (
						<div key={system.id} className={css.section}>
							<div className={css.sectionHeader}>
								<span className={css.sectionTitle}>{system.name}</span>
								<span className={css.sectionCount}>{games.length}</span>
							</div>
							<RowContainer className={css.row}>
								{games.map((game) => {
									const isFirst = firstCard;
									firstCard = false;
									return (
										<GameCard
											key={game.id}
											game={game}
											spotlightId={isFirst ? 'games-first-card' : undefined}
											onSelect={handleSelect}
										/>
									);
								})}
							</RowContainer>
						</div>
					);
				})}
			</Scroller>
		</div>
	);
};

export default Games;
