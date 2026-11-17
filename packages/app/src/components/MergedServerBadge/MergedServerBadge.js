import $L from '@enact/i18n/$L';

import {MaterialIcon} from '../icons/materialIcons';
import {serverCountOf} from '../../utils/mergedCopies';

import css from './MergedServerBadge.module.less';

// How many servers hold a merged card's title. Nothing for a title only one server holds. On a
// card it comes after the anime pill in the markup, so it can stack above it, and before the poster
// labels, so they stack above it.
const MergedServerBadge = ({item, aboveProgress, className, style}) => {
	const count = serverCountOf(item);
	if (count < 2) return null;
	return (
		<div
			className={`${css.badge}${aboveProgress ? ` ${css.aboveProgress}` : ''} ${className || ''}`}
			style={style}
			data-card-overlay="servers"
			aria-label={$L('On {count} servers').replace('{count}', String(count))}
		>
			<MaterialIcon name="dnsRounded" className={css.icon} />
			<span>{count}</span>
		</div>
	);
};

export default MergedServerBadge;
