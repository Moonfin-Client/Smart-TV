import {useState, useEffect, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';
import {useAuth} from '../../context/AuthContext';
import {canonicalServerKey, notifyItemRemovedFromCollection} from '../../services/itemMembershipService';

import css from '../AddToCollectionModal/AddToCollectionModal.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const RemoveFromCollectionModal = ({open, item, collections = [], api, onClose, onSuccess, backHandlerRef}) => {
	const {serverUrl, user} = useAuth();
	const [confirming, setConfirming] = useState(null);
	const [removing, setRemoving] = useState(false);

	useEffect(() => {
		if (!open) return;
		setConfirming(null);
		setRemoving(false);
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;
		let target = 'remove-collection-modal';
		if (confirming) target = 'remove-collection-confirm-btn';
		else if (collections.length === 0) target = 'remove-collection-empty-cancel-btn';
		const t = setTimeout(() => Spotlight.focus(target), 100);
		return () => clearTimeout(t);
	}, [open, confirming, collections.length]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		if (!open) {
			backHandlerRef.current = null;
			return undefined;
		}
		const handler = () => {
			if (removing) return true;
			if (confirming) {
				setConfirming(null);
			} else {
				onClose?.();
			}
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, open, removing, confirming, onClose]);

	useEffect(() => {
		if (!open || backHandlerRef) return undefined;
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				if (removing) return;
				if (confirming) {
					setConfirming(null);
				} else {
					onClose?.();
				}
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, backHandlerRef, removing, confirming, onClose]);

	const handleSelectCollection = useCallback((ev) => {
		const collectionId = ev.currentTarget.dataset.collectionId;
		const match = collections.find((c) => c.collectionId === collectionId);
		if (match) setConfirming(match);
	}, [collections]);

	const handleConfirmRemove = useCallback(async () => {
		if (!confirming || removing || !api || !item) return;
		setRemoving(true);
		try {
			await api.removeFromCollection(confirming.collectionId, [item.Id]);
			const serverKey = canonicalServerKey(item, {serverUrl, userId: user?.Id});
			notifyItemRemovedFromCollection(serverKey, confirming.collectionId, item.Id);
			onSuccess?.($L('Removed from {collection}').replace('{collection}', confirming.collectionName));
			onClose?.();
		} catch {
			onSuccess?.($L('Failed to remove from collection'));
		} finally {
			setRemoving(false);
		}
	}, [confirming, removing, api, item, serverUrl, user, onSuccess, onClose]);

	const handleCancelConfirm = useCallback(() => {
		setConfirming(null);
	}, []);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="remove-collection-modal">
				<h2 className={css.title}>{$L('Remove from Collection')}</h2>

				{confirming ? (
					<div className={css.createForm}>
						<p className={css.message}>
							{$L('Remove {item} from {collection}? The item stays in your library.')
								.replace('{item}', item?.Name || '')
								.replace('{collection}', confirming.collectionName || '')}
						</p>
						<div className={css.formButtons}>
							<SpottableButton
								className={css.btn}
								onClick={handleCancelConfirm}
								spotlightId="remove-collection-cancel-btn"
								disabled={removing}
							>
								{$L('Cancel')}
							</SpottableButton>
							<SpottableButton
								className={`${css.btn} ${css.btnPrimary}`}
								onClick={handleConfirmRemove}
								spotlightId="remove-collection-confirm-btn"
								disabled={removing}
							>
								{removing ? $L('Removing...') : $L('Remove')}
							</SpottableButton>
						</div>
					</div>
				) : (
					<>
						{collections.length === 0 && (
							<>
								<p className={css.message}>{$L('No collections found')}</p>
								<div className={css.formButtons}>
									<SpottableButton
										className={`${css.btn} spottable-default`}
										onClick={onClose}
										spotlightId="remove-collection-empty-cancel-btn"
									>
										{$L('Cancel')}
									</SpottableButton>
								</div>
							</>
						)}

						{collections.map((col, index) => (
							<SpottableDiv
								key={col.collectionId}
								className={index === 0 ? `${css.collectionRow} spottable-default` : css.collectionRow}
								data-collection-id={col.collectionId}
								onClick={handleSelectCollection}
							>
								<div className={css.collectionIcon}>
									<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M576-280l-56-56 104-104-104-104 56-56 104 104 104-104 56 56-104 104 104 104-56 56-104-104-104 104ZM120-360v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Z"/></svg>
								</div>
								<div className={css.collectionInfo}>
									<span className={css.collectionName}>{col.collectionName}</span>
								</div>
							</SpottableDiv>
						))}
					</>
				)}
			</DialogContainer>
		</div>
	);
};

export default RemoveFromCollectionModal;

