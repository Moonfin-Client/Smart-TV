import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {bookImageUrl, isAudiobookItem, peopleAuthors, seriesItemCountLabel} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {cleanOverview} from '../../utils/overviewText';
import {rem} from '../../utils/rootScale';
import {shuffleArray} from '../Details/detailsMedia';
import {handleSectionKey} from '../MusicBrowse/musicLibrary';
import {CoreIcon, playTracks} from '../MusicBrowse/MusicScreenParts';
import {countLabel} from '../MusicBrowse/musicScreens';
import {BookIcon} from './BookCard';
import {readOrListen} from './bookNavigation';
import {STATION_COLORS, authorShelves, authorStats, booksByAuthor, isFinished} from './bookScreens';
import {
	BookShelf, EmptyNote, ScreenHeader, focusRail, focusStrip, initialsOf, screenPx, spottableChildren, useScreenBack, useScreenFocus
} from './BookScreenParts';

import css from '../MusicBrowse/MusicScreens.module.less';
import musicCss from '../MusicBrowse/MusicLibrary.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
// Moves inside a list are measured there first, not across the whole screen.
const Section = SpotlightContainerDecorator({}, 'div');

const ROW_ID = 'book-author';
const MAIN_ID = 'book-author-main';
const SHELF_ID = 'book-author-shelf';
const SHOW_DELAY = 250;
const CARD_WIDTH = 170;
// Narrower than the music playlists' list, so the author in focus has room beside Bookstore's rail.
const LIST_WIDTH = {WebkitFlex: `0 0 ${rem(440)}`, flex: `0 0 ${rem(440)}`, width: rem(440)};

const numberedCard = (book, i) => ({number: book.IndexNumber ?? i + 1});

const byName = (a, b) => {
	const left = String(a.SortName || a.Name || '').toLowerCase();
	const right = String(b.SortName || b.Name || '').toLowerCase();
	if (left < right) return -1;
	return left > right ? 1 : 0;
};

// A portrait, or the name's initials on a tile from the station palette when there's no image.
export const Face = memo(({author, size, serverUrl, index = 0}) => {
	const url = author.ImageTags?.Primary ? bookImageUrl(author._serverUrl || serverUrl, author) : null;
	return (
		<span className={bookCss.face} style={{width: rem(size), height: rem(size), fontSize: rem(size * 0.36), background: url ? undefined : STATION_COLORS[index % STATION_COLORS.length]}}>
			{url ? <img src={url} alt="" loading="lazy" /> : initialsOf(author.Name)}
		</span>
	);
});

// The author in focus: who they are, what they've written in numbers, one button to start, and
// their books a shelf per series.
const Spotlit = ({author, index, books, api, serverUrl, onSelectItem, onPlay, onButtonsKey, onShelfKey}) => {
	const [bio, setBio] = useState(null);
	const stats = authorStats(books);
	const shelves = useMemo(() => authorShelves(books), [books]);
	const audiobooks = useMemo(() => books.filter(isAudiobookItem), [books]);
	// People only named on a title carry their name as an id, so there's nothing to fetch for them.
	const fetchable = author.Id && author.Id !== author.Name;

	useEffect(() => {
		setBio(null);
		if (!fetchable) return undefined;
		let cancelled = false;
		api.getItem(author.Id).then((res) => { if (!cancelled) setBio(cleanOverview(res?.Overview) || null); }).catch(() => {});
		return () => { cancelled = true; };
	}, [api, author.Id, fetchable]);

	const handleMain = useCallback(() => {
		if (audiobooks.length) playTracks(onPlay, shuffleArray(audiobooks));
		else {
			const next = books.find((book) => !isFinished(book)) || books[0];
			if (next) readOrListen(next, onPlay);
		}
	}, [audiobooks, books, onPlay]);

	return (
		<div className={css.detail} onFocus={keepFocusInView}>
			<div className={bookCss.spotHead}>
				<Face author={author} size={240} serverUrl={serverUrl} index={index} />
				<div className={css.detailInfo}>
					<div className={css.eyebrow}>{$L('Author')}</div>
					<div className={css.detailTitle}>{author.Name}</div>
					{bio && <div className={`${bookCss.overviewText} ${bookCss.bio}`}>{bio}</div>}
					<div className={bookCss.stats}>
						{[[stats.books, $L('Books')], [stats.audiobooks, $L('Audiobooks')], [stats.series, $L('Series')]].map(([value, label]) => (
							<div key={label} className={bookCss.stat}>
								<div className={bookCss.statValue}>{value}</div>
								<div className={bookCss.statLabel}>{label}</div>
							</div>
						))}
					</div>
					{books.length > 0 && (
						<Section className={css.panelButtons} onKeyDown={onButtonsKey}>
							<SpottableDiv className={`${musicCss.heroBtn} ${musicCss.primaryBtn}`} spotlightId={MAIN_ID} onClick={handleMain}>
								{audiobooks.length ? <CoreIcon name="shuffle" /> : <BookIcon name="menu_book_rounded" />}
								{audiobooks.length ? $L('Shuffle Audiobooks') : $L('Start Reading')}
							</SpottableDiv>
						</Section>
					)}
				</div>
			</div>
			<div className={bookCss.spotShelves}>
				{shelves.map((shelf, s) => (
					<div key={shelf.id}>
						<h2 className={bookCss.sectionTitle}>{shelf.title}</h2>
						<BookShelf
							items={shelf.items}
							idPrefix={`${SHELF_ID}-${s}`}
							width={screenPx(CARD_WIDTH)}
							serverUrl={serverUrl}
							onSelect={onSelectItem}
							onKeyDown={onShelfKey}
							cardProps={shelf.numbered ? numberedCard : null}
						/>
					</div>
				))}
			</div>
		</div>
	);
};

// Every author down the left, and the one in focus on the right after a short pause.
const BookAuthorsScreen = ({library, data, api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [artists, setArtists] = useState(null);
	const [shownIndex, setShownIndex] = useState(0);
	const timerRef = useRef(null);
	const libraryId = library?.Id;

	// The library's artists, then anyone only named as an author on a title, the way the library
	// counts them.
	useEffect(() => {
		let cancelled = false;
		api.getArtists({ParentId: libraryId, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName'})
			.then((res) => { if (!cancelled) setArtists(res?.Items || []); })
			.catch(() => { if (!cancelled) setArtists([]); });
		return () => { cancelled = true; };
	}, [api, libraryId]);

	const authors = useMemo(() => {
		if (!artists) return [];
		const extra = peopleAuthors(data.titles, artists.map((artist) => String(artist.Name || '').toLowerCase()));
		return [...artists, ...extra].sort(byName);
	}, [artists, data.titles]);
	const shown = authors[shownIndex] || null;
	const books = useMemo(() => (shown ? booksByAuthor(data.titles, shown) : []), [shown, data.titles]);

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('authors', artists !== null);
	useEffect(() => () => clearTimeout(timerRef.current), []);

	const handleRowFocus = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setShownIndex(index), SHOW_DELAY);
	}, []);

	// Right, or Select, shows the author in focus straight away and goes to their button.
	const showNow = useCallback((target) => {
		const index = parseInt(target?.dataset?.index, 10);
		clearTimeout(timerRef.current);
		if (index >= 0) setShownIndex(index);
		window.requestAnimationFrame(() => Spotlight.focus(MAIN_ID) || Spotlight.focus(`${SHELF_ID}-0-0`));
	}, []);
	const handleRowClick = useCallback((e) => showNow(e.currentTarget), [showNow]);

	const handleListKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onUp: focusStrip, onLeft: focusRail, onRight: () => showNow(e.target)
	}), [showNow]);

	const focusShownRow = useCallback(() => Spotlight.focus(`${ROW_ID}-${shownIndex}`), [shownIndex]);
	const handleButtonsKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onLeft: focusShownRow, onUp: focusStrip, onDown: () => Spotlight.focus(`${SHELF_ID}-0-0`)
	}), [focusShownRow]);
	// Left off a shelf's first book goes back to the list, and Up off the first shelf to the button.
	const handleShelfKey = useCallback((e) => {
		const cards = spottableChildren(e.currentTarget);
		const index = cards.indexOf(e.target);
		const firstShelf = e.target.dataset?.spotlightId?.indexOf(`${SHELF_ID}-0-`) === 0;
		if (e.keyCode === KEYS.LEFT && index === 0) {
			e.preventDefault();
			e.stopPropagation();
			focusShownRow();
		} else if (e.keyCode === KEYS.RIGHT && index === cards.length - 1) {
			e.preventDefault();
			e.stopPropagation();
		} else if (e.keyCode === KEYS.UP && firstShelf) {
			e.preventDefault();
			e.stopPropagation();
			if (!Spotlight.focus(MAIN_ID)) focusStrip();
		}
	}, [focusShownRow]);

	const count = authors.length ? countLabel(authors.length, $L('1 author'), $L('{count} authors')) : null;
	const header = <ScreenHeader screenId="authors" title={$L('Authors')} count={count} />;

	if (artists !== null && authors.length === 0) {
		return (
			<div className={css.screen}>
				{header}
				<EmptyNote />
			</div>
		);
	}

	return (
		<div className={css.screen}>
			{header}
			<div className={css.split}>
				<div className={css.listColumn} style={LIST_WIDTH}>
					<Section className={css.playlistList} onKeyDown={handleListKey} onFocus={keepFocusInView}>
						{authors.map((author, index) => (
							<SpottableDiv
								key={author.Id || author.Name}
								className={index === shownIndex ? `${css.playlistRow} ${css.playlistShown} ${bookCss.authorRow}` : `${css.playlistRow} ${bookCss.authorRow}`}
								data-index={index}
								spotlightId={`${ROW_ID}-${index}`}
								onFocus={handleRowFocus}
								onClick={handleRowClick}
							>
								<Face author={author} size={66} serverUrl={serverUrl} index={index} />
								<div className={css.playlistText}>
									<div className={css.playlistName}>{author.Name}</div>
									<div className={css.subMeta}>{seriesItemCountLabel(data.authorTitles.get(String(author.Name || '').toLowerCase()) || 0)}</div>
								</div>
							</SpottableDiv>
						))}
					</Section>
				</div>
				{shown && (
					<Spotlit
						key={shown.Id || shown.Name}
						author={shown}
						index={shownIndex}
						books={books}
						api={api}
						serverUrl={serverUrl}
						onSelectItem={onSelectItem}
						onPlay={onPlay}
						onButtonsKey={handleButtonsKey}
						onShelfKey={handleShelfKey}
					/>
				)}
			</div>
		</div>
	);
};

export default BookAuthorsScreen;
