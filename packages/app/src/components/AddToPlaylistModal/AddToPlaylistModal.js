import {useState, useEffect, useCallback, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';

import css from './AddToPlaylistModal.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const AddToPlaylistModal = ({open, itemId, api, onClose, onSuccess}) => {
	const [playlists, setPlaylists] = useState([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState('');
	const [adding, setAdding] = useState(false);
	const inputRef = useRef(null);

	useEffect(() => {
		if (!open || !api) return;
		setLoading(true);
		setCreating(false);
		setNewName('');
		api.getPlaylists().then(result => {
			setPlaylists(result?.Items || []);
			setLoading(false);
		}).catch(() => {
			setPlaylists([]);
			setLoading(false);
		});
	}, [open, api]);

	useEffect(() => {
		if (open && !loading && !creating) {
			const t = setTimeout(() => Spotlight.focus('playlist-modal'), 100);
			return () => clearTimeout(t);
		}
	}, [open, loading, creating]);

	useEffect(() => {
		if (creating && inputRef.current) {
			inputRef.current.focus();
		}
	}, [creating]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				if (creating) {
					setCreating(false);
				} else {
					onClose?.();
				}
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, creating, onClose]);

	const handleAddToPlaylist = useCallback(async (playlistId) => {
		if (adding) return;
		setAdding(true);
		try {
			await api.addToPlaylist(playlistId, [itemId]);
			onSuccess?.($L('Added to playlist'));
			onClose?.();
		} catch { /* no-op */ } finally {
			setAdding(false);
		}
	}, [api, itemId, adding, onSuccess, onClose]);

	const handlePlaylistClick = useCallback((ev) => {
		const plId = ev.currentTarget.dataset.playlistId;
		if (plId) handleAddToPlaylist(plId);
	}, [handleAddToPlaylist]);

	const handleStartCreate = useCallback(() => {
		setCreating(true);
		setNewName('');
	}, []);

	const handleCreatePlaylist = useCallback(async () => {
		const name = newName.trim();
		if (!name || adding) return;
		setAdding(true);
		try {
			await api.createPlaylist(name, [itemId]);
			onSuccess?.($L('Created "{name}" and added item').replace('{name}', name));
			onClose?.();
		} catch { /* no-op */ } finally {
			setAdding(false);
		}
	}, [api, itemId, newName, adding, onSuccess, onClose]);

	const handleInputKeyDown = useCallback((ev) => {
		if (ev.keyCode === 13) {
			ev.preventDefault();
			handleCreatePlaylist();
		} else if (isBackKey(ev)) {
			ev.preventDefault();
			ev.stopPropagation();
			setCreating(false);
		}
		ev.stopPropagation();
	}, [handleCreatePlaylist]);

	const handleInputChange = useCallback((ev) => {
		setNewName(ev.target.value);
	}, []);

	const handleCancelCreate = useCallback(() => setCreating(false), []);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="playlist-modal">
				<h2 className={css.title}>{creating ? $L('New Playlist') : $L('Add to Playlist')}</h2>

				{loading && (
					<p className={css.message}>{$L('Loading playlists…')}</p>
				)}

				{creating && (
					<div className={css.createForm}>
						<input
							ref={inputRef}
							className={css.input}
							type="text"
						placeholder={$L('Playlist name')}
							value={newName}
							onChange={handleInputChange}
							onKeyDown={handleInputKeyDown}
							maxLength={100}
						/>
						<div className={css.formButtons}>
							<SpottableButton
								className={`${css.btn} ${css.btnPrimary}`}
								onClick={handleCreatePlaylist}
								spotlightId="playlist-create-confirm"
								disabled={!newName.trim() || adding}
							>
							{adding ? $L('Creating…') : $L('Create')}
							</SpottableButton>
							<SpottableButton
								className={css.btn}
								onClick={handleCancelCreate}
								spotlightId="playlist-create-cancel"
							>
							{$L('Cancel')}
							</SpottableButton>
						</div>
					</div>
				)}

				{!loading && !creating && (
					<>
						<SpottableDiv
							className={css.playlistRow}
							onClick={handleStartCreate}
							spotlightId="playlist-create-new"
						>
							<div className={css.playlistIcon}>
								<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
							</div>
						<span className={css.playlistName}>{$L('Create New Playlist')}</span>
						</SpottableDiv>

						{playlists.length === 0 && (
						<p className={css.message}>{$L('No playlists found')}</p>
						)}

						{playlists.map(pl => (
							<SpottableDiv
								key={pl.Id}
								className={css.playlistRow}
								data-playlist-id={pl.Id}
								onClick={handlePlaylistClick}
							>
								<div className={css.playlistIcon}>
									<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M120-320v-80h480v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Zm520 480v-320l240 160-240 160Z"/></svg>
								</div>
								<div className={css.playlistInfo}>
									<span className={css.playlistName}>{pl.Name}</span>
									{pl.ChildCount != null && (
										<span className={css.playlistCount}>{$L('{count} items').replace('{count}', pl.ChildCount)}</span>
									)}
								</div>
							</SpottableDiv>
						))}
					</>
				)}

					{adding && <p className={css.message}>{$L('Adding…')}</p>}
			</DialogContainer>
		</div>
	);
};

export default AddToPlaylistModal;
