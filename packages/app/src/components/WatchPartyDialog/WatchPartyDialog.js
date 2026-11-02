import {memo, useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {watchParty, isRoomPlaying, partySource} from '../../services/siloWatchParty';
import useWatchParty from '../../hooks/useWatchParty';
import useHoldDialogFocus from '../../hooks/useHoldDialogFocus';
import {isBackKey} from '../../utils/keys';
import {formatPlaybackDuration} from '../../utils/playbackTimeLabels';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';
import SpottableInput from '../SpottableInput/SpottableInput';

import css from '../SyncPlayDialog/SyncPlayDialog.module.less';
import own from './WatchPartyDialog.module.less';

// Silo's Watch Party, in SyncPlay's place on Silo: start a room or join one with its code, then see who is in it and,
// as host, start or stop what everyone watches. Ported from Moonfin-Core's SiloWatchPartyScreen.

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const statusLabel = (room, connected) => {
	if (!connected) return $L('Reconnecting...');
	if (!isRoomPlaying(room)) return $L('In the lobby');
	if (room.playbackState === 'waiting') return $L('Waiting');
	return room.playbackState === 'paused' ? $L('Paused') : $L('Playing');
};

const itemTitle = (item) => {
	if (!item) return '';
	if (item.Type !== 'Episode') return item.Name || '';
	const number = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber} ` : '';
	return `${item.SeriesName ? `${item.SeriesName} · ` : ''}${number}${item.Name || ''}`;
};

const WatchPartyDialog = ({open, onClose, playingItemId}) => {
	const party = useWatchParty();
	const {room, busy, error, endedReason} = party;
	const [supported, setSupported] = useState(null);
	const [code, setCode] = useState('');
	const [item, setItem] = useState(null);

	useEffect(() => {
		if (!open || room) return;
		let live = true;
		setSupported(null);
		watchParty.available().then((ok) => live && setSupported(ok));
		return () => {
			live = false;
		};
	}, [open, room]);

	useEffect(() => {
		let live = true;
		setItem(null);
		if (room?.selectedContentId) watchParty.selectedItem().then((raw) => live && setItem(raw));
		return () => {
			live = false;
		};
	}, [room?.selectedContentId]);

	const inRoom = Boolean(room);
	const focusDefault = useCallback(() => {
		if (inRoom) {
			if (!Spotlight.focus('watchparty-primary-btn')) Spotlight.focus('watchparty-leave-btn');
		} else if (!Spotlight.focus('watchparty-start-btn')) {
			Spotlight.focus('watchparty-close-btn');
		}
	}, [inRoom]);
	useEffect(() => {
		if (!open) return;
		const t = setTimeout(focusDefault, 100);
		return () => clearTimeout(t);
	}, [open, focusDefault, supported]);
	useHoldDialogFocus(open, 'watchparty-dialog', focusDefault);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isTvKeyboardVisible()) return;
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onClose]);

	const handleCodeChange = useCallback((e) => setCode(e.target.value), []);
	const handleJoin = useCallback(async () => {
		if (!code.trim() || busy) return;
		if (await watchParty.join(code)) setCode('');
	}, [code, busy]);
	const handleCodeKeyDown = useCallback((e) => {
		if (e.key === 'Enter') handleJoin();
	}, [handleJoin]);
	const handleStart = useCallback(() => watchParty.create(), []);

	if (!open) return null;

	let body;
	if (room) {
		body = <RoomView party={party} item={item} playingItemId={playingItemId} />;
	} else if (supported === false) {
		body = <div className={css.emptyState}>{$L("This server doesn't offer Watch Party.")}</div>;
	} else {
		body = (
			<>
				{endedReason && (
					<div className={own.banner}>{endedReason === 'closed' ? $L('The Watch Party has ended.') : endedReason}</div>
				)}
				<div className={own.hint}>{$L('Open a title and choose Watch with group to pick what everyone watches.')}</div>
				<SpottableButton
					className={`${css.btn} ${css.createBtn}`}
					onClick={handleStart}
					disabled={busy || supported !== true}
					spotlightId="watchparty-start-btn"
				>
					{$L('Start a Watch Party')}
				</SpottableButton>
				<div className={css.divider}><span>{$L('Join')}</span></div>
				<div className={css.createSection}>
					<SpottableInput
						className={css.input}
						type="text"
						value={code}
						onChange={handleCodeChange}
						onKeyDown={handleCodeKeyDown}
						placeholder={$L('Room code or invite link')}
						maxLength={512}
						spotlightId="watchparty-code-input"
					/>
					<SpottableButton
						className={`${css.btn} ${css.createBtn}`}
						onClick={handleJoin}
						disabled={!code.trim() || busy}
						spotlightId="watchparty-join-btn"
					>
						{$L('Join')}
					</SpottableButton>
				</div>
			</>
		);
	}

	return (
		<div className={css.overlay} onClick={onClose}>
			<DialogContainer
				className={css.dialog}
				spotlightId="watchparty-dialog"
				onClick={(e) => e.stopPropagation()} // eslint-disable-line react/jsx-no-bind
			>
				<div className={css.header}>
					<h2 className={css.title}>{$L('Watch Party')}</h2>
					<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="watchparty-close-btn">&times;</SpottableButton>
				</div>
				<div className={css.content}>
					{error && <div className={own.banner}>{error}</div>}
					{body}
				</div>
			</DialogContainer>
		</div>
	);
};

const Member = ({member}) => {
	const avatar = watchParty.avatarUrlFor(member.profileId);
	return (
		<li className={`${css.member} ${own.member} ${member.connected ? '' : own.offline}`}>
			{avatar ? <img className={own.avatar} src={avatar} alt="" /> : (
				<span className={own.avatar}>{(member.displayName || '?').charAt(0).toUpperCase()}</span>
			)}
			<span>{member.isHost ? `${member.displayName} ★` : member.displayName}</span>
			{!member.connected && <span className={own.muted}>{$L('offline')}</span>}
		</li>
	);
};

// The host's subtitle choice cycles through each member's own, off, and the item's subtitle tracks.
const subtitleChoices = (item, room) => {
	const source = item ? partySource(item, room.selectedFileId) : null;
	const tracks = (source?.MediaStreams || []).filter((s) => s.Type === 'Subtitle' && Number.isInteger(s.Index));
	return [
		{label: $L("Each person's choice"), track: null, off: false},
		{label: $L('Off'), track: null, off: true},
		...tracks.map((t) => ({label: t.DisplayTitle || t.Language || String(t.Index), track: t, off: false}))
	];
};

const choiceMatches = (choice, current) => {
	if (!current) return !choice.off && !choice.track;
	if (current.off) return choice.off;
	return Boolean(choice.track) && choice.track.Index === current.index;
};

// What the host's room knows of where its members are in the staged title, read when the title or who's in the
// room changes.
const useResumePoint = (room, playing) => {
	const [point, setPoint] = useState(null);
	const contentId = !playing && room.isHost ? room.selectedContentId : null;
	const who = room.members.filter((m) => m.connected).map((m) => m.profileId).join(',');
	useEffect(() => {
		setPoint(null);
		if (!contentId) return undefined;
		let live = true;
		watchParty.resumePoint().then((next) => live && setPoint(next));
		return () => {
			live = false;
		};
	}, [contentId, who]);
	return point;
};

// Whose spot the resume is, and who it takes past the start.
const resumeHint = (resume, room) => {
	const name = room.members.find((m) => m.profileId === resume.profileId)?.displayName;
	const where = name
		? $L('Where {name} left off, the earliest anyone here has reached.').replace('{name}', name)
		: $L('The earliest point anyone here has reached.');
	if (!resume.notStarted) return where;
	return `${where} ${(resume.notStarted === 1 ? $L("1 person hasn't started it yet.") : $L("{count} people haven't started it yet."))
		.replace('{count}', String(resume.notStarted))}`;
};

const RoomView = memo(({party, item, playingItemId}) => {
	const {room, busy, connected, suggestions, groupSubtitle, groupSubtitlesSupported} = party;
	const playing = isRoomPlaying(room);
	const online = room.members.filter((m) => m.connected).length;

	const choices = subtitleChoices(item, room);
	const at = Math.max(0, choices.findIndex((c) => choiceMatches(c, groupSubtitle)));
	const handleSubtitle = useCallback(() => {
		const next = choices[(at + 1) % choices.length];
		watchParty.setGroupSubtitle(next.track, next.off);
	}, [choices, at]);

	// Where the room could pick the staged title up, asked again as members come and go.
	const resume = useResumePoint(room, playing);
	const startFromTop = useCallback(() => watchParty.startPlayback(0), []);
	const startResumed = useCallback(() => watchParty.startPlayback(resume?.seconds || 0), [resume]);

	let primary = null;
	let secondary = null;
	if (playing && room.isHost) {
		primary = {label: $L('Back to the lobby'), onClick: watchParty.stopPlayback};
	} else if (playing && room.selectedContentId !== playingItemId) {
		primary = {label: $L('Play now'), onClick: watchParty.openPlayer};
	} else if (!playing && room.isHost && room.selectedContentId) {
		if (resume) {
			primary = {label: $L('Resume at {time}').replace('{time}', formatPlaybackDuration(resume.seconds)), onClick: startResumed};
			secondary = {label: $L('Start from the beginning'), onClick: startFromTop};
		} else {
			primary = {label: $L('Start for everyone'), onClick: startFromTop};
		}
	}

	return (
		<div className={css.groupView}>
			<div className={css.groupHeader}>
				<h3 className={`${css.groupTitle} ${own.code}`}>{room.code}</h3>
				<span className={`${css.stateBadge} ${playing ? css.statePlaying : css.stateIdle}`}>{statusLabel(room, connected)}</span>
			</div>
			<div className={own.hint}>{$L('Others join with this code from their Watch Party screen.')}</div>

			<div className={css.nowPlaying}>
				<h4 className={css.sectionTitle}>{playing ? $L('Playing') : $L('Up next')}</h4>
				<div className={css.nowPlayingInfo}>
					<span className={css.nowPlayingTitle}>
						{room.selectedContentId ? itemTitle(item) : (room.isHost
							? $L('Open a title and choose Watch with group to pick what everyone watches.')
							: $L('Waiting for the host to pick something.'))}
					</span>
				</div>
				{primary && (
					<SpottableButton
						className={`${css.btn} ${css.createBtn} ${css.watchBtn}`}
						onClick={primary.onClick}
						disabled={busy}
						spotlightId="watchparty-primary-btn"
					>
						{primary.label}
					</SpottableButton>
				)}
				{secondary && (
					<SpottableButton
						className={`${css.btn} ${css.watchBtn}`}
						onClick={secondary.onClick}
						disabled={busy}
						spotlightId="watchparty-secondary-btn"
					>
						{secondary.label}
					</SpottableButton>
				)}
				{secondary && resume && <div className={own.hint}>{resumeHint(resume, room)}</div>}
			</div>

			{room.isVoting && <VotePanel room={room} suggestions={suggestions} busy={busy} />}

			<div>
				<h4 className={css.sectionTitle}>{$L('Members ({count})').replace('{count}', String(online))}</h4>
				<ul className={css.membersList}>
					{room.members.map((m) => <Member key={m.profileId} member={m} />)}
				</ul>
			</div>

			{room.isHost && (
				<div>
					<h4 className={css.sectionTitle}>{$L('Room settings')}</h4>
					<div className={own.settings}>
						<SpottableButton
							className={`${css.controlBtn} ${room.guestsCanPause ? css.controlActive : ''}`}
							onClick={() => watchParty.setGuestsCanPause(!room.guestsCanPause)} // eslint-disable-line react/jsx-no-bind
							disabled={busy}
						>
							{$L('Guests can play and pause')}: {room.guestsCanPause ? $L('On') : $L('Off')}
						</SpottableButton>
						{!playing && (
							<SpottableButton
								className={`${css.controlBtn} ${room.isVoting ? css.controlActive : ''}`}
								onClick={() => watchParty.setVoting(!room.isVoting)} // eslint-disable-line react/jsx-no-bind
								disabled={busy}
							>
								{$L('Let everyone vote on movies')}: {room.isVoting ? $L('On') : $L('Off')}
							</SpottableButton>
						)}
						{groupSubtitlesSupported && room.selectedContentId && (
							<SpottableButton className={css.controlBtn} onClick={handleSubtitle} disabled={busy}>
								{$L('Subtitles for everyone')}: {choices[at].label}
							</SpottableButton>
						)}
					</div>
				</div>
			)}

			<div className={css.controls}>
				{room.isHost && (
					<SpottableButton className={`${css.btn} ${css.leaveBtn}`} onClick={watchParty.end} disabled={busy} spotlightId="watchparty-end-btn">
						{$L('End Watch Party')}
					</SpottableButton>
				)}
				<SpottableButton className={`${css.btn} ${css.leaveBtn}`} onClick={watchParty.leave} spotlightId="watchparty-leave-btn">
					{$L('Leave group')}
				</SpottableButton>
			</div>
		</div>
	);
});

const VotePanel = ({room, suggestions, busy}) => {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState([]);

	const handleQuery = useCallback((e) => setQuery(e.target.value), []);
	const handleSearch = useCallback(async () => {
		try {
			setResults(await watchParty.searchMovies(query));
		} catch {
			setResults([]);
		}
	}, [query]);
	const handleKeyDown = useCallback((e) => {
		if (e.key === 'Enter') handleSearch();
	}, [handleSearch]);

	return (
		<div>
			<div className={own.hint}>
				{room.isHost
					? $L('Add movies for everyone to vote on, then play the one you want. TV episodes are still your pick.')
					: $L('Vote for what you want to watch. The host plays one.')}
			</div>
			{room.isHost && (
				<>
					<div className={css.createSection}>
						<SpottableInput
							className={css.input}
							type="text"
							value={query}
							onChange={handleQuery}
							onKeyDown={handleKeyDown}
							placeholder={$L('Search movies')}
							spotlightId="watchparty-search-input"
						/>
					</div>
					{results.map((movie) => (
						<div key={movie.Id} className={own.row}>
							<span className={own.grow}>{movie.Name}{movie.ProductionYear ? ` (${movie.ProductionYear})` : ''}</span>
							<SpottableButton
								className={css.controlBtn}
								disabled={busy}
								onClick={() => watchParty.suggestMovie(movie)} // eslint-disable-line react/jsx-no-bind
							>
								{$L('Add')}
							</SpottableButton>
						</div>
					))}
				</>
			)}
			{suggestions.length === 0 ? (
				<div className={css.emptyState}>{$L('No movies to vote on yet.')}</div>
			) : suggestions.map((s) => (
				<div key={s.id} className={own.row}>
					<span className={own.grow}>
						{s.title}{s.subtitle ? ` (${s.subtitle})` : ''}
						<span className={own.muted}>
							{' · '}{(s.voteCount === 1 ? $L('{count} vote') : $L('{count} votes')).replace('{count}', String(s.voteCount))}
						</span>
					</span>
					<SpottableButton
						className={`${css.controlBtn} ${s.votedByMe ? css.controlActive : ''}`}
						onClick={() => watchParty.vote(s, !s.votedByMe)} // eslint-disable-line react/jsx-no-bind
					>
						{$L('Vote')}
					</SpottableButton>
					{room.isHost && (
						<>
							<SpottableButton
								className={css.controlBtn}
								disabled={busy}
								onClick={() => watchParty.pickSuggestion(s)} // eslint-disable-line react/jsx-no-bind
							>
								{$L('Select')}
							</SpottableButton>
							<SpottableButton
								className={css.controlBtn}
								disabled={busy}
								onClick={() => watchParty.removeSuggestion(s)} // eslint-disable-line react/jsx-no-bind
							>
								{$L('Remove')}
							</SpottableButton>
						</>
					)}
				</div>
			))}
		</div>
	);
};

export default memo(WatchPartyDialog);
