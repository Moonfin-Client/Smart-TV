import {memo} from 'react';

import css from './SeerrStatusChip.module.less';

// Status chip shared by the requests hub, discover cards, details, and the
// collection view. color is one of pending, requested, available, error,
// approved (see utils/seerrStatus.js).
const SeerrStatusChip = ({label, color}) => {
	if (!label) return null;
	const colorClass = css[color] || css.approved;
	return <span className={`${css.chip} ${colorClass}`}>{label}</span>;
};

export default memo(SeerrStatusChip);
