import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';

// Every overlay the detail screen can raise, and the BACK handling that closes them in the
// right order. The track pickers share one activeModal slot because only one of them is ever
// up at a time, while the dialogs that own their own component get a flag each.
const useDetailsModals = ({backHandlerRef, onArtworkClosed, seerrBackRef, overviewBackRef}) => {
	const [activeModal, setActiveModal] = useState(null);
	const [showPlaylistModal, setShowPlaylistModal] = useState(false);
	const [showCollectionModal, setShowCollectionModal] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showRatingDialog, setShowRatingDialog] = useState(false);
	const [showArtworkModal, setShowArtworkModal] = useState(false);
	const [showIdentifyModal, setShowIdentifyModal] = useState(false);

	const lastFocusedElementRef = useRef(null);
	const artworkModalBackRef = useRef(null);
	// Which button opened the advanced menu, so the chosen quality resumes or starts over
	// the same way a plain press of that button would have.
	const advancedResumeRef = useRef(false);

	const openModal = useCallback((modal) => {
	  lastFocusedElementRef.current = document.activeElement;
		setActiveModal(modal);
		window.requestAnimationFrame(() => {
			const modalId = `${modal}-modal`;
			const focusResult = Spotlight.focus(modalId);
			if (!focusResult) {
				const selectedItem = document.querySelector(`[data-modal="${modal}"] [data-selected="true"]`);
				const firstItem = document.querySelector(`[data-modal="${modal}"] button`);
				if (selectedItem) {
					Spotlight.focus(selectedItem);
				} else if (firstItem) {
					Spotlight.focus(firstItem);
				}
			}
		});
	}, []);

	const closeModal = useCallback(() => {
		setActiveModal(null);
		window.requestAnimationFrame(() => {
		  if (lastFocusedElementRef.current) {
				Spotlight.focus(lastFocusedElementRef.current);
			}
		});
	}, []);

	const handleOpenAudioModal = useCallback(() => openModal('audio'), [openModal]);
	const handleOpenSubtitleModal = useCallback(() => openModal('subtitle'), [openModal]);
	const handleOpenVersionModal = useCallback(() => openModal('version'), [openModal]);
	const handleOpenServerModal = useCallback(() => openModal('server'), [openModal]);

	// Holding Play offers the same forced transcodes the mobile clients do, for a file
	// the set can open but not decode smoothly. A series or an album keeps the plain
	// press, since there is no single stream to pick a quality for.
	const openAdvancedPlayback = useCallback((resume) => {
		advancedResumeRef.current = resume;
		openModal('advancedPlayback');
	}, [openModal]);

	const handleAdvancedPlay = useCallback(() => openAdvancedPlayback(false), [openAdvancedPlayback]);
	const handleAdvancedResume = useCallback(() => openAdvancedPlayback(true), [openAdvancedPlayback]);

	const handleOpenPlaylistModal = useCallback(() => {
		setShowPlaylistModal(true);
	}, []);

	const handleClosePlaylistModal = useCallback(() => {
		setShowPlaylistModal(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, []);

	const handleOpenCollectionModal = useCallback(() => {
		setShowCollectionModal(true);
	}, []);

	const handleCloseCollectionModal = useCallback(() => {
		setShowCollectionModal(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, []);

	const handleOpenRatingDialog = useCallback(() => {
		setShowRatingDialog(true);
	}, []);

	const handleCloseRatingDialog = useCallback(() => {
		setShowRatingDialog(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-rating-btn') || Spotlight.focus('details-action-buttons'));
	}, []);

	const handleOpenDeleteDialog = useCallback(() => {
		setShowDeleteDialog(true);
	}, []);

	const handleCloseDeleteDialog = useCallback(() => {
		setShowDeleteDialog(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, []);

	const handleOpenIdentifyModal = useCallback(() => {
		setShowIdentifyModal(true);
	}, []);

	const handleCloseIdentifyModal = useCallback(() => {
		setShowIdentifyModal(false);
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, []);

	const handleOpenArtworkModal = useCallback(() => {
		setShowArtworkModal(true);
	}, []);

	const handleCloseArtworkModal = useCallback(() => {
		setShowArtworkModal(false);
		onArtworkClosed?.();
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, [onArtworkClosed]);

	// BACK closes the innermost overlay. The artwork modal browses within itself, so it gets
	// first refusal before the whole thing is dismissed. The Seerr popups and the expanded
	// overview run off their own state, so they answer through refs rather than flags of ours.
	useEffect(() => {
		if (!backHandlerRef) return;
		const handler = () => {
			if (seerrBackRef?.current?.()) return true;
			if (showArtworkModal) {
				if (artworkModalBackRef.current?.()) return true;
				handleCloseArtworkModal();
				return true;
			}
			if (showIdentifyModal) { handleCloseIdentifyModal(); return true; }
			if (showDeleteDialog) { handleCloseDeleteDialog(); return true; }
			if (showRatingDialog) { handleCloseRatingDialog(); return true; }
			if (showPlaylistModal) { handleClosePlaylistModal(); return true; }
			if (showCollectionModal) { handleCloseCollectionModal(); return true; }
			if (activeModal) { closeModal(); return true; }
			if (overviewBackRef?.current?.()) return true;
			return false;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, seerrBackRef, overviewBackRef, activeModal, showPlaylistModal, showCollectionModal, showDeleteDialog, showRatingDialog, showArtworkModal, showIdentifyModal, closeModal, handleClosePlaylistModal, handleCloseCollectionModal, handleCloseDeleteDialog, handleCloseRatingDialog, handleCloseArtworkModal, handleCloseIdentifyModal]);

	return {
		activeModal,
		openModal,
		closeModal,
		advancedResumeRef,
		artworkModalBackRef,
		showPlaylistModal,
		handleOpenPlaylistModal,
		handleClosePlaylistModal,
		showCollectionModal,
		handleOpenCollectionModal,
		handleCloseCollectionModal,
		showDeleteDialog,
		handleOpenDeleteDialog,
		handleCloseDeleteDialog,
		showRatingDialog,
		handleOpenRatingDialog,
		handleCloseRatingDialog,
		showArtworkModal,
		handleOpenArtworkModal,
		handleCloseArtworkModal,
		showIdentifyModal,
		handleOpenIdentifyModal,
		handleCloseIdentifyModal,
		handleOpenAudioModal,
		handleOpenSubtitleModal,
		handleOpenVersionModal,
		handleOpenServerModal,
		handleAdvancedPlay,
		handleAdvancedResume
	};
};

export default useDetailsModals;
