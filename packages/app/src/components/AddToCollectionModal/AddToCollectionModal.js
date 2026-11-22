import {useState, useEffect, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';
import {useAuth} from '../../context/AuthContext';
import {canonicalServerKey, notifyItemAddedToCollection} from '../../services/itemMembershipService';
import SpottableInput from '../SpottableInput/SpottableInput';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';

import css from './AddToCollectionModal.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

// The picker has to list every collection, not just the first page.
const COLLECTION_FETCH_LIMIT = 500;

const AddToCollectionModal = ({open, itemId, item, api, onClose, onSuccess}) => {
	const {serverUrl, user} = useAuth();
	const serverKey = canonicalServerKey(item || {Id: itemId}, {serverUrl, userId: user?.Id});
	const [collections, setCollections] = useState([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState('');
	const [adding, setAdding] = useState(false);

	useEffect(() => {
		if (!open || !api) return;
		setLoading(true);
		setCreating(false);
		setNewName('');
		// Where only some collections can take items (a Silo profile's own), the list is just those.
		(api.getEditableCollections ? api.getEditableCollections() : api.getCollections(COLLECTION_FETCH_LIMIT, 'SortName', 'Ascending', {editableOnly: true})).then(result => {
			setCollections(result?.Items || []);
			setLoading(false);
		}).catch(() => {
			setCollections([]);
			setLoading(false);
		});
	}, [open, api]);

	useEffect(() => {
		if (open && !loading && !creating) {
			const t = setTimeout(() => Spotlight.focus('collection-modal'), 100);
			return () => clearTimeout(t);
		}
	}, [open, loading, creating]);

	useEffect(() => {
		if (creating) {
			const t = setTimeout(() => Spotlight.focus('collection-name-input'), 100);
			return () => clearTimeout(t);
		}
	}, [creating]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isTvKeyboardVisible()) return;
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

	const handleAddToCollection = useCallback(async (collectionId) => {
		if (adding) return;
		setAdding(true);
		try {
			await api.addToCollection(collectionId, [itemId]);
			notifyItemAddedToCollection(serverKey, collectionId, [itemId]);
			onSuccess?.($L('Added to collection'));
			onClose?.();
		} catch { /* no-op */ } finally {
			setAdding(false);
		}
	}, [api, itemId, serverKey, adding, onSuccess, onClose]);

	const handleCollectionClick = useCallback((ev) => {
		const collectionId = ev.currentTarget.dataset.collectionId;
		if (collectionId) handleAddToCollection(collectionId);
	}, [handleAddToCollection]);

	const handleStartCreate = useCallback(() => {
		setCreating(true);
		setNewName('');
	}, []);

	const handleCreateCollection = useCallback(async () => {
		const name = newName.trim();
		if (!name || adding) return;
		setAdding(true);
		try {
			await api.createCollection(name, [itemId]);
			notifyItemAddedToCollection(serverKey);
			onSuccess?.($L('Created "{name}" and added item').replace('{name}', name));
			onClose?.();
		} catch { /* no-op */ } finally {
			setAdding(false);
		}
	}, [api, itemId, serverKey, newName, adding, onSuccess, onClose]);

	const handleInputKeyDown = useCallback((ev) => {
		if (ev.keyCode === 13) {
			ev.preventDefault();
			handleCreateCollection();
		} else if (isBackKey(ev)) {
			ev.preventDefault();
			ev.stopPropagation();
			setCreating(false);
		}
		ev.stopPropagation();
	}, [handleCreateCollection]);

	const handleInputChange = useCallback((ev) => {
		setNewName(ev.target.value);
	}, []);

	const handleCancelCreate = useCallback(() => setCreating(false), []);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="collection-modal">
				<h2 className={css.title}>{creating ? $L('New Collection') : $L('Add to Collection')}</h2>

				{loading && (
					<p className={css.message}>{$L('Loading collections...')}</p>
				)}

				{creating && (
					<div className={css.createForm}>
						<SpottableInput
							spotlightId="collection-name-input"
							className={css.input}
							type="text"
							placeholder={$L('Collection name')}
							value={newName}
							onChange={handleInputChange}
							onKeyDown={handleInputKeyDown}
							maxLength={100}
						/>
						<div className={css.formButtons}>
							<SpottableButton
								className={`${css.btn} ${css.btnPrimary}`}
								onClick={handleCreateCollection}
								spotlightId="collection-create-confirm"
								disabled={!newName.trim() || adding}
							>
								{adding ? $L('Creating...') : $L('Create')}
							</SpottableButton>
							<SpottableButton
								className={css.btn}
								onClick={handleCancelCreate}
								spotlightId="collection-create-cancel"
							>
								{$L('Cancel')}
							</SpottableButton>
						</div>
					</div>
				)}

				{!loading && !creating && (
					<>
						<SpottableDiv
							className={css.collectionRow}
							onClick={handleStartCreate}
							spotlightId="collection-create-new"
						>
							<div className={css.collectionIcon}>
								<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
							</div>
							<span className={css.collectionName}>{$L('Create New Collection')}</span>
						</SpottableDiv>

						{collections.length === 0 && (
							<p className={css.message}>{$L('No collections found')}</p>
						)}

						{collections.map(collection => (
							<SpottableDiv
								key={collection.Id}
								className={css.collectionRow}
								data-collection-id={collection.Id}
								onClick={handleCollectionClick}
							>
								<div className={css.collectionIcon}>
									<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M160-80q-33 0-56.5-23.5T80-160v-440h80v440h680v80H160Zm160-160q-33 0-56.5-23.5T240-320v-440q0-33 23.5-56.5T320-840h200l80 80h240q33 0 56.5 23.5T920-680v360q0 33-23.5 56.5T840-240H320Zm0-80h520v-360H567l-80-80H320v440Zm0 0v-440 440Z"/></svg>
								</div>
								<div className={css.collectionInfo}>
									<span className={css.collectionName}>{collection.Name}</span>
									{collection.ChildCount != null && (
										<span className={css.collectionCount}>{$L('{count} items').replace('{count}', collection.ChildCount)}</span>
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

export default AddToCollectionModal;
