// Get a different release: an admin takes a stuck download out of Radarr or Sonarr's queue, the
// arr blocks that release and searches for another. Offered only when the plugin said this viewer
// may remove it and the HD bar is stalled, blocked on import or failed.

import {useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import {arrServiceName} from '../../utils/seerrArrQueue';

const useSeerrReleaseSwap = ({release, mediaId, mediaType, setDetails, setError, setNotice}) => {
	// The release the open dialog names, so confirming removes what the viewer read even when a
	// poll lands in between. Null while the dialog is closed.
	const [popupRelease, setPopupRelease] = useState(null);
	const [swapping, setSwapping] = useState(false);

	// The title on screen now, so a reload that finishes after the viewer moved on is dropped.
	const currentTitle = useRef(null);
	currentTitle.current = `${mediaType}:${mediaId}`;

	// A download that started moving again, or a new title, takes the dialog away with it.
	const releaseKey = release ? `${release.service}:${release.id}` : null;
	useEffect(() => {
		setPopupRelease(null);
	}, [releaseKey, mediaId]);

	const handleSwapReleaseClick = useCallback(() => setPopupRelease(release), [release]);
	const handleCloseSwapPopup = useCallback(() => setPopupRelease(null), []);

	const handleSwapConfirm = useCallback(async () => {
		const target = popupRelease;
		setPopupRelease(null);
		if (!target || swapping) return;
		const title = `${mediaType}:${mediaId}`;
		setSwapping(true);
		try {
			// A 404 means it already left the queue, which the call counts as done.
			await seerrApi.removeArrQueueItem(target.service, target.id);
		} catch (err) {
			setSwapping(false);
			setError($L("Couldn't remove the download"));
			return;
		}
		setNotice($L('Removed. {service} is searching for another release.').replace('{service}', () => arrServiceName(target.service)));
		// The fresh details ask the queue again, which takes the bar away. A failed reload only
		// leaves the bar until the next poll.
		try {
			const updated = mediaType === 'movie' ? await seerrApi.getMovie(mediaId) : await seerrApi.getTv(mediaId);
			if (updated && currentTitle.current === title) setDetails(updated);
		} catch (err) {
			void err;
		}
		setSwapping(false);
	}, [popupRelease, swapping, mediaId, mediaType, setDetails, setError, setNotice]);

	return {
		// Hidden while a removal is on its way, so it can't be asked for twice.
		showsSwapRelease: Boolean(release) && !swapping,
		showSwapPopup: Boolean(popupRelease),
		swapRelease: popupRelease,
		handleSwapReleaseClick,
		handleCloseSwapPopup,
		handleSwapConfirm
	};
};

export default useSeerrReleaseSwap;
