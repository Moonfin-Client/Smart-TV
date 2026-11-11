import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import CoreDialog from '../CoreDialog';
import {MaterialIcon} from '../icons/materialIcons';
import {MEDIA_STATUS, isUnlimitedQuota} from '../../utils/seerrStatus';
import {isAvailableStatus, seasonNumbersOf, unavailableOrRequestedSeasons} from '../../utils/seerrRequestRules';
import {SeerrAdvancedRequestOptions, useSeerrAdvancedRequest} from './SeerrAdvancedRequestOptions';
import {SeerrButtonRow, SeerrDialogButton, SeerrDivider, SeerrQuotaRow, SeerrToggleRow} from './SeerrDialogControls';

import css from './SeerrRequestDialog.module.less';

const SpottableDiv = Spottable('div');

// TMDB's anime keyword, which sends a series to the server's anime profile and folder.
const ANIME_KEYWORD = 210024;

const DIALOG_ID = 'seerr-request-dialog';
const MATCH_NEXT_ID = 'seerr-match-next';
const matchId = (tvdbId) => `seerr-match-${tvdbId}`;

// Sonarr can't add a series without a TVDB id, and when TMDB has none Seerr drops the request once it
// sends it on. A series already on Seerr from an earlier request may have one of its own.
const needsSeriesMatch = (details) => details?.externalIds?.tvdbId == null && details?.mediaInfo?.tvdbId == null;

// One of Sonarr's series: poster, year, title and the start of the overview, as Seerr's own picker
// shows them. A pick shows as the fill and the check, so it reads apart from the focus ring.
const MatchCard = ({match, selected, ...rest}) => (
	<SpottableDiv {...rest} className={`${css.match} ${selected ? css.matchSelected : ''}`}>
		<div className={css.matchPoster}>
			{match.remotePoster && <img src={match.remotePoster} alt="" className={css.matchImage} />}
		</div>
		<div className={css.matchText}>
			{match.year > 0 && <div className={css.matchYear}>{match.year}</div>}
			<div className={css.matchTitle}>{match.title}</div>
			{match.overview && <div className={css.matchOverview}>{match.overview}</div>}
		</div>
		{selected && <MaterialIcon name="checkCircle" className={css.matchCheck} />}
	</SpottableDiv>
);

// A season pill. One that can't be asked for has no onClick and can't take focus, and one the
// library already holds carries a check, which says why it's off the table.
const SeasonChip = ({label, selected, isAvailable, onClick, ...rest}) => {
	const Chip = onClick ? SpottableDiv : 'div';
	return (
		<Chip
			{...rest}
			className={`${css.chip} ${selected ? css.chipSelected : ''} ${onClick ? '' : css.chipDisabled}`}
			onClick={onClick}
		>
			{isAvailable && <MaterialIcon name="checkCircle" className={css.chipCheck} />}
			<span>{label}</span>
		</Chip>
	);
};

/**
 * Picks what to request before sending it: the quality track when the viewer may ask for either,
 * which seasons of a series, and the server overrides for viewers allowed to set them. It mounts
 * each time it opens, so every request starts over from the defaults.
 *
 * `qualityToggle` puts a 4K switch on the sheet and `is4k` is only where it starts. Without the
 * switch the sheet asks for that one track and says so in the title. A `season` opens it with just
 * that season ticked.
 */
const SeerrRequestDialog = ({
	details, isTv, is4k: startIs4k, qualityToggle, isContinuing, activeRequests, quota,
	canRequestAdvanced, servers, season: startSeason, onSubmit, onClose
}) => {
	const [is4k, setIs4k] = useState(startIs4k);
	const [allSeasons, setAllSeasons] = useState(startSeason == null);
	const [selectedSeasons, setSelectedSeasons] = useState(startSeason == null ? [] : [startSeason]);
	// A series TMDB has no TVDB id for starts on picking which of Sonarr's series it is. The matches
	// are null while they load, and the lookup failing keeps the step up with a Retry.
	const [matching, setMatching] = useState(() => Boolean(isTv) && needsSeriesMatch(details));
	const [matches, setMatches] = useState(null);
	const [lookupFailed, setLookupFailed] = useState(false);
	const [tvdbId, setTvdbId] = useState(null);
	const wasMatchingRef = useRef(matching);

	const isAnime = isTv && (details?.keywords || []).some((k) => k.id === ANIME_KEYWORD);
	const advanced = useSeerrAdvancedRequest({enabled: canRequestAdvanced, isTv, isAnime, is4k, servers});
	const {reset: resetAdvanced, resolved} = advanced;

	const mediaInfo = details?.mediaInfo;
	const status = (is4k ? mediaInfo?.status4k : mediaInfo?.status) ?? 0;
	const seasonNumbers = useMemo(
		() => seasonNumbersOf(details?.seasons, details?.numberOfSeasons ?? 0),
		[details]
	);
	const taken = useMemo(() => unavailableOrRequestedSeasons(
		mediaInfo?.seasons,
		(activeRequests || []).filter((r) => Boolean(r.is4k) === is4k),
		is4k
	), [mediaInfo, activeRequests, is4k]);
	const available = useMemo(() => new Set((mediaInfo?.seasons || [])
		.filter((s) => isAvailableStatus(is4k ? s.status4k : s.status))
		.map((s) => s.seasonNumber)
	), [mediaInfo, is4k]);

	// TV quota counts seasons and movie quota counts one per request.
	let seasonsNeeded = selectedSeasons.length;
	if (allSeasons) seasonsNeeded = Math.min(Math.max(seasonNumbers.length - taken.size, 1), seasonNumbers.length);
	const limited = !isUnlimitedQuota(quota);
	const quotaBlocked = limited && (quota.restricted ||
		(quota.remaining != null && (isTv ? seasonsNeeded : 1) > quota.remaining));

	let quotaLabel = null;
	if (quotaBlocked) {
		quotaLabel = $L('Request limit reached');
	} else if (limited) {
		quotaLabel = (isTv
			? $L('{remaining} of {limit} season requests remaining')
			: $L('{remaining} of {limit} movie requests remaining'))
			.replace('{remaining}', quota.remaining ?? 0)
			.replace('{limit}', quota.limit ?? 0);
	}

	// Server picks only fill a blank, so switching track has to clear the old track's choices or a
	// 4K request would go out to the HD server.
	const handleToggle4k = useCallback((value) => {
		setIs4k(value);
		resetAdvanced();
	}, [resetAdvanced]);

	const handleAllSeasons = useCallback((value) => {
		setAllSeasons(value);
		if (value) setSelectedSeasons([]);
	}, []);

	const handleSeason = useCallback((e) => {
		const season = Number(e.currentTarget.dataset.season);
		setSelectedSeasons((prev) => (prev.indexOf(season) === -1 ? [...prev, season] : prev.filter((s) => s !== season)));
	}, []);

	const handleSubmit = useCallback(() => {
		const seasons = isTv && !allSeasons ? [...selectedSeasons].sort((a, b) => a - b) : null;
		if (seasons && !seasons.length) return;
		onSubmit({
			is4k,
			seasons,
			serverId: resolved.serverId,
			profileId: resolved.profileId,
			rootFolder: resolved.rootFolder,
			...(tvdbId != null ? {tvdbId} : {})
		});
	}, [isTv, allSeasons, selectedSeasons, is4k, resolved, tvdbId, onSubmit]);

	// With no Sonarr to ask the sheet goes on to the request. A lookup that found nothing or failed
	// stays on the step, since Seerr would drop the request the moment it sent it to Sonarr.
	const loadMatches = useCallback(async () => {
		setLookupFailed(false);
		let found;
		try {
			found = await seerrApi.lookupSonarrSeries(details?.id);
		} catch (err) {
			console.warn('[Seerr] Sonarr lookup failed:', err?.message);
			setLookupFailed(true);
			return;
		}
		// Seerr's own modal shows the first six, which is where the right one lands.
		if (found === null) setMatching(false);
		else setMatches(found.slice(0, 6));
	}, [details]);

	useEffect(() => {
		if (matching) loadMatches();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// The dialog puts focus in on opening, often before the matches arrive, so the step moves it to
	// the first card, the one picked before, or the only button left. Leaving the step hands focus back
	// to the request sheet.
	useEffect(() => {
		if (matching) {
			if (lookupFailed || matches) {
				Spotlight.focus(lookupFailed || !matches.length ? MATCH_NEXT_ID : matchId(tvdbId ?? matches[0].tvdbId));
			}
		} else if (wasMatchingRef.current) {
			Spotlight.focus(DIALOG_ID);
		}
		wasMatchingRef.current = matching;
	}, [matching, matches, lookupFailed]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePickMatch = useCallback((e) => {
		setTvdbId(Number(e.currentTarget.dataset.tvdbId));
		Spotlight.focus(MATCH_NEXT_ID);
	}, []);
	const handleMatchNext = useCallback(() => setMatching(false), []);
	const handleBackToMatches = useCallback(() => setMatching(true), []);

	const type = isTv ? $L('Series') : $L('Movie');
	const title = (startIs4k && !qualityToggle ? $L('Request 4K {type}') : $L('Request {type}')).replace('{type}', type);
	const chosenMatch = tvdbId != null && matches ? matches.find((m) => m.tvdbId === tvdbId) : null;

	if (matching) {
		const focusFirst = matches && (tvdbId ?? matches[0]?.tvdbId);
		let content;
		if (lookupFailed) {
			content = <div className={css.matchNote}>{$L("Sonarr couldn't find a match for this series, or couldn't be reached. Try again, or check the series on Seerr.")}</div>;
		} else if (!matches) {
			content = <div className={css.advancedLoading}><span className={css.spinner} /></div>;
		} else if (!matches.length) {
			content = <div className={css.matchNote}>{$L("We couldn't find a match for this series, so it can't be requested.")}</div>;
		} else {
			content = (
				<>
					<div className={css.matchNote}>{$L("We couldn't match this series automatically. Pick the right one below.")}</div>
					{matches.map((match) => (
						<MatchCard
							key={match.tvdbId}
							match={match}
							selected={match.tvdbId === tvdbId}
							spotlightId={matchId(match.tvdbId)}
							data-tvdb-id={match.tvdbId}
							data-selected={match.tvdbId === focusFirst ? 'true' : undefined}
							onClick={handlePickMatch}
						/>
					))}
				</>
			);
		}
		const onlyClose = !lookupFailed && matches && !matches.length;
		return (
			<CoreDialog open title={title} onClose={onClose} spotlightId={DIALOG_ID} bodyClassName={css.body}>
				{content}
				<SeerrButtonRow className={css.actions}>
					{onlyClose ? (
						<SeerrDialogButton label={$L('Close')} spotlightId={MATCH_NEXT_ID} data-selected="true" onClick={onClose} />
					) : (
						<>
							<SeerrDialogButton label={lookupFailed ? $L('Close') : $L('Cancel')} onClick={onClose} />
							{lookupFailed ? (
								<SeerrDialogButton label={$L('Retry')} primary primaryColor="#6366f1" spotlightId={MATCH_NEXT_ID} data-selected="true" onClick={loadMatches} />
							) : (
								<SeerrDialogButton label={$L('Next')} primary primaryColor="#6366f1" spotlightId={MATCH_NEXT_ID} onClick={tvdbId == null ? null : handleMatchNext} />
							)}
						</>
					)}
				</SeerrButtonRow>
			</CoreDialog>
		);
	}

	return (
		<CoreDialog open title={title} onClose={onClose} spotlightId={DIALOG_ID} bodyClassName={css.body}>
			{chosenMatch && <MatchCard match={chosenMatch} selected onClick={handleBackToMatches} />}
			{isTv && isContinuing && status === MEDIA_STATUS.AVAILABLE && (
				<div className={css.continuing}>
					<MaterialIcon name="autorenew" className={css.continuingIcon} />
					<span className={css.continuingText}>{$L('Series Continuing · Future Seasons Can Be Requested')}</span>
				</div>
			)}
			{qualityToggle && <SeerrToggleRow title={$L('4K')} value={is4k} onChange={handleToggle4k} data-selected="true" />}
			{isTv && <SeerrDivider />}
			{isTv && (
				<SeerrToggleRow
					title={$L('All Seasons')}
					value={allSeasons}
					checkbox
					data-selected={qualityToggle ? undefined : 'true'}
					onChange={handleAllSeasons}
				/>
			)}
			{isTv && !allSeasons && seasonNumbers.length > 0 && (
				<div className={css.seasons}>
					<div className={css.seasonWrap}>
						{seasonNumbers.map((season) => (
							<SeasonChip
								key={season}
								label={$L('S{number}').replace('{number}', season)}
								selected={selectedSeasons.indexOf(season) !== -1}
								isAvailable={available.has(season)}
								data-season={season}
								onClick={taken.has(season) ? undefined : handleSeason}
							/>
						))}
					</div>
				</div>
			)}
			{canRequestAdvanced && <SeerrDivider />}
			{canRequestAdvanced && <SeerrAdvancedRequestOptions controller={advanced} />}
			{quotaLabel && <SeerrQuotaRow className={css.quota} label={quotaLabel} blocked={quotaBlocked} />}
			<SeerrButtonRow className={css.actions}>
				{/* After a match was picked this steps back to the picker, the way Seerr's own modal does. */}
				<SeerrDialogButton label={chosenMatch ? $L('Back') : $L('Cancel')} onClick={chosenMatch ? handleBackToMatches : onClose} />
				<SeerrDialogButton
					label={$L('Submit Request')}
					primary
					primaryColor="#6366f1"
					onClick={quotaBlocked ? null : handleSubmit}
				/>
			</SeerrButtonRow>
		</CoreDialog>
	);
};

export default SeerrRequestDialog;
