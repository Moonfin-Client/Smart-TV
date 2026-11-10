import {memo, useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import {ModalContainer} from '../../utils/spotlightContainers';
import SpottableInput from '../SpottableInput/SpottableInput';
import useWatchParty from '../../hooks/useWatchParty';
import {watchParty, REACTIONS} from '../../services/siloWatchParty';
import {PartyAvatar, QUICK_REPLIES, ReactionGlyph, SpottableButton, memberStatus, reactionLabel} from './partyParts';

import css from './WatchPartyLayer.module.less';

// The layer over the video reads which party modal is up, since chat stays unfaded under the bar and reactions stay off
// the panel.
let openModal = null;
const modalListeners = new Set();
export const usePartyModal = (name) => {
	useEffect(() => {
		if (!name) return undefined;
		openModal = name;
		modalListeners.forEach((listener) => listener(name));
		return () => {
			openModal = null;
			modalListeners.forEach((listener) => listener(null));
		};
	}, [name]);
};
export const useOpenPartyModal = () => {
	const [shown, setShown] = useState(openModal);
	useEffect(() => {
		modalListeners.add(setShown);
		setShown(openModal);
		return () => modalListeners.delete(setShown);
	}, []);
	return shown;
};

const PeopleStrip = memo(({room}) => (
	<div className={css.people} aria-label={$L('{count} in the party').replace('{count}', String(room.members.length))}>
		{room.members.map((m) => (
			<span key={m.profileId} className={css.peopleFace}>
				<PartyAvatar member={m} />
				<span className={css.statusDot} style={{background: memberStatus(m).color}} />
			</span>
		))}
		<span className={css.peopleCount}>{room.members.length}</span>
	</div>
));

const WatchPartyQuickBar = ({onClose, stopPropagation}) => {
	const {room} = useWatchParty();
	const [typed, setTyped] = useState('');
	usePartyModal('bar');

	const handleReaction = useCallback((e) => watchParty.sendReaction(e.currentTarget.dataset.reaction), []);
	const handleReply = useCallback((e) => {
		if (watchParty.sendChat(e.currentTarget.dataset.text)) onClose();
	}, [onClose]);
	const handleTyped = useCallback((e) => setTyped(e.target.value), []);
	const handleTypedKey = useCallback((e) => {
		if (e.key !== 'Enter' && e.keyCode !== 13) return;
		if (watchParty.sendChat(typed)) {
			setTyped('');
			onClose();
		}
	}, [typed, onClose]);

	if (!room) return null;
	return (
		<div className={css.barLayer} onClick={onClose}>
			<PeopleStrip room={room} />
			<ModalContainer className={css.bar} onClick={stopPropagation} data-modal="partyChat" spotlightId="partyChat-modal">
				<span className={css.barHead}><span>{$L('Send to the party')}</span><span>{$L('Back to close')}</span></span>
				<div className={css.barRow}>
					{room.reactionsEnabled && REACTIONS.map((reaction) => (
						<SpottableButton key={reaction} className={css.reactionKey} data-reaction={reaction} onClick={handleReaction} aria-label={reactionLabel(reaction)}>
							<ReactionGlyph reaction={reaction} className={css.reactionGlyph} />
						</SpottableButton>
					))}
					{room.reactionsEnabled && room.chatEnabled && <span className={css.barDivider} />}
					{room.chatEnabled && QUICK_REPLIES().map((reply) => (
						<SpottableButton key={reply} className={css.reply} data-text={reply} onClick={handleReply}>{reply}</SpottableButton>
					))}
					{room.chatEnabled && (
						<SpottableInput
							className={css.typeInput}
							type="text"
							value={typed}
							onChange={handleTyped}
							onKeyDown={handleTypedKey}
							placeholder={$L('Type')}
							maxLength={500}
							spotlightId="party-chat-type"
						/>
					)}
				</div>
			</ModalContainer>
		</div>
	);
};

export default memo(WatchPartyQuickBar);
