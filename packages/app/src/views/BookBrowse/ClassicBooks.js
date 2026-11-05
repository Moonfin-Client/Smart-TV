import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import MediaCard from '../../components/MediaCard';
import LibrarySkeleton from '../Library/LibrarySkeleton';
import {MusicSection} from '../MusicBrowse/MusicSection';
import {rowNode} from '../MusicBrowse/musicFocus';
import {handleSectionKey} from '../MusicBrowse/musicLibrary';
import useMusicBrowseFocus from '../MusicBrowse/useMusicBrowseFocus';
import {
	SCOPE_ALL, SCOPE_AUDIOBOOKS, SCOPE_BOOKS, SCOPE_COMICS,
	availableScopes, bookImageUrl, bookProgressMeta, bookSeriesEntries, bookSubtitle, combinedTypes,
	isAudiobookItem, isAudiobookLibrary, isComicItem, isEbookItem, isMixedLibrary, matchesScope, peopleAuthors,
	playedPercent, scopeLabel, scopedTypes
} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rootScale} from '../../utils/rootScale';
import {scrimStyle} from '../../utils/scrimImage';
import {serverBlurredUrl} from '../../utils/serverBlur';
import BookCard, {BookEmptyState, BookIcon} from './BookCard';
import {openBookItem, readOrListen} from './bookNavigation';
import {TITLES, screenFor} from './bookScreens';
import {focusStrip} from './BookScreenParts';
import {BOOK_FIELDS, loadBookRow} from './useBookLibrary';

import css from './ClassicBooks.module.less';

const SpottableDiv = Spottable('div');
// Coming back to a shelf lands on the card it was left on.
const ShelfRow = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const HERO = 'hero';
const SCOPE = 'scope';
const FOCUS_IDS = {[HERO]: 'book-hero-cta', [SCOPE]: 'book-scope'};
const idForNode = (node) => FOCUS_IDS[node] || (node.startsWith('row:') ? `book-row-${node.slice(4)}` : null);
const seeAllId = (rowId) => `book-see-all-${rowId}`;

const CARD_WIDTH = 198;
const GENRE_CHIPS = 15;
const AVATAR_SIZE = {width: CARD_WIDTH, height: CARD_WIDTH};
const INSET = 48;
const HERO_FADE = [{to: 'bottom', rgb: '10, 10, 10', stops: [[0, 0.25], [0.55, 0.6], [1, 1]]}];

const compareLower = (a, b) => {
	const left = a.toLowerCase();
	const right = b.toLowerCase();
	if (left < right) return -1;
	return left > right ? 1 : 0;
};
const bySortName = (a, b) => compareLower(a.SortName || a.Name || '', b.SortName || b.Name || '');
const byName = (a, b) => compareLower(a.Name || '', b.Name || '');

// The rows only Classic shows, read once per library. A format switch recomposes them without
// asking again. Comics are typed Book, so they're split out of the book rows here.
const loadClassicRows = async (api, library) => {
	const audioLibrary = isAudiobookLibrary(library);
	const audioTypes = scopedTypes(library, SCOPE_AUDIOBOOKS);
	const row = (params) => loadBookRow(api, {ParentId: library.Id, Fields: `${BOOK_FIELDS},SortName`, ...params});
	const none = Promise.resolve([]);
	const [latestBookRow, latestAudioRow, lastPlayed, allBookRow, allAudioRow, allRow] = await Promise.all([
		audioLibrary ? none : row({IncludeItemTypes: 'Book', SortBy: 'DateCreated', SortOrder: 'Descending'}),
		row({IncludeItemTypes: audioTypes, SortBy: 'DateCreated', SortOrder: 'Descending'}),
		audioLibrary ? row({IncludeItemTypes: audioTypes, Filters: 'IsPlayed', SortBy: 'DatePlayed', SortOrder: 'Descending'}) : none,
		audioLibrary ? none : row({IncludeItemTypes: 'Book', SortBy: 'SortName', SortOrder: 'Ascending'}),
		row({IncludeItemTypes: audioTypes, SortBy: 'SortName', SortOrder: 'Ascending'}),
		row({IncludeItemTypes: combinedTypes(library), SortBy: 'SortName', SortOrder: 'Ascending'})
	]);
	const latestBooks = latestBookRow.filter(isEbookItem);
	const latestComics = latestBookRow.filter(isComicItem);
	const latestAudiobooks = latestAudioRow.filter(isAudiobookItem);
	const ebooks = allBookRow.filter(isEbookItem);
	const allBooks = ebooks.length || !latestBooks.length ? ebooks : latestBooks;
	const audiobooks = allAudioRow.filter(isAudiobookItem);
	const allAudiobooks = audiobooks.length || !latestAudiobooks.length ? audiobooks : latestAudiobooks;
	const comicsFromAll = allRow.filter(isComicItem);
	const combined = [...allBooks, ...allAudiobooks, ...comicsFromAll].sort(bySortName);
	const comics = new Map([...latestComics, ...comicsFromAll].map((comic) => [comic.Id, comic]));
	const hasComics = !audioLibrary && comics.size > 0;
	return {
		latestBooks,
		latestAudiobooks,
		latestComics: hasComics ? (latestComics.length ? latestComics : Array.from(comics.values())) : [],
		lastPlayed,
		allBooks,
		allAudiobooks,
		allComics: hasComics ? Array.from(comics.values()).sort(bySortName) : [],
		all: combined.length ? combined : allRow
	};
};

const authorNames = (titles) => {
	const names = new Set();
	const ids = new Set();
	titles.forEach((title) => {
		(title.People || []).forEach((person) => {
			if (person.Type !== 'Author' && person.Role !== 'Author') return;
			if (person.Name) names.add(person.Name.toLowerCase());
			if (person.Id) ids.add(person.Id);
		});
		if (title.AlbumArtist) names.add(title.AlbumArtist.toLowerCase());
		(title.Artists || []).forEach((artist) => names.add(String(artist).toLowerCase()));
	});
	return {names, ids};
};

// The authors a format's titles credit. An audiobook scope also keeps anyone no book credits,
// since an author only known from the artists list is most likely a narrator or audiobook writer.
export const scopedAuthors = (authors, titles, scope) => {
	if (scope === SCOPE_ALL) return authors;
	if (scope === SCOPE_COMICS) return [];
	const books = authorNames(titles.filter(isEbookItem));
	const credits = (author, set) => set.names.has(String(author.Name || '').toLowerCase()) || set.ids.has(author.Id);
	if (scope === SCOPE_BOOKS) return authors.filter((author) => credits(author, books));
	const audio = authorNames(titles.filter(isAudiobookItem));
	return authors.filter((author) => credits(author, audio) || !credits(author, books));
};

// The shelves for a format, each with where its See All goes. Empty ones drop out.
export const classicShelves = ({library, scope, mixed, data, extra, series, authors}) => {
	const all = scope === SCOPE_ALL;
	const audioLibrary = isAudiobookLibrary(library);
	const showBooks = all || scope === SCOPE_BOOKS;
	const showAudiobooks = all || scope === SCOPE_AUDIOBOOKS;
	const showComics = all || scope === SCOPE_COMICS;
	const scoped = (items) => (all ? items : items.filter((item) => matchesScope(item, scope)));
	const mixFormats = mixed && all;
	const titlesIn = (shelfScope, sort) => screenFor(TITLES, mixed ? shelfScope : SCOPE_ALL, sort);

	let last;
	if (scope === SCOPE_BOOKS) last = {id: 'allBooks', title: $L('Books'), items: extra.allBooks, seeAll: titlesIn(SCOPE_BOOKS, 'name')};
	else if (scope === SCOPE_AUDIOBOOKS) last = {id: 'allAudiobooks', title: $L('Audiobooks'), items: extra.allAudiobooks, seeAll: titlesIn(SCOPE_AUDIOBOOKS, 'name')};
	else if (scope === SCOPE_COMICS) last = {id: 'allComics', title: $L('Comics'), items: extra.allComics, seeAll: titlesIn(SCOPE_COMICS, 'name')};
	else {
		const title = mixed ? $L('All Titles') : (audioLibrary ? $L('Audiobooks') : $L('Books'));
		last = {id: 'allTitles', title, items: extra.all, seeAll: titlesIn(SCOPE_ALL, 'name'), mixFormats};
	}

	return [
		{id: 'resume', title: audioLibrary ? $L('Continue Listening') : $L('Continue Reading'), items: scoped(data.resume), seeAll: titlesIn(scope, 'datePlayed'), mixFormats},
		showBooks && !audioLibrary && {id: 'latestBooks', title: $L('Latest Books'), items: extra.latestBooks, seeAll: titlesIn(SCOPE_BOOKS)},
		showAudiobooks && {id: 'latestAudiobooks', title: $L('Latest Audiobooks'), items: extra.latestAudiobooks, seeAll: titlesIn(SCOPE_AUDIOBOOKS)},
		showComics && !audioLibrary && {id: 'latestComics', title: $L('Latest Comics'), items: extra.latestComics, seeAll: titlesIn(SCOPE_COMICS)},
		all && {id: 'lastPlayed', title: $L('Last Played'), items: extra.lastPlayed, seeAll: titlesIn(SCOPE_AUDIOBOOKS, 'datePlayed')},
		all && {id: 'series', title: $L('Series'), items: series, seeAll: {id: 'series'}},
		{id: 'authors', title: $L('Authors'), items: authors, kind: 'avatar'},
		all && {id: 'genres', title: $L('Genres'), items: data.genres.slice(0, GENRE_CHIPS), kind: 'chip', seeAll: {id: 'genres'}},
		all && {id: 'collections', title: $L('Collections'), items: data.collections, seeAll: {id: 'collections'}},
		all && {id: 'favorites', title: $L('Favorites'), items: data.favorites, seeAll: {id: 'favorites'}, mixFormats},
		last
	].filter((shelf) => shelf && shelf.items.length > 0);
};

// The featured title over its blurred cover, with the one button that opens it to read or listen.
const ClassicHero = ({item, serverUrl, onKeyDown, onPrimary, heroRef}) => {
	const audio = isAudiobookItem(item);
	const percent = playedPercent(item);
	const started = percent > 0;
	const url = bookImageUrl(serverUrl, item);
	const blurred = url ? serverBlurredUrl(url, 60) : null;
	const meta = bookProgressMeta(item);
	const subtitle = bookSubtitle(item);
	let cta = audio ? $L('Listen') : $L('Read');
	if (started) cta = audio ? $L('Continue Listening') : $L('Continue Reading');

	return (
		<div className={css.hero} ref={heroRef}>
			{url && <div className={`${css.heroBackdrop} ${blurred ? '' : css.heroBackdropDim}`} style={{backgroundImage: `url(${blurred || url})`}} />}
			<div className={css.heroScrim} style={scrimStyle(HERO_FADE)} />
			<div className={css.heroContent}>
				<div className={css.heroText}>
					<div className={css.eyebrow}>{audio ? $L('Continue Listening') : $L('Continue Reading')}</div>
					<div className={css.heroTitle}>{item.Name}</div>
					{subtitle && <div className={css.heroSubtitle}>{subtitle}</div>}
					<div className={css.heroActions} onKeyDown={onKeyDown}>
						<SpottableDiv className={css.cta} spotlightId={FOCUS_IDS[HERO]} onClick={onPrimary}>
							<BookIcon name="play_arrow" className={css.ctaIcon} />{cta}
						</SpottableDiv>
						{started && <div className={css.heroProgress}><div style={{width: `${Math.min(percent, 100)}%`}} /></div>}
						{meta && <div className={css.heroMeta}>{meta}</div>}
					</div>
				</div>
				<div className={css.heroCover}>
					{url ? <img src={url} alt="" /> : <BookIcon name="menu_book" className={css.heroCoverIcon} />}
				</div>
			</div>
		</div>
	);
};

const StatsBand = ({stats}) => (
	<div className={css.stats}>
		{stats.filter((stat) => stat.count > 0).map((stat) => (
			<div key={stat.label} className={css.stat}>
				<div className={css.statCount}>{stat.count}</div>
				<div className={css.statLabel}>{stat.label}</div>
			</div>
		))}
	</div>
);

// The format filter, one stop whose Left and Right move the selection straight away.
const ScopePill = ({scopes, value, onChange, onKeyDown, scopeRef}) => {
	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT || e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			const next = scopes[scopes.indexOf(value) + (e.keyCode === KEYS.LEFT ? -1 : 1)];
			if (next) onChange(next);
		} else {
			onKeyDown(e);
		}
	}, [scopes, value, onChange, onKeyDown]);
	const handleClick = useCallback((e) => {
		const scope = e.target.closest('[data-scope]')?.dataset.scope;
		if (scope) onChange(scope);
	}, [onChange]);
	const index = scopes.indexOf(value);

	return (
		<div className={css.scopeWrap} ref={scopeRef}>
			<SpottableDiv className={css.scope} spotlightId={FOCUS_IDS[SCOPE]} onKeyDown={handleKeyDown} onClick={handleClick}>
				<div className={css.scopeThumb} style={{width: `${100 / scopes.length}%`, left: `${index * 100 / scopes.length}%`}} />
				{scopes.map((scope) => (
					<div key={scope} className={`${css.scopeSegment} ${scope === value ? css.scopeSelected : ''}`} data-scope={scope}>
						{scopeLabel(scope)}
					</div>
				))}
			</SpottableDiv>
		</div>
	);
};

const GenreChip = ({item, onSelect}) => {
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	return <SpottableDiv className={css.chip} onClick={handleClick}><span>{item.Name}</span></SpottableDiv>;
};

const Shelf = ({shelf, index, serverUrl, onSelect, registerRowRef, onSeeAll, keys}) => {
	const sectionRef = useCallback((el) => registerRowRef(index, el), [registerRowRef, index]);
	const handleSeeAll = useCallback(() => onSeeAll(shelf.seeAll), [onSeeAll, shelf.seeAll]);
	return (
		<MusicSection
			title={shelf.title}
			shelf
			sectionRef={sectionRef}
			seeAllId={seeAllId(shelf.id)}
			onSeeAll={shelf.seeAll ? handleSeeAll : null}
			{...keys}
		>
			<ShelfRow className={css.shelfRow} spotlightId={`book-row-${index}`} onFocus={keepFocusInView}>
				{shelf.items.map((item) => {
					if (shelf.kind === 'chip') return <GenreChip key={item.Id} item={item} onSelect={onSelect} />;
					if (shelf.kind === 'avatar') {
						return <MediaCard key={item.Id} item={item} serverUrl={serverUrl} cardType="circle" size={AVATAR_SIZE} onSelect={onSelect} />;
					}
					return <BookCard key={item.Id} item={item} serverUrl={serverUrl} width={CARD_WIDTH} showFormat={shelf.mixFormats} onSelect={onSelect} />;
				})}
			</ShelfRow>
		</MusicSection>
	);
};

// The Classic book library: the title being read over its blurred cover, a band of counts, the
// format filter for a library holding more than one, and shelves of titles under it, each See All
// opening its destination.
const ClassicBooks = ({library, api, serverUrl, data, onSelectItem, onOpenGrid, onOpenScreen, onPlay}) => {
	const [extra, setExtra] = useState(null);
	const [scopeChoice, setScope] = useState(SCOPE_ALL);
	const initialFocusRef = useRef(false);

	useEffect(() => {
		if (!api || !library?.Id) return undefined;
		let cancelled = false;
		setExtra(null);
		loadClassicRows(api, library).then((rows) => {
			if (!cancelled) setExtra(rows);
		});
		return () => { cancelled = true; };
	}, [api, library]);

	const loading = !extra;
	const mixed = isMixedLibrary(library, data.counts);
	const scopes = useMemo(() => availableScopes(data.counts), [data.counts]);
	// A reload, or a switch to a library with one format, can take away the format that was picked,
	// which leaves All.
	const scope = mixed && scopes.includes(scopeChoice) ? scopeChoice : SCOPE_ALL;
	const audioLibrary = isAudiobookLibrary(library);

	const series = useMemo(() => (
		scope === SCOPE_ALL ? data.series : bookSeriesEntries(data.titles.filter((title) => matchesScope(title, scope)), data.folders)
	), [data.series, data.titles, data.folders, scope]);
	const authors = useMemo(() => {
		if (!extra) return [];
		// Authors the title rows only credit as people join the server's list, sorted together.
		const artists = data.authors.filter((author) => author.Type !== 'Person');
		const credited = peopleAuthors([...extra.allBooks, ...extra.all], artists.map((artist) => String(artist.Name || '').toLowerCase()));
		return scopedAuthors(credited.length ? [...artists, ...credited].sort(byName) : artists, data.titles, scope);
	}, [data.authors, data.titles, extra, scope]);
	const shelves = useMemo(() => (extra ? classicShelves({library, scope, mixed, data, extra, series, authors}) : []),
		[library, scope, mixed, data, extra, series, authors]);

	const featured = data.resume[0] || extra?.latestBooks[0] || extra?.latestAudiobooks[0] || extra?.latestComics[0] || null;
	const hasHero = Boolean(featured);
	const shelfCount = shelves.length;
	const chain = useMemo(() => [
		...(hasHero ? [HERO] : []),
		...(mixed ? [SCOPE] : []),
		...Array.from({length: shelfCount}, (_, i) => rowNode(i))
	], [hasHero, mixed, shelfCount]);

	const {scrollerRef, chainRef, lastNodeRef, registerRowRef, registerNode, focusNode} = useMusicBrowseFocus(chain, idForNode);

	// Up off the first stop goes to the strip over the page.
	const sectionKey = useCallback((node, extraKeys) => (e) => (
		handleSectionKey(e, {node, chain: chainRef.current, focusNode, ...(node === chainRef.current[0] ? {onUp: focusStrip} : {}), ...extraKeys})
	), [chainRef, focusNode]);
	// Up from a shelf with a See All stops there first, and Down from it goes back into the shelf.
	const seeAllKeys = useCallback((node, id) => ({
		onKeyDown: sectionKey(node, {onUp: () => Spotlight.focus(id)}),
		onSeeAllKeyDown: sectionKey(node, {onDown: () => focusNode(node)})
	}), [sectionKey, focusNode]);
	const handleHeroKey = useMemo(() => sectionKey(HERO), [sectionKey]);
	const handleScopeKey = useMemo(() => sectionKey(SCOPE), [sectionKey]);

	const registerHero = useCallback((el) => registerNode(HERO, el), [registerNode]);
	const registerScope = useCallback((el) => registerNode(SCOPE, el), [registerNode]);

	const handlers = useMemo(() => ({onSelectItem, onOpenGrid}), [onSelectItem, onOpenGrid]);
	const handleSelect = useCallback((item) => openBookItem(item, handlers), [handlers]);
	const handlePrimary = useCallback(() => readOrListen(featured, onPlay), [featured, onPlay]);

	// First focus lands on the hero's button, or the first stop without one, then a backstop for
	// reloads that pull the focused card out from under it.
	useEffect(() => {
		if (loading) return;
		const active = document.activeElement;
		const focused = active && active !== document.body && active.classList?.contains('spottable');
		// Picked from the strip, Overview opens with focus still on it.
		if (!initialFocusRef.current) {
			initialFocusRef.current = true;
			if (!focused && chain.length) focusNode(chain[0]);
			return;
		}
		if (focused) return;
		const remembered = lastNodeRef.current;
		if (chain.length) focusNode(chain.includes(remembered) ? remembered : chain[0]);
	}, [loading, chain, focusNode, lastNodeRef]);

	const stats = [
		...(mixed
			? [
				{label: $L('Books'), count: data.counts.books},
				{label: $L('Audiobooks'), count: data.counts.audiobooks},
				{label: $L('Comics'), count: data.counts.comics}
			]
			: [{label: audioLibrary ? $L('Audiobooks') : $L('Books'), count: data.counts.all}]),
		{label: $L('Series'), count: series.length},
		{label: $L('Authors'), count: scope === SCOPE_ALL ? data.authorCount : authors.length},
		{label: $L('Genres'), count: data.genres.length}
	];

	if (loading) {
		return (
			<div className={css.page}>
				<div className={css.scroller}>
					<div className={css.topSpacer} />
					<LibrarySkeleton gridWidth={window.innerWidth / rootScale() - INSET * 2} cardWidth={267} posterHeight={400} padX={10} minRowGap={10} showText />
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.scroller} ref={scrollerRef}>
				{hasHero ? (
					<ClassicHero item={featured} serverUrl={serverUrl} heroRef={registerHero} onKeyDown={handleHeroKey} onPrimary={handlePrimary} />
				) : (
					<div className={css.topSpacer} />
				)}
				<StatsBand stats={stats} />
				{mixed && <ScopePill scopes={scopes} value={scope} onChange={setScope} onKeyDown={handleScopeKey} scopeRef={registerScope} />}
				{shelves.length > 0 ? shelves.map((shelf, index) => {
					const node = rowNode(index);
					const keys = shelf.seeAll ? seeAllKeys(node, seeAllId(shelf.id)) : {onKeyDown: sectionKey(node)};
					return (
						<Shelf
							key={shelf.id}
							shelf={shelf}
							index={index}
							serverUrl={serverUrl}
							onSelect={handleSelect}
							registerRowRef={registerRowRef}
							onSeeAll={onOpenScreen}
							keys={keys}
						/>
					);
				}) : (
					<BookEmptyState title={$L('No Books Found')} description={$L('This library does not contain any books, audiobooks, or comics yet.')} />
				)}
			</div>
		</div>
	);
};

export default ClassicBooks;
