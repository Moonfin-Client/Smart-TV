import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';

import {getServerType} from '../../services/jellyfinApi';
import {getSupportedImageTypes, hasRemoteImages} from './artworkTypes';

// Owns the item being edited: its browsing history, the remote images offered
// for each category, and the server write access warning.
const useArtworkItem = ({open, initialItem, api, onError}) => {
	const [activeItem, setActiveItem] = useState(initialItem);
	const [history, setHistory] = useState([initialItem]);
	const [historyIndex, setHistoryIndex] = useState(0);

	const [supportedCategories, setSupportedCategories] = useState([]);
	const [remoteImages, setRemoteImages] = useState({});
	const [loadingCategories, setLoadingCategories] = useState({});
	const [writeAccessWarning, setWriteAccessWarning] = useState(null);

	// Server write access reports cover every library, so fetch them once and
	// match the current item's path each load.
	const writeAccessReportsRef = useRef(null);
	// Bumped on each load so stale async responses from a previous item are ignored.
	const loadIdRef = useRef(0);

	const loadItem = useCallback(async (itemToLoad) => {
		const loadId = ++loadIdRef.current;
		setActiveItem(itemToLoad);
		const categories = getSupportedImageTypes(itemToLoad.Type, getServerType());
		setSupportedCategories(categories);
		setRemoteImages({});
		setLoadingCategories({});
		setWriteAccessWarning(null);

		if (hasRemoteImages(itemToLoad.Type)) {
			categories.forEach(async (category) => {
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
		} else {
			const empty = {};
			categories.forEach(category => { empty[category] = []; });
			setRemoteImages(empty);
		}

		// Warn up front when the server can't write to this item's library path.
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
				console.warn('Failed to check libraries write access:', e);
			}
		}
	}, [api]);

	useEffect(() => {
		if (open && initialItem) {
			setHistory([initialItem]);
			setHistoryIndex(0);
			writeAccessReportsRef.current = null;
			loadItem(initialItem);
		}
	}, [open, initialItem, loadItem]);

	// Following a breadcrumb pushes onto the history, dropping anything ahead of
	// the current position the way a browser does.
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
			onError?.($L('Failed to load item'));
		}
	}, [api, history, historyIndex, loadItem, onError]);

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

	// Re-reads the item after a write so the current cards pick up the new tags
	// without re-running the remote image fetches.
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

	return {
		activeItem,
		supportedCategories,
		remoteImages,
		loadingCategories,
		writeAccessWarning,
		setWriteAccessWarning,
		canGoBack: historyIndex > 0,
		canGoForward: historyIndex < history.length - 1,
		goBack,
		goForward,
		navigateToItem,
		refreshItemMetadata
	};
};

export default useArtworkItem;
