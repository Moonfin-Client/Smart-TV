import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import DetailsTabBar from '../../components/DetailsTabBar';
import {useSettings} from '../../context/SettingsContext';
import useItemMenuHold, {itemWithIdAt} from '../../hooks/useItemMenuHold';
import {
	SCOPE_ALL, availableScopes, bookImageUrl, bookProgressMeta, bookSubtitle, genreHue, isAudiobookItem,
	isAudiobookLibrary, isComicItem, isMixedLibrary, matchesScope, playedPercent, scopeLabel, scopedTypes,
	seriesCoverUrls, seriesItemCountLabel, titlesLabel
} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rem} from '../../utils/rootScale';
import {scrimStyle} from '../../utils/scrimImage';
import {handleSectionKey} from '../MusicBrowse/musicLibrary';
import useMusicBrowseFocus from '../MusicBrowse/useMusicBrowseFocus';
import BookCard, {BookEmptyState, BookIcon} from './BookCard';
import {bookMenuItem, openBookItem, readOrListen} from './bookNavigation';
import {TITLES, screenFor} from './bookScreens';
import {focusStrip} from './BookScreenParts';
import {loadBookRow} from './useBookLibrary';

import css from './ReadingRoomBooks.module.less';

const SpottableDiv = Spottable('div');
// Coming back to a row lands on the card it was left on.
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const HEADER = 'header';
const CONTINUE = 'continue';
const SCOPE = 'scope';
const RECENT = 'recent';
const SERIES = 'series';
const AUTHORS = 'authors';
const GENRES = 'genres';
const NODES = [HEADER, CONTINUE, SCOPE, RECENT, SERIES, AUTHORS, GENRES];

// The scope stop is the selected format, or Browse all when there's no format filter.
const IDS = {
	[HEADER]: 'rr-search',
	[CONTINUE]: 'rr-continue',
	[SCOPE]: 'rr-scope',
	[RECENT]: 'rr-recent',
	[SERIES]: 'rr-series',
	[AUTHORS]: 'rr-author-0',
	[GENRES]: 'rr-genre-0'
};
const idForNode = (node) => IDS[node] || null;
const seeAllId = (node) => `rr-see-all-${node}`;

const RECENT_COUNT = 20;
const AUTHOR_COUNT = 6;
const AUTHOR_COLUMNS = 2;
const GENRE_COLUMNS = 3;
const GENRE_COUNT = 6;
const CARD_WIDTH = 267;

// Each cover behind the front one sits a ninth of a cover's width further right, a little higher
// and fainter.
const SERIES_COVER = 234;
const FAN = SERIES_COVER * 0.11;
const FAN_OPACITY = [1, 0.85, 0.6];

// Matches .backdropScrim. The build bakes the stylesheet's theme colors to their fallbacks, so the
// fade ends on the page's own background rather than the theme's.
const SCRIM = [{to: 'bottom', rgb: '10, 10, 10', stops: [[0, 0.2], [0.6, 0.75], [1, 1]]}];

const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2)
	.map((part) => Array.from(part)[0].toUpperCase()).join('');

const rowsOf = (items, columns) => {
	const rows = [];
	for (let start = 0; start < items.length; start += columns) rows.push(items.slice(start, start + columns));
	return rows;
};

const Cover = ({url, audio, className, style}) => (
	<div className={className} style={style}>
		{url ? <img className={css.coverImage} src={url} alt="" loading="lazy" /> : (
			<div className={css.coverPlaceholder}><BookIcon name={audio ? 'headphones_rounded' : 'menu_book_rounded'} className={css.coverGlyph} /></div>
		)}
	</div>
);

const SectionHeader = ({title, caption, node, onSeeAll, onSeeAllKeyDown}) => (
	<div className={css.sectionHeader}>
		<h2 className={css.sectionTitle}>{title}</h2>
		{caption && <span className={css.caption}>{caption}</span>}
		{onSeeAll && (
			<SpottableDiv className={css.seeAll} spotlightId={seeAllId(node)} onClick={onSeeAll} onKeyDown={onSeeAllKeyDown}>
				{$L('See All')}
			</SpottableDiv>
		)}
	</div>
);

const ContinueCard = memo(({item, serverUrl, onSelect, onRead}) => {
	const audio = isAudiobookItem(item);
	const subtitle = bookSubtitle(item);
	const handleClick = useCallback((e) => onSelect(item, e), [item, onSelect]);
	const handleRead = useCallback((e) => {
		e.stopPropagation();
		onRead(item);
	}, [item, onRead]);
	let eyebrow = $L('Book');
	if (audio) eyebrow = $L('Audiobook');
	else if (isComicItem(item)) eyebrow = $L('Comic');

	return (
		<SpottableDiv className={css.continueCard} data-book-id={item.Id} onClick={handleClick}>
			<Cover url={bookImageUrl(item._serverUrl || serverUrl, item)} audio={audio} className={audio ? css.continueCoverAudio : css.continueCover} />
			<div className={css.continueText}>
				<div className={css.eyebrow}>{eyebrow}</div>
				<div className={css.continueTitle}>{item.Name}</div>
				{subtitle && <div className={css.continueAuthor}>{subtitle}</div>}
				<div className={css.continueSpacer} />
				<div className={css.track}><div className={css.trackFill} style={{width: `${Math.min(Math.max(playedPercent(item), 0), 100)}%`}} /></div>
				<div className={css.continueFoot}>
					<span className={css.meta}>{bookProgressMeta(item)}</span>
					<span className={css.readButton} onClick={handleRead}>
						<BookIcon name="play_arrow_rounded" className={css.readIcon} />
						{audio ? $L('Listen') : $L('Read')}
					</span>
				</div>
			</div>
		</SpottableDiv>
	);
});

const SeriesTile = memo(({item, serverUrl, onSelect}) => {
	const base = item._serverUrl || serverUrl;
	const covers = seriesCoverUrls(base, item);
	const urls = covers.length ? covers : [bookImageUrl(base, item)];
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	return (
		<SpottableDiv className={css.seriesTile} onClick={handleClick}>
			<div className={css.fan}>
				{urls.map((url, i) => (
					<Cover
						key={i}
						url={url}
						className={css.fanCover}
						style={{left: rem(FAN * i), top: rem(FAN * 0.4 * (2 - i)), opacity: FAN_OPACITY[i], zIndex: urls.length - i}}
					/>
				))}
			</div>
			<div className={css.seriesName}>{item.Name}</div>
			<div className={css.seriesCount}>{seriesItemCountLabel(item.ChildCount || 0)}</div>
		</SpottableDiv>
	);
});

const AuthorPill = memo(({item, index, count, serverUrl, onSelect}) => {
	const url = bookImageUrl(item._serverUrl || serverUrl, item);
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	return (
		<SpottableDiv className={css.authorPill} spotlightId={index === 0 ? IDS[AUTHORS] : undefined} onClick={handleClick}>
			<span className={css.avatar}>
				{url ? <img className={css.coverImage} src={url} alt="" loading="lazy" /> : <span className={css.initials}>{initialsOf(item.Name)}</span>}
			</span>
			<span className={css.authorText}>
				<span className={css.authorName}>{item.Name}</span>
				{count > 0 && <span className={css.authorCount}>{titlesLabel(count)}</span>}
			</span>
		</SpottableDiv>
	);
});

// A genre as a tile tinted by its name, so it keeps its color between visits.
const GenreTile = memo(({item, index, onSelect}) => {
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	const count = item.ChildCount || 0;
	return (
		<SpottableDiv
			className={css.genreTile}
			style={{backgroundColor: `hsl(${genreHue(item.Name || '')}, 32%, 20%)`}}
			spotlightId={index === 0 ? IDS[GENRES] : undefined}
			onClick={handleClick}
		>
			<div className={css.genreName}>{item.Name}</div>
			{count > 0 && <div className={css.genreCount}>{titlesLabel(count)}</div>}
		</SpottableDiv>
	);
});

const Grid = ({items, columns, render}) => rowsOf(items, columns).map((row, r) => (
	<div key={r} className={css.gridRow}>
		{Array.from({length: columns}, (_, c) => (
			<div key={c} className={css.gridCell}>{row[c] ? render(row[c], r * columns + c) : null}</div>
		))}
	</div>
));

// The Reading Room book library: the library's name in a serif over what's being read on large
// cards, then the newest titles, the series fanned out, and the authors and genres as tiles.
const ReadingRoomBooks = ({library, api, serverUrl, data, onSelectItem, onOpenGrid, onOpenScreen, onPlay, onSearch}) => {
	const {settings} = useSettings();
	const [scope, setScope] = useState(SCOPE_ALL);
	const [recent, setRecent] = useState([]);
	const [onButton, setOnButton] = useState(false);
	const onButtonRef = useRef(false);
	onButtonRef.current = onButton;
	const initialFocusRef = useRef(false);

	const mixed = isMixedLibrary(library, data.counts);
	const scopes = availableScopes(data.counts);
	// A refresh can take away the format being filtered to, which puts it back on All.
	const activeScope = mixed && scopes.includes(scope) ? scope : SCOPE_ALL;
	const audioLibrary = isAudiobookLibrary(library);

	useEffect(() => {
		if (!api || !library?.Id) return undefined;
		let cancelled = false;
		loadBookRow(api, {
			ParentId: library.Id,
			IncludeItemTypes: scopedTypes(library, activeScope),
			SortBy: 'DateCreated,SortName',
			SortOrder: 'Descending',
			Limit: 60,
			EnableImageTypes: 'Primary'
		}).then((items) => {
			if (!cancelled) setRecent(items.filter((item) => matchesScope(item, activeScope)).slice(0, RECENT_COUNT));
		});
		return () => { cancelled = true; };
	}, [api, library, activeScope]);

	const resume = data.resume;
	const authors = data.authors.slice(0, AUTHOR_COUNT);
	const genres = data.genres.slice(0, GENRE_COUNT);
	const series = data.series;
	const empty = data.counts.all === 0 && resume.length === 0;
	const hasTitles = data.counts.all > 0;

	const chain = useMemo(() => [
		HEADER,
		...(resume.length ? [CONTINUE] : []),
		...(hasTitles ? [SCOPE] : []),
		...(!empty && recent.length ? [RECENT] : []),
		...(!empty && series.length ? [SERIES] : []),
		...(!empty && authors.length ? [AUTHORS] : []),
		...(!empty && genres.length ? [GENRES] : [])
	], [resume.length, hasTitles, empty, recent.length, series.length, authors.length, genres.length]);

	const {scrollerRef, chainRef, lastNodeRef, registerNode, focusNode} = useMusicBrowseFocus(chain, idForNode);

	const sectionRefs = useMemo(() => {
		const refs = {};
		NODES.forEach((node) => {
			refs[node] = (el) => registerNode(node, el);
		});
		return refs;
	}, [registerNode]);

	// Up off the first stop goes to the chips over the page.
	const sectionKey = useCallback((node, extra) => (e) => (
		handleSectionKey(e, {node, chain: chainRef.current, focusNode, ...(node === chainRef.current[0] ? {onUp: focusStrip} : {}), ...extra})
	), [chainRef, focusNode]);
	// Up from a row with a See All stops there first, and Down from it goes back into the row.
	const seeAllKeys = useCallback((node) => ({
		onKeyDown: sectionKey(node, {onUp: () => Spotlight.focus(seeAllId(node))}),
		onSeeAllKeyDown: sectionKey(node, {onDown: () => focusNode(node)})
	}), [sectionKey, focusNode]);
	// Left and Right are left to Spotlight here, so they cross between the authors and the genres.
	const verticalKey = useCallback((node, extra) => {
		const handler = sectionKey(node, extra);
		return (e) => {
			if (e.keyCode === KEYS.UP || e.keyCode === KEYS.DOWN) handler(e);
		};
	}, [sectionKey]);

	const handlers = useMemo(() => ({onSelectItem, onOpenGrid}), [onSelectItem, onOpenGrid]);
	const openItem = useCallback((item) => openBookItem(item, handlers), [handlers]);
	const readItem = useCallback((item) => readOrListen(item, onPlay), [onPlay]);
	// A pointer clicks the card or its button directly, so only OK goes by which one is picked.
	const selectContinue = useCallback((item, e) => (
		onButtonRef.current && e.type !== 'click' ? readItem(item) : openItem(item)
	), [readItem, openItem]);
	const browseAll = useCallback(() => onOpenScreen(screenFor(TITLES, activeScope)), [onOpenScreen, activeScope]);
	const openSeriesFolders = useCallback(() => onOpenScreen({id: 'series'}), [onOpenScreen]);
	const openGenres = useCallback(() => onOpenScreen({id: 'genres'}), [onOpenScreen]);

	const continueItemAt = useCallback((target) => bookMenuItem(itemWithIdAt(resume, 'data-book-id', target)), [resume]);
	const continueMenu = useItemMenuHold(continueItemAt);

	// Down from a card steps onto its button before leaving the row, and Up from the button steps
	// back. The button stays picked while Left and Right move along the row.
	const handleContinueKey = useCallback((e) => {
		const down = e.keyCode === KEYS.DOWN;
		if ((down && !onButtonRef.current) || (e.keyCode === KEYS.UP && onButtonRef.current)) {
			e.preventDefault();
			e.stopPropagation();
			setOnButton(down);
			return;
		}
		handleSectionKey(e, {node: CONTINUE, chain: chainRef.current, focusNode});
	}, [chainRef, focusNode]);

	// The new focus isn't known until the blur is over, so the check waits a tick.
	const handleContinueBlur = useCallback((e) => {
		const row = e.currentTarget;
		window.setTimeout(() => {
			if (!row.contains(document.activeElement)) setOnButton(false);
		}, 0);
	}, []);

	const handleHeaderKey = useMemo(() => sectionKey(HEADER), [sectionKey]);
	const handleScopeKey = useMemo(() => sectionKey(SCOPE), [sectionKey]);
	const recentKeys = useMemo(() => seeAllKeys(RECENT), [seeAllKeys]);
	const seriesKeys = useMemo(() => seeAllKeys(SERIES), [seeAllKeys]);
	const genresBesideAuthors = authors.length > 0;
	const handleAuthorsKey = useMemo(() => verticalKey(AUTHORS), [verticalKey]);
	const handleGenresKey = useMemo(() => verticalKey(GENRES, {onUp: () => Spotlight.focus(seeAllId(GENRES))}), [verticalKey]);
	// Beside the authors, Up from the genres' See All goes to whatever sits above both.
	const handleGenresSeeAllKey = useMemo(() => sectionKey(genresBesideAuthors ? AUTHORS : GENRES, {
		onDown: () => Spotlight.focus(IDS[GENRES])
	}), [sectionKey, genresBesideAuthors]);

	// The first load lands under the header, unless Overview was picked from the chips, which keep
	// focus. After that focus only moves when a reload took the focused stop away.
	useEffect(() => {
		const active = document.activeElement;
		const focused = active && active !== document.body && active.classList?.contains('spottable');
		if (!initialFocusRef.current) {
			initialFocusRef.current = true;
			if (focused) return;
			focusNode(chain[1] || chain[0]);
			// The page stays at the top as it lands, so the header is still in view.
			if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
			return;
		}
		if (focused) return;
		const last = lastNodeRef.current;
		focusNode(chain.includes(last) ? last : chain[0]);
	}, [chain, focusNode, lastNodeRef, scrollerRef]);

	const name = library?.Name || $L('Books');

	const stats = [
		titlesLabel(data.counts.all),
		series.length ? (series.length === 1 ? $L('1 series') : $L('{count} series').replace('{count}', series.length)) : null,
		data.authorCount ? $L('{count} authors').replace('{count}', data.authorCount) : null,
		data.genreCount ? $L('{count} genres').replace('{count}', data.genreCount) : null
	].filter(Boolean).join(' · ');
	const backdropUrl = resume.length && !settings.hideBackdropsInLibraries ? bookImageUrl(resume[0]._serverUrl || serverUrl, resume[0]) : null;
	const scopeCount = data.counts[activeScope];
	const scopeTabs = scopes.map((id) => ({id, label: scopeLabel(id)}));

	return (
		<div className={css.page}>
			<div className={css.scroller} ref={scrollerRef}>
				<div className={css.top}>
					{backdropUrl && (
						<div className={css.backdrop}>
							<img className={css.backdropImage} src={backdropUrl} alt="" />
							<div className={css.backdropScrim} style={scrimStyle(SCRIM)} />
						</div>
					)}
					<div className={css.header} ref={sectionRefs[HEADER]}>
						<div className={css.headerText}>
							<div className={css.libraryName}>{name}</div>
							<div className={css.stats}>{stats}</div>
						</div>
						<SpottableDiv className={css.search} spotlightId={IDS[HEADER]} onClick={onSearch} onKeyDown={handleHeaderKey}>
							<BookIcon name="search_rounded" className={css.searchIcon} />
							<span>{audioLibrary ? $L('Search audiobooks') : $L('Search books')}</span>
						</SpottableDiv>
					</div>
					{resume.length > 0 && (
						<div className={css.section} ref={sectionRefs[CONTINUE]}>
							<SectionHeader
								title={audioLibrary ? $L('Continue Listening') : $L('Continue Reading')}
								caption={$L('{count} in progress').replace('{count}', data.resumeTotal)}
							/>
							<RowContainer
								{...continueMenu}
								className={`${css.row} ${css.continueRow} ${onButton ? css.onButton : ''}`}
								spotlightId={IDS[CONTINUE]}
								onFocus={keepFocusInView}
								onBlur={handleContinueBlur}
								onKeyDown={handleContinueKey}
							>
								{resume.map((item) => (
									<ContinueCard key={item.Id} item={item} serverUrl={serverUrl} onSelect={selectContinue} onRead={readItem} />
								))}
							</RowContainer>
						</div>
					)}
				</div>

				{empty ? (
					<BookEmptyState title={$L('No Books Found')} description={$L('This library does not contain any books, audiobooks, or comics yet.')} />
				) : (
					<>
						{hasTitles && (
							<div className={css.scopeRow} ref={sectionRefs[SCOPE]} onKeyDown={handleScopeKey}>
								{mixed && (
									<DetailsTabBar tabs={scopeTabs} activeId={activeScope} activeSpotlightId={IDS[SCOPE]} onSelect={setScope} onActivate={setScope} />
								)}
								<div className={css.scopeSpacer} />
								<SpottableDiv className={css.browseAll} spotlightId={mixed ? undefined : IDS[SCOPE]} onClick={browseAll}>
									{scopeCount === 1 ? $L('Browse 1 title') : $L('Browse all {count} titles').replace('{count}', scopeCount)}
									<BookIcon name="chevron_right_rounded" className={css.chevron} />
								</SpottableDiv>
							</div>
						)}

						{recent.length > 0 && (
							<div className={css.section} ref={sectionRefs[RECENT]}>
								<SectionHeader title={$L('Recently Added')} node={RECENT} onSeeAll={browseAll} onSeeAllKeyDown={recentKeys.onSeeAllKeyDown} />
								<RowContainer className={css.row} spotlightId={IDS[RECENT]} onFocus={keepFocusInView} onKeyDown={recentKeys.onKeyDown}>
									{recent.map((item) => (
										<BookCard key={item.Id} item={item} serverUrl={serverUrl} width={CARD_WIDTH} showFormat={mixed} onSelect={openItem} />
									))}
								</RowContainer>
							</div>
						)}

						{series.length > 0 && (
							<div className={css.section} ref={sectionRefs[SERIES]}>
								<SectionHeader title={$L('Series')} node={SERIES} onSeeAll={openSeriesFolders} onSeeAllKeyDown={seriesKeys.onSeeAllKeyDown} />
								<RowContainer className={css.row} spotlightId={IDS[SERIES]} onFocus={keepFocusInView} onKeyDown={seriesKeys.onKeyDown}>
									{series.map((item) => <SeriesTile key={item.Id} item={item} serverUrl={serverUrl} onSelect={openItem} />)}
								</RowContainer>
							</div>
						)}

						{(authors.length > 0 || genres.length > 0) && (
							<div className={css.peopleAndGenres}>
								{authors.length > 0 && (
									<div className={css.gridSection} ref={sectionRefs[AUTHORS]}>
										<SectionHeader title={$L('Authors')} />
										<div onKeyDown={handleAuthorsKey}>
											<Grid
												items={authors}
												columns={AUTHOR_COLUMNS}
												render={(item, index) => ( // eslint-disable-line react/jsx-no-bind
													<AuthorPill item={item} index={index} count={data.authorTitles.get(String(item.Name || '').toLowerCase()) || 0} serverUrl={serverUrl} onSelect={openItem} />
												)}
											/>
										</div>
									</div>
								)}
								{genres.length > 0 && (
									<div className={css.gridSection} ref={sectionRefs[GENRES]}>
										<SectionHeader title={$L('Genres')} node={GENRES} onSeeAll={openGenres} onSeeAllKeyDown={handleGenresSeeAllKey} />
										<div onKeyDown={handleGenresKey}>
											<Grid
												items={genres}
												columns={GENRE_COLUMNS}
												render={(item, index) => <GenreTile item={item} index={index} onSelect={openItem} />} // eslint-disable-line react/jsx-no-bind
											/>
										</div>
									</div>
								)}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
};

export default ReadingRoomBooks;
