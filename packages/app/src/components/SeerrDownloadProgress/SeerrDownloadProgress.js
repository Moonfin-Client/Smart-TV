import {memo} from 'react';
import $L from '@enact/i18n/$L';

import {DOWNLOAD_STATE, downloadLabelParts} from '../../utils/seerrStatus';

import css from './SeerrDownloadProgress.module.less';

// Progress bar for an active Seerr download. Plain divs, not Spottable, so 5-way
// focus order is unaffected. summary comes from getDownloadSummary or
// getMediaDownloadSummary in utils/seerrStatus. compact is for a poster tile,
// where the verb has no room and the sizes give way before the percentage does.
// A stalled or failed bar takes a status color, so a stuck download stands out
// from a slow one, and a paused or queued one dims while it waits. When the arr's
// own queue says why, its words go on a line under the bar, verbatim, up to three
// lines. A poster tile has no room under the bar, so it passes showReason false and
// puts the reason where its requester line was.
const STATE_CLASS = {
	[DOWNLOAD_STATE.STALLED]: css.stalled,
	[DOWNLOAD_STATE.IMPORT_BLOCKED]: css.stalled,
	[DOWNLOAD_STATE.FAILED]: css.failed,
	[DOWNLOAD_STATE.PAUSED]: css.dimmed,
	[DOWNLOAD_STATE.QUEUED]: css.dimmed
};

const SeerrDownloadProgress = ({summary, prefix, compact = false, showReason = true}) => {
	if (!summary) return null;
	const pct = Math.round(summary.fraction * 100);
	const {leading, percent} = downloadLabelParts(summary, compact);
	const lead = leading && prefix ? `${prefix} · ${leading}` : leading;
	return (
		<div className={[css.container, compact && css.compact, STATE_CLASS[summary.state]].filter(Boolean).join(' ')}>
			<div className={css.label}>
				{lead && <span className={css.leading}>{lead}</span>}
				{lead && percent && <span className={css.separator}> · </span>}
				{percent && <span className={css.percent}>{percent}</span>}
			</div>
			<div className={css.track}>
				<div className={css.fill} style={{width: `${pct}%`}} />
			</div>
			{showReason && summary.reason && <div className={css.reason}>{summary.reason}</div>}
		</div>
	);
};

// Material's search_off, for a title the arr is searching for and not finding.
const SEARCH_OFF = 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3 6.08 3 3.28 5.64 3.03 9h2.02C5.3 6.75 7.18 5 9.5 5 11.99 5 14 7.01 14 9.5S11.99 14 9.5 14c-.17 0-.33-.03-.5-.05v2.02c.17.02.33.03.5.03 1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM6.47 10.82 4 13.29l-2.47-2.47-.71.71L3.29 14 .82 16.47l.71.71L4 14.71l2.47 2.47.71-.71L4.71 14l2.47-2.47z';

// Where the bar would be when the arr has the title, is looking and has found
// nothing to download. No bar, since nothing is downloading.
// `prefix` names the track when a 4K bar shows beside it, the way the bars do.
export const SeerrNotFoundYet = memo(({compact = false, prefix = null}) => (
	<div className={[css.notFound, compact && css.compact].filter(Boolean).join(' ')}>
		<svg className={css.notFoundIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d={SEARCH_OFF} />
		</svg>
		<span className={css.notFoundLabel}>{prefix ? `${prefix} · ${$L('Not found yet')}` : $L('Not found yet')}</span>
	</div>
));

export default memo(SeerrDownloadProgress);
