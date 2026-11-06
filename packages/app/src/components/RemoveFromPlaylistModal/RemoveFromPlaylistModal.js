import {useState, useEffect, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';
import {useAuth} from '../../context/AuthContext';
import {canonicalServerKey, notifyItemRemovedFromPlaylist} from '../../services/itemMembershipService';

import css from '../AddToPlaylistModal/AddToPlaylistModal.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const RemoveFromPlaylistModal = ({open, item, playlists = [], loading = false, api, onClose, onSuccess, backHandlerRef}) => {
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
		let target = 'remove-playlist-modal';
		if (confirming) target = 'remove-playlist-confirm-btn';
		else if (loading || playlists.length === 0) target = 'remove-playlist-loading-cancel-btn';
		const t = setTimeout(() => Spotlight.focus(target), 100);
		return () => clearTimeout(t);
	}, [open, loading, confirming, playlists.length]);

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

	const handleSelectPlaylist = useCallback((ev) => {
		const playlistId = ev.currentTarget.dataset.playlistId;
		const match = playlists.find((p) => p.playlistId === playlistId);
		if (match) setConfirming(match);
	}, [playlists]);

	const handleConfirmRemove = useCallback(async () => {
		if (!confirming || removing || !api || !item) return;
		setRemoving(true);
		try {
			await api.removeFromPlaylist(confirming.playlistId, [confirming.entryId]);
			const serverKey = canonicalServerKey(item, {serverUrl, userId: user?.Id});
			notifyItemRemovedFromPlaylist(serverKey, confirming.playlistId, item.Id);
			onSuccess?.($L('Removed from {playlist}').replace('{playlist}', confirming.playlistName));
			onClose?.();
		} catch {
			onSuccess?.($L('Failed to remove from playlist'));
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
			<DialogContainer className={css.dialog} spotlightId="remove-playlist-modal">
				<h2 className={css.title}>{$L('Remove from Playlist')}</h2>

				{confirming ? (
					<div className={css.createForm}>
						<p className={css.message}>
							{$L('Remove {item} from {playlist}? The item stays in your library.')
								.replace('{item}', item?.Name || '')
								.replace('{playlist}', confirming.playlistName || '')}
						</p>
						<div className={css.formButtons}>
							<SpottableButton
								className={css.btn}
								onClick={handleCancelConfirm}
								spotlightId="remove-playlist-cancel-btn"
								disabled={removing}
							>
								{$L('Cancel')}
							</SpottableButton>
							<SpottableButton
								className={`${css.btn} ${css.btnPrimary}`}
								onClick={handleConfirmRemove}
								spotlightId="remove-playlist-confirm-btn"
								disabled={removing}
							>
								{removing ? $L('Removing...') : $L('Remove')}
							</SpottableButton>
						</div>
					</div>
				) : (
					<>
						{loading && (
							<p className={css.message}>{$L('Loading playlists…')}</p>
						)}

						{!loading && playlists.length === 0 && (
							<p className={css.message}>{$L('No playlists found')}</p>
						)}

						{(loading || playlists.length === 0) && (
							<div className={css.formButtons}>
								<SpottableButton
									className={`${css.btn} spottable-default`}
									onClick={onClose}
									spotlightId="remove-playlist-loading-cancel-btn"
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						)}

						{!loading && playlists.map((pl, index) => (
							<SpottableDiv
								key={`${pl.playlistId}:${pl.entryId}`}
								className={index === 0 ? `${css.playlistRow} spottable-default` : css.playlistRow}
								data-playlist-id={pl.playlistId}
								onClick={handleSelectPlaylist}
							>
								<div className={css.playlistIcon}>
									<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M576-280l-56-56 104-104-104-104 56-56 104 104 104-104 56 56-104 104 104 104-56 56-104-104-104 104ZM120-360v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Z"/></svg>
								</div>
								<div className={css.playlistInfo}>
									<span className={css.playlistName}>{pl.playlistName}</span>
								</div>
							</SpottableDiv>
						))}
					</>
				)}
			</DialogContainer>
		</div>
	);
};

export default RemoveFromPlaylistModal;

