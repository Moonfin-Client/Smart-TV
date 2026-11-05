import {memo} from 'react';

import {MaterialIcon} from '../icons/materialIcons';
import {MEDIA_STATUS} from '../../utils/seerrStatus';

import css from './SeerrStatusDot.module.less';

const VARIANTS = {
	[MEDIA_STATUS.AVAILABLE]: ['available', 'checkRounded'],
	[MEDIA_STATUS.PARTIALLY_AVAILABLE]: ['partial', 'removeRounded'],
	[MEDIA_STATUS.PROCESSING]: ['processing', 'scheduleRounded'],
	[MEDIA_STATUS.PENDING]: ['pending', 'scheduleRounded']
};

// Core's round Seerr status marker for a poster corner: an outlined check when available, a
// filled dash when partly there, and an outlined clock in its own color while on its way.
const SeerrStatusDot = ({status}) => {
	const variant = VARIANTS[status];
	if (!variant) return null;
	return (
		<div className={`${css.dot} ${css[variant[0]]}`}>
			<MaterialIcon name={variant[1]} className={css.icon} />
		</div>
	);
};

export default memo(SeerrStatusDot);
