import {useCallback, useEffect, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {Scroller} from '@enact/sandstone/Scroller';

import {getServerType} from '../../services/jellyfinApi';
import ArtworkCategoryGrid from './ArtworkCategoryGrid';
import ArtworkCategoryRow from './ArtworkCategoryRow';
import ArtworkFilterBar from './ArtworkFilterBar';
import ArtworkHeader from './ArtworkHeader';
import {ConfirmDialog, ImagePreviewDialog, SourcesDialog, WriteAccessDialog} from './ArtworkDialogs';
import {ModalContainer} from './artworkSpottables';
import useArtworkActions from './useArtworkActions';
import useArtworkFilters from './useArtworkFilters';
import useArtworkItem from './useArtworkItem';
import useArtworkOverlays from './useArtworkOverlays';

import css from './ChangeArtworkModal.module.less';

const FOCUS_DELAY = 100;

const ChangeArtworkModal = ({open, item: initialItem, api, serverUrl, onClose, onSuccess, backHandlerRef}) => {
	const overlays = useArtworkOverlays({open, resetKey: initialItem});
	const item = useArtworkItem({open, initialItem, api, onError: onSuccess});
	const filters = useArtworkFilters({open, resetKey: initialItem, remoteImages: item.remoteImages});
	const actions = useArtworkActions({
		open,
		resetKey: initialItem,
		api,
		activeItem: item.activeItem,
		refreshItemMetadata: item.refreshItemMetadata,
		onWriteAccessError: item.setWriteAccessWarning,
		onMessage: onSuccess
	});

	const {activeItem, writeAccessWarning, setWriteAccessWarning} = item;
	const {
		focusedCategory, openCategory, closeCategory,
		showSourcesPopup, openSources, closeSources,
		previewImage, openPreview, closePreview,
		deleteConfirm, openDeleteConfirm, closeDeleteConfirm,
		clearAllConfirm, openClearAllConfirm, closeClearAllConfirm
	} = overlays;
	const {deleteImage, downloadImage, clearAllArtwork, hasChanged} = actions;
	// Silo can't delete artwork, only pick another.
	const canDelete = getServerType() !== 'silo';
	const isGridView = focusedCategory !== null;

	const handleWarningDismiss = useCallback(() => {
		setWriteAccessWarning(null);
	}, [setWriteAccessWarning]);

	// Whatever is sitting on top of the artwork list, topmost first. The focus
	// move and the back press both need this same ordering.
	const activeLayer = useMemo(() => {
		if (previewImage) return {focusId: 'zoom-preview', close: closePreview};
		if (deleteConfirm) return {focusId: 'delete-confirm', close: closeDeleteConfirm};
		if (clearAllConfirm) return {focusId: 'clear-all-confirm', close: closeClearAllConfirm};
		if (showSourcesPopup) return {focusId: 'sources-popup', close: closeSources};
		if (writeAccessWarning) return {focusId: 'write-access-warning', close: handleWarningDismiss};
		if (focusedCategory) return {focusId: 'grid-back-btn', close: closeCategory};
		return null;
	}, [previewImage, deleteConfirm, clearAllConfirm, showSourcesPopup, writeAccessWarning, focusedCategory,
		closePreview, closeDeleteConfirm, closeClearAllConfirm, closeSources, handleWarningDismiss, closeCategory]);

	// Move d-pad focus into whichever overlay or view is active, and back to the
	// modal when one closes, so focus is never stranded on the covered content.
	useEffect(() => {
		if (!open) return undefined;
		const target = activeLayer ? activeLayer.focusId : 'change-artwork-modal';
		const t = setTimeout(() => Spotlight.focus(target), FOCUS_DELAY);
		return () => clearTimeout(t);
	}, [open, activeLayer]);

	// Back is driven by the parent through backHandlerRef so it composes with the
	// app back stack. Returns true when a sub view was closed, false when nothing
	// is left, letting the parent close the modal.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (!activeLayer) return false;
			activeLayer.close();
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, activeLayer]);

	const gridRemoteImages = useMemo(
		() => (focusedCategory ? (item.remoteImages[focusedCategory] || []).filter(filters.shouldShowImage) : []),
		[focusedCategory, item.remoteImages, filters.shouldShowImage]
	);

	const handleCloseClick = useCallback(() => {
		onClose?.(hasChanged);
	}, [onClose, hasChanged]);

	const handleDeleteConfirmYes = useCallback(() => {
		if (deleteConfirm) {
			deleteImage(deleteConfirm.category, deleteConfirm.index);
			closeDeleteConfirm();
		}
	}, [deleteConfirm, deleteImage, closeDeleteConfirm]);

	const handleClearAllYes = useCallback(() => {
		clearAllArtwork();
		closeClearAllConfirm();
	}, [clearAllArtwork, closeClearAllConfirm]);

	const handlePreviewUse = useCallback(() => {
		if (previewImage) {
			downloadImage(previewImage.category, previewImage.image.Url);
			closePreview();
		}
	}, [previewImage, downloadImage, closePreview]);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<ModalContainer className={css.dialog} spotlightId="change-artwork-modal">
				<ArtworkHeader
					item={activeItem}
					canGoBack={item.canGoBack}
					canGoForward={item.canGoForward}
					onNavigate={item.navigateToItem}
					onBack={item.goBack}
					onForward={item.goForward}
					onClose={handleCloseClick}
				/>

				{!isGridView && (
					<ArtworkFilterBar
						hasSources={filters.availableSources.length > 0}
						onlyShowInterfaceLanguage={filters.onlyShowInterfaceLanguage}
						onOpenSources={openSources}
						onToggleLanguage={filters.toggleLanguageFilter}
						onClearAll={canDelete ? openClearAllConfirm : null}
					/>
				)}

				<div className={css.body}>
					{!isGridView ? (
						<Scroller className={css.scroller} direction="vertical">
							{item.supportedCategories.map((category) => (
								<ArtworkCategoryRow
									key={category}
									item={activeItem}
									serverUrl={serverUrl}
									category={category}
									remoteList={(item.remoteImages[category] || []).filter(filters.shouldShowImage)}
									loading={item.loadingCategories[category]}
									onRequestDelete={canDelete ? openDeleteConfirm : null}
									onSelectRemote={openPreview}
									onViewAll={openCategory}
								/>
							))}
						</Scroller>
					) : (
						<ArtworkCategoryGrid
							item={activeItem}
							serverUrl={serverUrl}
							category={focusedCategory}
							remoteList={gridRemoteImages}
							selectedResolution={filters.selectedResolution}
							onSelectResolution={filters.setSelectedResolution}
							onRequestDelete={canDelete ? openDeleteConfirm : null}
							onSelectRemote={openPreview}
							onBack={closeCategory}
						/>
					)}
				</div>

				{showSourcesPopup && (
					<SourcesDialog
						sources={filters.availableSources}
						deselectedSources={filters.deselectedSources}
						onToggle={filters.toggleSource}
						onClose={closeSources}
					/>
				)}

				{deleteConfirm && (
					<ConfirmDialog
						spotlightId="delete-confirm"
						title={$L('Confirm Delete')}
						message={$L('Are you sure you want to delete this custom artwork?')}
						confirmLabel={$L('Delete')}
						confirmSpotlightId="delete-yes-btn"
						cancelSpotlightId="delete-no-btn"
						onConfirm={handleDeleteConfirmYes}
						onCancel={closeDeleteConfirm}
					/>
				)}

				{clearAllConfirm && (
					<ConfirmDialog
						spotlightId="clear-all-confirm"
						title={$L('Confirm Clear All')}
						message={$L('Are you sure you want to clear all custom artwork for this item?')}
						confirmLabel={$L('Clear')}
						confirmSpotlightId="clear-all-yes-btn"
						cancelSpotlightId="clear-all-no-btn"
						onConfirm={handleClearAllYes}
						onCancel={closeClearAllConfirm}
					/>
				)}

				{writeAccessWarning && (
					<WriteAccessDialog message={writeAccessWarning} onDismiss={handleWarningDismiss} />
				)}

				{previewImage && (
					<ImagePreviewDialog
						image={previewImage.image}
						onUse={handlePreviewUse}
						onCancel={closePreview}
					/>
				)}
			</ModalContainer>
		</div>
	);
};

export default ChangeArtworkModal;
