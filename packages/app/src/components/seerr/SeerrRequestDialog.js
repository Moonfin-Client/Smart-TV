import {useCallback, useMemo, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';

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
			rootFolder: resolved.rootFolder
		});
	}, [isTv, allSeasons, selectedSeasons, is4k, resolved, onSubmit]);

	const type = isTv ? $L('Series') : $L('Movie');
	const title = (startIs4k && !qualityToggle ? $L('Request 4K {type}') : $L('Request {type}')).replace('{type}', type);

	return (
		<CoreDialog open title={title} onClose={onClose} spotlightId="seerr-request-dialog" bodyClassName={css.body}>
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
				<SeerrDialogButton label={$L('Cancel')} onClick={onClose} />
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
