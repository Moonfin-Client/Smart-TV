import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';

import {getServerType} from '../../services/jellyfinApi';
import {getSupportedImageTypes, getCurrentTags} from './artworkTypes';

// Literal $L calls so the translation extractor still picks these up.
const errorTemplate = (actionName) => {
	switch (actionName) {
		case 'download':
			return $L('Image download failed: {err}');
		case 'delete':
			return $L('Image delete failed: {err}');
		case 'clear':
			return $L('Clear artwork failed: {err}');
		default:
			return $L('Action failed: {err}');
	}
};

// Every write to an item's artwork. The in flight set is never rendered and
// only exists to stop a second press landing while a request is still out, so
// it sits in a ref rather than state and keeps these callbacks stable.
const useArtworkActions = ({open, resetKey, api, activeItem, refreshItemMetadata, onWriteAccessError, onMessage}) => {
	const inFlightRef = useRef(new Set());
	const [hasChanged, setHasChanged] = useState(false);

	useEffect(() => {
		if (open) {
			setHasChanged(false);
			inFlightRef.current = new Set();
		}
	}, [open, resetKey]);

	// A library set to save metadata locally needs write access to the media
	// folder, so that misconfiguration gets its own explanatory dialog rather
	// than the raw server error.
	const handleActionError = useCallback(async (error, actionName) => {
		let isLocalMetadataEnabled = false;
		if (api.getVirtualFolders) {
			try {
				const folders = await api.getVirtualFolders();
				const itemPath = activeItem.Path;
				if (itemPath && Array.isArray(folders)) {
					const matchingFolder = folders.find(folder =>
						folder.Locations?.some(loc => itemPath.startsWith(loc))
					);
					if (matchingFolder) {
						isLocalMetadataEnabled = matchingFolder.LibraryOptions?.SaveLocalMetadata === true;
					}
				}
			} catch (e) {
				console.warn('Failed to check virtual folders:', e);
			}
		}

		if (isLocalMetadataEnabled) {
			onWriteAccessError?.(
				$L('Saving metadata locally is enabled for this library, but the server lacks write permissions to write files to the library folder.')
			);
		} else {
			onMessage?.(errorTemplate(actionName).replace('{err}', error.message || error.toString()));
		}
	}, [api, activeItem, onWriteAccessError, onMessage]);

	const downloadImage = useCallback(async (category, imageUrl) => {
		if (inFlightRef.current.has(category)) return;
		inFlightRef.current.add(category);
		try {
			await api.downloadRemoteImage(activeItem.Id, category, imageUrl);
			setHasChanged(true);
			await refreshItemMetadata();
			onMessage?.($L('Artwork updated successfully'));
		} catch (e) {
			handleActionError(e, 'download');
		} finally {
			inFlightRef.current.delete(category);
		}
	}, [api, activeItem, refreshItemMetadata, handleActionError, onMessage]);

	const deleteImage = useCallback(async (category, imageIndex) => {
		if (inFlightRef.current.has(category)) return;
		inFlightRef.current.add(category);
		try {
			await api.deleteItemImage(activeItem.Id, category, imageIndex);
			setHasChanged(true);
			await refreshItemMetadata();
			onMessage?.($L('Image deleted successfully'));
		} catch (e) {
			handleActionError(e, 'delete');
		} finally {
			inFlightRef.current.delete(category);
		}
	}, [api, activeItem, refreshItemMetadata, handleActionError, onMessage]);

	const clearAllArtwork = useCallback(async () => {
		const allTypes = getSupportedImageTypes(activeItem.Type, getServerType());
		inFlightRef.current = new Set(allTypes);
		try {
			for (const category of allTypes) {
				const tags = getCurrentTags(activeItem, category);
				if (tags.length > 0) {
					if (category === 'Backdrop') {
						// Back to front, since removing one shifts the rest down.
						for (let i = tags.length - 1; i >= 0; i--) {
							await api.deleteItemImage(activeItem.Id, category, i);
						}
					} else {
						await api.deleteItemImage(activeItem.Id, category);
					}
				}
			}
			setHasChanged(true);
			await refreshItemMetadata();
			onMessage?.($L('All custom artwork cleared'));
		} catch (e) {
			handleActionError(e, 'clear');
		} finally {
			inFlightRef.current = new Set();
		}
	}, [api, activeItem, refreshItemMetadata, handleActionError, onMessage]);

	return {hasChanged, downloadImage, deleteImage, clearAllArtwork};
};

export default useArtworkActions;
