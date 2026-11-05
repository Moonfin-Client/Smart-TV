import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import DetailsTabBar from '../../components/DetailsTabBar';
import useItemMenuHold, {cardIndexOf} from '../../hooks/useItemMenuHold';
import {useStorage} from '../../hooks/useStorage';
import {
	SCOPE_ALL, availableScopes, bookImageUrl, bookProgressMeta, bookSubtitle, isAudiobookItem, isAudiobookLibrary,
	isMixedLibrary, matchesScope, playedPercent, scopeLabel
} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {stopPropagation} from '../../utils/gridChrome';
import {KEYS} from '../../utils/keys';
import {cleanOverview} from '../../utils/overviewText';
import {rem} from '../../utils/rootScale';
import {PanelContainer} from '../../utils/spotlightContainers';
import {handleSectionKey} from '../MusicBrowse/musicLibrary';
import {CoreIcon, focusSoon, indexFromId, usePagedItems} from '../MusicBrowse/MusicScreenParts';
import {gridMove, gridRows, rowIndexOf} from '../MusicBrowse/musicScreens';
import BookCard, {BookIcon} from './BookCard';
import {bookMenuItem, openBookItem, readOrListen} from './bookNavigation';
import {bookNavFor, formatEyebrow, titleMeta, titlesCount, titlesHeading} from './bookScreens';
import {
	EmptyNote, ScreenHeader, contentKeyHandler, focusControls, focusRail, handleGridKey, useColumns, useScreenBack,
	useScreenFocus
} from './BookScreenParts';
import {TITLE_SORTS, sortById, titlesFetcher} from './bookTitles';

import css from '../MusicBrowse/MusicScreens.module.less';
import filterCss from '../MusicBrowse/MusicFilterPanel.module.less';
import musicCss from '../MusicBrowse/MusicLibrary.module.less';
import bookCss from './BookScreens.module.less';
import railCss from './BookstoreRail.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');
// Moves inside the panel's buttons are measured there first, not across the page.
const PanelSection = SpotlightContainerDecorator({}, 'div');
const handleContentKey = contentKeyHandler('titles');

const ID = 'book-title';
const CONTINUE_ID = 'book-continue';
const READ_ID = 'book-title-panel-read';
const FILTER_ID = 'book-titles-filter';
const TARGET = 230;
const INSETS = 120;
const GAP = 30;
const CARET_HALF = 14;
const PANEL_COVER = 210;
const SORTS = TITLE_SORTS.map((sort) => ({id: sort.id, label: sort.label()}));

// What's being read or heard, over Bookstore's grid. Select opens the title's details, and the
// play button, which only a pointer reaches, reads or plays it.
const ContinueTile = memo(({item, index, serverUrl, onPlay, onClick}) => {
	const url = bookImageUrl(item._serverUrl || serverUrl, item);
	const audiobook = isAudiobookItem(item);
	const meta = bookProgressMeta(item);
	const subtitle = bookSubtitle(item);
	const handlePlay = useCallback((e) => {
		e.stopPropagation();
		onPlay(item);
	}, [item, onPlay]);
	return (
		<SpottableDiv className={railCss.continueTile} data-index={index} onClick={onClick}>
			<div className={audiobook ? railCss.continueCoverAudio : railCss.continueCover}>
				{url ? <img src={url} alt="" loading="lazy" /> : <BookIcon name={audiobook ? 'headphones_rounded' : 'menu_book_rounded'} className={railCss.continuePlaceholder} />}
			</div>
			<div className={railCss.continueText}>
				<div className={railCss.continueTitle}>{item.Name}</div>
				{subtitle && <div className={railCss.continueSubtitle}>{subtitle}</div>}
				<div className={railCss.continueProgress}><div style={{width: `${Math.min(playedPercent(item), 100)}%`}} /></div>
				{meta && <div className={railCss.continueMeta}>{meta}</div>}
			</div>
			<div className={railCss.continuePlay} onClick={handlePlay} aria-label={audiobook ? $L('Continue Listening') : $L('Continue Reading')}>
				<BookIcon name="play_arrow_rounded" />
			</div>
		</SpottableDiv>
	);
});

// The radio list the Filter pill opens, Any Genre first.
const GenreFilter = ({genres, picked, onPick, onClose}) => {
	const options = useMemo(() => [{Id: null, Name: $L('Any Genre')}, ...genres], [genres]);
	const pickedIndex = Math.max(0, options.findIndex((option) => option.Id === (picked?.Id || null)));

	useEffect(() => focusSoon(`book-genre-option-${pickedIndex}`), [pickedIndex]);

	const handlePick = useCallback((e) => {
		const option = options[parseInt(e.currentTarget.dataset.index, 10)];
		if (option) onPick(option.Id ? option : null);
	}, [options, onPick]);

	return (
		<div className={filterCss.overlay} onClick={onClose}>
			<PanelContainer className={filterCss.panel} spotlightId="book-genre-filter" onClick={stopPropagation} onFocus={keepFocusInView}>
				<h2 className={filterCss.title}>{$L('Filter by Genre')}</h2>
				{options.map((option, index) => {
					const selected = index === pickedIndex;
					return (
						<SpottableDiv
							key={option.Id || 'any'}
							className={selected ? `${filterCss.option} ${filterCss.optionActive}` : filterCss.option}
							data-index={index}
							spotlightId={`book-genre-option-${index}`}
							onClick={handlePick}
						>
							<span className={filterCss.radio}>{selected && <span className={filterCss.radioFill} />}</span>
							<span className={filterCss.optionLabel}>{option.Name}</span>
						</SpottableDiv>
					);
				})}
			</PanelContainer>
		</div>
	);
};

// The title opened under its row: what it is, how far along it is, and Read or Listen, Details and
// a favorite heart. The overview and genres come from the full item once it's in.
const TitlePanel = ({item, api, serverUrl, caretLeft, favorite, onFavorite, onRead, onDetails, onKeyDown}) => {
	const [full, setFull] = useState(null);
	const audio = isAudiobookItem(item);
	const shown = full || item;
	const percent = playedPercent(item);
	const progress = bookProgressMeta(item);
	const url = bookImageUrl(item._serverUrl || serverUrl, item);

	useEffect(() => {
		let cancelled = false;
		api.getItem(item.Id).then((res) => { if (!cancelled && res) setFull(res); }).catch(() => {});
		return () => { cancelled = true; };
	}, [api, item.Id]);

	const toggleFavorite = useCallback(() => onFavorite(item.Id, !favorite), [onFavorite, item.Id, favorite]);

	const genre = shown.Genres?.[0];
	return (
		<div className={bookCss.panel}>
			<div className={css.caret} style={{left: caretLeft}} />
			<div className={bookCss.panelCover} style={{width: rem(PANEL_COVER), height: rem(audio ? PANEL_COVER : PANEL_COVER * 1.5)}}>
				{url ? <img src={url} alt="" /> : null}
			</div>
			<div className={bookCss.panelInfo}>
				<div className={css.eyebrow}>{genre ? `${formatEyebrow(item)} · ${genre}` : formatEyebrow(item)}</div>
				<div className={css.panelTitle}>{item.Name}</div>
				<div className={css.meta}>{titleMeta(shown)}</div>
				{shown.Overview && <div className={bookCss.overviewText}>{cleanOverview(shown.Overview)}</div>}
				{progress && (
					<div className={bookCss.progressLine}>
						{percent > 0 && <div className={bookCss.track}><div className={bookCss.trackFill} style={{width: `${Math.min(percent, 100)}%`}} /></div>}
						{progress}
					</div>
				)}
				<PanelSection className={css.panelButtons} onKeyDown={onKeyDown}>
					<SpottableDiv className={`${musicCss.heroBtn} ${musicCss.primaryBtn}`} spotlightId={READ_ID} onClick={onRead}>
						{audio ? <BookIcon name="headphones_rounded" /> : <BookIcon name="menu_book_rounded" />}
						{audio ? $L('Listen') : $L('Read')}
					</SpottableDiv>
					<SpottableDiv className={musicCss.heroBtn} onClick={onDetails}>
						<CoreIcon name="info_outline" />{$L('Details')}
					</SpottableDiv>
					<SpottableDiv className={`${musicCss.heroBtn} ${bookCss.heart}`} onClick={toggleFavorite} aria-label={$L('Favorite')}>
						<BookIcon name={favorite ? 'favorite_rounded' : 'favorite_border_rounded'} />
					</SpottableDiv>
				</PanelSection>
			</div>
		</div>
	);
};

// Every title in a format as a cover grid. Picking one opens it in a panel under its row rather than
// leaving the screen. Bookstore keeps what's being read over it, and leaves the format to its rail.
const BookTitlesScreen = ({screen, style, library, data, api, serverUrl, onSelectItem, onOpenGrid, onPlay, onBack, backHandlerRef}) => {
	const bookstore = bookNavFor(style) === 'rail';
	const mixed = isMixedLibrary(library, data.counts);
	const [scopeChoice, setScope] = useState(screen.scope || SCOPE_ALL);
	const scope = bookstore ? screen.scope || SCOPE_ALL : scopeChoice;
	const [storedSort, setStoredSort, sortLoaded] = useStorage(`book_sort_${library?.Id}`, 'dateAdded');
	const [sortChoice, setSortChoice] = useState(screen.sort || null);
	const sort = sortById(sortChoice || storedSort);
	const [genre, setGenre] = useState(null);
	const [showGenres, setShowGenres] = useState(false);
	const [openIndex, setOpenIndex] = useState(-1);
	// Kept here rather than in the panel, so a title opened again shows the heart it was left with.
	const [favorites, setFavorites] = useState({});
	const {columns, width, px} = useColumns(TARGET, INSETS, GAP);

	const fetchPage = useMemo(() => (sortLoaded ? titlesFetcher({api, library, scope, sort, genreId: genre?.Id}) : null),
		[api, library, scope, sort, genre, sortLoaded]);
	const {items, total, loaded, complete, loadMore} = usePagedItems(fetchPage);
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const rows = useMemo(() => gridRows(items.length, columns), [items.length, columns]);
	const resume = useMemo(() => (bookstore ? data.resume.filter((item) => matchesScope(item, scope)) : []), [bookstore, data.resume, scope]);

	useEffect(() => setOpenIndex(-1), [fetchPage]);

	const opened = openIndex >= 0 ? items[openIndex] : null;
	const openRow = openIndex >= 0 ? rowIndexOf(rows, openIndex) : -1;

	const focusIndex = useCallback((index) => Spotlight.focus(`${ID}-${index}`), []);

	const closePanel = useCallback(() => {
		if (openIndex < 0) return false;
		focusIndex(openIndex);
		setOpenIndex(-1);
		return true;
	}, [openIndex, focusIndex]);

	const closeGenres = useCallback(() => {
		Spotlight.focus(FILTER_ID);
		setShowGenres(false);
	}, []);

	useScreenBack(backHandlerRef, onBack, () => {
		if (showGenres) {
			closeGenres();
			return true;
		}
		return closePanel();
	});
	useScreenFocus('titles', loaded && !showGenres);

	const pickSort = useCallback((id) => {
		setSortChoice(id);
		setStoredSort(id);
	}, [setStoredSort]);
	const pickGenre = useCallback((picked) => {
		setGenre(picked);
		closeGenres();
	}, [closeGenres]);
	const openGenres = useCallback(() => setShowGenres(true), []);

	const handleSelect = useCallback((item) => {
		const index = itemsRef.current.indexOf(item);
		setOpenIndex((prev) => (prev === index ? -1 : index));
	}, []);

	const handleGridKeyDown = useCallback((e) => handleGridKey(e, {
		rows,
		index: indexFromId(e.target, ID),
		focusIndex,
		// The open panel sits between its row and the next, so both step into it at Read.
		onKey: (direction, row) => openRow >= 0 && (
			(direction === 'down' && row === openRow) || (direction === 'up' && row === openRow + 1)
		) && Spotlight.focus(READ_ID)
	}), [rows, openRow, focusIndex]);

	const handleGridFocus = useCallback((e) => {
		const index = indexFromId(e.target, ID);
		if (index >= 0 && rowIndexOf(rows, index) >= rows.length - 3) loadMore();
	}, [rows, loadMore]);

	const handlePanelKey = useCallback((e) => handleSectionKey(e, {
		chain: [],
		onUp: () => focusIndex(openIndex),
		onDown: () => {
			const below = gridMove(rows, openRow, openIndex, 'down');
			if (below != null) focusIndex(below);
		},
		onLeft: focusRail
	}), [rows, openRow, openIndex, focusIndex]);

	const handleRead = useCallback(() => opened && readOrListen(opened, onPlay), [opened, onPlay]);
	const handleDetails = useCallback(() => opened && onSelectItem?.(opened), [opened, onSelectItem]);
	const handleFavorite = useCallback((id, next) => {
		setFavorites((prev) => ({...prev, [id]: next}));
		api.setFavorite(id, next).catch(() => setFavorites((prev) => ({...prev, [id]: !next})));
	}, [api]);
	const readItem = useCallback((item) => readOrListen(item, onPlay), [onPlay]);

	const handleContinueClick = useCallback((e) => {
		const item = resume[cardIndexOf(e.target)];
		if (item) openBookItem(item, {onSelectItem, onOpenGrid});
	}, [resume, onSelectItem, onOpenGrid]);
	const continueItemAt = useCallback((target) => bookMenuItem(resume[cardIndexOf(target)]), [resume]);
	const continueMenu = useItemMenuHold(continueItemAt);
	const handleContinueKey = useCallback((e) => {
		const index = cardIndexOf(e.target);
		const edge = (e.keyCode === KEYS.LEFT && index === 0) || (e.keyCode === KEYS.RIGHT && index === resume.length - 1);
		if (!edge && e.keyCode !== KEYS.UP && e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.keyCode === KEYS.LEFT) focusRail();
		else if (e.keyCode === KEYS.DOWN && !focusControls('titles')) focusIndex(0);
	}, [resume.length, focusIndex]);
	const focusContinue = useCallback(() => resume.length > 0 && Spotlight.focus(CONTINUE_ID), [resume.length]);

	const caretLeft = openRow >= 0 ? rem((openIndex - rows[openRow].start) * (width + GAP) + width / 2 - CARET_HALF) : 0;
	const count = genre ? (complete ? titlesCount(items.length) : null) : titlesCount(data.counts[scope]);
	const scopeTabs = useMemo(() => availableScopes(data.counts).map((id) => ({id, label: scopeLabel(id)})), [data.counts]);
	const empty = complete && items.length === 0;

	return (
		<div className={css.screen}>
			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{resume.length > 0 && (
					<div className={bookCss.continueRow}>
						<h2 className={bookCss.sectionTitle}>{isAudiobookLibrary(library) ? $L('Continue Listening') : $L('Continue Reading')}</h2>
						<RowContainer {...continueMenu} className={railCss.continueRow} spotlightId={CONTINUE_ID} onKeyDown={handleContinueKey} onFocus={keepFocusInView}>
							{resume.map((item, index) => (
								<ContinueTile key={item.Id} item={item} index={index} serverUrl={serverUrl} onPlay={readItem} onClick={handleContinueClick} />
							))}
						</RowContainer>
					</div>
				)}
				<ScreenHeader screenId="titles" title={titlesHeading(scope)} count={count} onUp={focusContinue}>
					{!bookstore && mixed && <DetailsTabBar tabs={scopeTabs} activeId={scope} expanded={false} onActivate={setScope} />}
					<DetailsTabBar tabs={SORTS} activeId={sort.id} expanded={false} onActivate={pickSort} />
					<SpottableDiv className={css.pill} spotlightId={FILTER_ID} onClick={openGenres}>
						<CoreIcon name="filter_list" className={genre ? css.accentIcon : undefined} />{genre ? genre.Name : $L('Filter')}
					</SpottableDiv>
				</ScreenHeader>

				{empty ? <EmptyNote /> : (
					<div className={bookCss.grid} onKeyDown={handleGridKeyDown} onFocus={handleGridFocus}>
						{rows.map((row, r) => (
							<div key={row.start}>
								<div className={bookCss.bookRow}>
									{items.slice(row.start, row.end).map((item, i) => (
										<BookCard
											key={item.Id}
											item={item}
											width={px}
											serverUrl={serverUrl}
											showFormat={mixed && scope === SCOPE_ALL}
											spotlightId={`${ID}-${row.start + i}`}
											onSelect={handleSelect}
										/>
									))}
								</div>
								{r === openRow && opened && (
									<TitlePanel
										key={opened.Id}
										item={opened}
										api={api}
										serverUrl={serverUrl}
										caretLeft={caretLeft}
										favorite={favorites[opened.Id] ?? Boolean(opened.UserData?.IsFavorite)}
										onFavorite={handleFavorite}
										onRead={handleRead}
										onDetails={handleDetails}
										onKeyDown={handlePanelKey}
									/>
								)}
							</div>
						))}
					</div>
				)}
				{!loaded && total === 0 && <div className={css.loading}>{$L('Loading...')}</div>}
			</div>

			{showGenres && <GenreFilter genres={data.genres} picked={genre} onPick={pickGenre} onClose={closeGenres} />}
		</div>
	);
};

export default BookTitlesScreen;
