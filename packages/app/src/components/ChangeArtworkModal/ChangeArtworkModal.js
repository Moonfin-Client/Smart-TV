import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {Scroller} from '@enact/sandstone/Scroller';
import {getImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';

import css from './ChangeArtworkModal.module.less';

const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const RestrictedContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const RESOLUTIONS = ['All', 'High (1080p+)', 'Medium (720p)', 'Low (<720p)'];

const getSupportedImageTypes = (itemType) => {
	const type = itemType?.toLowerCase();
	switch (type) {
		case 'movie':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Art', 'Disc'];
		case 'series':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Art'];
		case 'season':
			return ['Primary', 'Backdrop', 'Banner'];
		case 'episode':
			return ['Primary'];
		case 'musicvideo':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb'];
		case 'trailer':
			return ['Primary', 'Backdrop', 'Thumb'];
		case 'boxset':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb'];
		case 'playlist':
			return ['Primary', 'Backdrop'];
		case 'musicartist':
			return ['Primary', 'Backdrop', 'Banner', 'Logo'];
		case 'musicalbum':
			return ['Primary', 'Backdrop', 'Disc'];
		case 'audio':
			return ['Primary'];
		case 'book':
		case 'audiobook':
			return ['Primary'];
		case 'folder':
		case 'collectionfolder':
		case 'userview':
		case 'genre':
		case 'musicgenre':
			return ['Primary', 'Backdrop', 'Thumb'];
		default:
			return ['Primary', 'Backdrop'];
	}
};

const getCategoryDisplayName = (category, itemType) => {
	switch (category) {
		case 'Primary':
			return itemType?.toLowerCase() === 'episode' ? $L('Thumbnail') : $L('Poster');
		case 'Backdrop':
			return $L('Backdrops');
		case 'Banner':
			return $L('Banner');
		case 'Logo':
			return $L('Logo');
		case 'Thumb':
			return $L('Thumbnail');
		case 'Art':
			return $L('Art');
		case 'Disc':
			return $L('Disc Art');
		default:
			return category;
	}
};

const getImageDimensions = (category, itemType) => {
	if (category === 'Primary' && itemType?.toLowerCase() === 'episode') {
		return {width: 280, height: 158}; // 16:9 for episode primary images
	}
	switch (category) {
		case 'Primary':
			return {width: 160, height: 240}; // 2:3
		case 'Backdrop':
		case 'Thumb':
		case 'Screenshot':
			return {width: 280, height: 158}; // 16:9
		case 'Banner':
			return {width: 350, height: 70}; // 5:1
		case 'Logo':
		case 'Art':
			return {width: 200, height: 80}; // ~2.5:1
		case 'Disc':
			return {width: 160, height: 160}; // 1:1
		default:
			return {width: 160, height: 240};
	}
};

// The matching css dimension class, so card sizing lives in css rather than
// inline style objects. Widths still come from getImageDimensions for the
// remote image fetch url.
const getCardSizeClass = (category, itemType) => {
	if (category === 'Primary') {
		return itemType?.toLowerCase() === 'episode' ? 'sizeWide' : 'sizePoster';
	}
	switch (category) {
		case 'Backdrop':
		case 'Thumb':
		case 'Screenshot':
			return 'sizeWide';
		case 'Banner':
			return 'sizeBanner';
		case 'Logo':
		case 'Art':
			return 'sizeLogo';
		case 'Disc':
			return 'sizeSquare';
		default:
			return 'sizePoster';
	}
};

const getCurrentTags = (item, category) => {
	if (category === 'Backdrop') {
		return item.BackdropImageTags || [];
	}
	const tag = item.ImageTags?.[category];
	return tag ? [tag] : [];
};

const getOptimizedRemoteImageUrl = (url, category, targetWidth) => {
	if (!url) return '';

	// 1. TMDB Optimization
	if (url.includes('image.tmdb.org/t/p/original/')) {
		if (targetWidth) {
			if (category === 'Backdrop' || category === 'Thumb' || category === 'Screenshot') {
				return targetWidth <= 780 ? url.replace('/original/', '/w780/') : url.replace('/original/', '/w1280/');
			} else if (category === 'Primary') {
				if (targetWidth <= 342) return url.replace('/original/', '/w342/');
				if (targetWidth <= 500) return url.replace('/original/', '/w500/');
				return url.replace('/original/', '/w780/');
			} else if (category === 'Logo' || category === 'Art') {
				return targetWidth <= 300 ? url.replace('/original/', '/w300/') : url.replace('/original/', '/w500/');
			}
		} else {
			if (category === 'Backdrop' || category === 'Thumb' || category === 'Screenshot') {
				return url.replace('/original/', '/w780/');
			} else if (category === 'Primary') {
				return url.replace('/original/', '/w342/');
			} else if (category === 'Logo' || category === 'Art') {
				return url.replace('/original/', '/w300/');
			}
		}
	}
	return url;
};

const ChangeArtworkModal = ({open, item: initialItem, api, serverUrl, onClose, onSuccess, backHandlerRef}) => {
	const {settings} = useSettings();
	const [activeItem, setActiveItem] = useState(initialItem);
	const [history, setHistory] = useState([initialItem]);
	const [historyIndex, setHistoryIndex] = useState(0);

	const [supportedCategories, setSupportedCategories] = useState([]);
	const [remoteImages, setRemoteImages] = useState({});
	const [loadingCategories, setLoadingCategories] = useState({});
	const [actionInProgress, setActionInProgress] = useState(new Set());
	const [hasChanged, setHasChanged] = useState(false);

	// Filters
	const [onlyShowInterfaceLanguage, setOnlyShowInterfaceLanguage] = useState(true);
	const [deselectedSources, setDeselectedSources] = useState(new Set());
	const [selectedResolution, setSelectedResolution] = useState('All');
	const [focusedCategory, setFocusedCategory] = useState(null); // Expanded category

	// Overlays / Modals inside ChangeArtwork
	const [showSourcesPopup, setShowSourcesPopup] = useState(false);
	const [previewImage, setPreviewImage] = useState(null); // { category, image }
	const [deleteConfirm, setDeleteConfirm] = useState(null); // { category, index }
	const [clearAllConfirm, setClearAllConfirm] = useState(false);
	const [writeAccessWarning, setWriteAccessWarning] = useState(null); // error string

	// Server write access reports cover every library, so fetch them once and
	// match the current item's path each load.
	const writeAccessReportsRef = useRef(null);
	// Bumped on each load so stale async responses from a previous item are ignored.
	const loadIdRef = useRef(0);

	// Initialize / load item details
	const loadItem = useCallback(async (itemToLoad) => {
		const loadId = ++loadIdRef.current;
		setActiveItem(itemToLoad);
		const categories = getSupportedImageTypes(itemToLoad.Type);
		setSupportedCategories(categories);
		setRemoteImages({});
		setLoadingCategories({});
		setFocusedCategory(null);
		setWriteAccessWarning(null);

		// Fetch remote images for each category
		categories.forEach(async (category) => {
			if (itemToLoad.Type?.toLowerCase() === 'genre' || itemToLoad.Type?.toLowerCase() === 'musicgenre') {
				if (loadIdRef.current === loadId) setRemoteImages(prev => ({...prev, [category]: []}));
				return;
			}
			setLoadingCategories(prev => ({...prev, [category]: true}));
			try {
				const result = await api.getRemoteImages(itemToLoad.Id, category);
				const list = result?.Images || [];
				if (loadIdRef.current === loadId) setRemoteImages(prev => ({...prev, [category]: list}));
			} catch (e) {
				console.warn(`Failed to fetch remote images for ${category}:`, e);
			} finally {
				if (loadIdRef.current === loadId) setLoadingCategories(prev => ({...prev, [category]: false}));
			}
		});

		// Warn when the server cannot write to this item's library path
		if (api.checkWriteAccess) {
			try {
				if (!writeAccessReportsRef.current) {
					writeAccessReportsRef.current = await api.checkWriteAccess();
				}
				const reports = writeAccessReportsRef.current;
				const itemPath = itemToLoad.Path;
				if (loadIdRef.current === loadId && itemPath && Array.isArray(reports)) {
					const matchingReport = reports.find(report =>
						report.FailedPaths?.some(path => itemPath.startsWith(path))
					);
					if (matchingReport) {
						const libraryName = matchingReport.LibraryName || $L('Library');
						setWriteAccessWarning(
							$L('The server does not have write permissions for "{libraryName}" library path. Local artwork changes may fail to save.').replace('{libraryName}', libraryName)
						);
					}
				}
			} catch (e) {
				console.warn('[Moonfin] Failed to check libraries write access:', e);
			}
		}
	}, [api]);

	// Initialize on open
	useEffect(() => {
		if (open && initialItem) {
			setHistory([initialItem]);
			setHistoryIndex(0);
			setHasChanged(false);
			setFocusedCategory(null);
			setDeselectedSources(new Set());
			setOnlyShowInterfaceLanguage(true);
			setSelectedResolution('All');
			setDeleteConfirm(null);
			setPreviewImage(null);
			setClearAllConfirm(false);
			setShowSourcesPopup(false);
			setWriteAccessWarning(null);
			setActionInProgress(new Set());
			writeAccessReportsRef.current = null;
			loadItem(initialItem);
		}
	}, [open, initialItem, loadItem]);

	// Move d-pad focus into whichever overlay or view is active, and back to the
	// modal when one closes, so focus is never stranded on the covered content.
	useEffect(() => {
		if (!open) return undefined;
		let target = 'change-artwork-modal';
		if (previewImage) target = 'zoom-preview';
		else if (deleteConfirm) target = 'delete-confirm';
		else if (clearAllConfirm) target = 'clear-all-confirm';
		else if (showSourcesPopup) target = 'sources-popup';
		else if (writeAccessWarning) target = 'write-access-warning';
		else if (focusedCategory) target = 'grid-back-btn';
		const t = setTimeout(() => Spotlight.focus(target), 100);
		return () => clearTimeout(t);
	}, [open, previewImage, deleteConfirm, clearAllConfirm, showSourcesPopup, writeAccessWarning, focusedCategory]);

	// Back is driven by the parent through backHandlerRef so it composes with the
	// app back stack. Returns true when a sub view was closed, false when nothing
	// is left, letting the parent close the modal.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = () => {
			if (previewImage) { setPreviewImage(null); return true; }
			if (deleteConfirm) { setDeleteConfirm(null); return true; }
			if (clearAllConfirm) { setClearAllConfirm(false); return true; }
			if (showSourcesPopup) { setShowSourcesPopup(false); return true; }
			if (writeAccessWarning) { setWriteAccessWarning(null); return true; }
			if (focusedCategory) { setFocusedCategory(null); return true; }
			return false;
		};
		return () => { if (backHandlerRef) backHandlerRef.current = null; };
	}, [backHandlerRef, previewImage, deleteConfirm, clearAllConfirm, showSourcesPopup, writeAccessWarning, focusedCategory]);

	// History Navigation
	const navigateToItem = useCallback(async (itemId) => {
		if (!itemId) return;
		try {
			const updated = await api.getItem(itemId);
			if (updated) {
				const nextHistory = history.slice(0, historyIndex + 1);
				nextHistory.push(updated);
				setHistory(nextHistory);
				setHistoryIndex(nextHistory.length - 1);
				loadItem(updated);
			}
		} catch (e) {
			onSuccess?.($L('Failed to load item'));
		}
	}, [api, history, historyIndex, loadItem, onSuccess]);

	const goBack = useCallback(() => {
		if (historyIndex > 0) {
			const prevIndex = historyIndex - 1;
			setHistoryIndex(prevIndex);
			loadItem(history[prevIndex]);
		}
	}, [history, historyIndex, loadItem]);

	const goForward = useCallback(() => {
		if (historyIndex < history.length - 1) {
			const nextIndex = historyIndex + 1;
			setHistoryIndex(nextIndex);
			loadItem(history[nextIndex]);
		}
	}, [history, historyIndex, loadItem]);

	const refreshItemMetadata = useCallback(async () => {
		try {
			const updated = await api.getItem(activeItem.Id);
			if (updated) {
				setActiveItem(updated);
				const updatedHistory = [...history];
				updatedHistory[historyIndex] = updated;
				setHistory(updatedHistory);
			}
		} catch (e) {
			console.warn('Failed to refresh item metadata:', e);
		}
	}, [api, activeItem, history, historyIndex]);

	// Error handler checking local metadata config
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
			setWriteAccessWarning(
				$L('Saving metadata locally is enabled for this library, but the server lacks write permissions to write files to the library folder.')
			);
		} else {
			const msgMap = {
				download: $L('Image download failed: {err}'),
				delete: $L('Image delete failed: {err}'),
				clear: $L('Clear artwork failed: {err}')
			};
			const template = msgMap[actionName] || $L('Action failed: {err}');
			onSuccess?.(template.replace('{err}', error.message || error.toString()));
		}
	}, [api, activeItem, onSuccess]);

	// Download Remote Image
	const downloadImage = useCallback(async (category, imageUrl) => {
		if (actionInProgress.has(category)) return;
		setActionInProgress(prev => new Set(prev).add(category));
		try {
			await api.downloadRemoteImage(activeItem.Id, category, imageUrl);
			setHasChanged(true);
			await refreshItemMetadata();
			onSuccess?.($L('Artwork updated successfully'));
		} catch (e) {
			handleActionError(e, 'download');
		} finally {
			setActionInProgress(prev => {
				const next = new Set(prev);
				next.delete(category);
				return next;
			});
		}
	}, [api, activeItem, actionInProgress, refreshItemMetadata, handleActionError, onSuccess]);

	// Delete Item Image
	const deleteImage = useCallback(async (category, imageIndex) => {
		if (actionInProgress.has(category)) return;
		setActionInProgress(prev => new Set(prev).add(category));
		try {
			await api.deleteItemImage(activeItem.Id, category, imageIndex);
			setHasChanged(true);
			await refreshItemMetadata();
			onSuccess?.($L('Image deleted successfully'));
		} catch (e) {
			handleActionError(e, 'delete');
		} finally {
			setActionInProgress(prev => {
				const next = new Set(prev);
				next.delete(category);
				return next;
			});
		}
	}, [api, activeItem, actionInProgress, refreshItemMetadata, handleActionError, onSuccess]);

	// Clear All Artwork
	const clearAllArtwork = useCallback(async () => {
		const allTypes = getSupportedImageTypes(activeItem.Type);
		setActionInProgress(new Set(allTypes));
		try {
			for (const category of allTypes) {
				const tags = getCurrentTags(activeItem, category);
				if (tags.length > 0) {
					if (category === 'Backdrop') {
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
			onSuccess?.($L('All custom artwork cleared'));
		} catch (e) {
			handleActionError(e, 'clear');
		} finally {
			setActionInProgress(new Set());
		}
	}, [api, activeItem, refreshItemMetadata, handleActionError, onSuccess]);

	// Available providers dynamic list
	const availableSources = useMemo(() => {
		const sources = new Set();
		Object.values(remoteImages).forEach(list => {
			list.forEach(img => {
				if (img.ProviderName) sources.add(img.ProviderName);
			});
		});
		return Array.from(sources);
	}, [remoteImages]);

	// Filter logic
	const shouldShowImage = useCallback((img) => {
		if (deselectedSources.has(img.ProviderName)) return false;

		if (onlyShowInterfaceLanguage) {
			const lang = img.Language?.toLowerCase();
			const currentLang = (settings.uiLanguage || 'en').split('-')[0].toLowerCase();
			if (lang && lang !== 'all' && lang !== 'none' && lang !== 'mul' && lang !== currentLang) {
				return false;
			}
		}

		if (selectedResolution !== 'All') {
			const w = img.Width;
			const h = img.Height;
			if (!w || !h) return true;
			const maxDim = Math.max(w, h);
			if (selectedResolution === 'High (1080p+)' && maxDim < 1080) return false;
			if (selectedResolution === 'Medium (720p)' && (maxDim < 720 || maxDim >= 1080)) return false;
			if (selectedResolution === 'Low (<720p)' && maxDim >= 720) return false;
		}

		return true;
	}, [deselectedSources, onlyShowInterfaceLanguage, selectedResolution, settings.uiLanguage]);

	// Filtered remote images and the size class for the expanded grid, computed
	// once rather than per card.
	const gridRemoteImages = useMemo(
		() => (focusedCategory ? (remoteImages[focusedCategory] || []).filter(shouldShowImage) : []),
		[focusedCategory, remoteImages, shouldShowImage]
	);
	const gridSizeClass = useMemo(
		() => (focusedCategory ? css[getCardSizeClass(focusedCategory, activeItem?.Type)] : ''),
		[focusedCategory, activeItem]
	);
	const gridImageWidth = useMemo(
		() => (focusedCategory ? getImageDimensions(focusedCategory, activeItem?.Type).width : 0),
		[focusedCategory, activeItem]
	);

	// Toggle filters
	const toggleLanguageFilter = useCallback(() => {
		setOnlyShowInterfaceLanguage(prev => !prev);
	}, []);

	const toggleSource = useCallback((source) => {
		setDeselectedSources(prev => {
			const next = new Set(prev);
			if (next.has(source)) {
				next.delete(source);
			} else {
				next.add(source);
			}
			return next;
		});
	}, []);

	// Click handlers for links
	const handleBreadcrumbClick = useCallback((ev) => {
		const targetId = ev.currentTarget.dataset.id;
		if (targetId) navigateToItem(targetId);
	}, [navigateToItem]);

	// Performance-optimized Callback Handlers to satisfy react/jsx-no-bind lints
	const handleCloseClick = useCallback(() => {
		onClose?.(hasChanged);
	}, [onClose, hasChanged]);

	const handleOpenSourcesClick = useCallback(() => {
		setShowSourcesPopup(true);
	}, []);

	const handleSourcesClose = useCallback(() => {
		setShowSourcesPopup(false);
	}, []);

	const handleSourceItemClick = useCallback((ev) => {
		const src = ev.currentTarget.dataset.source;
		if (src) toggleSource(src);
	}, [toggleSource]);

	const handleOpenClearAllClick = useCallback(() => {
		setClearAllConfirm(true);
	}, []);

	const handleDeleteConfirmYes = useCallback(() => {
		if (deleteConfirm) {
			deleteImage(deleteConfirm.category, deleteConfirm.index);
			setDeleteConfirm(null);
		}
	}, [deleteConfirm, deleteImage]);

	const handleDeleteConfirmNo = useCallback(() => {
		setDeleteConfirm(null);
	}, []);

	const handleClearAllYes = useCallback(() => {
		clearAllArtwork();
		setClearAllConfirm(false);
	}, [clearAllArtwork]);

	const handleClearAllNo = useCallback(() => {
		setClearAllConfirm(false);
	}, []);

	const handleWarningDismiss = useCallback(() => {
		setWriteAccessWarning(null);
	}, []);

	const handlePreviewUse = useCallback(() => {
		if (previewImage) {
			downloadImage(previewImage.category, previewImage.image.Url);
			setPreviewImage(null);
		}
	}, [previewImage, downloadImage]);

	const handlePreviewCancel = useCallback(() => {
		setPreviewImage(null);
	}, []);

	const handleViewAllClick = useCallback((ev) => {
		const cat = ev.currentTarget.dataset.category;
		if (cat) setFocusedCategory(cat);
	}, []);

	const handleResolutionChipClick = useCallback((ev) => {
		const res = ev.currentTarget.dataset.resolution;
		if (res) setSelectedResolution(res);
	}, []);

	const handleDeleteConfirmClick = useCallback((ev) => {
		const category = ev.currentTarget.dataset.category;
		const indexStr = ev.currentTarget.dataset.index;
		const index = indexStr ? parseInt(indexStr, 10) : null;
		setDeleteConfirm({category, index});
	}, []);

	const handleRemoteCardClick = useCallback((ev) => {
		const category = ev.currentTarget.dataset.category;
		const index = parseInt(ev.currentTarget.dataset.index, 10);
		const list = (remoteImages[category] || []).filter(shouldShowImage);
		const img = list[index];
		if (img) {
			setPreviewImage({category, image: img});
		}
	}, [remoteImages, shouldShowImage]);

	const handleCloseGridClick = useCallback(() => {
		setFocusedCategory(null);
	}, []);

	// Render Breadcrumbs
	const renderBreadcrumbs = () => {
		const seriesName = activeItem.SeriesName;
		const seriesId = activeItem.SeriesId;
		const seasonName = activeItem.SeasonName;
		const seasonId = activeItem.SeasonId;

		const parts = [];
		if (activeItem.Type === 'Episode') {
			if (seriesName) {
				parts.push(
					<SpottableButton
						key="series"
						className={css.breadcrumbLink}
						data-id={seriesId}
						onClick={handleBreadcrumbClick}
					>
						{seriesName}
					</SpottableButton>
				);
				parts.push(<span key="sep1" className={css.breadcrumbSep}> \ </span>);
			}
			if (seasonName) {
				parts.push(
					<SpottableButton
						key="season"
						className={css.breadcrumbLink}
						data-id={seasonId}
						onClick={handleBreadcrumbClick}
					>
						{seasonName}
					</SpottableButton>
				);
				parts.push(<span key="sep2" className={css.breadcrumbSep}> \ </span>);
			}
			parts.push(<span key="episode" className={css.breadcrumbText}>{activeItem.Name}</span>);
		} else if (activeItem.Type === 'Season') {
			if (seriesName) {
				parts.push(
					<SpottableButton
						key="series"
						className={css.breadcrumbLink}
						data-id={seriesId}
						onClick={handleBreadcrumbClick}
					>
						{seriesName}
					</SpottableButton>
				);
				parts.push(<span key="sep1" className={css.breadcrumbSep}> \ </span>);
			}
			parts.push(<span key="season" className={css.breadcrumbText}>{activeItem.Name}</span>);
		} else {
			parts.push(<span key="item" className={css.breadcrumbText}>{activeItem.Name}</span>);
		}

		return <div className={css.breadcrumbs}>{parts}</div>;
	};

	const isGridView = focusedCategory !== null;

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<ModalContainer className={css.dialog} spotlightId="change-artwork-modal">
				{/* Header */}
				<div className={css.header}>
					<div className={css.headerLeft}>
						<h1 className={css.title}>{$L('Change Artwork')}</h1>
						{renderBreadcrumbs()}
					</div>
					<div className={css.headerRight}>
						{/* History Back */}
						<SpottableButton
							className={`${css.chevronBtn} ${historyIndex === 0 ? css.disabled : ''}`}
							onClick={goBack}
							disabled={historyIndex === 0}
							spotlightId="history-back-btn"
						>
							<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
						</SpottableButton>
						{/* History Forward */}
						<SpottableButton
							className={`${css.chevronBtn} ${historyIndex === history.length - 1 ? css.disabled : ''}`}
							onClick={goForward}
							disabled={historyIndex === history.length - 1}
							spotlightId="history-forward-btn"
						>
							<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
						</SpottableButton>
						{/* Close Button */}
						<SpottableButton
							className={css.closeBtn}
							onClick={handleCloseClick}
							spotlightId="dialog-close-btn"
						>
							<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
						</SpottableButton>
					</div>
				</div>

				{/* Global Filters & Actions */}
				{!isGridView && (
					<div className={css.filterBar}>
						{availableSources.length > 0 && (
							<SpottableButton
								className={css.filterBtn}
								onClick={handleOpenSourcesClick}
								spotlightId="sources-filter-btn"
							>
								{$L('Sources')}
							</SpottableButton>
						)}
						<SpottableButton
							className={`${css.filterBtn} ${onlyShowInterfaceLanguage ? css.activeFilter : ''}`}
							onClick={toggleLanguageFilter}
							spotlightId="lang-filter-btn"
						>
							{onlyShowInterfaceLanguage ? $L('Show All Languages') : $L('Local Language Only')}
						</SpottableButton>
						<SpottableButton
							className={`${css.filterBtn} ${css.clearAllBtn}`}
							onClick={handleOpenClearAllClick}
							spotlightId="clear-all-btn"
						>
							{$L('Clear All Artwork')}
						</SpottableButton>
					</div>
				)}

				<div className={css.body}>
					{!isGridView ? (
						<Scroller className={css.scroller} direction="vertical">
							{supportedCategories.map((category) => {
								const currentTags = getCurrentTags(activeItem, category);
								const remoteList = (remoteImages[category] || []).filter(shouldShowImage);
								const loading = loadingCategories[category];
								const dims = getImageDimensions(category, activeItem.Type);
								const sizeClass = css[getCardSizeClass(category, activeItem.Type)];

								return (
									<div key={category} className={css.categorySection}>
										<div className={css.categoryHeader}>
											<span className={css.categoryTitle}>
												{getCategoryDisplayName(category, activeItem.Type)}
											</span>
											{remoteList.length > 0 && (
												<SpottableButton
													className={css.viewAllBtn}
													data-category={category}
													onClick={handleViewAllClick}
												>
													{$L('View All ({count})').replace('{count}', remoteList.length)}
												</SpottableButton>
											)}
										</div>

										<Scroller direction="horizontal" verticalScrollbar="hidden" horizontalScrollbar="hidden" className={css.cardRowScroller}>
											<div className={css.cardRow}>
												{/* Current Images */}
												{currentTags.map((tag, idx) => (
													<SpottableDiv
														key={`current-${tag}-${idx}`}
														className={`${css.cardWrapper} ${sizeClass}`}
													>
														<img
															src={getImageUrl(serverUrl, activeItem.Id, category, {maxWidth: 400, tag})}
															className={css.cardImg}
															alt=""
														/>
														<div className={css.cardBadge}>{$L('Current')}</div>
														<SpottableButton
															className={css.cardActionBtn}
															data-category={category}
															data-index={category === 'Backdrop' ? idx : ''}
															onClick={handleDeleteConfirmClick}
														>
															<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
														</SpottableButton>
													</SpottableDiv>
												))}

												{/* Remote Images (subset for list view) */}
												{loading && (
													<div className={`${css.loaderCard} ${sizeClass}`}>
														<div className={css.spinner} />
													</div>
												)}

												{!loading && remoteList.slice(0, 8).map((img, idx) => {
													const optimizedUrl = getOptimizedRemoteImageUrl(img.ThumbnailUrl || img.Url, category, dims.width);
													return (
														<SpottableDiv
															key={`remote-${img.Url || idx}`}
															className={`${css.cardWrapper} ${sizeClass}`}
															data-category={category}
															data-index={idx}
															onClick={handleRemoteCardClick}
														>
															<img src={optimizedUrl} className={css.cardImg} alt="" />
															<div className={css.cardFooter}>
																<span className={css.cardProvider}>{img.ProviderName}</span>
																{img.Width && img.Height && (
																	<span className={css.cardResolution}>{img.Width}x{img.Height}</span>
																)}
															</div>
														</SpottableDiv>
													);
												})}

												{!loading && currentTags.length === 0 && remoteList.length === 0 && (
													<div className={`${css.emptyCard} ${sizeClass}`}>
														<span>{$L('No artwork found')}</span>
													</div>
												)}
											</div>
										</Scroller>
									</div>
								);
							})}
						</Scroller>
					) : (
						/* Category Grid View */
						<div className={css.gridView}>
							<div className={css.gridHeader}>
								<SpottableButton
									className={css.backBtn}
									onClick={handleCloseGridClick}
									spotlightId="grid-back-btn"
								>
									<svg viewBox="0 0 24 24" className={css.backBtnIcon}><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
									{$L('Back')}
								</SpottableButton>
								<h2 className={css.gridTitle}>
									{getCategoryDisplayName(focusedCategory, activeItem.Type)}
								</h2>

								{/* Resolution Selection Chips */}
								<div className={css.resolutionChips}>
									{RESOLUTIONS.map((res) => (
										<SpottableButton
											key={res}
											className={`${css.resolutionChip} ${selectedResolution === res ? css.activeChip : ''}`}
											data-resolution={res}
											onClick={handleResolutionChipClick}
										>
											{res}
										</SpottableButton>
									))}
								</div>
							</div>

							<Scroller className={css.gridScroller} direction="vertical">
								<div className={css.gridContent}>
									{/* Current Images */}
									{getCurrentTags(activeItem, focusedCategory).map((tag, idx) => {
										return (
											<SpottableDiv
												key={`grid-current-${tag}-${idx}`}
												className={`${css.cardWrapper} ${gridSizeClass}`}
											>
												<img
													src={getImageUrl(serverUrl, activeItem.Id, focusedCategory, {maxWidth: 400, tag})}
													className={css.cardImg}
													alt=""
												/>
												<div className={css.cardBadge}>{$L('Current')}</div>
												<SpottableButton
													className={css.cardActionBtn}
													data-category={focusedCategory}
													data-index={focusedCategory === 'Backdrop' ? idx : ''}
													onClick={handleDeleteConfirmClick}
												>
													<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
												</SpottableButton>
											</SpottableDiv>
										);
									})}

									{/* Remote Images in Grid */}
									{gridRemoteImages.map((img, idx) => {
										const optimizedUrl = getOptimizedRemoteImageUrl(img.ThumbnailUrl || img.Url, focusedCategory, gridImageWidth);
										return (
											<SpottableDiv
												key={`grid-remote-${img.Url || idx}`}
												className={`${css.cardWrapper} ${gridSizeClass}`}
												data-category={focusedCategory}
												data-index={idx}
												onClick={handleRemoteCardClick}
											>
												<img src={optimizedUrl} className={css.cardImg} alt="" />
												<div className={css.cardFooter}>
													<span className={css.cardProvider}>{img.ProviderName}</span>
													{img.Width && img.Height && (
														<span className={css.cardResolution}>{img.Width}x{img.Height}</span>
													)}
												</div>
											</SpottableDiv>
										);
									})}

									{getCurrentTags(activeItem, focusedCategory).length === 0 && gridRemoteImages.length === 0 && (
										<div className={css.emptyCard}>
											<span>{$L('No artwork found')}</span>
										</div>
									)}
								</div>
							</Scroller>
						</div>
					)}
				</div>

				{/* Overlays / Popups */}

				{/* Sources Filter Select Popup */}
				{showSourcesPopup && (
					<div className={css.modalOverlay}>
						<RestrictedContainer className={css.sourcesPanel} spotlightId="sources-popup">
							<h3 className={css.panelTitle}>{$L('Filter Providers')}</h3>
							<div className={css.sourcesList}>
								{availableSources.map(src => (
									<SpottableDiv
										key={src}
										className={css.sourceItem}
										data-source={src}
										onClick={handleSourceItemClick}
									>
										<input
											type="checkbox"
											className={css.checkbox}
											checked={!deselectedSources.has(src)}
											readOnly
										/>
										<span className={css.sourceName}>{src}</span>
									</SpottableDiv>
								))}
							</div>
							<SpottableButton
								className={css.btn}
								onClick={handleSourcesClose}
								spotlightId="sources-close-btn"
							>
								{$L('Close')}
							</SpottableButton>
						</RestrictedContainer>
					</div>
				)}

				{/* Delete Confirmation Dialog */}
				{deleteConfirm && (
					<div className={css.modalOverlay}>
						<RestrictedContainer className={css.confirmPanel} spotlightId="delete-confirm">
							<h3 className={css.panelTitle}>{$L('Confirm Delete')}</h3>
							<p className={css.panelMessage}>{$L('Are you sure you want to delete this custom artwork?')}</p>
							<div className={css.formButtons}>
								<SpottableButton
									className={`${css.btn} ${css.btnPrimary}`}
									onClick={handleDeleteConfirmYes}
									spotlightId="delete-yes-btn"
								>
									{$L('Delete')}
								</SpottableButton>
								<SpottableButton
									className={css.btn}
									onClick={handleDeleteConfirmNo}
									spotlightId="delete-no-btn"
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						</RestrictedContainer>
					</div>
				)}

				{/* Clear All Confirmation Dialog */}
				{clearAllConfirm && (
					<div className={css.modalOverlay}>
						<RestrictedContainer className={css.confirmPanel} spotlightId="clear-all-confirm">
							<h3 className={css.panelTitle}>{$L('Confirm Clear All')}</h3>
							<p className={css.panelMessage}>{$L('Are you sure you want to clear all custom artwork for this item?')}</p>
							<div className={css.formButtons}>
								<SpottableButton
									className={`${css.btn} ${css.btnPrimary}`}
									onClick={handleClearAllYes}
									spotlightId="clear-all-yes-btn"
								>
									{$L('Clear')}
								</SpottableButton>
								<SpottableButton
									className={css.btn}
									onClick={handleClearAllNo}
									spotlightId="clear-all-no-btn"
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						</RestrictedContainer>
					</div>
				)}

				{/* Proactive / Reactive Write Access Warning Dialog */}
				{writeAccessWarning && (
					<div className={css.modalOverlay}>
						<RestrictedContainer className={css.warningPanel} spotlightId="write-access-warning">
							<h3 className={css.panelTitle}>{$L('Warning: No Write Access')}</h3>
							<p className={css.panelMessage}>{writeAccessWarning}</p>
							<p className={css.panelTip}>
								{$L('Make sure the media folders are writable by the Jellyfin system user on your host.')}
							</p>
							<SpottableButton
								className={css.btn}
								onClick={handleWarningDismiss}
								spotlightId="warning-dismiss-btn"
							>
								{$L('Dismiss')}
							</SpottableButton>
						</RestrictedContainer>
					</div>
				)}

				{/* Zoom Preview Dialog */}
				{previewImage && (
					<div className={css.modalOverlay}>
						<RestrictedContainer className={css.previewPanel} spotlightId="zoom-preview">
							<div className={css.previewHeader}>
								<h3>{$L('Preview: {provider}').replace('{provider}', previewImage.image.ProviderName)}</h3>
								{previewImage.image.Width && previewImage.image.Height && (
									<span className={css.previewResolution}>
										{previewImage.image.Width}x{previewImage.image.Height}
									</span>
								)}
							</div>
							<div className={css.previewImgWrapper}>
								<img
									src={previewImage.image.Url}
									className={css.previewImg}
									alt=""
								/>
							</div>
							<div className={css.formButtons}>
								<SpottableButton
									className={`${css.btn} ${css.btnPrimary}`}
									onClick={handlePreviewUse}
									spotlightId="preview-use-btn"
								>
									{$L('Use Image')}
								</SpottableButton>
								<SpottableButton
									className={css.btn}
									onClick={handlePreviewCancel}
									spotlightId="preview-cancel-btn"
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						</RestrictedContainer>
					</div>
				)}
			</ModalContainer>
		</div>
	);
};

export default ChangeArtworkModal;
