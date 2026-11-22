import {memo, useLayoutEffect, useRef} from 'react';

import {MEDIA_STATUS} from '../../utils/seerrStatus';
import {mediaStatusLabel} from '../../utils/seerrBadges';
import {isUnownedSeerrTitle} from '../../utils/tmdbThumb';

import css from './SeerrStatusBanner.module.less';

// How posters show a Seerr status, badge or banner, or null when the user turned them off.
export const seerrBadgeStyle = (settings) => {
	if (settings?.showSeerrAvailabilityBadges === false) return null;
	return settings?.seerrBadgeStyle === 'banner' ? 'banner' : 'badge';
};

// The statuses worth a dot, and the only ones a banner shows.
export const hasSeerrDot = (status) => status >= MEDIA_STATUS.PENDING && status <= MEDIA_STATUS.AVAILABLE;

// A Seerr title's status when it's worth showing. Outside list titles and Seerr's genre and studio
// tiles have no status of their own.
export const seerrTitleStatus = (item) => {
	const status = isUnownedSeerrTitle(item) && !item._external ? item.mediaInfo?.status : null;
	return hasSeerrDot(status) ? status : null;
};

const FILLS = {
	[MEDIA_STATUS.PENDING]: 'pending',
	[MEDIA_STATUS.PROCESSING]: 'processing',
	[MEDIA_STATUS.PARTIALLY_AVAILABLE]: 'available',
	[MEDIA_STATUS.AVAILABLE]: 'available'
};

// The Seerr status written across the top of a poster in the status color. The card it sits in
// puts it inside its own rounded clip.
const SeerrStatusBanner = ({status, large, className}) => {
	const labelRef = useRef(null);

	// A label too long for a narrow poster shrinks to fit rather than being cut off.
	useLayoutEffect(() => {
		const label = labelRef.current;
		const room = label.parentNode.clientWidth;
		const transform = label.offsetWidth > room ? `translateX(-50%) scale(${room / label.offsetWidth})` : '';
		label.style.webkitTransform = transform;
		label.style.transform = transform;
	}, [status]);

	return (
		<div className={[css.banner, css[FILLS[status]], large && css.large, className].filter(Boolean).join(' ')}>
			<span ref={labelRef} className={css.label}>{mediaStatusLabel(status).toUpperCase()}</span>
		</div>
	);
};

export default memo(SeerrStatusBanner);
