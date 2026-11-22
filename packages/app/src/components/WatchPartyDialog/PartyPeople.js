import {memo, useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpottableInput from '../SpottableInput/SpottableInput';
import {watchParty, formatRoomCode} from '../../services/siloWatchParty';
import {ModalContainer} from '../../utils/spotlightContainers';
import useWatchParty from '../../hooks/useWatchParty';
import {PartyAvatar, SpottableButton, memberStatus} from './partyParts';
import {usePartyModal} from './WatchPartyQuickBar';

import css from './WatchPartyLayer.module.less';

const memberName = (m) => {
	if (m.isSelf) return m.isHost ? $L('You · Host') : $L('You');
	return m.isHost ? `${m.displayName} · ${$L('Host')}` : m.displayName;
};

const PartyPeople = ({room, busy, onDone}) => {
	const [picked, setPicked] = useState(null);
	const [pin, setPin] = useState(null);
	const [pinBad, setPinBad] = useState(false);
	const [everyoneAllowed, setEveryoneAllowed] = useState(true);

	useEffect(() => {
		let live = true;
		watchParty.config().then((config) => live && setEveryoneAllowed(config?.everyone_control_allowed !== false));
		return () => {
			live = false;
		};
	}, []);
	const pinShownRef = useRef(false);
	useEffect(() => {
		if (pin === '') Spotlight.focus('party-pin-input');
		// Setting the PIN takes its field away, and the focus with it.
		else if (pin === null && pinShownRef.current) Spotlight.focus('party-pin-row');
		pinShownRef.current = pin !== null;
	}, [pin]);

	const handleMember = useCallback((e) => {
		const id = e.currentTarget.dataset.member;
		if (room.isHost && id !== room.selfMemberId) setPicked((was) => (was === id ? null : id));
	}, [room.isHost, room.selfMemberId]);
	// The actions go once used, so focus moves to your own row, where a second OK does nothing.
	const handlePromote = useCallback(() => {
		Spotlight.focus('party-member-self');
		watchParty.promote(picked);
		setPicked(null);
	}, [picked]);
	const handleRemove = useCallback(() => {
		Spotlight.focus('party-member-self');
		watchParty.removeMember(picked);
		setPicked(null);
	}, [picked]);
	const handleEveryone = useCallback(() => watchParty.setEveryoneControls(!room.everyoneControls), [room.everyoneControls]);
	const handlePinRow = useCallback(() => {
		if (room.hasPin) watchParty.setPin(null);
		else setPin('');
	}, [room.hasPin]);
	const handlePinChange = useCallback((e) => {
		setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
		setPinBad(false);
	}, []);
	const handlePinKey = useCallback(async (e) => {
		if (e.key !== 'Enter' && e.keyCode !== 13) return;
		if (!/^\d{4,8}$/.test(pin || '')) {
			setPinBad(true);
			return;
		}
		if (await watchParty.setPin(pin)) setPin(null);
	}, [pin]);
	const handleLeave = useCallback(() => {
		watchParty.leave();
		onDone?.();
	}, [onDone]);
	const handleEnd = useCallback(() => {
		watchParty.end();
		onDone?.();
	}, [onDone]);

	return (
		<div className={css.partyPeople}>
			<span className={css.section}>{$L('People · {count}').replace('{count}', String(room.members.length))}</span>
			{room.members.map((m) => {
				const status = memberStatus(m);
				const open = picked === m.profileId && room.isHost && !m.isSelf;
				return (
					<div key={m.profileId} className={open ? css.memberOpen : null}>
						<SpottableButton className={`${css.member} ${m.connected ? '' : css.memberAway}`} data-member={m.profileId} onClick={handleMember} spotlightId={m.isSelf ? 'party-member-self' : undefined}>
							<PartyAvatar member={m} className={m.isHost ? css.hostRing : null} />
							<span className={css.memberText}>
								<span className={css.memberName}>{memberName(m)}</span>
								<span className={css.memberStatus}><span className={css.dot} style={{background: status.color}} />{status.label}</span>
							</span>
						</SpottableButton>
						{open && (
							<div className={css.memberActions}>
								<SpottableButton className={css.action} onClick={handlePromote} disabled={busy}>{$L('Make host')}</SpottableButton>
								<SpottableButton className={css.action} onClick={handleRemove} disabled={busy}>{$L('Remove')}</SpottableButton>
							</div>
						)}
					</div>
				);
			})}

			{room.isHost && (
				<>
					<span className={css.section}>{$L('Room settings')}</span>
					{everyoneAllowed && (
						<SpottableButton className={css.setting} onClick={handleEveryone} disabled={busy}>
							<span className={css.grow}>{$L('Everyone can control playback')}</span>
							<span className={`${css.switch} ${room.everyoneControls ? css.switchOn : ''}`} role="switch" aria-checked={room.everyoneControls} />
						</SpottableButton>
					)}
					{pin === null ? (
						<SpottableButton className={css.setting} onClick={handlePinRow} disabled={busy} spotlightId="party-pin-row">
							<span className={css.grow}>{$L('Room PIN')}</span>
							<span className={css.settingValue}>{room.hasPin ? $L('On') : $L('Off')}</span>
						</SpottableButton>
					) : (
						<>
							<SpottableInput
								className={css.pinInput}
								type="text"
								purpose="numeric"
								value={pin}
								onChange={handlePinChange}
								onKeyDown={handlePinKey}
								placeholder={$L('Room PIN, 4 to 8 digits')}
								maxLength={8}
								spotlightId="party-pin-input"
							/>
							{pinBad && <span className={css.settingHint}>{$L('Use 4 to 8 digits.')}</span>}
						</>
					)}
				</>
			)}

			<div className={css.partyActions}>
				<SpottableButton className={css.action} onClick={handleLeave} spotlightId="watchparty-leave-btn">{$L('Leave')}</SpottableButton>
				{room.isHost && (
					<SpottableButton className={`${css.action} ${css.danger}`} onClick={handleEnd} disabled={busy} spotlightId="watchparty-end-btn">
						{$L('End for everyone')}
					</SpottableButton>
				)}
			</div>
		</div>
	);
};

export default memo(PartyPeople);

export const PartyPanel = memo(({onClose, stopPropagation}) => {
	const {room, busy} = useWatchParty();
	usePartyModal('panel');
	if (!room) return null;
	return (
		<div className={css.panelLayer} onClick={onClose}>
			<ModalContainer className={css.panel} onClick={stopPropagation} data-modal="party" spotlightId="party-modal" role="dialog" aria-label={$L('Your watch party')}>
				<span className={css.panelTitle}>{$L('Your watch party')}</span>
				<span className={css.panelSub}>{$L('Room code {code}').replace('{code}', formatRoomCode(room.code))}</span>
				<PartyPeople room={room} busy={busy} onDone={onClose} />
			</ModalContainer>
		</div>
	);
});
