import AddToPlaylistModal from '../../components/AddToPlaylistModal';
import AddToCollectionModal from '../../components/AddToCollectionModal';
import DeleteItemDialog from '../../components/DeleteItemDialog';
import ChangeArtworkModal from '../../components/ChangeArtworkModal';
import IdentifyModal from '../../components/IdentifyModal';

import css from './Details.module.less';

// The dialogs that own their own component, and the toast they all report through.
const DetailDialogs = ({
	item,
	api,
	serverUrl,
	modals,
	onItemRefreshed,
	onConfirmDelete,
	onToast,
	toastMessage,
	onToastEnd
}) => (
	<>
		<AddToPlaylistModal
			open={modals.showPlaylistModal}
			itemId={item?.Id}
			item={item}
			api={api}
			onClose={modals.handleClosePlaylistModal}
			onSuccess={onToast}
		/>

		<AddToCollectionModal
			open={modals.showCollectionModal}
			itemId={item?.Id}
			item={item}
			api={api}
			onClose={modals.handleCloseCollectionModal}
			onSuccess={onToast}
		/>

		<IdentifyModal
			open={modals.showIdentifyModal}
			item={item}
			api={api}
			onClose={modals.handleCloseIdentifyModal}
			onApplied={onItemRefreshed}
			onSuccess={onToast}
		/>

		<DeleteItemDialog
			open={modals.showDeleteDialog}
			itemName={item?.Name}
			onCancel={modals.handleCloseDeleteDialog}
			onConfirm={onConfirmDelete}
		/>

		<ChangeArtworkModal
			open={modals.showArtworkModal}
			item={item}
			api={api}
			serverUrl={serverUrl}
			onClose={modals.handleCloseArtworkModal}
			onSuccess={onToast}
			backHandlerRef={modals.artworkModalBackRef}
		/>

		{toastMessage && (
			<div className={css.toast} onAnimationEnd={onToastEnd}>{toastMessage}</div>
		)}
	</>
);

export default DetailDialogs;
