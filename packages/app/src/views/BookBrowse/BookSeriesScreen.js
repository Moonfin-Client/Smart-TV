import {memo, useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import {bookProgressMeta} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {countLabel} from '../MusicBrowse/musicScreens';
import {authorOf, isFinished, readingOrder, seriesProgress} from './bookScreens';
import {BookShelf, EmptyNote, ScreenHeader, contentKeyHandler, rowEdgeKey, screenPx, useScreenBack, useScreenFocus} from './BookScreenParts';

import css from '../MusicBrowse/MusicScreens.module.less';
import bookCss from './BookScreens.module.less';

const handleContentKey = contentKeyHandler('series');
const CARD_WIDTH = 180;
// Rows are drawn as focus nears them, since a big library can hold hundreds of series.
const FIRST_ROWS = 10;
const ROWS_AHEAD = 6;

const SeriesRow = memo(({series, index, serverUrl, onSelectItem, onFocusRow}) => {
	const books = useMemo(() => readingOrder(series.Members || []), [series]);
	const progress = useMemo(() => seriesProgress(books), [books]);
	const author = authorOf(books[0]);
	const handleFocus = useCallback(() => onFocusRow(index), [index, onFocusRow]);
	const cardProps = useCallback((book, i) => ({
		number: book.IndexNumber ?? i + 1,
		upNext: book === progress.next,
		finished: isFinished(book),
		subtitle: isFinished(book) ? $L('Finished') : bookProgressMeta(book)
	}), [progress.next]);

	return (
		<div className={bookCss.seriesRow}>
			<div className={bookCss.seriesInfo}>
				<div className={css.eyebrow}>{$L('Series')}</div>
				<div className={bookCss.seriesName}>{series.Name}</div>
				{author && <div className={css.meta}>{author}</div>}
				<div className={css.subMeta}>{progress.label}</div>
			</div>
			<BookShelf
				items={books}
				idPrefix={`book-series-${index}`}
				width={screenPx(CARD_WIDTH)}
				serverUrl={serverUrl}
				onSelect={onSelectItem}
				onKeyDown={rowEdgeKey}
				onFocus={handleFocus}
				cardProps={cardProps}
				className={`${bookCss.shelf} ${bookCss.rowShelf}`}
			/>
		</div>
	);
});

// Every series as a row: what it is and where the reader has got to, then its books in order.
const BookSeriesScreen = ({data, serverUrl, onSelectItem, onBack, backHandlerRef}) => {
	const [reach, setReach] = useState(FIRST_ROWS);
	const series = data.series;

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('series', true);

	const handleFocusRow = useCallback((index) => setReach((prev) => Math.max(prev, index + ROWS_AHEAD)), []);

	return (
		<div className={css.screen}>
			<ScreenHeader screenId="series" title={$L('Series')} count={series.length ? countLabel(series.length, $L('1 series'), $L('{count} series')) : null} />
			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{series.length === 0 ? <EmptyNote /> : (
					<div className={bookCss.seriesList}>
						{series.slice(0, reach).map((entry, index) => (
							<SeriesRow key={entry.Id} series={entry} index={index} serverUrl={serverUrl} onSelectItem={onSelectItem} onFocusRow={handleFocusRow} />
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default BookSeriesScreen;
