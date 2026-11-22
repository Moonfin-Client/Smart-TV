import {memo, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';

import {useSettings} from '../../context/SettingsContext';
import useItemMenuHold from '../../hooks/useItemMenuHold';
import {bookImageUrl, bookSubtitle, formatBookDuration, isAudiobookItem, isComicItem, playedPercent, remainingTicks} from '../../utils/bookLibrary';
import {bookMenuItem} from './bookNavigation';
import {BOOK_ICON_PATHS} from './bookIcons';

import css from './BookCard.module.less';

const SpottableDiv = Spottable('div');

export const BookIcon = ({name, className}) => (
	<svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={BOOK_ICON_PATHS[name]} /></svg>
);

const formatIconName = (item) => {
	if (isAudiobookItem(item)) return 'headphones_rounded';
	return isComicItem(item) ? 'auto_stories_rounded' : 'menu_book_rounded';
};

// A cover with its title and author under it. Books and comics stand 2:3 with a progress bar, and
// audiobooks and people are square, an audiobook with its time left in the corner. Rows that mix
// formats mark each card with its format. In a series a card can carry its number, an Up Next
// badge, and a check that dims it once it's finished, and `subtitle` replaces the author.
const BookCard = ({item, serverUrl, width, showFormat, spotlightId, onSelect, number, upNext, finished, subtitle: subtitleText}) => {
	const audiobook = isAudiobookItem(item);
	const square = audiobook || item.Type === 'Person';
	const url = bookImageUrl(item._serverUrl || serverUrl, item);
	const percent = playedPercent(item);
	const remaining = audiobook ? remainingTicks(item) : null;
	const subtitle = subtitleText ?? bookSubtitle(item);
	const {settings} = useSettings();
	const className = [css.card, finished && css.finished, !settings.cardFocusZoom && css.noZoom].filter(Boolean).join(' ');

	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);
	const itemAt = useCallback(() => bookMenuItem(item), [item]);
	const menuHold = useItemMenuHold(itemAt);

	return (
		<SpottableDiv {...menuHold} className={className} style={{width}} spotlightId={spotlightId} data-book-id={item.Id} onClick={handleClick}>
			<div className={css.cover} style={{height: square ? width : width * 1.5}}>
				{url ? (
					<img className={css.image} src={url} alt="" loading="lazy" />
				) : (
					<div className={css.placeholder}><BookIcon name={formatIconName(item)} className={css.placeholderIcon} /></div>
				)}
				{number != null && <span className={css.numberBadge}>{number}</span>}
				{upNext && <span className={css.upNext}>{$L('Up Next')}</span>}
				{finished && <span className={css.check}><BookIcon name="check_rounded" className={css.checkIcon} /></span>}
				{showFormat && (
					<span className={css.formatBadge}><BookIcon name={formatIconName(item)} className={css.formatIcon} /></span>
				)}
				{remaining != null && <span className={css.timeChip}>{formatBookDuration(remaining)}</span>}
				{!audiobook && percent > 0 && (
					<div className={css.progressBar}><div className={css.progress} style={{width: `${Math.min(percent, 100)}%`}} /></div>
				)}
			</div>
			<div className={css.title}>{item.Name}</div>
			<div className={css.subtitle}>{subtitle || '\u00a0'}</div>
		</SpottableDiv>
	);
};

export const BookEmptyState = ({title, description}) => (
	<div className={css.empty}>
		<BookIcon name="auto_stories_outlined" className={css.emptyIcon} />
		<div className={css.emptyTitle}>{title}</div>
		<div className={css.emptyDescription}>{description}</div>
	</div>
);

export default memo(BookCard);
