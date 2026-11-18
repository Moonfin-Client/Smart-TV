import {memo} from 'react';

import SeerrDownloadProgress, {SeerrNotFoundYet} from '../SeerrDownloadProgress';
import SeerrStatusDot from './SeerrStatusDot';

import css from './SeerrStatusBadge.module.less';

// What Seerr has to say about a title, one pill per quality track. It stays quiet unless
// there is more to the story than owning it, since a green Available on every item in the
// library is just noise.
export const SeerrStatusBadge = memo(({seerr, className}) => {
	if (!seerr.isActive) return null;
	const pills = seerr.statusPills;
	if (!pills?.length) return null;
	return (
		<span className={`${css.pills} ${className || ''}`}>
			{pills.map((pill) => (
				<span key={pill.text} className={`${css.statusBadge} ${css[pill.color] || css.gray}`}>{pill.text}</span>
			))}
		</span>
	);
});

// The bars only exist while something is genuinely downloading, so the whole block disappears
// once it lands rather than sitting there at 100%. When the arr is searching and finding
// nothing, a line says so where the HD bar would be.
export const SeerrDownloadBars = memo(({seerr}) => {
	if (!seerr.isActive || (!seerr.hdDownload && !seerr.download4k && !seerr.notFoundYet)) return null;
	return (
		<div className={css.downloads}>
			{seerr.notFoundYet && (
				<div className={css.downloadRow}>
					<SeerrNotFoundYet prefix={seerr.download4k ? 'HD' : null} />
				</div>
			)}
			{seerr.hdDownload && (
				<div className={css.downloadRow}>
					<SeerrDownloadProgress summary={seerr.hdDownload} prefix={seerr.download4k ? 'HD' : null} />
				</div>
			)}
			{seerr.download4k && (
				<div className={css.downloadRow}>
					<SeerrDownloadProgress summary={seerr.download4k} prefix="4K" />
				</div>
			)}
		</div>
	);
});

export const SeerrSeasonDot = ({status}) => <SeerrStatusDot status={status} left />;
