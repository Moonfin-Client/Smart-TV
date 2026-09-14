// The request flow: what the viewer is allowed to ask for, which popup that takes them
// through, and cancelling or reporting a problem afterwards. HD and 4K are tracked separately
// and each has its own control, so everything here works one track at a time.

import {useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import seerrApi, {canRequestMovies, canRequestTv, canRequest4kMovies, canRequest4kTv, hasAdvancedRequestPermission, canCreateIssues, canManageRequests} from '../../services/seerrApi';
import {MEDIA_STATUS, REQUEST_STATUS} from '../../utils/seerrStatus';
import {getStatusPills, isSeasonRerequestable, seasonMarkerStatus} from '../../utils/seerrBadges';
import {
	cancelableRequests, isContinuingSeries, requestOfferFor, seasonNumbersOf, unavailableOrRequestedSeasons
} from '../../utils/seerrRequestRules';
import {closeSeerrTagsDialog} from '../../utils/seerrTagsDialogBack';

const useSeerrRequests = ({
	mediaId, mediaType, details, setDetails, setError, isAuthenticated,
	userPermissions, currentUserId, is4kEnabled, hdStatus, status4k
}) => {
	const [requesting, setRequesting] = useState(false);
	const [showQualityPopup, setShowQualityPopup] = useState(false);
	const [showSeasonPopup, setShowSeasonPopup] = useState(false);
	const [showAdvancedPopup, setShowAdvancedPopup] = useState(false);
	const [pendingIs4k, setPendingIs4k] = useState(false);
	const [pendingSeasons, setPendingSeasons] = useState(null);
	const [showCancelPopup, setShowCancelPopup] = useState(false);
	// Which track the cancel popup is about.
	const [cancelScope, setCancelScope] = useState(false);
	const [showReportPopup, setShowReportPopup] = useState(false);
	const [showManagePopup, setShowManagePopup] = useState(false);

	const handleCloseQualityPopup = useCallback(() => setShowQualityPopup(false), []);
	const handleCloseSeasonPopup = useCallback(() => setShowSeasonPopup(false), []);
	const handleCloseAdvancedPopup = useCallback(() => setShowAdvancedPopup(false), []);
	const handleCloseCancelPopup = useCallback(() => setShowCancelPopup(false), []);
	const handleCloseReportPopup = useCallback(() => setShowReportPopup(false), []);
	const handleCloseManagePopup = useCallback(() => setShowManagePopup(false), []);

	// BACK dismisses the innermost popup. Handed back rather than installed on a handler ref,
	// because the detail screen already owns that ref for its own overlays and one of the two
	// would otherwise overwrite the other.
	const closeTopPopup = useCallback(() => {
		if (closeSeerrTagsDialog()) return true;
		if (showManagePopup) { setShowManagePopup(false); return true; }
		if (showQualityPopup) { setShowQualityPopup(false); return true; }
		if (showReportPopup) { setShowReportPopup(false); return true; }
		if (showAdvancedPopup) { setShowAdvancedPopup(false); return true; }
		if (showSeasonPopup) { setShowSeasonPopup(false); return true; }
		if (showCancelPopup) { setShowCancelPopup(false); return true; }
		return false;
	}, [showQualityPopup, showSeasonPopup, showAdvancedPopup, showCancelPopup, showReportPopup, showManagePopup]);

	// Issue reports need the seerr internal media id, so the title has to be at least
	// partially available on the server before the button is offered.
	const canReportIssue = useMemo(() => {
		if (!canCreateIssues(userPermissions)) return false;
		if (details?.mediaInfo?.id == null) return false;
		const watchable = [MEDIA_STATUS.PARTIALLY_AVAILABLE, MEDIA_STATUS.AVAILABLE];
		return watchable.indexOf(hdStatus) !== -1 || watchable.indexOf(status4k) !== -1;
	}, [userPermissions, details, hdStatus, status4k]);

	const handleReportIssueClick = useCallback(() => setShowReportPopup(true), []);

	const handleReportSubmit = useCallback(async ({issueType, message, problemSeason, problemEpisode}) => {
		try {
			await seerrApi.createIssue({
				issueType,
				message,
				mediaId: details.mediaInfo.id,
				problemSeason,
				problemEpisode
			});
			setShowReportPopup(false);
		} catch (err) {
			console.error('Issue report failed:', err.message);
		}
	}, [details]);

	const requests = useMemo(() => details?.mediaInfo?.requests ?? [], [details]);
	const hdDeclined = useMemo(() => requests.some(r => !r.is4k && r.status === REQUEST_STATUS.DECLINED), [requests]);
	const fourKDeclined = useMemo(() => requests.some(r => r.is4k && r.status === REQUEST_STATUS.DECLINED), [requests]);
	// Seerr's own rule for what is still open, and so what can be taken back. Approving or
	// declining, though, only applies to a request nobody has ruled on yet.
	const activeRequests = useMemo(() => requests.filter(
		r => r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.APPROVED
	), [requests]);
	const pendingRequests = useMemo(() => requests.filter(r => r.status === REQUEST_STATUS.PENDING), [requests]);
	const hasOpenHdRequest = useMemo(() => activeRequests.some(r => !r.is4k), [activeRequests]);
	const hasOpenFourKRequest = useMemo(() => activeRequests.some(r => r.is4k), [activeRequests]);

	const getSeasonStatusMap = useCallback((is4k) => {
		const statusMap = new Map();
		if (!requests || requests.length === 0) return statusMap;

		requests.forEach(req => {
			if (req.is4k === is4k) {
				req.seasons?.forEach(seasonReq => {
					const existingStatus = statusMap.get(seasonReq.seasonNumber);
					const newStatus = seasonReq.status;
					if (!existingStatus ||
						(isSeasonRerequestable(existingStatus) && !isSeasonRerequestable(newStatus)) ||
						(newStatus === REQUEST_STATUS.COMPLETED) ||
						(newStatus === REQUEST_STATUS.APPROVED && existingStatus === REQUEST_STATUS.PENDING)) {
						statusMap.set(seasonReq.seasonNumber, newStatus);
					}
				});
			}
		});
		return statusMap;
	}, [requests]);

	const seasonStatusMapHd = useMemo(() => getSeasonStatusMap(false), [getSeasonStatusMap]);
	const seasonStatusMap4k = useMemo(() => getSeasonStatusMap(true), [getSeasonStatusMap]);

	// What to mark each season card with, keyed by season number. The server keeps its own
	// per-season list and that wins where it exists, and the requests fill in the seasons it
	// says nothing about, which is how a brand new request shows before Seerr has caught up.
	const seasonMarkers = useMemo(() => {
		const markers = new Map();
		(details?.mediaInfo?.seasons || []).forEach((season) => {
			const status = season.status > MEDIA_STATUS.UNKNOWN ? season.status : season.status4k;
			if (status > MEDIA_STATUS.UNKNOWN) markers.set(season.seasonNumber, status);
		});
		seasonStatusMapHd.forEach((requestStatus, seasonNumber) => {
			if (markers.has(seasonNumber)) return;
			const status = seasonMarkerStatus(requestStatus);
			if (status) markers.set(seasonNumber, status);
		});
		return markers;
	}, [details, seasonStatusMapHd]);

	const isBlacklisted = useMemo(() =>
		hdStatus === MEDIA_STATUS.BLOCKLISTED || status4k === MEDIA_STATUS.BLOCKLISTED,
	[hdStatus, status4k]);

	const isTv = mediaType !== 'movie';

	// A running series can always grow another season, so it never closes the way a film does.
	const isContinuing = useMemo(() => isTv && isContinuingSeries(details?.status), [isTv, details]);

	// Whether a season is still there for the asking, which is the one thing that reopens the
	// button while a request on some other season is already running.
	const unrequestedSeasons = useCallback((is4k) => {
		if (!isTv) return false;
		const taken = unavailableOrRequestedSeasons(
			details?.mediaInfo?.seasons,
			activeRequests.filter(r => Boolean(r.is4k) === is4k),
			is4k
		);
		return seasonNumbersOf(details?.seasons, details?.numberOfSeasons ?? 0)
			.some((season) => !taken.has(season));
	}, [isTv, details, activeRequests]);

	// No download server check. Seerr takes the request either way and holds it
	// until there is somewhere to send it, so asking for one here only hid the
	// button on a setup that would have worked.
	const hdOffer = useMemo(() => requestOfferFor({
		status: hdStatus,
		hasExistingRequest: hasOpenHdRequest,
		allowed: isAuthenticated && !isBlacklisted && !hdDeclined && (mediaType === 'movie'
			? canRequestMovies(userPermissions)
			: canRequestTv(userPermissions)),
		isTv,
		isContinuing,
		hasUnrequestedSeasons: unrequestedSeasons(false)
	}), [hdStatus, hasOpenHdRequest, isAuthenticated, isBlacklisted, hdDeclined,
		mediaType, userPermissions, isTv, isContinuing, unrequestedSeasons]);

	const fourKOffer = useMemo(() => requestOfferFor({
		status: status4k,
		hasExistingRequest: hasOpenFourKRequest,
		allowed: isAuthenticated && !isBlacklisted && !fourKDeclined && is4kEnabled && (mediaType === 'movie'
			? canRequest4kMovies(userPermissions)
			: canRequest4kTv(userPermissions)),
		isTv,
		isContinuing,
		hasUnrequestedSeasons: unrequestedSeasons(true)
	}), [status4k, hasOpenFourKRequest, isAuthenticated, isBlacklisted, fourKDeclined, is4kEnabled,
		mediaType, userPermissions, isTv, isContinuing, unrequestedSeasons]);

	const canRequestHd = hdOffer.canRequest;
	const canRequest4k = fourKOffer.canRequest;

	const hasAdvanced = useMemo(() =>
		hasAdvancedRequestPermission(userPermissions),
	[userPermissions]);

	const statusPills = useMemo(() =>
		getStatusPills(hdStatus, status4k, hdDeclined, fourKDeclined),
	[hdStatus, status4k, hdDeclined, fourKDeclined]
	);

	const reloadDetails = useCallback(async () => {
		const updated = mediaType === 'movie'
			? await seerrApi.getMovie(mediaId)
			: await seerrApi.getTv(mediaId);
		setDetails(updated);
	}, [mediaId, mediaType, setDetails]);

	// Each label speaks only for its own half, since asking and taking back are
	// separate controls.
	const requestLabel = useMemo(() =>
		hdOffer.wantsMore ? $L('Request More') : $L('Request'),
	[hdOffer]);

	const requestLabel4k = useMemo(() =>
		fourKOffer.wantsMore ? $L('Request More in 4K') : $L('Request 4K'),
	[fourKOffer]);

	const handleRequest = useCallback(async (is4K = false, seasons = null, advancedOptions = null) => {
		if (requesting) return;

		setShowSeasonPopup(false);
		setShowAdvancedPopup(false);
		setRequesting(true);
		try {
			const options = {
				is4k: is4K,
				...(advancedOptions || {})
			};

			if (mediaType === 'movie') {
				await seerrApi.requestMovie(mediaId, options);
			} else {
				await seerrApi.requestTv(mediaId, {
					...options,
					seasons: seasons || 'all'
				});
			}
			await reloadDetails();
		} catch (err) {
			console.error('Request failed:', err);
			setError(err.message || $L('Request failed'));
		} finally {
			setRequesting(false);
		}
	}, [mediaId, mediaType, requesting, reloadDetails, setError]);

	const proceedWithRequest = useCallback((is4K, seasons = null) => {
		if (hasAdvanced) {
			setPendingIs4k(is4K);
			setPendingSeasons(seasons);
			setShowAdvancedPopup(true);
		} else {
			handleRequest(is4K, seasons);
		}
	}, [hasAdvanced, handleRequest]);

	// A series asks which seasons first, everything else goes straight on to the request.
	const handleRequestTrack = useCallback((is4k) => {
		setShowQualityPopup(false);
		if (mediaType === 'tv' && details?.seasons?.length > 0) {
			setPendingIs4k(is4k);
			setShowSeasonPopup(true);
			return;
		}
		proceedWithRequest(is4k);
	}, [mediaType, details?.seasons, proceedWithRequest]);

	// The single request control for a title with nothing owned. A viewer allowed
	// both tracks picks one first, anyone else goes straight to the track they hold.
	const handleRequestChoose = useCallback(() => {
		if (canRequestHd && canRequest4k) {
			setShowQualityPopup(true);
			return;
		}
		handleRequestTrack(canRequest4k);
	}, [canRequestHd, canRequest4k, handleRequestTrack]);

	const handleSeasonConfirm = useCallback((selectedSeasons) => {
		proceedWithRequest(pendingIs4k, selectedSeasons);
	}, [pendingIs4k, proceedWithRequest]);

	const handleAdvancedConfirm = useCallback((advancedOptions) => {
		handleRequest(pendingIs4k, pendingSeasons, advancedOptions);
	}, [pendingIs4k, pendingSeasons, handleRequest]);

	const handleCancelTrack = useCallback((is4k) => {
		setCancelScope(is4k);
		setShowCancelPopup(true);
	}, []);

	// Only what Seerr would actually let this viewer take back, so the button never leads to
	// a refusal from the server.
	const cancelable = useCallback((is4k) => cancelableRequests(
		activeRequests.filter(r => Boolean(r.is4k) === is4k),
		{canManageRequests: canManageRequests(userPermissions), currentUserId}
	), [activeRequests, userPermissions, currentUserId]);

	const canCancelHd = useMemo(() => cancelable(false).length > 0, [cancelable]);
	const canCancel4k = useMemo(() => cancelable(true).length > 0, [cancelable]);

	const cancelTargets = useMemo(() => cancelable(cancelScope), [cancelable, cancelScope]);

	const handleCancelConfirm = useCallback(async () => {
		setShowCancelPopup(false);
		try {
			for (const req of cancelTargets) {
				await seerrApi.cancelRequest(req.id);
			}
			await reloadDetails();
		} catch (err) {
			console.error('Cancel failed:', err);
			setError(err.message || $L('Failed to cancel request'));
		}
	}, [cancelTargets, reloadDetails, setError]);

	// Approving and declining are offered on the title itself, so a moderator doesn't have to
	// find their way to the requests screen for something already in front of them.
	const canManage = useMemo(() => canManageRequests(userPermissions), [userPermissions]);

	const handleManageRequestsClick = useCallback(() => setShowManagePopup(true), []);

	const handleResolveRequest = useCallback(async (requestId, approved) => {
		try {
			if (approved) {
				await seerrApi.approveRequest(requestId);
			} else {
				await seerrApi.declineRequest(requestId);
			}
			await reloadDetails();
		} catch (err) {
			console.error('Request update failed:', err);
			setError(err.message || $L('Failed to update request'));
		}
	}, [reloadDetails, setError]);

	return {
		activeRequests,
		cancelTargets,
		canManage,
		canReportIssue,
		canRequest4k,
		canRequestHd,
		closeTopPopup,
		fourKDeclined,
		handleAdvancedConfirm,
		handleCancelConfirm,
		handleCloseAdvancedPopup,
		handleCloseCancelPopup,
		handleCloseManagePopup,
		handleCloseReportPopup,
		handleCancelTrack,
		handleCloseQualityPopup,
		handleCloseSeasonPopup,
		handleManageRequestsClick,
		handleRequestChoose,
		handleReportIssueClick,
		handleReportSubmit,
		handleRequestTrack,
		handleResolveRequest,
		handleSeasonConfirm,
		hasAdvanced,
		canCancelHd,
		canCancel4k,
		hdDeclined,
		pendingIs4k,
		pendingRequests,
		requestLabel,
		requestLabel4k,
		seasonMarkers,
		seasonStatusMap4k,
		seasonStatusMapHd,
		showAdvancedPopup,
		showCancelPopup,
		showManagePopup,
		showQualityPopup,
		showReportPopup,
		showSeasonPopup,
		statusPills
	};
};

export default useSeerrRequests;
