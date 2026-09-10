import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';

import LoadingSpinner from '../../components/LoadingSpinner';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import BackdropLayer from '../../components/BackdropLayer';
import * as gamesApi from '../../services/gamesApi';
import {useSettings} from '../../context/SettingsContext';
import {gameDisplayTitle, gameFallbackColor, hideBrokenArt} from '../../utils/gameArt';
import {buildGameIndex, gameIndexMatches, gameQueryWords} from '../../utils/gameBrowse';
import {LETTERS, createGridKeyDown, createToolbarKeyDown, focusOverhang, horizontalCellPad} from '../../utils/gridChrome';
import {KEYS} from '../../utils/keys';

import css from './GameSystem.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

// The alphabet strip opens with an All button, which holds no letter.
const ALL_LETTER = '';
const ALPHA_LETTERS = [ALL_LETTER].concat(LETTERS);

// The inset the stylesheet keeps either side of the grid, both sides added up.
const GRID_INSET = 140;
// The least room a row leaves between two cards, which the two title lines need
// more of than a poster grid does.
const MIN_ROW_GAP = 10;
// A cover stands 1.34 times its own width, with the title underneath.
const CARD_WIDTH = 145;
const COVER_HEIGHT = Math.round(CARD_WIDTH * 1.34);
const CAPTION_HEIGHT = 70;
const CARD_HEIGHT = COVER_HEIGHT + CAPTION_HEIGHT;

// What the backdrop tries in turn.
const BACKDROP_KINDS = ['snap', 'title', 'boxart'];

const handleToolbarKeyDown = createToolbarKeyDown('game-grid', 'game-search');
const handleGridKeyDown = createGridKeyDown(css.grid, 'game-back-btn');

const GameSystem = ({library, system, onSelectGame, onBack, backHandlerRef}) => {
	const {settings} = useSettings();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [games, setGames] = useState([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [letter, setLetter] = useState(ALL_LETTER);
	const [focusedGame, setFocusedGame] = useState(null);
	const [detail, setDetail] = useState(null);
	const [backdropUrl, setBackdropUrl] = useState('');

	const libraryId = library?.Id;
	const systemId = system?.id;
	const detailRequestRef = useRef(0);
	const backdropsEnabled = settings?.showHomeBackdrop !== false && !settings?.hideBackdropsInLibraries;

	useEffect(() => {
		let cancelled = false;
		if (!libraryId || !systemId) {
			setLoading(false);
			return undefined;
		}
		setLoading(true);
		gamesApi.getGames(libraryId, systemId)
			.then((all) => {
				if (cancelled) return;
				setGames(all || []);
				setLoading(false);
			})
			.catch((e) => {
				if (cancelled) return;
				setError(e?.message || $L('Failed to load games'));
				setLoading(false);
			});
		return () => { cancelled = true; };
	}, [libraryId, systemId]);

	// Back leaves the search box first, then the screen.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			const active = document.activeElement;
			if (active && active.tagName === 'INPUT') {
				active.blur();
				Spotlight.focus('game-search');
				return true;
			}
			if (onBack) onBack();
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, onBack]);

	const indexed = useMemo(() => games.map((game) => {
		const title = gameDisplayTitle(game.title, game.fileName);
		return {game, title, index: buildGameIndex(title, game.fileName)};
	}), [games]);

	const visibleGames = useMemo(() => {
		const words = gameQueryWords(searchQuery);
		if (!words.length && !letter) return indexed;
		return indexed.filter((entry) => gameIndexMatches(entry.index, words, letter));
	}, [indexed, searchQuery, letter]);

	const visibleRef = useRef(visibleGames);
	visibleRef.current = visibleGames;

	useEffect(() => {
		if (!loading && visibleGames.length) {
			setTimeout(() => Spotlight.focus('game-grid'), 0);
		}
	}, [loading, visibleGames.length]);

	// The row under the title fills in from the full record, which only the
	// focused game is worth asking for.
	useEffect(() => {
		const gameId = focusedGame?.id;
		if (!libraryId || !gameId) {
			setDetail(null);
			return undefined;
		}
		const request = ++detailRequestRef.current;
		const id = setTimeout(() => {
			gamesApi.getGame(libraryId, gameId)
				.then((full) => {
					if (request === detailRequestRef.current) setDetail(full);
				})
				.catch(() => {
					if (request === detailRequestRef.current) setDetail(null);
				});
		}, 250);
		return () => clearTimeout(id);
	}, [libraryId, focusedGame]);

	// The screenshot stands in for a backdrop, falling back to the title screen
	// and then the cover, since not every rom set carries all three.
	useEffect(() => {
		const gameId = focusedGame?.id;
		if (!backdropsEnabled || !libraryId || !gameId) {
			setBackdropUrl('');
			return undefined;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			let attempt = 0;
			const probe = () => {
				if (cancelled || attempt >= BACKDROP_KINDS.length) return;
				const url = gamesApi.gameThumbUrl(libraryId, gameId, BACKDROP_KINDS[attempt]);
				const img = new window.Image();
				img.onload = () => { if (!cancelled) setBackdropUrl(url); };
				img.onerror = () => { attempt++; probe(); };
				img.src = url;
			};
			probe();
		}, 250);
		return () => { cancelled = true; clearTimeout(timer); };
	}, [backdropsEnabled, libraryId, focusedGame]);

	const handleSearchChange = useCallback((ev) => {
		setSearchQuery(ev.target.value);
		setLetter(ALL_LETTER);
	}, []);

	// Down out of the search lands on the back button rather than skipping over
	// the row into the grid.
	const handleSearchKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.DOWN) return;
		ev.preventDefault();
		ev.stopPropagation();
		Spotlight.focus('game-back-btn');
	}, []);

	const handleLetterSelect = useCallback((ev) => {
		setLetter(ev.currentTarget?.dataset?.letter || ALL_LETTER);
	}, []);

	const handleItemClick = useCallback((ev) => {
		const index = ev.currentTarget?.dataset?.index;
		if (index === undefined) return;
		const entry = visibleRef.current[parseInt(index, 10)];
		if (entry && onSelectGame) onSelectGame(library, entry.game);
	}, [onSelectGame, library]);

	const cellPadX = horizontalCellPad(CARD_WIDTH, window.innerWidth - GRID_INSET);
	const cellPadY = Math.max(MIN_ROW_GAP, focusOverhang(CARD_HEIGHT));
	const cellPadding = `${cellPadY}px ${cellPadX}px`;
	const gridItemSize = {minWidth: CARD_WIDTH + cellPadX * 2, minHeight: CARD_HEIGHT + cellPadY * 2};

	const renderItem = useCallback(({index, ...rest}) => {
		const entry = visibleRef.current[index];
		if (!entry) return <div {...rest} className={css.itemCard} style={{padding: cellPadding}} />;

		const artUrl = gamesApi.gameThumbUrl(libraryId, entry.game.id);
		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				style={{padding: cellPadding}}
				onClick={handleItemClick}
				// eslint-disable-next-line react/jsx-no-bind
				onFocus={() => setFocusedGame(entry.game)}
				data-index={index}
			>
				<div className={css.itemCardInner}>
					<div className={css.cover} style={{height: COVER_HEIGHT, background: gameFallbackColor(entry.game.id)}}>
						{artUrl && <img className={css.coverImage} src={artUrl} alt="" loading="lazy" onError={hideBrokenArt} />}
					</div>
					<div className={css.cardTitle}>{entry.title}</div>
				</div>
			</SpottableDiv>
		);
	}, [libraryId, handleItemClick, cellPadding]);

	const showDetails = settings?.showMediaDetailsOnLibraryPage !== false;
	const focusedTitle = focusedGame ? gameDisplayTitle(focusedGame.title, focusedGame.fileName) : '';
	// The record for the game before this one stays put until its replacement
	// lands, so the row holds what it had rather than emptying between the two.
	const activeDetail = detail && detail.id === focusedGame?.id ? detail : null;
	const meta = [];
	if (activeDetail) {
		if (activeDetail.year) meta.push({text: String(activeDetail.year)});
		if (activeDetail.genre) meta.push({text: activeDetail.genre});
		if (activeDetail.region) meta.push({text: activeDetail.region});
		if (activeDetail.players) meta.push({icon: 'players', text: String(activeDetail.players)});
		if (activeDetail.rating) meta.push({icon: 'rating', text: Number(activeDetail.rating).toFixed(1)});
	}

	return (
		<div className={css.page}>
			{backdropsEnabled && (
				<BackdropLayer targetUrl={backdropUrl} blurAmount={settings?.backdropBlurHome} />
			)}
			<div className={css.content}>
				<div className={css.header}>
					<div className={css.headerSide} />
					<div className={css.headerTitle}>
						<div className={css.systemName}>{system?.name || $L('Games')}</div>
					</div>
					<div className={css.headerSide}>
						<div className={css.searchWrap}>
							<svg className={css.searchIcon} viewBox="0 -960 960 960">
								<path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
							</svg>
							<SpottableInput
								type="text"
								className={css.searchField}
								placeholder={$L('Search this library...')}
								value={searchQuery}
								onChange={handleSearchChange}
								onKeyDown={handleSearchKeyDown}
								spotlightId="game-search"
								autoComplete="off"
							/>
						</div>
					</div>
				</div>

				{showDetails && (
					<div className={css.focusedInfo}>
						{focusedGame && (
							<>
								<div className={css.focusedName}>{focusedTitle}</div>
								<div className={css.focusedMeta}>
									{meta.map((piece, i) => (
										<span key={i} className={css.metaItem}>
											{piece.icon === 'players' && (
												<svg className={css.metaIcon} viewBox="0 -960 960 960">
													<path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Z" />
												</svg>
											)}
											{piece.icon === 'rating' && (
												<svg className={css.metaIcon} viewBox="0 -960 960 960">
													<path d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z" />
												</svg>
											)}
											{piece.text}
										</span>
									))}
								</div>
								{activeDetail?.overview && (
									<div className={css.focusedOverview}>{activeDetail.overview}</div>
								)}
							</>
						)}
					</div>
				)}

				<ToolbarContainer className={css.toolbar} spotlightId="game-toolbar" onKeyDown={handleToolbarKeyDown}>
					<SpottableButton className={css.toolbarBtn} onClick={onBack} spotlightId="game-back-btn">
						<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
							<path d="M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" />
						</svg>
					</SpottableButton>
					<div className={css.letterNav}>
						{ALPHA_LETTERS.map((value) => (
							<SpottableButton
								key={value || 'all'}
								className={`${css.letterButton} ${letter === value ? css.active : ''}`}
								onClick={handleLetterSelect}
								data-letter={value}
							>
								{value || $L('All')}
							</SpottableButton>
						))}
					</div>
				</ToolbarContainer>

				<GridContainer className={css.gridContainer}>
					{loading ? (
						<div className={css.center}><LoadingSpinner /></div>
					) : error ? (
						<div className={css.center}><div className={css.message}>{error}</div></div>
					) : visibleGames.length === 0 ? (
						<div className={css.center}><div className={css.message}>{$L('No items found')}</div></div>
					) : (
						<div className={css.gridWrapper}>
							<VirtualGridList
								className={css.grid}
								dataSize={visibleGames.length}
								itemRenderer={renderItem}
								itemSize={gridItemSize}
								direction="vertical"
								horizontalScrollbar="hidden"
								verticalScrollbar="hidden"
								spacing={0}
								onKeyDown={handleGridKeyDown}
								spotlightId="game-grid"
							/>
						</div>
					)}
				</GridContainer>
			</div>
		</div>
	);
};

export default GameSystem;
