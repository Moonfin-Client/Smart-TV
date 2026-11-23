import {memo, useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import useUserAvatar from '../../hooks/useUserAvatar';
import {toCssColor} from '../../theme/themeSpec';
import {focusContentFromSidebar} from '../../utils/navFocusTargets';
import {KEYS} from '../../utils/keys';
import {ChevronDownIcon, ChevronUpIcon} from '../icons/navIcons';
import {currentEntryIndex, navEntries, rememberReturnOnEnter, useBackToClose, useCloseOnFocusOut, useNavVisibility} from './navDestinations';

import css from './ReelNav.module.less';

const SpottableButton = Spottable('button');

const ReelContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	preserveId: true
}, 'nav');

const WINDOW_ID = 'navbar-reel-window';
const AVATAR_ID = 'navbar-reel-avatar';
// How many entries show on each side of the window. One more on each side waits hidden, so
// an entry turning into view fades in rather than popping up.
const VISIBLE = 3;
// A held key repeats faster than the wheel can be read, so repeats turn it at this pace.
const REPEAT_MS = 130;

// How far entry `index` sits from the window, wrapping around a list of `count`. Each entry
// gets one place, so a short list fills fewer slots instead of showing an entry twice.
export const reelDistance = (index, center, count) => {
	let distance = (((index - center) % count) + count) % count;
	if (distance > count / 2) distance -= count;
	return distance;
};

// Clicks on the wheel keep focus where it is, on the window.
const preventFocusLoss = (e) => e.preventDefault();

const slotClass = (distance) => css[`slot${distance < 0 ? 'Up' : 'Down'}${Math.abs(distance)}`] || css.slotDown0;

const ReelEntry = ({entry, index, distance, current, jump, accent, onPick}) => {
	const handleClick = useCallback(() => onPick(index), [index, onPick]);
	const Icon = entry.Icon;
	return (
		<div
			className={[css.entry, slotClass(distance), distance === 0 && css.inWindow, jump && css.jump].filter(Boolean).join(' ')}
			onClick={handleClick}
			onMouseDown={preventFocusLoss}
		>
			<Icon className={css.entryIcon} />
			<span className={css.entryLabel}>{entry.label}</span>
			{current && <span className={css.currentDot} style={{background: accent}} />}
		</div>
	);
};

const ReelNav = ({activeView = 'home', libraries = [], hasLiveTv = false, onSelectLibrary, onUserMenu, music, hideForTrailer, backRef, ...handlers}) => {
	const {activeTheme} = useSettings();
	const {user, avatarUrl, initial, onError} = useUserAvatar();
	const vis = useNavVisibility(libraries, hasLiveTv);
	const accent = toCssColor(activeTheme.colors.accent);
	const [open, setOpen] = useState(false);
	const [center, setCenter] = useState(0);
	const lastTurnRef = useRef(0);
	const placesRef = useRef({});

	const entries = navEntries(vis, {...handlers, onSelectLibrary}, {side: true, splitLibraries: true, nowPlaying: Boolean(music)});
	const count = entries.length;
	const currentIndex = currentEntryIndex(entries, activeView);
	// The list can shrink under an open wheel when a setting changes.
	const at = center % count;
	const entriesRef = useRef(entries);
	entriesRef.current = entries;

	const openReel = useCallback(() => {
		setCenter(currentEntryIndex(entriesRef.current, activeView));
		setOpen(true);
	}, [activeView]);

	useEffect(() => {
		if (open) Spotlight.focus(WINDOW_ID);
	}, [open]);

	const close = useCallback(() => setOpen(false), []);
	const closeToContent = useCallback(() => {
		setOpen(false);
		focusContentFromSidebar();
	}, []);

	const turn = useCallback((step) => {
		setCenter((value) => (((value + step) % count) + count) % count);
	}, [count]);

	// Focus goes back to the page first, so whatever the entry opens returns there afterwards.
	const go = useCallback((index) => {
		const entry = entriesRef.current[index];
		closeToContent();
		entry?.onClick?.();
	}, [closeToContent]);

	const handlePick = useCallback((index) => {
		if (index === at) go(index);
		else setCenter(index);
	}, [at, go]);

	const handleWindowClick = useCallback(() => go(at), [at, go]);

	const handleWindowKeyDown = useCallback((e) => {
		const {keyCode} = e;
		if (keyCode !== KEYS.UP && keyCode !== KEYS.DOWN && keyCode !== KEYS.LEFT && keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		if (keyCode === KEYS.RIGHT) {
			closeToContent();
		} else if (keyCode === KEYS.LEFT) {
			Spotlight.focus(AVATAR_ID);
		} else {
			const now = Date.now();
			if (e.repeat && now - lastTurnRef.current < REPEAT_MS) return;
			lastTurnRef.current = now;
			turn(keyCode === KEYS.UP ? -1 : 1);
		}
	}, [closeToContent, turn]);

	const handleAvatarKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.RIGHT && e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(WINDOW_ID);
	}, []);

	const handleAvatarClick = useCallback(() => {
		setOpen(false);
		onUserMenu?.();
	}, [onUserMenu]);

	const handleWheel = useCallback((e) => {
		const now = Date.now();
		if (!e.deltaY || now - lastTurnRef.current < REPEAT_MS) return;
		lastTurnRef.current = now;
		turn(e.deltaY > 0 ? 1 : -1);
	}, [turn]);

	const turnUp = useCallback(() => turn(-1), [turn]);
	const turnDown = useCallback(() => turn(1), [turn]);

	useCloseOnFocusOut(open, close);
	useBackToClose(backRef, open, closeToContent);

	// An entry that wraps from one end of the wheel to the other jumps there instead of sliding
	// across the window.
	const places = {};
	const wheel = open ? entries.map((entry, index) => {
		const distance = reelDistance(index, at, count);
		if (Math.abs(distance) > VISIBLE + 1) return null;
		const before = placesRef.current[entry.key];
		places[entry.key] = distance;
		return (
			<ReelEntry
				key={entry.key}
				entry={entry}
				index={index}
				distance={distance}
				current={index === currentIndex}
				jump={before !== undefined && Math.abs(before - distance) > 1}
				accent={accent}
				onPick={handlePick}
			/>
		);
	}) : null;
	useEffect(() => {
		placesRef.current = places;
	});

	const RestIcon = entries[currentIndex].Icon;

	return (
		<ReelContainer
			className={`${css.reel} ${hideForTrailer && !open ? css.trailerHidden : ''}`}
			onFocus={rememberReturnOnEnter}
			spotlightId="navbar"
		>
			{!open && (
				<div className={css.rest}>
					<span className={`${css.dot} ${css.dot1}`} />
					<span className={`${css.dot} ${css.dot2}`} />
					<span className={`${css.dot} ${css.dot3}`} />
					<SpottableButton className={`${css.restButton} ${spotlightDefaultClass}`} onFocus={openReel} onClick={openReel}>
						<RestIcon className={css.restIcon} />
					</SpottableButton>
					<span className={`${css.dot} ${css.dot3}`} />
					<span className={`${css.dot} ${css.dot2}`} />
					<span className={`${css.dot} ${css.dot1}`} />
				</div>
			)}

			{open && (
				<div className={css.overlay} onWheel={handleWheel}>
					<div className={css.shade} onClick={closeToContent} />
					<div className={css.profile}>
						<SpottableButton className={css.avatarButton} spotlightId={AVATAR_ID} onClick={handleAvatarClick} onKeyDown={handleAvatarKeyDown}>
							{avatarUrl ? (
								<img className={css.avatarImage} src={avatarUrl} alt={user?.Name} onError={onError} />
							) : (
								<span className={css.avatarInitial}>{initial}</span>
							)}
						</SpottableButton>
						<span className={css.profileName}>{user?.Name || $L('User')}</span>
					</div>
					<div className={`${css.hairline} ${css.hairlineTop}`} />
					<div className={`${css.hairline} ${css.hairlineBottom}`} />
					<div className={css.marker} style={{borderLeftColor: accent}} />
					<div className={`${css.chevron} ${css.chevronUp}`} onClick={turnUp} onMouseDown={preventFocusLoss}>
						<ChevronUpIcon className={css.chevronIcon} />
					</div>
					<div className={`${css.chevron} ${css.chevronDown}`} onClick={turnDown} onMouseDown={preventFocusLoss}>
						<ChevronDownIcon className={css.chevronIcon} />
					</div>
					{wheel}
					<SpottableButton
						className={css.window}
						spotlightId={WINDOW_ID}
						aria-label={entries[at].label}
						onClick={handleWindowClick}
						onKeyDown={handleWindowKeyDown}
					/>
				</div>
			)}
		</ReelContainer>
	);
};

export default memo(ReelNav);
