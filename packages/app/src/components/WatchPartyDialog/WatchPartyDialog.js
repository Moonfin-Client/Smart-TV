import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {watchParty, isRoomPlaying, partySource, formatRoomCode, titleWithYear} from '../../services/siloWatchParty';
import {getServerUrl} from '../../services/jellyfinApi';
import useWatchParty from '../../hooks/useWatchParty';
import useWatchPartyRooms from '../../hooks/useWatchPartyRooms';
import useHoldDialogFocus from '../../hooks/useHoldDialogFocus';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import {isBackKey} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {drawQrCode} from '../../utils/qrCanvas';
import {formatPlaybackDuration} from '../../utils/playbackTimeLabels';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';
import SpottableInput from '../SpottableInput/SpottableInput';
import PartyPeople from './PartyPeople';
import {PartyIcon, SpottableButton, partyErrorText, partyTitle} from './partyParts';

import css from '../SyncPlayDialog/SyncPlayDialog.module.less';
import own from './WatchPartyDialog.module.less';

// The Watch Parties screen, Silo's own room on Silo (ported from Moonfin-Core's SiloWatchPartyScreen) and Moonbase's
// rooms on Jellyfin, Emby and Plex, with SyncPlay groups beside them on Jellyfin.

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');

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

const endedText = (reason) => {
	if (reason === 'closed') return $L('The Watch Party has ended.');
	if (reason === 'removed') return $L('The host removed you from the party.');
	return reason;
};

const WatchPartyDialog = ({open, onClose, playingItemId, onOpenSyncPlay}) => {
	const party = useWatchParty();
	const {room, busy, error, errorCode, endedReason} = party;
	const [supported, setSupported] = useState(null);
	const [code, setCode] = useState('');
	const [item, setItem] = useState(null);
	const moonbase = room ? party.backend === 'moonbase' : open && watchParty.backend() === 'moonbase';

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
		if (!open && watchParty.state().pinRequest) watchParty.cancelPin();
	}, [open]);

	useEffect(() => {
		let live = true;
		setItem(null);
		if (room?.selectedContentId) watchParty.selectedItem().then((raw) => live && setItem(raw));
		return () => {
			live = false;
		};
	}, [room?.selectedContentId]);

	const inRoom = Boolean(room);
	const pinAsked = Boolean(party.pinRequest);
	const focusDefault = useCallback(() => {
		if (inRoom) {
			// Without a main action, focus goes to your own row, where OK does nothing, and never to Leave.
			if (!Spotlight.focus('watchparty-primary-btn') && !Spotlight.focus('party-member-self')) Spotlight.focus('watchparty-close-btn');
		} else if (pinAsked) {
			Spotlight.focus('watchparty-pin-input');
		} else if (!Spotlight.focus('watchparty-start-btn')) {
			Spotlight.focus('watchparty-close-btn');
		}
	}, [inRoom, pinAsked]);
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
	if (room && moonbase) {
		body = <MoonbaseLobby party={party} item={item} playingItemId={playingItemId} />;
	} else if (room) {
		body = <RoomView party={party} item={item} playingItemId={playingItemId} />;
	} else if (moonbase && party.pinRequest) {
		body = <PinPrompt party={party} />;
	} else if (moonbase) {
		body = <RoomsView supported={supported} endedReason={endedReason} onClose={onClose} onOpenSyncPlay={onOpenSyncPlay} />;
	} else if (supported === false) {
		body = <div className={css.emptyState}>{$L("This server doesn't offer Watch Party.")}</div>;
	} else {
		body = (
			<>
				{endedReason && (
					<div className={own.banner}>{endedText(endedReason)}</div>
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

	let title = $L('Watch Party');
	if (moonbase) title = room ? $L('Your watch party') : $L('Watch Parties');
	// The PIN prompt shows its own error, and a PIN being asked for isn't one.
	const shownError = moonbase ? (!party.pinRequest && errorCode !== 'pin_required' && partyErrorText(errorCode, error)) : error;

	return (
		<div className={css.overlay} onClick={onClose}>
			<DialogContainer
				className={`${css.dialog} ${moonbase ? own.wide : ''}`}
				spotlightId="watchparty-dialog"
				onClick={(e) => e.stopPropagation()} // eslint-disable-line react/jsx-no-bind
			>
				<div className={css.header}>
					<h2 className={css.title}>
						{title}
						{moonbase && room && <span className={own.titleNote}>{statusLabel(room, party.connected)}</span>}
					</h2>
					<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="watchparty-close-btn">&times;</SpottableButton>
				</div>
				<div className={css.content}>
					{shownError && <div className={own.banner}>{shownError}</div>}
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
							<span className={own.grow}>{titleWithYear(movie.Name, movie.ProductionYear)}</span>
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
						{titleWithYear(s.title, s.subtitle)}
						<span className={own.muted}>
							{' · '}{(s.voteCount === 1 ? $L('{count} vote') : $L('{count} votes')).replace('{count}', String(s.voteCount))}
						</span>
					</span>
					<SpottableButton
						className={`${css.controlBtn} ${s.votedByMe ? css.controlActive : ''}`}
						onClick={() => watchParty.vote(s, !s.votedByMe)} // eslint-disable-line react/jsx-no-bind
					>
						{s.votedByMe ? $L('Voted') : $L('Vote')}
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

// Moonbase

const roomMeta = (room) => {
	const parts = [];
	if (room.kind === 'syncplay') {
		parts.push({playing: $L('Playing'), paused: $L('Paused'), waiting: $L('Waiting')}[room.playbackState] || $L('In the lobby'));
	} else if (room.phase !== 'playing') {
		parts.push($L('In the lobby'));
	} else if (room.playbackState === 'paused') {
		parts.push($L('Paused'));
	} else {
		parts.push(room.positionSeconds > 0 ? `${$L('Playing')} ${formatPlaybackDuration(room.positionSeconds)}` : $L('Playing'));
	}
	if (room.hostName) parts.push(room.hostName);
	parts.push($L('{count} watching').replace('{count}', String(room.memberCount)));
	if (room.everyoneControls) parts.push($L('Everyone controls'));
	return parts.join(' · ');
};

export const roomDotColor = (room) => {
	if (room.kind === 'syncplay' || room.playbackState === 'paused') return '#c8c8c8';
	return room.phase === 'playing' ? '#3ecf8e' : '#f5b942';
};

// Wide art first, then the poster, with `step` counting the pictures that failed to load.
export const roomArtUrl = (room, step = 0) => {
	const types = room.contentType === 'Episode' ? ['Primary'] : ['Backdrop', 'Primary'];
	return room.selectedContentId && step < types.length
		? getImageUrl(getServerUrl(), room.selectedContentId, types[step], {maxWidth: 480, quality: 80})
		: null;
};

// The Watch Party or SyncPlay chip only shows with `labels`, on Jellyfin where both kinds are listed.
export const RoomChips = ({room, labels, className}) => (
	<span className={className}>
		{labels && <span className={`${own.chip} ${room.kind === 'syncplay' ? own.chipSyncPlay : own.chipParty}`}>{room.kind === 'syncplay' ? $L('SyncPlay') : $L('Watch Party')}</span>}
		{room.hasPin && <span className={`${own.chip} ${own.chipSyncPlay}`}><PartyIcon name="lock" className={own.chipIcon} />{$L('PIN')}</span>}
	</span>
);

export const RoomArt = ({room, className = own.tileImage, loading}) => {
	const [failed, setFailed] = useState(0);
	const handleError = useCallback(() => setFailed((n) => n + 1), []);
	const url = roomArtUrl(room, failed);
	return url ? <img className={className} src={url} alt="" loading={loading} onError={handleError} /> : null;
};

const RoomsView = ({supported, endedReason, onClose, onOpenSyncPlay}) => {
	const {serverType} = useAuth();
	const {settings} = useSettings();
	const {joinGroup} = useSyncPlay();
	const {busy} = useWatchParty();
	const jellyfin = serverType === 'jellyfin';
	const {rooms: listed} = useWatchPartyRooms({active: true, intervalMs: 10000, withSyncPlay: jellyfin});
	const rooms = useMemo(() => listed || [], [listed]);
	const [code, setCode] = useState('');
	// Moonbase that answers but has parties off says so, rather than asking for Moonbase.
	const [turnedOff, setTurnedOff] = useState(false);
	useEffect(() => {
		let live = true;
		if (supported === false) watchParty.config().then((config) => live && setTurnedOff(Boolean(config)));
		return () => {
			live = false;
		};
	}, [supported]);

	const startsSyncPlay = jellyfin && (supported === false || settings.watchPartyService === 'syncplay');
	const handleStart = useCallback(() => {
		if (!startsSyncPlay) {
			watchParty.create();
			return;
		}
		onClose();
		onOpenSyncPlay?.();
	}, [startsSyncPlay, onClose, onOpenSyncPlay]);
	const handleCode = useCallback((e) => setCode(e.target.value), []);
	const handleJoin = useCallback(async () => {
		if (!code.trim() || busy) return;
		if (await watchParty.join(code)) setCode('');
	}, [code, busy]);
	const handleCodeKey = useCallback((e) => {
		if (e.key === 'Enter' || e.keyCode === 13) handleJoin();
	}, [handleJoin]);
	const handleRoom = useCallback(async (e) => {
		const picked = rooms.find((r) => r.roomId === e.currentTarget.dataset.room);
		if (!picked || busy) return;
		if (picked.kind !== 'syncplay') {
			watchParty.joinRoom(picked);
			return;
		}
		if (await joinGroup(picked.roomId)) {
			onClose();
			onOpenSyncPlay?.();
		}
	}, [rooms, busy, joinGroup, onClose, onOpenSyncPlay]);

	if (supported === false && turnedOff) {
		return <div className={own.needs}><span className={own.needsTitle}>{partyErrorText('disabled')}</span></div>;
	}
	if (supported === false && !jellyfin) {
		return (
			<div className={own.needs}>
				<span className={own.needsTitle}>{$L('Watch Parties need Moonbase on this server')}</span>
				<span className={own.hint}>{$L('Ask whoever runs the server to install the Moonbase plugin. On Jellyfin, SyncPlay still works without it.')}</span>
			</div>
		);
	}

	return (
		<div className={own.rooms}>
			<div className={own.roomsActions}>
				{endedReason && <div className={own.banner}>{endedText(endedReason)}</div>}
				<SpottableButton className={own.bigAction} onClick={handleStart} disabled={busy || supported === null} spotlightId="watchparty-start-btn">
					<PartyIcon name="plus" className={own.bigActionIcon} />{$L('Start a watch party')}
				</SpottableButton>
				<SpottableInput
					className={`${css.input} ${own.codeInput}`}
					type="text"
					value={code}
					onChange={handleCode}
					onKeyDown={handleCodeKey}
					placeholder={$L('Join with a code')}
					maxLength={512}
					spotlightId="watchparty-code-input"
				/>
				{code.trim() && (
					<SpottableButton className={`${css.btn} ${css.createBtn}`} onClick={handleJoin} disabled={busy} spotlightId="watchparty-join-btn">
						{$L('Join')}
					</SpottableButton>
				)}
				<p className={own.hint}>{$L('Parties you can watch show up here. Got a code from someone? Pick Join with a code.')}</p>
			</div>
			<div className={own.tilesColumn}>
				{rooms.length > 0 && (
					<span className={own.roomsCount}>{$L('{count} on this server').replace('{count}', String(rooms.length))}</span>
				)}
				<div className={own.tiles}>
					{rooms.map((r) => (
						<SpottableDiv key={`${r.kind}-${r.roomId}`} className={own.tile} data-room={r.roomId} onClick={handleRoom}>
							<span className={own.tileArt}>
								<RoomArt room={r} />
								<RoomChips room={r} labels={jellyfin} className={own.tileChips} />
							</span>
							<span className={own.tileTitle}>{r.kind === 'syncplay' ? r.hostName : (partyTitle(r) || $L('Nothing picked yet'))}</span>
							<span className={own.tileMeta}><span className={own.dot} style={{background: roomDotColor(r)}} />{roomMeta(r)}</span>
						</SpottableDiv>
					))}
				</div>
			</div>
		</div>
	);
};

const PinPrompt = ({party}) => {
	const {busy, errorCode, pinRequest} = party;
	const [pin, setPin] = useState('');
	const handlePin = useCallback((e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8)), []);
	const handleJoin = useCallback(async () => {
		if (pin.length < 4 || busy) return;
		if (!(await watchParty.joinWithPin(pin))) setPin('');
	}, [pin, busy]);
	const handleKey = useCallback((e) => {
		if (e.key === 'Enter' || e.keyCode === 13) handleJoin();
	}, [handleJoin]);
	const wrong = errorCode === 'wrong_pin' || errorCode === 'too_many_attempts';
	return (
		<div className={own.pinPrompt}>
			<span className={own.needsTitle}>
				{pinRequest.hostName ? $L("Enter the PIN for {name}'s party").replace('{name}', pinRequest.hostName) : $L('Enter the room PIN')}
			</span>
			{wrong && <span className={own.error}><PartyIcon name="lock" className={own.chipIcon} />{partyErrorText(errorCode)}</span>}
			<SpottableInput
				className={css.input}
				type="text"
				purpose="numeric"
				value={pin}
				onChange={handlePin}
				onKeyDown={handleKey}
				placeholder={$L('PIN')}
				maxLength={8}
				spotlightId="watchparty-pin-input"
			/>
			<div className={own.row}>
				<SpottableButton className={`${css.btn} ${css.createBtn}`} onClick={handleJoin} disabled={busy || pin.length < 4}>{$L('Join')}</SpottableButton>
				<SpottableButton className={css.btn} onClick={watchParty.cancelPin}>{$L('Cancel')}</SpottableButton>
			</div>
		</div>
	);
};

// The QR code only moves the invite link onto your own phone, to send it from there.
const Invite = ({room}) => {
	const canvasRef = useRef(null);
	const url = watchParty.inviteUrl();
	useEffect(() => {
		drawQrCode(canvasRef.current, url);
	}, [url]);
	return (
		<div className={own.invite}>
			<span className={own.inviteTitle}>{$L('Send the invite')}</span>
			{url && <canvas ref={canvasRef} className={own.qr} aria-label={$L('QR code for the invite link')} />}
			<span className={own.inviteHint}>{$L('Scan with your phone to get the invite link, then send it from there. Or just share the code.')}</span>
			<span className={own.bigCode}>{formatRoomCode(room.code)}</span>
		</div>
	);
};

const MoonbaseLobby = memo(({party, item, playingItemId}) => {
	const {room, busy, suggestions} = party;
	const playing = isRoomPlaying(room);
	const startFromTop = useCallback(() => watchParty.startPlayback(0), []);

	let primary = null;
	if (playing && room.isHost) primary = {label: $L('Back to the lobby'), onClick: watchParty.stopPlayback};
	else if (playing && room.selectedContentId !== playingItemId) primary = {label: $L('Play now'), onClick: watchParty.openPlayer};
	else if (!playing && room.isHost && room.selectedContentId) primary = {label: $L('Start for everyone'), onClick: startFromTop};

	return (
		<div className={own.lobby}>
			<Invite room={room} />
			<div className={own.lobbyMiddle}>
				<div className={css.nowPlaying}>
					<h4 className={css.sectionTitle}>{playing ? $L('Playing') : $L('Up next')}</h4>
					<div className={css.nowPlayingInfo}>
						<span className={css.nowPlayingTitle}>
							{room.selectedContentId ? (itemTitle(item) || partyTitle(room)) : (room.isHost
								? $L('Open a title and choose Watch with group to pick what everyone watches.')
								: $L('Waiting for the host to pick something.'))}
						</span>
					</div>
					{primary && (
						<SpottableButton className={`${css.btn} ${css.createBtn} ${css.watchBtn}`} onClick={primary.onClick} disabled={busy} spotlightId="watchparty-primary-btn">
							{primary.label}
						</SpottableButton>
					)}
				</div>
				{room.isHost && !playing && (
					<SpottableButton
						className={`${css.controlBtn} ${room.isVoting ? css.controlActive : ''}`}
						onClick={() => watchParty.setVoting(!room.isVoting)} // eslint-disable-line react/jsx-no-bind
						disabled={busy}
					>
						{$L('Let everyone vote on movies')}: {room.isVoting ? $L('On') : $L('Off')}
					</SpottableButton>
				)}
				{room.isVoting && <VotePanel room={room} suggestions={suggestions} busy={busy} />}
				<div className={own.hint}>{$L("Play waits for everyone's player, 10 seconds at most, then counts down 3, 2, 1.")}</div>
			</div>
			<div className={own.lobbySide}>
				<PartyPeople room={room} busy={busy} />
			</div>
		</div>
	);
});

export default memo(WatchPartyDialog);
