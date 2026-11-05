// The Seerr side of a detail screen. A library title is matched to Seerr by its TMDB id, and
// anything that doesn't resolve leaves the overlay idle, so the screen renders exactly as it
// did before. A season or episode goes through its series and only gets the Seerr actions.

import {useCallback, useEffect, useMemo, useState} from 'react';

import {useSeerr} from '../../context/SeerrContext';
import seerrApi from '../../services/seerrApi';
import {hasSeerrChips} from '../../components/seerr/SeerrSections';
import {hasMediaFacts} from '../../utils/seerrMediaFacts';
import {normalizeMediaItem} from '../../utils/seerrHomeRows';
import {streamingProviders as providersFor} from '../../utils/seerrStreaming';
import {IDLE, bestSearchMatch, isSeriesPart, seerrTargetFor, seriesTargetFrom} from '../../utils/seerrTarget';
import useSeerrDetailsData from './useSeerrDetailsData';
import useSeerrRequests from './useSeerrRequests';
import useSeerrWatchlist from './useSeerrWatchlist';

// A season or episode page only carries the actions. The chips, facts, pills and rows all describe
// the series and stay on its own page.
const SERIES_PART_HIDES = {
	details: null,
	statusPills: [],
	seasonMarkers: new Map(),
	similarCards: [],
	recommendationCards: [],
	streamingProviders: [],
	pieces: {chips: false, facts: false, streaming: false, recommendations: false, similar: false, collection: false},
	hasTabContent: false
};

// `showsSection` is the viewer's detail sections setting. A piece switched off reads as one
// Seerr had nothing for, so every style draws and focuses the same set.
const useSeerrOverlay = ({item, seerrOnly, showsSection, api}) => {
	const {isEnabled, isAuthenticated, user, displayName} = useSeerr();
	const ready = isEnabled && isAuthenticated;

	const seriesPart = !seerrOnly && isSeriesPart(item);
	const seriesId = seriesPart ? item.SeriesId : null;
	const [seriesTarget, setSeriesTarget] = useState(IDLE);
	useEffect(() => {
		setSeriesTarget(IDLE);
		if (!ready || !seriesId || !api) return undefined;
		let cancelled = false;
		api.getItem(seriesId).then((series) => {
			if (!cancelled) setSeriesTarget(seriesTargetFrom(series));
		}).catch((e) => {
			void e;
		});
		return () => {
			cancelled = true;
		};
	}, [ready, seriesId, api]);

	const rawTarget = useMemo(() => {
		if (!ready) return IDLE;
		return seriesPart ? seriesTarget : seerrTargetFor(item);
	}, [ready, seriesPart, seriesTarget, item]);

	// A title known only by IMDb id has to become a TMDB id before Seerr can say anything
	// about it. The id is searched first since it names exactly one title, and the title
	// search only stands in when the id turns up nothing.
	const [imdbLookup, setImdbLookup] = useState({match: null, done: false});
	useEffect(() => {
		setImdbLookup({match: null, done: false});
		if (!rawTarget.imdbId || rawTarget.mediaId) return undefined;
		let cancelled = false;
		(async () => {
			let page = null;
			try {
				page = await seerrApi.search(rawTarget.imdbId);
			} catch (e) {
				void e;
			}
			if (!page?.results?.length && rawTarget.title) {
				try {
					page = await seerrApi.search(rawTarget.title);
				} catch (e) {
					void e;
				}
			}
			if (cancelled) return;
			const match = bestSearchMatch(page?.results || [], rawTarget.mediaType);
			const matchType = match?.mediaType === 'tv' || match?.mediaType === 'movie' ? match.mediaType : rawTarget.mediaType;
			setImdbLookup({match: match ? {mediaId: match.id, mediaType: matchType} : null, done: true});
		})();
		return () => {
			cancelled = true;
		};
	}, [rawTarget]);

	const resolvingImdb = Boolean(rawTarget.imdbId) && !rawTarget.mediaId && !imdbLookup.done;
	const target = useMemo(
		() => (!rawTarget.mediaId && imdbLookup.match ? {...rawTarget, ...imdbLookup.match} : rawTarget),
		[rawTarget, imdbLookup.match]
	);

	// A lookup that comes back empty is the ordinary case for a title Seerr has never heard of,
	// so it stays quiet. A request that fails is the viewer's own action going wrong and has to
	// be said out loud, which is why the two errors are kept apart.
	const [actionError, setActionError] = useState(null);
	const clearActionError = useCallback(() => setActionError(null), []);

	const data = useSeerrDetailsData({
		mediaId: target.mediaId,
		mediaType: target.mediaType,
		contextUser: user
	});

	const requests = useSeerrRequests({
		mediaId: target.mediaId,
		mediaType: target.mediaType,
		details: data.details,
		setDetails: data.setDetails,
		setError: setActionError,
		isAuthenticated,
		userPermissions: data.userPermissions,
		currentUserId: data.currentUserId,
		is4kEnabled: data.is4kEnabled,
		hdStatus: data.hdStatus,
		status4k: data.status4k
	});

	const watchlist = useSeerrWatchlist({
		mediaId: target.mediaId,
		mediaType: target.mediaType,
		details: data.details
	});

	// Seerr's rows arrive in its own shape, and every detail style draws its rows with the
	// library's MediaCard, so they are converted once here rather than in each screen.
	const showsSimilar = showsSection('seerrSimilar');
	const showsRecommendations = showsSection('seerrRecommendations');
	const similarCards = useMemo(
		() => (showsSimilar ? data.similar.map(normalizeMediaItem) : []),
		[data.similar, showsSimilar]
	);
	const recommendationCards = useMemo(
		() => (showsRecommendations ? data.recommendations.map(normalizeMediaItem) : []),
		[data.recommendations, showsRecommendations]
	);

	const streamingProviders = useMemo(
		() => providersFor(data.details, data.streamingRegion),
		[data.details, data.streamingRegion]
	);

	const isActive = Boolean(target.mediaId && data.details);

	// The parts of the Seerr block with something to show that the viewer left on.
	const pieces = {
		chips: isActive && showsSection('seerrGenresTags') && hasSeerrChips(data.details),
		facts: isActive && showsSection('seerrStats') && hasMediaFacts(data.details, target.mediaType),
		streaming: isActive && showsSection('seerrStreaming') && streamingProviders.length > 0,
		recommendations: isActive && recommendationCards.length > 0,
		similar: isActive && similarCards.length > 0,
		collection: isActive && showsSection('seerrCollection') && Boolean(data.details.collection)
	};

	// A title Seerr knows of but has nothing to say about would otherwise offer
	// an empty tab.
	const hasTabContent = pieces.chips || pieces.facts || pieces.streaming || pieces.recommendations || pieces.similar || pieces.collection;

	const offersRequest = seerrOnly
		? requests.canRequestHd || requests.canRequest4k
		: requests.canRequestHd;
	const offersRequest4k = !seerrOnly && requests.canRequest4k;

	const {handleRequestTrack, handleCancelTrack} = requests;
	const onRequest = useCallback(() => handleRequestTrack(false), [handleRequestTrack]);
	const onRequest4k = useCallback(() => handleRequestTrack(true), [handleRequestTrack]);
	const onCancel = useCallback(() => handleCancelTrack(false), [handleCancelTrack]);
	const onCancel4k = useCallback(() => handleCancelTrack(true), [handleCancelTrack]);

	return {
		...data,
		...requests,
		// The screen must keep its loading state up while the IMDb id is still becoming
		// a TMDB id, or it renders empty for the wait.
		loading: data.loading || resolvingImdb,
		similarCards,
		recommendationCards,
		streamingProviders,
		displayName,
		mediaType: target.mediaType,
		isActive,
		pieces,
		hasTabContent,
		onRequest4k,
		onCancel,
		onCancel4k,
		actionError,
		clearActionError,
		// With nothing owned, one control covers both tracks, and its sheet
		// carries a quality switch when the viewer can ask for both. A library title
		// gets a button per track instead, since there the 4K one asks for the
		// track that is missing. Worked out once so the two button rows agree
		// without restating the rules.
		offersRequest,
		offersRequest4k,
		requestLabel: seerrOnly && !requests.canRequestHd
			? requests.requestLabel4k
			: requests.requestLabel,
		onRequestPrimary: seerrOnly ? requests.handleRequestChoose : onRequest,
		showsRequest: isActive && (offersRequest || requests.canCancelHd),
		showsRequest4k: isActive && (offersRequest4k || requests.canCancel4k),
		showsReportIssue: isActive && requests.canReportIssue,
		showsManage: isActive && requests.canManage && requests.pendingRequests.length > 0,
		showsWatchlist: isActive,
		onWatchlist: watchlist.onWatchlist,
		toggleWatchlist: watchlist.toggleWatchlist,
		// What the request and report dialogs read, which a season or episode page still needs
		sheetDetails: data.details,
		...(seriesPart ? SERIES_PART_HIDES : null)
	};
};

export default useSeerrOverlay;
