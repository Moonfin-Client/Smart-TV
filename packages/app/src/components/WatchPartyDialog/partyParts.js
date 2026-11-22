import {memo, useCallback, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {watchParty} from '../../services/siloWatchParty';
import {formatPlaybackDuration} from '../../utils/playbackTimeLabels';

import css from './WatchPartyLayer.module.less';

const SpottableBase = Spottable('button');
// A natively disabled button drops the focus, which then lands behind the dialog, so busy only blocks the press.
export const SpottableButton = ({disabled, onClick, ...rest}) => (
	<SpottableBase {...rest} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} />
);

// The reactions are our own glyphs, never system emoji.
const GLYPHS = {
	love: <path d="M12 21s-7.6-4.7-9.7-9.3C.8 8.3 2.9 4.4 6.8 4.4c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.9 0 6 3.9 4.5 7.3C19.6 16.3 12 21 12 21z" fill="#ff5c7c" />,
	haha: (
		<>
			<circle cx="12" cy="12" r="10" fill="#ffc93c" />
			<path d="M7.4 9.8q1.3-1.6 2.6 0M14 9.8q1.3-1.6 2.6 0" stroke="#4a3300" strokeWidth="1.6" fill="none" strokeLinecap="round" />
			<path d="M6.8 13h10.4a5.2 5.2 0 0 1-10.4 0z" fill="#4a3300" />
		</>
	),
	wow: (
		<>
			<circle cx="12" cy="12" r="10" fill="#ffc93c" />
			<circle cx="8.8" cy="9.8" r="1.4" fill="#4a3300" />
			<circle cx="15.2" cy="9.8" r="1.4" fill="#4a3300" />
			<ellipse cx="12" cy="15.6" rx="2.3" ry="2.9" fill="#4a3300" />
		</>
	),
	sad: (
		<>
			<circle cx="12" cy="12" r="10" fill="#ffc93c" />
			<circle cx="8.8" cy="10" r="1.4" fill="#4a3300" />
			<circle cx="15.2" cy="10" r="1.4" fill="#4a3300" />
			<path d="M8.4 17q3.6-3.2 7.2 0" stroke="#4a3300" strokeWidth="1.6" fill="none" strokeLinecap="round" />
			<path d="M16.8 12.2s1.5 1.9 1.5 2.9a1.5 1.5 0 0 1-3 0c0-1 1.5-2.9 1.5-2.9z" fill="#4fb0ff" />
		</>
	),
	fire: (
		<>
			<path d="M12 1.8c1 3.6 5.4 5.6 5.4 11.4a5.4 5.4 0 0 1-10.8 0c0-2.6 1.3-4.2 2.5-5.2.2 1.8 1.1 2.8 2.1 3.3C10.9 8.4 11.4 4.9 12 1.8z" fill="#ff7a29" />
			<path d="M12 12.2c.6 1.5 2.4 2.5 2.4 4.5a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2.1 1.5-2.7.1.7.4 1.1.9 1.3-.3-1.1-.2-2.1 0-3.1z" fill="#ffd23c" />
		</>
	),
	popcorn: (
		<>
			<circle cx="7.6" cy="9.4" r="2.6" fill="#ffe9a8" />
			<circle cx="12" cy="7.6" r="3" fill="#fff2c9" />
			<circle cx="16.4" cy="9.4" r="2.6" fill="#ffe9a8" />
			<circle cx="10" cy="5.4" r="2.1" fill="#ffe9a8" />
			<circle cx="14.2" cy="5.6" r="2.1" fill="#fff2c9" />
			<path d="M5.6 10.4h12.8l-1.7 11H7.3z" fill="#f2f2f2" />
			<path d="M9.2 10.4l.6 11M12 10.4v11M14.8 10.4l-.6 11" stroke="#e5484d" strokeWidth="1.7" />
		</>
	)
};

export const reactionLabel = (reaction) => ({
	love: $L('Love'), haha: $L('Haha'), wow: $L('Wow'), sad: $L('Sad'), fire: $L('Fire'), popcorn: $L('Popcorn')
}[reaction] || '');

export const ReactionGlyph = memo(({reaction, className}) => (
	<svg className={className} viewBox="0 0 24 24" role="img" aria-label={reactionLabel(reaction)}>{GLYPHS[reaction]}</svg>
));

const ICONS = {
	crown: <path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z" />,
	people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.6.2 4.4 1.9 5 4.8" /></>,
	wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" /></>,
	check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
	close: <path d="M6 6l12 12M18 6L6 18" />,
	lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
	keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
	plus: <path d="M12 5v14M5 12h14" />,
	chat: <path d="M4 5h16v11H9l-5 4z" />,
	info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16h.01" /></>,
	blocked: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>
};

export const PartyIcon = memo(({name, className}) => (
	<svg className={`${css.icon} ${className || ''}`} viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
));

const AVATAR_COLORS = ['#8e44ad', '#2e6fb7', '#16794f', '#c0392b', '#9a5b00', '#00796b'];

const avatarColor = (seed) => {
	const value = String(seed || '');
	let hash = 0;
	for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const PartyAvatar = memo(({member, name, className}) => {
	const shown = member?.displayName || name || '';
	const url = member ? watchParty.avatarUrlFor(member.profileId) : null;
	const [failed, setFailed] = useState(false);
	const handleError = useCallback(() => setFailed(true), []);
	const style = url && !failed ? null : {background: avatarColor(shown)};
	return (
		<span className={`${css.avatar} ${className || ''}`} style={style}>
			{url && !failed ? <img src={url} alt="" onError={handleError} /> : (shown.charAt(0) || '?').toUpperCase()}
		</span>
	);
});

const STATUS = {
	in_sync: {color: '#3ecf8e', label: () => $L('In sync')},
	catching_up: {color: '#f5b942', label: () => $L('Catching up')},
	buffering: {color: '#4fb0ff', label: () => $L('Buffering')},
	not_watching: {color: '#6f6f6f', label: () => $L('Not watching')},
	ready: {color: '#3ecf8e', label: () => $L('Ready')},
	joining: {color: '#555555', label: () => $L('Joining')}
};

export const memberStatus = (member) => {
	if (!member.connected) return {color: '#6f6f6f', label: $L('offline')};
	const status = STATUS[member.status] || STATUS.joining;
	return {color: status.color, label: status.label()};
};

export const isReady = (member) => member.status === 'ready' || member.status === 'in_sync';

export const toastText = (toast) => {
	const name = toast?.name || '';
	switch (toast?.kind) {
		case 'pause': return $L('{name} paused').replace('{name}', name);
		case 'play': return $L('{name} resumed').replace('{name}', name);
		case 'seek': return $L('{name} skipped to {time}').replace('{name}', name).replace('{time}', formatPlaybackDuration(toast.seconds));
		case 'joined': return $L('{name} joined').replace('{name}', name);
		case 'left': return $L('{name} left').replace('{name}', name);
		case 'host': return toast.self ? $L("You're the host now") : $L('{name} is the host now').replace('{name}', name);
		case 'policy': return toast.everyone ? $L('Everyone can control playback now') : $L('Only the host controls playback now');
		case 'switched': return $L('{name} switched to {title}').replace('{name}', name).replace('{title}', toast.title || '');
		case 'no_access': return $L("You don't have access to what they're watching.");
		case 'host_only': return $L('Only the host can control playback.');
		case 'reconnecting': return $L('Reconnecting to the party...');
		case 'reconnected': return $L('Back in the party');
		default: return '';
	}
};

// The icon a toast wears when it isn't someone's doing.
export const toastIcon = (toast) => ({
	host: 'crown', policy: 'people', reconnecting: 'wifi', reconnected: 'check', no_access: 'blocked', host_only: 'blocked'
}[toast?.kind] || null);

export const partyErrorText = (code, fallback) => ({
	wrong_pin: $L("That PIN didn't work. Try again."),
	too_many_attempts: $L('Too many tries. Wait a minute.'),
	full: $L('This party is full.'),
	not_found: $L('No room has that code.'),
	no_access: $L("You don't have access to what they're watching."),
	disabled: $L('Watch Parties are turned off on this server.'),
	not_allowed: $L("The server doesn't allow that."),
	rate_limited: $L('Slow down a little, then try again.')
}[code] || fallback || '');

export const QUICK_REPLIES = () => [$L('Haha'), $L('No way'), $L('Pause please'), $L('Brb'), $L('Again!')];

// What the room is watching, like Arcane · S2:E1.
export const partyTitle = (room) => {
	if (!room?.contentTitle) return '';
	if (room.contentType !== 'Episode') return room.contentTitle;
	const number = room.season != null && room.episode != null ? ` · S${room.season}:E${room.episode}` : '';
	return `${room.seriesName || room.contentTitle}${number}`;
};
