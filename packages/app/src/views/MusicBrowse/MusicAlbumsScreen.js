import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import DetailsTabBar from '../../components/DetailsTabBar';
import {keepFocusInView} from '../../utils/focusScroll';
import {stopPropagation} from '../../utils/gridChrome';
import {formatDuration} from '../../utils/helpers';
import {rem} from '../../utils/rootScale';
import {PanelContainer} from '../../utils/spotlightContainers';
import {shuffleArray} from '../Details/detailsMedia';
import MusicTrackList from './MusicTrackList';
import {handleSectionKey} from './musicLibrary';
import {ALBUM_SORTS, countLabel, gridMove, gridRows, rowIndexOf} from './musicScreens';
import {
	CoreIcon, MusicCardGrid, ScreenHeader, contentKeyHandler, focusRail, focusSoon, handleGridKey, indexFromId,
	playTracks, toPage, useCardSize, usePagedItems, useScreenBack, useScreenFocus
} from './MusicScreenParts';

import css from './MusicScreens.module.less';
import musicCss from './MusicLibrary.module.less';
import filterCss from './MusicFilterPanel.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('albums');
// Moves inside the panel's buttons and its songs are measured there first, not across the page.
const PanelSection = SpotlightContainerDecorator({}, 'div');

const ID = 'music-album';
const PLAY_ID = 'music-album-panel-play';
const FIRST_TRACK_ID = 'music-album-panel-track';
const FILTER_ID = 'music-albums-filter';
const COLUMNS = 6;
const INSETS = 120;
const GAP = 30;
const CARET_HALF = 14;
const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,Genres,AlbumArtist,AlbumArtists,ChildCount';

const sumTicks = (tracks) => tracks.reduce((sum, track) => sum + (track.RunTimeTicks || 0), 0);

// The album opened under its row: what it is, Play, Shuffle and Open Album, and its songs in two
// columns.
const AlbumPanel = ({album, tracks, caretLeft, onPlay, onShuffle, onOpen, onPlayTrack, onButtonsKey, onTracksKey}) => {
	const artist = album.AlbumArtist || album.AlbumArtists?.[0]?.Name;
	const count = tracks ? tracks.length : album.ChildCount;
	const ticks = tracks?.length ? sumTicks(tracks) : album.RunTimeTicks;
	const meta = [artist, album.ProductionYear ? String(album.ProductionYear) : ''].filter(Boolean).join(' · ');
	const subMeta = [
		count > 0 ? countLabel(count, $L('1 track'), $L('{count} tracks')) : '',
		formatDuration(ticks),
		album.Genres?.[0]
	].filter(Boolean).join(' · ');

	return (
		<div className={css.albumPanel}>
			<div className={css.caret} style={{left: caretLeft}} />
			<div className={css.panelInfo}>
				<div className={css.eyebrow}>{$L('Album')}</div>
				<div className={css.panelTitle}>{album.Name}</div>
				{meta && <div className={css.meta}>{meta}</div>}
				{subMeta && <div className={css.subMeta}>{subMeta}</div>}
				<PanelSection className={css.panelButtons} onKeyDown={onButtonsKey}>
					<SpottableDiv className={`${musicCss.heroBtn} ${musicCss.primaryBtn}`} spotlightId={PLAY_ID} onClick={onPlay}>
						<CoreIcon name="play_arrow" />{$L('Play')}
					</SpottableDiv>
					<SpottableDiv className={musicCss.heroBtn} onClick={onShuffle}>
						<CoreIcon name="shuffle" />{$L('Shuffle')}
					</SpottableDiv>
					<SpottableDiv className={musicCss.heroBtn} onClick={onOpen}>
						<CoreIcon name="album" />{$L('Open Album')}
					</SpottableDiv>
				</PanelSection>
			</div>
			<PanelSection className={css.panelTracks} onKeyDown={onTracksKey}>
				{tracks ? (
					<MusicTrackList
						tracks={tracks}
						numbered
						className={css.twoColumns}
						firstSpotlightId={FIRST_TRACK_ID}
						onPlay={onPlayTrack}
					/>
				) : (
					<div className={css.loading}>{$L('Loading...')}</div>
				)}
			</PanelSection>
		</div>
	);
};

// The radio list of genres the Filter pill opens, All Genres first.
const GenreFilter = ({genres, picked, onPick, onClose}) => {
	const options = useMemo(() => [{Id: null, Name: $L('All Genres')}, ...genres], [genres]);
	const pickedIndex = Math.max(0, options.findIndex((option) => option.Id === (picked?.Id || null)));

	useEffect(() => focusSoon(`music-genre-option-${pickedIndex}`), [pickedIndex, options.length]);

	const handlePick = useCallback((e) => {
		const option = options[parseInt(e.currentTarget.dataset.index, 10)];
		if (option) onPick(option.Id ? option : null);
	}, [options, onPick]);

	return (
		<div className={filterCss.overlay} onClick={onClose}>
			<PanelContainer className={filterCss.panel} spotlightId="music-genre-filter" onClick={stopPropagation} onFocus={keepFocusInView}>
				<h2 className={filterCss.title}>{$L('Filter by Genre')}</h2>
				{options.map((option, index) => {
					const selected = index === pickedIndex;
					return (
						<SpottableDiv
							key={option.Id || 'all'}
							className={selected ? `${filterCss.option} ${filterCss.optionActive}` : filterCss.option}
							data-index={index}
							spotlightId={`music-genre-option-${index}`}
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

// Every album as a cover grid. Selecting one opens it in a panel under its row rather than
// leaving the screen.
const MusicAlbumsScreen = ({library, api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [sortId, setSortId] = useState(ALBUM_SORTS[0].id);
	const [genre, setGenre] = useState(null);
	const [genres, setGenres] = useState(null);
	const [showGenres, setShowGenres] = useState(false);
	const [openIndex, setOpenIndex] = useState(-1);
	const [tracks, setTracks] = useState(null);
	const libraryId = library?.Id;
	const sort = ALBUM_SORTS.find((option) => option.id === sortId);

	const fetchPage = useCallback((start, limit) => api.getItems({
		ParentId: libraryId,
		IncludeItemTypes: 'MusicAlbum',
		Recursive: true,
		SortBy: sort.SortBy,
		SortOrder: sort.SortOrder,
		GenreIds: genre?.Id,
		Fields: FIELDS,
		StartIndex: start,
		Limit: limit
	}).then((res) => toPage(res)), [api, libraryId, sort, genre]);

	const {items, total, loaded, complete, loadMore} = usePagedItems(fetchPage);
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const rows = useMemo(() => gridRows(items.length, COLUMNS), [items.length]);
	const {side, size} = useCardSize(COLUMNS, INSETS, GAP);

	useEffect(() => setOpenIndex(-1), [fetchPage]);

	const album = openIndex >= 0 ? items[openIndex] : null;
	const albumId = album?.Id;
	const openRow = openIndex >= 0 ? rowIndexOf(rows, openIndex) : -1;

	useEffect(() => {
		setTracks(null);
		if (!albumId) return undefined;
		let cancelled = false;
		api.getAlbumTracks(albumId)
			.then((res) => { if (!cancelled) setTracks(res?.Items || []); })
			.catch(() => { if (!cancelled) setTracks([]); });
		return () => { cancelled = true; };
	}, [api, albumId]);

	const openGenres = useCallback(() => {
		setShowGenres(true);
		if (genres) return;
		api.getMusicGenres({ParentId: libraryId, IncludeItemTypes: 'MusicAlbum'})
			.then((res) => setGenres(res?.Items || []))
			.catch(() => setGenres([]));
	}, [api, libraryId, genres]);

	// The pill is still there behind the list, so focus goes back to it before the list closes.
	const closeGenres = useCallback(() => {
		Spotlight.focus(FILTER_ID);
		setShowGenres(false);
	}, []);

	const pickGenre = useCallback((picked) => {
		setGenre(picked);
		closeGenres();
	}, [closeGenres]);

	const focusIndex = useCallback((index) => Spotlight.focus(`${ID}-${index}`), []);

	// Focus goes back to the album before the panel goes, so it never lands nowhere.
	const closePanel = useCallback(() => {
		if (openIndex < 0) return false;
		focusIndex(openIndex);
		setOpenIndex(-1);
		return true;
	}, [openIndex, focusIndex]);

	useScreenBack(backHandlerRef, onBack, () => {
		if (showGenres) {
			closeGenres();
			return true;
		}
		return closePanel();
	});
	useScreenFocus('albums', loaded && !showGenres);

	const handleSelect = useCallback((item) => {
		const index = itemsRef.current.indexOf(item);
		setOpenIndex((prev) => (prev === index ? -1 : index));
	}, []);

	const handleGridKeyDown = useCallback((e) => handleGridKey(e, {
		rows,
		index: indexFromId(e.target, ID),
		focusIndex,
		// The open panel sits between its row and the next, so both step into it at Play.
		onKey: (direction, row) => openRow >= 0 && (
			(direction === 'down' && row === openRow) || (direction === 'up' && row === openRow + 1)
		) && Spotlight.focus(PLAY_ID)
	}), [rows, openRow, focusIndex]);

	const handleGridFocus = useCallback((e) => {
		const index = indexFromId(e.target, ID);
		if (index >= 0 && rowIndexOf(rows, index) >= rows.length - 3) loadMore();
	}, [rows, loadMore]);

	const focusAlbum = useCallback(() => focusIndex(openIndex), [focusIndex, openIndex]);
	const focusBelow = useCallback(() => {
		const below = gridMove(rows, openRow, openIndex, 'down');
		if (below != null) focusIndex(below);
	}, [rows, openRow, openIndex, focusIndex]);
	const focusFirstTrack = useCallback(() => Spotlight.focus(FIRST_TRACK_ID), []);
	const focusPlay = useCallback(() => Spotlight.focus(PLAY_ID), []);

	const handleButtonsKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onUp: focusAlbum, onDown: focusBelow, onLeft: focusRail, onRight: focusFirstTrack
	}), [focusAlbum, focusBelow, focusFirstTrack]);
	const handleTracksKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onUp: focusAlbum, onDown: focusBelow, onLeft: focusPlay
	}), [focusAlbum, focusBelow, focusPlay]);

	const handlePlay = useCallback(() => playTracks(onPlay, tracks || []), [onPlay, tracks]);
	const handleShuffle = useCallback(() => playTracks(onPlay, shuffleArray(tracks || [])), [onPlay, tracks]);
	const handleOpen = useCallback(() => album && onSelectItem?.(album), [album, onSelectItem]);
	const handlePlayTrack = useCallback((track) => playTracks(onPlay, tracks || [], (tracks || []).indexOf(track)), [onPlay, tracks]);

	const caretLeft = openIndex >= 0 && openRow >= 0
		? rem((openIndex - rows[openRow].start) * (side + GAP) + side / 2 - CARET_HALF)
		: 0;

	const afterRow = useCallback((row) => (row === openRow && album ? (
		<AlbumPanel
			album={album}
			tracks={tracks}
			caretLeft={caretLeft}
			onPlay={handlePlay}
			onShuffle={handleShuffle}
			onOpen={handleOpen}
			onPlayTrack={handlePlayTrack}
			onButtonsKey={handleButtonsKey}
			onTracksKey={handleTracksKey}
		/>
	) : null), [openRow, album, tracks, caretLeft, handlePlay, handleShuffle, handleOpen, handlePlayTrack, handleButtonsKey, handleTracksKey]);

	const empty = complete && items.length === 0;

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="albums"
				title={$L('Albums')}
				count={total > 0 ? countLabel(total, $L('1 album'), $L('{count} albums')) : null}
			>
				<DetailsTabBar tabs={ALBUM_SORTS} activeId={sortId} expanded={false} onActivate={setSortId} />
				<SpottableDiv className={css.pill} spotlightId={FILTER_ID} onClick={openGenres}>
					<CoreIcon name="filter_list" className={genre ? css.accentIcon : undefined} />{genre ? genre.Name : $L('Filter')}
				</SpottableDiv>
			</ScreenHeader>

			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{empty ? (
					<div className={css.empty}>{$L('No items found')}</div>
				) : (
					<div className={css.grid} onKeyDown={handleGridKeyDown} onFocus={handleGridFocus}>
						<MusicCardGrid
							items={items}
							rows={rows}
							idPrefix={ID}
							cardType="square"
							size={size}
							serverUrl={serverUrl}
							onSelect={handleSelect}
							afterRow={afterRow}
						/>
					</div>
				)}
			</div>

			{showGenres && (
				<GenreFilter genres={genres || []} picked={genre} onPick={pickGenre} onClose={closeGenres} />
			)}
		</div>
	);
};

export default MusicAlbumsScreen;
