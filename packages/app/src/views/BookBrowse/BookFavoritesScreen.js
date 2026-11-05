import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {seriesCoverUrls, seriesItemCountLabel} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rem} from '../../utils/rootScale';
import {CoreIcon, indexFromId} from '../MusicBrowse/MusicScreenParts';
import {countLabel, gridRows} from '../MusicBrowse/musicScreens';
import BookCard from './BookCard';
import {Face} from './BookAuthorsScreen';
import {openBookItem} from './bookNavigation';
import {FAVORITE_PANELS, splitFavorites} from './bookScreens';
import {
	EmptyNote, ScreenHeader, SeeAllButton, contentKeyHandler, focusRail, focusStrip, handleGridKey, rowEdgeKey,
	screenPx, useColumns, useRoom, useScreenBack, useScreenFocus
} from './BookScreenParts';
import {titlesFetcher} from './bookTitles';

import css from '../MusicBrowse/MusicScreens.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
const PanelItems = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');
const handleContentKey = contentKeyHandler('favorites');

const GRID_ID = 'book-favgrid';
const BACK_ID = 'book-fav-back';
const ALL_FAVORITES = 500;
const MAX_PANEL_CARD = 170;
const BOARD_GAP = 30;
const PANEL_PADDING = 48;
const PANEL_GAP = 20;
const PER_PANEL = 4;
const SERIES_PER_PANEL = 2;
const SERIES_COVER = 180;

const panelItemId = (panel, index) => `book-fav-${panel}-${index}`;
const seeAllId = (panel) => `book-fav-all-${panel}`;

const SeriesTile = memo(({item, spotlightId, serverUrl, onSelect}) => {
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	const url = seriesCoverUrls(item._serverUrl || serverUrl, item)[0];
	return (
		<SpottableDiv className={bookCss.portrait} style={{width: rem(SERIES_COVER)}} spotlightId={spotlightId} onClick={handleClick}>
			<div className={bookCss.stripCover} style={{height: rem(SERIES_COVER * 1.5)}}>{url && <img src={url} alt="" loading="lazy" />}</div>
			<div className={bookCss.portraitName}>{item.Name}</div>
			<div className={css.subMeta}>{seriesItemCountLabel(item.ChildCount || 0)}</div>
		</SpottableDiv>
	);
});

const AuthorTile = memo(({item, index, spotlightId, serverUrl, size, onSelect}) => {
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	return (
		<SpottableDiv className={bookCss.portrait} style={{width: rem(size)}} spotlightId={spotlightId} onClick={handleClick}>
			<Face author={item} size={size} serverUrl={serverUrl} index={index} />
			<div className={bookCss.portraitName}>{item.Name}</div>
		</SpottableDiv>
	);
});

const tileFor = (panel, item, index, spotlightId, props) => {
	if (panel === 'series') return <SeriesTile key={item.Id} item={item} spotlightId={spotlightId} {...props} />;
	if (panel === 'authors') return <AuthorTile key={item.Id} item={item} index={index} spotlightId={spotlightId} {...props} />;
	return <BookCard key={item.Id} item={item} width={screenPx(props.size)} spotlightId={spotlightId} serverUrl={props.serverUrl} onSelect={props.onSelect} />;
};

// The library's favorites as a board of panels, Books, Audiobooks, Comics, Series and Authors, each
// hidden while it's empty. See All opens a panel's whole list in place, and Back closes it.
const BookFavoritesScreen = ({library, data, api, serverUrl, onSelectItem, onOpenGrid, onBack, backHandlerRef}) => {
	const [lists, setLists] = useState(null);
	const [expanded, setExpanded] = useState(null);
	const libraryId = library?.Id;
	const {columns, px} = useColumns(230, 120, 30);
	// Four to a panel, two panels across, whatever room the rail leaves.
	const room = useRoom();
	const panelCard = Math.min(MAX_PANEL_CARD, Math.floor(((room - BOARD_GAP) / 2 - PANEL_PADDING - PANEL_GAP * (PER_PANEL - 1)) / PER_PANEL));

	// Favorite titles split by format, the series folders that are favorites, and favorite artists.
	useEffect(() => {
		let cancelled = false;
		const quietly = (promise, fallback) => promise.catch(() => fallback);
		Promise.all([
			quietly(titlesFetcher({api, library, favorites: true})(0, ALL_FAVORITES), {items: []}),
			quietly(api.getItems({ParentId: libraryId, IncludeItemTypes: 'Folder', Recursive: true, Filters: 'IsFavorite', Fields: 'ParentId'}), null),
			quietly(api.getArtists({ParentId: libraryId, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName'}), null)
		]).then(([titles, folders, artists]) => {
			if (cancelled) return;
			const favoriteFolders = new Set((folders?.Items || []).map((folder) => folder.Id));
			setLists({
				...splitFavorites(titles.items),
				series: data.series.filter((entry) => entry.IsFolder && favoriteFolders.has(entry.Id)),
				authors: artists?.Items || []
			});
		});
		return () => { cancelled = true; };
	}, [api, library, libraryId, data.series]);

	const panels = useMemo(() => (lists ? FAVORITE_PANELS.filter((panel) => lists[panel.id].length > 0) : []), [lists]);
	const total = panels.reduce((sum, panel) => sum + lists[panel.id].length, 0);
	const expandedItems = expanded ? lists[expanded] : [];
	const rows = useMemo(() => gridRows(expandedItems.length, columns), [expandedItems.length, columns]);

	const closeExpanded = useCallback(() => {
		if (!expanded) return false;
		const index = panels.findIndex((panel) => panel.id === expanded);
		setExpanded(null);
		window.requestAnimationFrame(() => Spotlight.focus(seeAllId(index)));
		return true;
	}, [expanded, panels]);

	useScreenBack(backHandlerRef, onBack, closeExpanded);
	useScreenFocus('favorites', lists !== null);

	const handleSelect = useCallback((item) => openBookItem(item, {onSelectItem, onOpenGrid}), [onSelectItem, onOpenGrid]);
	const handleSeeAll = useCallback((e) => {
		const panel = panels[parseInt(e.currentTarget.dataset.panel, 10)];
		if (!panel) return;
		setExpanded(panel.id);
		window.requestAnimationFrame(() => Spotlight.focus(`${GRID_ID}-0`));
	}, [panels]);

	// Up from a panel's items goes to its See All, and Down from See All back into them.
	// Left off the left column's panels goes to the rail, and Right off the right column's holds.
	const handleItemsKey = useCallback((e) => {
		const column = e.currentTarget.dataset.column;
		const outward = column === '0' ? e.keyCode === KEYS.LEFT : e.keyCode === KEYS.RIGHT;
		if (outward && rowEdgeKey(e)) return;
		if (e.keyCode !== KEYS.UP) return;
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(seeAllId(e.currentTarget.dataset.panel));
	}, []);
	const handleSeeAllKey = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(panelItemId(e.currentTarget.dataset.panel, 0));
	}, []);

	const focusIndex = useCallback((index) => Spotlight.focus(`${GRID_ID}-${index}`), []);
	const handleGridKeyDown = useCallback((e) => handleGridKey(e, {
		rows,
		index: indexFromId(e.target, GRID_ID),
		focusIndex,
		onKey: (direction, row) => direction === 'up' && row === 0 && Spotlight.focus(BACK_ID)
	}), [rows, focusIndex]);
	const handleBackKey = useCallback((e) => {
		if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			focusIndex(0);
		} else if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			focusStrip();
		} else if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			e.stopPropagation();
			focusRail();
		}
	}, [focusIndex]);

	const tileProps = {serverUrl, size: panelCard, onSelect: handleSelect};
	if (expanded) {
		const panel = FAVORITE_PANELS.find((option) => option.id === expanded);
		return (
			<div className={css.screen}>
				<div className={bookCss.header}>
					<div className={bookCss.headerTop}>
						<SpottableDiv className={css.pill} spotlightId={BACK_ID} onClick={closeExpanded} onKeyDown={handleBackKey}>
							<CoreIcon name="arrow_left" />{$L('Back')}
						</SpottableDiv>
						<h1 className={`${css.title} ${bookCss.titleAfterBack}`}>{panel.label()}</h1>
						<span className={css.count}>{countLabel(expandedItems.length, $L('1 favorite'), $L('{count} favorites'))}</span>
					</div>
				</div>
				<div className={css.scroller} onFocus={keepFocusInView}>
					<div className={bookCss.grid} onKeyDown={handleGridKeyDown}>
						{rows.map((row) => (
							<div key={row.start} className={bookCss.bookRow}>
								{expandedItems.slice(row.start, row.end).map((item, i) => (expanded === 'series' || expanded === 'authors'
									? tileFor(expanded, item, row.start + i, `${GRID_ID}-${row.start + i}`, tileProps)
									: <BookCard key={item.Id} item={item} width={px} spotlightId={`${GRID_ID}-${row.start + i}`} serverUrl={serverUrl} onSelect={handleSelect} />
								))}
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={css.screen}>
			<ScreenHeader screenId="favorites" title={$L('Favorites')} count={total ? countLabel(total, $L('1 favorite'), $L('{count} favorites')) : null} />
			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{lists && panels.length === 0 ? <EmptyNote /> : (
					<div className={bookCss.board}>
						{panels.map((panel, p) => {
							const items = lists[panel.id].slice(0, panel.id === 'series' ? SERIES_PER_PANEL : PER_PANEL);
							return (
								<div key={panel.id} className={bookCss.boardPanel} style={{width: `calc(50% - ${rem(BOARD_GAP)})`}}>
									<div className={bookCss.panelHead}>
										<div className={bookCss.panelHeading}>
											{panel.label()}<span className={bookCss.panelCount}>{lists[panel.id].length}</span>
										</div>
										<div data-panel={p} onKeyDown={handleSeeAllKey}>
											<SeeAllButton spotlightId={seeAllId(p)} data-panel={p} onClick={handleSeeAll} />
										</div>
									</div>
									<PanelItems className={bookCss.panelItems} data-panel={p} data-column={p % 2} onKeyDown={handleItemsKey}>
										{items.map((item, i) => tileFor(panel.id, item, i, panelItemId(p, i), tileProps))}
									</PanelItems>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

export default BookFavoritesScreen;
