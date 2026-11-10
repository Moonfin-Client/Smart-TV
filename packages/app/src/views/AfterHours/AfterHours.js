/* eslint-disable react/jsx-no-bind */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {portal} from '../../components/CoreDialog';
import {useAuth} from '../../context/AuthContext';
import {isBackKey, KEYS} from '../../utils/keys';
import {memoryCache} from '../Browse/browseCache';
import {genreGlowRgb} from '../Browse/galleryGlow';
import {fetchBoard, loadDeviceBoards, postScore, recordDeviceRun} from '../../services/miniGamesApi';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {GAME_IDS, H, W, drawDim, drawShade, makeGame, simulate} from './games';
import HowToPlay, {remoteLines} from './HowToPlay';
import {isSoundOn, loadSounds, playSound, setSoundOn, sleepAudio, startMusic, stopMusic, unlockAudio} from './sound';

import css from './AfterHours.module.less';

// The canvas is the 480 x 270 game screen at twice its size, stretched over the TV.
const SC = 2;
const ROW_SHIFT = 328;
const LEADERBOARDS = GAME_IDS.length;
// webOS can send a click with the OK key while its pointer shows, which would count the press twice.
const CLICK_AFTER_KEY_MS = 300;
// OK pressed in the last moment of a run shouldn't land on Play again.
const OVER_SETTLE_MS = 500;
// Games whose How to play card has been started from, so it only opens by itself before a first run.
const SEEN_KEY = 'afterHoursSeen';

const gameText = () => ({
	'buffer-run': {name: $L('Buffer Run'), genre: $L('Endless runner with a gravity flip'), pitch: $L('The runner from the loading screen finally gets somewhere to go.')},
	'fast-forward': {name: $L('Fast Forward'), genre: $L('Three-lane runner'), pitch: $L('A sprint down three lobby aisles.')},
	'cable-crawl': {name: $L('Cable Crawl'), genre: $L('Grid crawler'), pitch: $L('Steer an HDMI cable around the back of the TV cabinet and plug into signal.')},
	'case-stack': {name: $L('Case Stack'), genre: $L('One-button stacker'), pitch: $L('Build a shelf-high tower of Blu-ray cases, each one a title from your own library with the genre color and uppercase title the bookshelf media bar already uses.')},
	'pixel-purge': {name: $L('Pixel Purge'), genre: $L('Paddle breaker'), pitch: $L('A bad encode left the picture full of blocky artifacts, and they creep down a little every second.')}
});

const spine = (title, rgb) => {
	const [r, g, b] = rgb.split(',').map(Number);
	return {title, col: `rgb(${rgb})`, dark: 0.299 * r + 0.587 * g + 0.114 * b > 150};
};

// Case Stack's cases are the media bar's titles, colored by genre like the bookshelf bar's spines.
const shelfOf = (items) => {
	const titles = (items || []).filter((item) => item && typeof item.Name === 'string' && item.Name.trim());
	if (titles.length) return titles.map((item) => spine(item.Name.toUpperCase(), genreGlowRgb(item.Genres)));
	const neutral = [$L('Feature Presentation'), $L('Double Feature'), $L('Midnight Movie'), $L("Director's Cut"), $L('Special Edition'), $L('Coming Soon')];
	const genres = ['Comedy', 'Sci-Fi', 'Horror', 'Animation', 'Romance', 'Thriller'];
	return neutral.map((title, i) => spine(title.toUpperCase(), genreGlowRgb([genres[i]])));
};

const Trophy = () => (
	<svg viewBox="0 0 24 24" width="88" height="88" aria-hidden="true">
		<path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="#ffc94a" />
		<path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" stroke="#ffc94a" strokeWidth="1.6" fill="none" />
		<rect x="10.5" y="12.5" width="3" height="4" fill="#ffc94a" />
		<rect x="8" y="17" width="8" height="2.5" rx="1" fill="#ffc94a" />
	</svg>
);

const Board = ({rows, me, fresh}) => {
	if (!rows) return null;
	if (!rows.length) return <div className={css.empty}>{$L('No scores yet')}</div>;
	return (
		<ol className={css.board}>
			{rows.map((row, i) => (
				<li key={i} className={row.userName === me ? css.mine : null}>
					<span className={css.rank}>{i + 1}</span>
					<span className={css.name}>
						{row.userName}
						{row.userName === me && <span className={css.tag}>{$L('YOU')}</span>}
						{i === fresh && <span className={`${css.tag} ${css.tagNew}`}>{$L('NEW')}</span>}
					</span>
					<span className={css.score}>{row.score.toLocaleString()}</span>
				</li>
			))}
		</ol>
	);
};

const Thumb = ({id, shelf}) => {
	const ref = useRef(null);
	useEffect(() => {
		const canvas = ref.current;
		const c = canvas && canvas.getContext('2d');
		if (!c) return;
		const g = simulate(makeGame(id, shelf), 4);
		const draw = () => g.draw(c, 4);
		draw();
		// The HUD's digits come out in the fallback face until the arcade's fonts have loaded.
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
	}, [id, shelf]);
	return <canvas ref={ref} width={W} height={H} className={css.thumb} />;
};

const AfterHours = ({onClose}) => {
	const {serverName, user} = useAuth();
	const me = user?.Name || '';
	const text = useMemo(gameText, []);
	const shelf = useMemo(() => shelfOf(memoryCache.featuredItems), []);

	const [screen, setScreen] = useState('menu');
	const [focus, setFocus] = useState(0);
	// Only the remote scrolls the row. A row that moved under a still pointer would hover the next card.
	const [shift, setShift] = useState(0);
	const [button, setButton] = useState(0);
	const [boards, setBoards] = useState({source: null, lists: {}});
	const [result, setResult] = useState(null);
	const [soundOn, setSoundState] = useState(isSoundOn());
	// {id, from}, where from is 'first', 'menu' or 'pause'.
	const [howTo, setHowTo] = useState(null);
	// The run whose controls line is showing, or 0 once it has faded.
	const [controlsRun, setControlsRun] = useState(0);
	const remote = useMemo(remoteLines, []);

	const rootRef = useRef(null);
	const canvasRef = useRef(null);
	const gameRef = useRef(null);
	const gameIdRef = useRef(GAME_IDS[0]);
	const runRef = useRef(0);
	const steerRef = useRef(0);
	const lastKeyRef = useRef(0);
	const demoOverRef = useRef(0);
	const overAtRef = useRef(0);
	const seenRef = useRef({});
	const dimmedRef = useRef(false);

	const showDemo = useCallback((id) => {
		gameRef.current = simulate(makeGame(id, shelf), 3);
		demoOverRef.current = 0;
	}, [shelf]);

	if (!gameRef.current) showDemo(GAME_IDS[0]);

	// The boards come from the server when the plugin answers for every game, otherwise from this TV.
	useEffect(() => {
		let live = true;
		Promise.all(GAME_IDS.map(fetchBoard))
			.then((lists) => ({source: 'server', lists: GAME_IDS.reduce((all, id, i) => ({...all, [id]: lists[i]}), {})}))
			.catch(() => loadDeviceBoards().then((lists) => ({source: 'device', lists})))
			.then((next) => live && setBoards(next));
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => {
		getFromStorage(SEEN_KEY).then((seen) => {
			if (seen && typeof seen === 'object') seenRef.current = seen;
		}).catch(() => {});
	}, []);

	useEffect(() => {
		const active = document.activeElement;
		if (active && active.blur) active.blur();
		if (rootRef.current) rootRef.current.focus();
		loadSounds();
		return () => {
			sleepAudio();
			setTimeout(() => Spotlight.focus('info-appVersion'), 0);
		};
	}, []);

	const arcadeMusic = screen === 'menu' || (screen === 'howto' && howTo && howTo.from !== 'pause');
	useEffect(() => {
		if (arcadeMusic) startMusic();
		else stopMusic();
	}, [arcadeMusic]);

	const endRun = useCallback(async () => {
		const id = gameIdRef.current;
		const score = gameRef.current.score;
		const run = ++runRef.current;
		playSound('crash');
		overAtRef.current = Date.now();
		setButton(0);
		setResult({id, score});
		setScreen('over');
		const placed = await recordDeviceRun(id, {userName: me, score});
		let outcome;
		try {
			const rank = await postScore(id, score);
			outcome = {source: 'server', rank, list: await fetchBoard(id)};
		} catch {
			outcome = {source: 'device', rank: placed.rank, list: placed.list};
		}
		if (run !== runRef.current) return;
		setResult({id, score, ...outcome});
		setBoards((prev) => (prev.source === outcome.source ? {...prev, lists: {...prev.lists, [id]: outcome.list}} : prev));
		if (outcome.rank) playSound('fanfare');
	}, [me]);
	const endRunRef = useRef(endRun);
	endRunRef.current = endRun;

	// One requestAnimationFrame loop draws the menu's demo or the game being played. A paused or
	// finished game keeps its last frame under a dim.
	useEffect(() => {
		const c = canvasRef.current && canvasRef.current.getContext('2d', {alpha: false});
		if (!c) return undefined;
		c.setTransform(SC, 0, 0, SC, 0, 0);
		if (screen === 'pause' || screen === 'over' || screen === 'howto') {
			// Pause and its How to play card share one frozen frame, which is dimmed once.
			if (!dimmedRef.current) drawDim(c);
			dimmedRef.current = true;
			return undefined;
		}
		if (screen !== 'menu' && screen !== 'play') return undefined;
		dimmedRef.current = false;
		let raf = 0;
		let last = 0;
		const frame = (now) => {
			raf = window.requestAnimationFrame(frame);
			const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
			last = now;
			const g = gameRef.current;
			if (screen === 'menu') {
				if (!g.over) {
					g.ai();
					g.update(dt);
				} else if ((demoOverRef.current += dt) > 1.2) {
					g.reset();
					demoOverRef.current = 0;
				}
			} else if (!g.ended) {
				// A Case Stack miss ends the run from the key press, between updates.
				if (!g.over) g.update(dt);
				if (g.over) {
					g.ended = true;
					endRunRef.current();
				}
			}
			g.draw(c, now / 1000);
			if (screen === 'menu') drawShade(c);
		};
		raf = window.requestAnimationFrame(frame);
		return () => window.cancelAnimationFrame(raf);
	}, [screen]);

	const startGame = useCallback((id) => {
		const g = makeGame(id, shelf);
		g.reset();
		g.sfx = playSound;
		gameRef.current = g;
		gameIdRef.current = id;
		steerRef.current = 0;
		runRef.current++;
		setControlsRun(runRef.current);
		setResult(null);
		setScreen('play');
	}, [shelf]);

	useEffect(() => {
		if (!controlsRun) return undefined;
		const timer = setTimeout(() => setControlsRun(0), 4000);
		return () => clearTimeout(timer);
	}, [controlsRun]);

	const toArcade = useCallback(() => {
		playSound('back');
		showDemo(GAME_IDS[Math.min(focus, LEADERBOARDS - 1)]);
		setScreen('menu');
	}, [focus, showDemo]);

	const moveFocus = useCallback((to, pointer) => {
		if (to < 0 || to > LEADERBOARDS || to === focus) return;
		playSound('tick');
		setFocus(to);
		if (!pointer) setShift(Math.max(0, to - 3));
		if (to < LEADERBOARDS) showDemo(GAME_IDS[to]);
	}, [focus, showDemo]);

	const openHowTo = useCallback((id, from) => {
		setHowTo({id, from});
		setButton(0);
		setScreen('howto');
	}, []);

	const openCard = useCallback((i) => {
		playSound('select');
		if (i === LEADERBOARDS) setScreen('boards');
		else if (!seenRef.current[GAME_IDS[i]]) openHowTo(GAME_IDS[i], 'first');
		else startGame(GAME_IDS[i]);
	}, [openHowTo, startGame]);

	const pauseButtons = useMemo(() => [
		{label: $L('Resume'), run: () => {
			playSound('select');
			setScreen('play');
		}},
		{label: $L('How to play'), run: () => {
			playSound('select');
			openHowTo(gameIdRef.current, 'pause');
		}},
		{label: soundOn ? $L('Sound on') : $L('Sound off'), run: () => {
			setSoundOn(!soundOn);
			setSoundState(!soundOn);
		}},
		{label: $L('Quit'), run: toArcade}
	], [openHowTo, soundOn, toArcade]);

	const overButtons = useMemo(() => [
		{label: $L('Play again'), run: () => {
			playSound('select');
			startGame(gameIdRef.current);
		}},
		{label: $L('Back to the arcade'), run: toArcade}
	], [startGame, toArcade]);

	const backToPause = useCallback(() => {
		playSound('back');
		setButton(1);
		setScreen('pause');
	}, []);

	const howToButtons = useMemo(() => {
		if (!howTo) return [];
		if (howTo.from === 'pause') return [{label: $L('Back to the game'), run: backToPause}];
		return [
			{label: $L('Start'), run: () => {
				playSound('select');
				seenRef.current = {...seenRef.current, [howTo.id]: true};
				saveToStorage(SEEN_KEY, seenRef.current);
				startGame(howTo.id);
			}},
			{label: $L('Back to the arcade'), run: () => {
				playSound('back');
				setScreen('menu');
			}}
		];
	}, [backToPause, howTo, startGame]);

	const gameKey = useCallback((code) => {
		const g = gameRef.current;
		const up = code === KEYS.UP;
		const down = code === KEYS.DOWN;
		const ok = code === KEYS.ENTER;
		switch (gameIdRef.current) {
			case 'buffer-run': {
				// On the ceiling everything is mirrored, Up and Down included.
				const flipped = g.p.grav < 0;
				if (ok || (flipped ? down : up)) g.jump();
				else if (flipped ? up : down) g.duck();
				break;
			}
			case 'fast-forward':
				g.press(up ? 'up' : down ? 'down' : ok ? 'ok' : '');
				break;
			case 'cable-crawl':
				g.press({[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'}[code]);
				break;
			case 'case-stack':
				if (ok) g.drop();
				break;
			case 'pixel-purge':
				if (code === KEYS.LEFT || code === KEYS.RIGHT) {
					steerRef.current = code === KEYS.LEFT ? -1 : 1;
					g.p.tx = steerRef.current < 0 ? -W : 2 * W;
				}
				break;
			default:
		}
	}, []);

	const handleKey = useCallback((code, back, repeat) => {
		const prev = code === KEYS.LEFT || code === KEYS.UP;
		const next = code === KEYS.RIGHT || code === KEYS.DOWN;
		const ok = code === KEYS.ENTER;
		if (screen === 'menu') {
			if (back) {
				playSound('back');
				onClose();
			} else if (code === KEYS.LEFT || code === KEYS.RIGHT) moveFocus(focus + (code === KEYS.LEFT ? -1 : 1));
			else if (code === KEYS.DOWN && !repeat && focus < LEADERBOARDS) {
				playSound('select');
				openHowTo(GAME_IDS[focus], 'menu');
			} else if (ok && !repeat) openCard(focus);
		} else if (screen === 'play') {
			if (back) {
				playSound('back');
				setButton(0);
				setScreen('pause');
			} else if (!repeat) gameKey(code);
		} else if (screen === 'pause' || screen === 'over' || screen === 'howto') {
			const buttons = screen === 'pause' ? pauseButtons : screen === 'over' ? overButtons : howToButtons;
			if (back) {
				if (screen === 'pause') {
					playSound('back');
					setScreen('play');
				} else if (screen === 'over') toArcade();
				else if (howTo.from === 'pause') backToPause();
				else {
					playSound('back');
					setScreen('menu');
				}
			} else if (prev || next) {
				const to = button + (prev ? -1 : 1);
				if (to >= 0 && to < buttons.length) {
					playSound('tick');
					setButton(to);
				}
			} else if (ok && !repeat && Date.now() - overAtRef.current > OVER_SETTLE_MS) buttons[button].run();
		} else if (screen === 'boards' && (back || ok)) {
			playSound('back');
			setScreen('menu');
		}
	}, [backToPause, button, focus, gameKey, howTo, howToButtons, moveFocus, onClose, openCard, openHowTo, overButtons, pauseButtons, screen, toArcade]);
	const handleKeyRef = useRef(handleKey);
	handleKeyRef.current = handleKey;
	const screenRef = useRef(screen);
	screenRef.current = screen;

	// The arcade takes the remote while it's up, ahead of Spotlight and the settings drawer under it.
	useEffect(() => {
		const held = {};
		const ours = (e) => isBackKey(e) || [KEYS.UP, KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT, KEYS.ENTER].indexOf(e.keyCode) >= 0;
		const down = (e) => {
			if (!ours(e)) return;
			e.preventDefault();
			e.stopPropagation();
			unlockAudio();
			const repeat = !!held[e.keyCode];
			held[e.keyCode] = true;
			if (e.keyCode === KEYS.ENTER) lastKeyRef.current = Date.now();
			handleKeyRef.current(e.keyCode, isBackKey(e), repeat);
		};
		const up = (e) => {
			if (!ours(e)) return;
			e.preventDefault();
			e.stopPropagation();
			delete held[e.keyCode];
			const dir = e.keyCode === KEYS.LEFT ? -1 : e.keyCode === KEYS.RIGHT ? 1 : 0;
			if (dir && dir === steerRef.current && gameIdRef.current === 'pixel-purge' && gameRef.current.p) {
				steerRef.current = 0;
				gameRef.current.p.tx = gameRef.current.p.x;
			}
		};
		// A game left running behind another app would end on its own.
		const hidden = () => {
			if (document.hidden && screenRef.current === 'play') setScreen('pause');
		};
		window.addEventListener('keydown', down, true);
		window.addEventListener('keyup', up, true);
		document.addEventListener('visibilitychange', hidden);
		return () => {
			window.removeEventListener('keydown', down, true);
			window.removeEventListener('keyup', up, true);
			document.removeEventListener('visibilitychange', hidden);
		};
	}, []);

	// The Magic Remote pointer: it steers Pixel Purge, and a click is a tap everywhere else.
	const handleMouseMove = useCallback((e) => {
		if (screen !== 'play' || gameIdRef.current !== 'pixel-purge' || !rootRef.current) return;
		gameRef.current.p.tx = e.clientX / rootRef.current.clientWidth * W;
	}, [screen]);
	const handleCanvasClick = useCallback(() => {
		if (screen !== 'play' || Date.now() - lastKeyRef.current < CLICK_AFTER_KEY_MS) return;
		const g = gameRef.current;
		unlockAudio();
		if (gameIdRef.current === 'buffer-run') g.jump();
		else if (gameIdRef.current === 'fast-forward') g.press('ok');
		else if (gameIdRef.current === 'case-stack') g.drop();
	}, [screen]);
	const pointerClick = (run) => () => Date.now() - lastKeyRef.current > CLICK_AFTER_KEY_MS && run();
	const pointerButton = (i, run) => ({onMouseEnter: () => setButton(i), onClick: pointerClick(run)});

	const source = boards.source || (result && result.source);
	const sourceLine = (from) => (from === 'server' ? $L('Scores from {server}').replace('{server}', serverName || '') : $L('Scores on this device'));
	const focused = focus < LEADERBOARDS ? text[GAME_IDS[focus]] : null;

	return portal(
		<div ref={rootRef} className={css.arcade} tabIndex={-1} onMouseMove={handleMouseMove}>
			<canvas ref={canvasRef} className={css.screen} width={W * SC} height={H * SC} onClick={handleCanvasClick} />

			{screen === 'menu' && (
				<div className={css.menu}>
					<div className={css.brand}><span>Moonfin</span><b>{$L('After Hours')}</b></div>
					<div className={css.info}>
						{focused && <span className={css.genre}>{focused.genre}</span>}
						<h3>{focused ? focused.name : $L('Leaderboards')}</h3>
						{focused && <p>{focused.pitch}</p>}
						<div className={css.chips}>
							<span><kbd>{$L('OK')}</kbd> {focused ? $L('Play') : $L('Open')}</span>
							{focused && <span onClick={pointerClick(() => openHowTo(GAME_IDS[focus], 'menu'))}><kbd>{$L('Down')}</kbd> {$L('How to play')}</span>}
							<span><kbd>{$L('Back')}</kbd> {$L('About')}</span>
						</div>
					</div>
					{focused && boards.source && (
						<div className={css.topBox}>
							<span className={css.heading}>{boards.source === 'server' ? $L('Top 3 · This server') : $L('Top 3 · This device')}</span>
							<Board rows={boards.lists[GAME_IDS[focus]] || []} me={me} fresh={-1} />
						</div>
					)}
					<div className={css.row} style={{transform: `translateX(${-shift * ROW_SHIFT}px)`}}>
						{GAME_IDS.map((id, i) => (
							<div key={id} className={i === focus ? `${css.card} ${css.focused}` : css.card} onMouseEnter={() => moveFocus(i, true)} onClick={pointerClick(() => openCard(i))}>
								<Thumb id={id} shelf={shelf} />
								<span>{text[id].name}</span>
							</div>
						))}
						<div className={focus === LEADERBOARDS ? `${css.card} ${css.focused}` : css.card} onMouseEnter={() => moveFocus(LEADERBOARDS, true)} onClick={pointerClick(() => openCard(LEADERBOARDS))}>
							<div className={`${css.thumb} ${css.trophy}`}><Trophy /></div>
							<span>{$L('Leaderboards')}</span>
						</div>
					</div>
				</div>
			)}

			{screen === 'play' && (
				<div className={css.hudRow}>
					<div className={css.hint}><kbd>{$L('Back')}</kbd> {$L('Pause')}</div>
					<div className={css.controlsSlot}>
						<div className={controlsRun ? css.playControls : `${css.playControls} ${css.faded}`}>{remote[gameIdRef.current]}</div>
					</div>
				</div>
			)}

			{screen === 'pause' && (
				<div className={css.pause}>
					<div className={css.panel}>
						<h3>{text[gameIdRef.current].name}</h3>
						{pauseButtons.map((b, i) => (
							<div key={i} className={i === button ? `${css.button} ${css.buttonFocused}` : css.button} {...pointerButton(i, b.run)}>{b.label}</div>
						))}
					</div>
				</div>
			)}

			{screen === 'over' && result && (
				<div className={css.over}>
					<div className={css.overMain}>
						<div className={css.gameOver}>{$L('Game over')}</div>
						<div className={css.final}>{result.score.toLocaleString()}</div>
						{result.rank && <div className={css.newRank}>{$L('New #{rank} on the board').replace('{rank}', result.rank)}</div>}
						<div className={css.buttons}>
							{overButtons.map((b, i) => (
								<div key={i} className={i === button ? `${css.button} ${css.buttonFocused}` : css.button} {...pointerButton(i, b.run)}>{b.label}</div>
							))}
						</div>
						{result.source && <div className={css.source}>{sourceLine(result.source)}</div>}
					</div>
					{result.list && (
						<div className={css.panel}>
							<span className={css.heading}>{$L('{game} · Top 3').replace('{game}', text[result.id].name)}</span>
							<Board rows={result.list} me={me} fresh={result.rank ? result.rank - 1 : -1} />
						</div>
					)}
				</div>
			)}

			{screen === 'howto' && howTo && (
				<HowToPlay id={howTo.id} name={text[howTo.id].name}>
					{howToButtons.map((b, i) => (
						<div key={i} className={i === button ? `${css.button} ${css.buttonFocused}` : css.button} {...pointerButton(i, b.run)}>{b.label}</div>
					))}
				</HowToPlay>
			)}

			{screen === 'boards' && (
				<div className={css.boards}>
					<div className={css.boardsHead}>
						<b>{$L('Leaderboards')}</b>
						{source && <span>{sourceLine(source)}</span>}
					</div>
					<div className={css.boardGrid}>
						{GAME_IDS.map((id) => (
							<div key={id} className={css.boardCard}>
								<h4>{text[id].name}</h4>
								<Board rows={boards.lists[id] || []} me={me} fresh={-1} />
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export default AfterHours;
