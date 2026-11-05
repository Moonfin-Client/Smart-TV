import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import DetailsTabBar from '../../components/DetailsTabBar';
import {combinedTypes} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rootScale} from '../../utils/rootScale';
import {countLabel} from '../MusicBrowse/musicScreens';
import BookCard, {BookIcon} from './BookCard';
import {STATION_COLORS, genreTitleCount, sortBookGenres, titlesCount} from './bookScreens';
import {EmptyNote, ScreenHeader, contentKeyHandler, focusRail, rowEdgeKey, screenPx, useScreenBack, useScreenFocus} from './BookScreenParts';
import {BOOK_FIELDS} from './useBookLibrary';

import css from '../MusicBrowse/MusicScreens.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('genres');
// Up and down between genres come back to the title they were left on, or the station first.
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const SHELF_SIZE = 12;
const CARD_WIDTH = 150;
const PLACEHOLDERS = Array.from({length: 7}, (_, i) => i);
// A row's height plus its margin from the stylesheet, which the rows in view are worked out from.
const ROW_STRIDE = 340;
const ORDERS = [{id: 'most', label: $L('Most Titles')}, {id: 'name', label: $L('A to Z')}];

const GenreRow = memo(({genre, index, shelf, serverUrl, onSelectItem, onSurprise}) => {
	// Some servers count no titles on a genre, so the shelf's own total stands in once it's read.
	const count = genreTitleCount(genre) || shelf?.total || 0;
	// Right off the last title holds. Left off the first goes back to the station by itself.
	const handleShelfKey = useCallback((e) => e.keyCode === KEYS.RIGHT && rowEdgeKey(e), []);
	return (
		<RowContainer className={bookCss.genreRow}>
			<SpottableDiv
				className={css.station}
				style={{background: STATION_COLORS[index % STATION_COLORS.length]}}
				data-index={index}
				spotlightId={`book-station-${index}`}
				onClick={onSurprise}
			>
				<span className={css.stationName}>{genre.Name}</span>
				{count > 0 && <span className={css.stationMeta}>{titlesCount(count)}</span>}
				<span className={css.stationChip}><BookIcon name="casino_rounded" />{$L('Surprise Me')}</span>
			</SpottableDiv>
			<div className={css.genreShelf} onFocus={keepFocusInView} onKeyDown={handleShelfKey}>
				{shelf
					? shelf.items.map((book) => (
						<BookCard key={book.Id} item={book} width={screenPx(CARD_WIDTH)} serverUrl={serverUrl} onSelect={onSelectItem} />
					))
					: PLACEHOLDERS.map((i) => <div key={i} className={`${css.shelfPlaceholder} ${bookCss.genrePlaceholder}`} />)}
			</div>
		</RowContainer>
	);
});

// Every genre as a station that picks something unread at random, then its newest titles. Rows
// fetch their titles once they're on screen.
const BookGenresScreen = ({library, data, api, serverUrl, onSelectItem, onBack, backHandlerRef}) => {
	const [order, setOrder] = useState('most');
	const [shelves, setShelves] = useState({});
	const asked = useRef(new Set());
	const scrollerRef = useRef(null);
	const libraryId = library?.Id;
	const types = combinedTypes(library);

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('genres', true);

	// With no counts to go on, the list stays A to Z and there's nothing to switch.
	const counted = useMemo(() => data.genres.some((genre) => genreTitleCount(genre) > 0), [data.genres]);
	const sorted = useMemo(() => sortBookGenres(data.genres, counted ? order : 'name'), [data.genres, counted, order]);
	const sortedRef = useRef(sorted);
	sortedRef.current = sorted;

	const loadShelf = useCallback((genre) => {
		if (asked.current.has(genre.Id)) return;
		asked.current.add(genre.Id);
		api.getItems({
			ParentId: libraryId, IncludeItemTypes: types, GenreIds: genre.Id, Recursive: true,
			SortBy: 'DateCreated,SortName', SortOrder: 'Descending', Fields: BOOK_FIELDS, ImageTypeLimit: 1, Limit: SHELF_SIZE
		})
			.then((res) => ({items: res?.Items || [], total: res?.TotalRecordCount || 0}), () => ({items: [], total: 0}))
			.then((shelf) => setShelves((prev) => ({...prev, [genre.Id]: shelf})));
	}, [api, libraryId, types]);

	const loadVisible = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const stride = ROW_STRIDE * rootScale();
		const first = Math.max(0, Math.floor(scroller.scrollTop / stride) - 1);
		const last = Math.ceil((scroller.scrollTop + scroller.clientHeight) / stride) + 1;
		sortedRef.current.slice(first, last).forEach(loadShelf);
	}, [loadShelf]);

	useEffect(loadVisible, [sorted, loadVisible]);

	// A random unread title in the genre, or any title once they've all been read.
	const handleSurprise = useCallback(async (e) => {
		const genre = sortedRef.current[parseInt(e.currentTarget.dataset.index, 10)];
		if (!genre) return;
		const pick = (filters) => api.getItems({
			ParentId: libraryId, IncludeItemTypes: types, GenreIds: genre.Id, Recursive: true, SortBy: 'Random', Limit: 1, Fields: BOOK_FIELDS, ...filters
		}).then((res) => res?.Items?.[0], () => null);
		const item = await pick({Filters: 'IsUnplayed'}) || await pick({});
		if (item) onSelectItem?.(item);
	}, [api, libraryId, types, onSelectItem]);

	// Left off a station goes to the rail, and holds where there's none.
	const handleListKey = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT && e.target.dataset?.spotlightId?.indexOf('book-station-') === 0) {
			e.preventDefault();
			e.stopPropagation();
			focusRail();
		}
	}, []);

	return (
		<div className={css.screen}>
			<ScreenHeader screenId="genres" title={$L('Genres')} count={sorted.length ? countLabel(sorted.length, $L('1 genre'), $L('{count} genres')) : null}>
				{counted && <DetailsTabBar tabs={ORDERS} activeId={order} expanded={false} onActivate={setOrder} />}
			</ScreenHeader>
			<div className={css.scroller} ref={scrollerRef} onScroll={loadVisible} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{sorted.length === 0 ? <EmptyNote /> : (
					<div className={css.genreList} onKeyDown={handleListKey}>
						{sorted.map((genre, index) => (
							<GenreRow
								key={genre.Id}
								genre={genre}
								index={index}
								shelf={shelves[genre.Id]}
								serverUrl={serverUrl}
								onSelectItem={onSelectItem}
								onSurprise={handleSurprise}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default BookGenresScreen;
