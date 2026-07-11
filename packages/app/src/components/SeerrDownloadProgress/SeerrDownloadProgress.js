import {memo} from 'react';
import $L from '@enact/i18n/$L';

import css from './SeerrDownloadProgress.module.less';

// Thin decorative download progress bar for Seerr requests and details.
// Plain divs, not Spottable, so 5-way focus order is unaffected. summary
// comes from getDownloadSummary/getMediaDownloadSummary in utils/seerrStatus.
const SeerrDownloadProgress = ({summary, prefix}) => {
	if (!summary) return null;
	const pct = Math.round(summary.fraction * 100);
	const label = summary.isImporting
		? $L('Importing')
		: `${$L('Downloading')} · ${pct}%`;
	return (
		<div className={css.container}>
			<span className={css.label}>{prefix ? `${prefix} · ${label}` : label}</span>
			<div className={css.track}>
				<div className={css.fill} style={{width: `${pct}%`}} />
			</div>
		</div>
	);
};

export default memo(SeerrDownloadProgress);
