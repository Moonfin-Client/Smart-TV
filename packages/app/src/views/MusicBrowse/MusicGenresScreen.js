import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaCard from '../../components/MediaCard';
import {keepFocusInView} from '../../utils/focusScroll';
import {rootScale} from '../../utils/rootScale';
import {SONG_MIXES, TILE_COLORS, countLabel, genreAlbumCount, hasGenreCounts, mixQuery, sortGenres} from './musicScreens';
import {CoreIcon, ScreenHeader, contentKeyHandler, playQuery, useScreenBack, useScreenFocus} from './MusicScreenParts';

import css from './MusicScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('genres');
// Up and down between genres come back to the album they were left on, or the station first.
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const SHELF_PAGE = 20;
const SHELF_CARD = {width: 176, height: 176};
const PLACEHOLDERS = Array.from({length: 7}, (_, i) => i);
// A row's height plus its margin from the stylesheet, which the rows in view are worked out from.
const ROW_STRIDE = 290;
const ALBUM_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,AlbumArtist';
const [EVERYTHING] = SONG_MIXES;

const shelfFull = (shelf) => shelf && shelf.items.length >= shelf.total;

// A genre's station, which shuffles it, and its newest albums beside it.
const GenreRow = memo(({genre, index, shelf, serverUrl, onSelectItem, onShuffle, onNearEnd}) => {
	const count = genreAlbumCount(genre);
	const handleShelfFocus = useCallback((e) => {
		keepFocusInView(e);
		const at = Array.prototype.indexOf.call(e.currentTarget.children, e.target);
		if (shelf && at >= shelf.items.length - 5 && !shelfFull(shelf)) onNearEnd(genre);
	}, [shelf, genre, onNearEnd]);

	return (
		<RowContainer className={css.genreRow}>
			<SpottableDiv
				className={css.station}
				style={{background: TILE_COLORS[index % TILE_COLORS.length]}}
				data-index={index}
				spotlightId={`music-station-${index}`}
				onClick={onShuffle}
			>
				<span className={css.stationName}>{genre.Name}</span>
				{count > 0 && <span className={css.stationMeta}>{countLabel(count, $L('1 album'), $L('{count} albums'))}</span>}
				<span className={css.stationChip}><CoreIcon name="shuffle" />{$L('Shuffle')}</span>
			</SpottableDiv>
			<div className={css.genreShelf} onFocus={handleShelfFocus}>
				{shelf
					? shelf.items.map((album) => (
						<MediaCard
							key={album.Id}
							item={album}
							serverUrl={serverUrl}
							cardType="square"
							size={SHELF_CARD}
							onSelect={onSelectItem}
						/>
					))
					: PLACEHOLDERS.map((i) => <div key={i} className={css.shelfPlaceholder} />)}
			</div>
		</RowContainer>
	);
});

// Every genre as a station row, most albums first. Rows fetch their albums once they're on screen.
const MusicGenresScreen = ({library, api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [genres, setGenres] = useState(null);
	const [byAlbums, setByAlbums] = useState(true);
	const [shelves, setShelves] = useState({});
	const shelvesRef = useRef(shelves);
	shelvesRef.current = shelves;
	const loadingRef = useRef(new Set());
	const scrollerRef = useRef(null);
	const libraryId = library?.Id;

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('genres', genres !== null);

	useEffect(() => {
		let cancelled = false;
		api.getMusicGenres({ParentId: libraryId, IncludeItemTypes: 'MusicAlbum', Fields: 'ItemCounts'})
			.then((res) => { if (!cancelled) setGenres(res?.Items || []); })
			.catch(() => { if (!cancelled) setGenres([]); });
		return () => { cancelled = true; };
	}, [api, libraryId]);

	// With no counts to go on the list stays A to Z and there's nothing to switch.
	const counted = useMemo(() => Boolean(genres) && hasGenreCounts(genres), [genres]);
	const sorted = useMemo(() => (genres ? sortGenres(genres, counted && byAlbums ? 'albums' : 'name') : []), [genres, counted, byAlbums]);
	const sortedRef = useRef(sorted);
	sortedRef.current = sorted;

	const loadShelf = useCallback((genre) => {
		const key = genre.Id;
		const shelf = shelvesRef.current[key];
		if (loadingRef.current.has(key) || shelfFull(shelf)) return;
		loadingRef.current.add(key);
		api.getItems({
			ParentId: libraryId,
			IncludeItemTypes: 'MusicAlbum',
			GenreIds: key,
			Recursive: true,
			SortBy: 'DateCreated,SortName',
			SortOrder: 'Descending',
			Fields: ALBUM_FIELDS,
			StartIndex: shelf ? shelf.items.length : 0,
			Limit: SHELF_PAGE
		})
			.then((res) => setShelves((prev) => {
				const items = (prev[key]?.items || []).concat(res?.Items || []);
				return {...prev, [key]: {items, total: res?.TotalRecordCount ?? items.length}};
			}))
			// A shelf that fails keeps what it has and stops asking.
			.catch(() => setShelves((prev) => {
				const items = prev[key]?.items || [];
				return {...prev, [key]: {items, total: items.length}};
			}))
			.then(() => loadingRef.current.delete(key));
	}, [api, libraryId]);

	const loadVisible = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const stride = ROW_STRIDE * rootScale();
		const first = Math.max(0, Math.floor(scroller.scrollTop / stride) - 1);
		const last = Math.ceil((scroller.scrollTop + scroller.clientHeight) / stride) + 1;
		sortedRef.current.slice(first, last).forEach((genre) => {
			if (!shelvesRef.current[genre.Id]) loadShelf(genre);
		});
	}, [loadShelf]);

	useEffect(loadVisible, [sorted, loadVisible]);

	const toggleSort = useCallback(() => setByAlbums((prev) => !prev), []);

	const handleShuffle = useCallback((e) => {
		const genre = sortedRef.current[parseInt(e.currentTarget.dataset.index, 10)];
		if (genre) playQuery(api, onPlay, {...mixQuery(EVERYTHING, libraryId), GenreIds: genre.Id});
	}, [api, onPlay, libraryId]);

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="genres"
				title={$L('Genres')}
				count={sorted.length > 0 ? countLabel(sorted.length, $L('1 genre'), $L('{count} genres')) : null}
			>
				{counted && (
					<SpottableDiv className={css.pill} onClick={toggleSort}>
						<CoreIcon name="sort" />{byAlbums ? $L('Most Albums') : $L('A to Z')}
					</SpottableDiv>
				)}
			</ScreenHeader>

			<div className={css.scroller} ref={scrollerRef} onScroll={loadVisible} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{genres && genres.length === 0 ? (
					<div className={css.empty}>{$L('No items found')}</div>
				) : (
					<div className={css.genreList}>
						{sorted.map((genre, index) => (
							<GenreRow
								key={genre.Id}
								genre={genre}
								index={index}
								shelf={shelves[genre.Id]}
								serverUrl={serverUrl}
								onSelectItem={onSelectItem}
								onShuffle={handleShuffle}
								onNearEnd={loadShelf}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default MusicGenresScreen;
