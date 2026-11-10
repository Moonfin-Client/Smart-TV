import {memo} from 'react';

import {DOWNLOAD_STATE, downloadLabelParts} from '../../utils/seerrStatus';

import css from './SeerrDownloadProgress.module.less';

// Progress bar for an active Seerr download. Plain divs, not Spottable, so 5-way
// focus order is unaffected. summary comes from getDownloadSummary or
// getMediaDownloadSummary in utils/seerrStatus. compact is for a poster tile,
// where the verb has no room and the sizes give way before the percentage does.
// A stalled or failed bar takes a status colour, so a stuck download stands out
// from a slow one, and a paused or queued one dims while it waits.
const STATE_CLASS = {
	[DOWNLOAD_STATE.STALLED]: css.stalled,
	[DOWNLOAD_STATE.FAILED]: css.failed,
	[DOWNLOAD_STATE.PAUSED]: css.dimmed,
	[DOWNLOAD_STATE.QUEUED]: css.dimmed
};

const SeerrDownloadProgress = ({summary, prefix, compact = false}) => {
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
		</div>
	);
};

export default memo(SeerrDownloadProgress);
