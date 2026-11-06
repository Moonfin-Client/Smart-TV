import $L from '@enact/i18n/$L';

import {useIncompleteRecording} from '../../services/incompleteRecordings';
import {formatShowingTime} from '../../utils/clock';
import {parseServerDate} from '../../utils/serverDate';

import css from './IncompleteBadge.module.less';

// Marks a Live TV recording that missed part of its program. It sits in a card's top left corner,
// below the favorite badge and a Seerr banner when there are any. An inline badge sits in a row of
// text instead, such as beside an episode's runtime.
const IncompleteBadge = ({itemId, belowFavorite, belowBanner, inline}) => {
	const entry = useIncompleteRecording(itemId);
	if (!entry) return null;
	return (
		<span className={`${css.badge} ${belowFavorite ? css.belowFavorite : ''} ${belowBanner ? css.belowBanner : ''} ${inline ? css.inline : ''}`} data-card-overlay={inline ? undefined : 'incomplete'}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M9.66 7.64C9.94 7.03 10.08 6.33 9.98 5.53C9.8 3.8 8.44 2.34 6.7 2.06C3.94 1.59 1.59 3.94 2.06 6.7C2.34 8.44 3.8 9.8 5.53 9.98C6.33 10.03 7.03 9.94 7.64 9.61L9.98 12L7.64 14.34C7.03 14.06 6.33 13.92 5.53 14.02C3.8 14.2 2.34 15.56 2.06 17.3C1.59 20.06 3.94 22.41 6.7 21.94C8.44 21.61 9.8 20.16 9.98 18.42C10.03 17.67 9.94 16.97 9.61 16.36L12 14.02L19.59 21.61C20.48 22.5 21.98 21.84 21.98 20.58C21.98 20.2 21.84 19.83 21.61 19.59L9.66 7.64ZM6 8.02C4.92 8.02 3.98 7.12 3.98 6C3.98 4.88 4.92 3.98 6 3.98C7.08 3.98 8.02 4.88 8.02 6C8.02 7.12 7.08 8.02 6 8.02ZM6 20.02C4.92 20.02 3.98 19.12 3.98 18C3.98 16.88 4.92 15.98 6 15.98C7.08 15.98 8.02 16.88 8.02 18C8.02 19.12 7.08 20.02 6 20.02ZM12 12.52C11.72 12.52 11.48 12.28 11.48 12C11.48 11.72 11.72 11.48 12 11.48C12.28 11.48 12.52 11.72 12.52 12C12.52 12.28 12.28 12.52 12 12.52ZM19.59 2.39 12.98 9 15 11.02 21.61 4.41C21.84 4.17 21.98 3.8 21.98 3.42C21.98 2.16 20.48 1.5 19.59 2.39Z" />
			</svg>
			{$L('Incomplete')}
		</span>
	);
};

// A malformed count reads as zero rather than hiding the line.
const wholeMinutes = (value) => Math.round(Number(value)) || 0;

export const incompleteDetailText = (entry, clockDisplay) => {
	const scheduledStart = parseServerDate(entry.scheduledStart);
	const recordedAt = parseServerDate(entry.recordedAt);
	let found = null;
	if (entry.state === 'scheduled' && scheduledStart) {
		found = $L('Complete showing scheduled {dateTime}').replace('{dateTime}', formatShowingTime(scheduledStart, clockDisplay));
	} else if (entry.state === 'recorded' && recordedAt) {
		found = $L('Complete copy recorded {dateTime}').replace('{dateTime}', formatShowingTime(recordedAt, clockDisplay));
	} else if (entry.state === 'notFound') {
		found = $L('No complete showing found');
	}
	const minutes = $L('{recorded} of {expected} min')
		.replace('{recorded}', wholeMinutes(entry.recordedMinutes))
		.replace('{expected}', wholeMinutes(entry.expectedMinutes));
	return [$L('Incomplete'), minutes, found].filter(Boolean).join(' · ');
};

// The status line under an incomplete recording's title on the details screen, such as
// Incomplete · 23 of 37 min · Complete showing scheduled Thu 8:00 PM.
export const IncompleteDetailLine = ({itemId, clockDisplay}) => {
	const entry = useIncompleteRecording(itemId);
	if (!entry) return null;
	return <div className={css.line}>{incompleteDetailText(entry, clockDisplay)}</div>;
};

export default IncompleteBadge;
