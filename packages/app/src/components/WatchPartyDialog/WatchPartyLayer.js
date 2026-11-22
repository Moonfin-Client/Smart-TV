import {memo, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import useWatchParty from '../../hooks/useWatchParty';
import {useSettings} from '../../context/SettingsContext';
import {PartyAvatar, PartyIcon, ReactionGlyph, isReady, toastIcon, toastText} from './partyParts';
import {useOpenPartyModal} from './WatchPartyQuickBar';

import css from './WatchPartyLayer.module.less';

const TOAST_MS = 4000;
const CHAT_MS = 6000;
const REACTION_MS = 3000;
// The server starts anyway once the wait passes this.
const READY_WAIT_MS = 10000;
const STARTING_CLASS = 'wp-starting';

// Redraws four times a second while something on screen runs on the clock.
const useNow = (running) => {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!running) return undefined;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, [running]);
	return now;
};

const Toast = ({toast}) => {
	const [shown, setShown] = useState(null);
	useEffect(() => {
		if (!toast) return undefined;
		setShown(toast);
		const timer = setTimeout(() => setShown(null), TOAST_MS);
		return () => clearTimeout(timer);
	}, [toast]);
	const words = toastText(shown);
	if (!shown || !words) return null;
	const icon = toastIcon(shown);
	return (
		<div className={css.toast} role="status" key={shown.id}>
			{icon ? <span className={css.toastIcon}><PartyIcon name={icon} /></span> : <PartyAvatar name={shown.name} className={css.toastAvatar} />}
			<span>{words}</span>
		</div>
	);
};

const Waiting = ({room, waitingSince, now}) => {
	const present = room.members.filter((m) => m.connected);
	const pending = present.filter((m) => !isReady(m));
	const left = Math.ceil((waitingSince + READY_WAIT_MS - now) / 1000);
	let line = $L('Starting together');
	if (pending.length === 1) {
		line = pending[0].isSelf ? $L('Waiting for your player') : $L("Waiting for {name}'s player").replace('{name}', pending[0].displayName);
	} else if (pending.length > 1) {
		line = $L('Waiting for {count} players').replace('{count}', String(pending.length));
	}
	return (
		<div className={css.center}>
			<div className={css.waitCard}>
				<span className={css.waitFaces}>
					{present.map((m) => (
						<PartyAvatar key={m.profileId} member={m} className={isReady(m) ? css.faceReady : css.facePending} />
					))}
				</span>
				<span className={css.waitLine}>{line}</span>
				{pending.length > 0 && left > 0 && (
					<span className={css.waitSub}>{$L('Starting anyway in {seconds} s').replace('{seconds}', String(left))}</span>
				)}
			</div>
		</div>
	);
};

// What a Moonbase party draws over the video, none of it focusable.
const WatchPartyLayer = () => {
	const {room, backend, toast, chat, reactions, countdownAt, waitingSince} = useWatchParty();
	const {settings} = useSettings();
	const modal = useOpenPartyModal();
	const barOpen = modal === 'bar';
	const lastSeen = chat.length ? chat[chat.length - 1].receivedAt : 0;
	const lastReaction = reactions.length ? reactions[reactions.length - 1].at : 0;
	const waiting = room?.playbackState === 'waiting' && !countdownAt;
	const now = useNow(Boolean(countdownAt) || waiting || Date.now() - lastSeen < CHAT_MS || Date.now() - lastReaction < REACTION_MS);
	// The wait and the countdown stand in for the player's loading screen, which LoadingAnimation.module.less hides.
	const starting = backend === 'moonbase' && (waiting || Boolean(countdownAt));
	useEffect(() => {
		if (!starting) return undefined;
		document.documentElement.classList.add(STARTING_CLASS);
		return () => document.documentElement.classList.remove(STARTING_CLASS);
	}, [starting]);

	if (!room || backend !== 'moonbase') return null;

	const lines = barOpen ? chat.slice(-3) : (settings.watchPartyChatOverlay === false ? [] : chat.slice(-3).filter((m) => now - m.receivedAt < CHAT_MS));
	const floating = modal === 'panel' ? [] : reactions.filter((r) => now - r.at < REACTION_MS);
	const count = countdownAt ? Math.ceil((countdownAt - now) / 1000) : 0;

	return (
		<div className={css.layer} aria-live="polite">
			<Toast toast={toast} />
			{floating.length > 0 && (
				<div className={css.reactions} aria-hidden="true">
					{floating.map((r, i) => (
						<span key={r.id} className={css.float} style={{right: `${(i % 3) * 60}px`}}>
							<ReactionGlyph reaction={r.reaction} className={css.floatGlyph} />
							{r.name && <span className={css.floatName}>{r.name}</span>}
						</span>
					))}
				</div>
			)}
			{lines.length > 0 && (
				<div className={`${css.chat} ${barOpen ? css.chatAboveBar : ''}`} role="log" aria-label={$L('Party chat')}>
					{lines.map((m) => (
						<div key={m.id || `${m.memberId}-${m.sentAt}`} className={`${css.bubble} ${barOpen ? '' : css.bubbleFading}`}>
							<PartyAvatar member={room.members.find((p) => p.profileId === m.memberId)} name={m.displayName} className={css.bubbleAvatar} />
							<span><b className={css.bubbleName}>{m.displayName}</b>{m.text}</span>
						</div>
					))}
				</div>
			)}
			{waiting && waitingSince && <Waiting room={room} waitingSince={waitingSince} now={now} />}
			{count > 0 && (
				<div className={`${css.center} ${css.dim}`}>
					<span className={css.countdown}>{count}</span>
					<span className={css.countdownLine}>{$L('Starting together')}</span>
				</div>
			)}
		</div>
	);
};

export default memo(WatchPartyLayer);
