import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import DetailsTabBar from '../../components/DetailsTabBar';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {LETTERS} from '../../utils/gridChrome';
import {SONG_MIXES, countLabel, gridRows, jumpRow, letterOf, mixQuery, rowIndexOf} from './musicScreens';
import {
	CoreIcon, MusicCardGrid, ScreenHeader, contentKeyHandler, focusSoon, handleGridKey, indexFromId,
	playQuery, toPage, useCardSize, usePagedItems, useScreenBack, useScreenFocus
} from './MusicScreenParts';

import css from './MusicScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('artists');
// Coming in from the grid lands on the letter being browsed, and the rail holds focus at its ends.
const RailContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-current="true"]',
	leaveFor: {up: '', down: '', right: ''}
}, 'div');

const ID = 'music-artist';
const COLUMNS = 7;
// The grid's left inset plus the room it leaves the rail on the right, and the gap between faces.
const INSETS = 190;
const GAP = 30;
const FIELDS = 'PrimaryImageAspectRatio,SortName';
const HEADING_PAD = 12;
const [EVERYTHING] = SONG_MIXES;

const MODES = [
	{id: 'albumArtists', label: $L('Album Artists')},
	{id: 'artists', label: $L('All Artists')}
];

const railId = (letter) => `music-az-${letter === '#' ? 'hash' : letter}`;

const withAlbumCount = (artist) => (
	artist.AlbumCount > 0 ? {...artist, Subtitle: countLabel(artist.AlbumCount, $L('1 album'), $L('{count} albums'))} : artist
);

// Every artist in the library as round portraits under letter headings, with a rail to jump
// along the alphabet.
const MusicArtistsScreen = ({screen, library, api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [mode, setMode] = useState(screen.mode || 'albumArtists');
	const [descending, setDescending] = useState(false);
	const [focusLetter, setFocusLetter] = useState(null);
	const [pendingLetter, setPendingLetter] = useState(null);
	const scrollerRef = useRef(null);
	const lastIndexRef = useRef(0);
	const libraryId = library?.Id;

	const fetchPage = useCallback((start, limit) => {
		const load = mode === 'artists' ? api.getArtists : api.getAlbumArtists;
		return load({
			ParentId: libraryId,
			SortBy: 'SortName',
			SortOrder: descending ? 'Descending' : 'Ascending',
			Fields: FIELDS,
			StartIndex: start,
			Limit: limit
		}).then((res) => toPage(res, withAlbumCount));
	}, [api, libraryId, mode, descending]);

	const {items, total, loaded, complete, loadMore} = usePagedItems(fetchPage);
	const rows = useMemo(() => gridRows(items.length, COLUMNS, (i) => letterOf(items[i])), [items]);
	const {size} = useCardSize(COLUMNS, INSETS, GAP);
	const currentLetter = focusLetter || rows[0]?.section || null;

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('artists', loaded);

	useEffect(() => {
		setFocusLetter(null);
		lastIndexRef.current = 0;
	}, [fetchPage]);

	const toggleSort = useCallback(() => setDescending((prev) => !prev), []);
	const handleShuffleAll = useCallback(() => playQuery(api, onPlay, mixQuery(EVERYTHING, libraryId)), [api, onPlay, libraryId]);

	const focusIndex = useCallback((index) => Spotlight.focus(`${ID}-${index}`), []);

	const handleGridKeyDown = useCallback((e) => handleGridKey(e, {
		rows,
		index: indexFromId(e.target, ID),
		focusIndex,
		// Right off the end of a row goes to the rail, at the letter being browsed.
		onKey: (direction, row, index) => direction === 'right' && index === rows[row].end - 1 && Spotlight.focus(railId(rows[row].section))
	}), [rows, focusIndex]);

	const handleGridFocus = useCallback((e) => {
		const index = indexFromId(e.target, ID);
		if (index < 0) return;
		lastIndexRef.current = index;
		const row = rowIndexOf(rows, index);
		setFocusLetter(rows[row]?.section || null);
		if (row >= rows.length - 3) loadMore();
	}, [rows, loadMore]);

	const handleRailKey = useCallback((e) => {
		if (e.keyCode !== KEYS.LEFT) return;
		e.preventDefault();
		e.stopPropagation();
		focusIndex(lastIndexRef.current);
	}, [focusIndex]);

	const handleLetter = useCallback((e) => setPendingLetter(e.currentTarget.dataset.letter), []);

	// A letter pages the list in until it turns up, then brings its heading to the top and lands on
	// its first artist.
	useEffect(() => {
		if (!pendingLetter || !loaded) return;
		const row = jumpRow(rows, pendingLetter, descending, complete);
		if (row < 0 && !complete) {
			loadMore();
			return;
		}
		setPendingLetter(null);
		if (row < 0) return;
		const scroller = scrollerRef.current;
		const heading = scroller?.querySelector(`[data-heading-row="${row}"]`);
		if (heading) scroller.scrollTop = Math.max(0, heading.offsetTop - HEADING_PAD);
		focusSoon(`${ID}-${rows[row].start}`);
	}, [pendingLetter, rows, loaded, complete, descending, loadMore]);

	const empty = complete && items.length === 0;

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="artists"
				title={$L('Artists')}
				count={total > 0 ? countLabel(total, $L('1 artist'), $L('{count} artists')) : null}
			>
				<DetailsTabBar tabs={MODES} activeId={mode} expanded={false} onActivate={setMode} />
				<SpottableDiv className={css.pill} onClick={toggleSort}>
					<CoreIcon name="sort_by_alpha" />{descending ? $L('Z to A') : $L('A to Z')}
				</SpottableDiv>
				<SpottableDiv className={css.pill} onClick={handleShuffleAll}>
					<CoreIcon name="shuffle" />{$L('Shuffle All')}
				</SpottableDiv>
			</ScreenHeader>

			<div className={css.body}>
				<div className={css.scroller} ref={scrollerRef} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
					{empty ? (
						<div className={css.empty}>{$L('No items found')}</div>
					) : (
						<div className={`${css.grid} ${css.gridBesideRail}`} onKeyDown={handleGridKeyDown} onFocus={handleGridFocus}>
							<MusicCardGrid
								items={items}
								rows={rows}
								idPrefix={ID}
								cardType="circle"
								size={size}
								serverUrl={serverUrl}
								onSelect={onSelectItem}
							/>
						</div>
					)}
				</div>

				{items.length > 0 && (
					<RailContainer className={css.rail} spotlightId="music-az-rail" onKeyDown={handleRailKey} aria-label={$L('Jump to letter')}>
						{LETTERS.map((letter) => (
							<SpottableDiv
								key={letter}
								className={letter === currentLetter ? `${css.railLetter} ${css.railCurrent}` : css.railLetter}
								data-letter={letter}
								data-current={letter === currentLetter}
								spotlightId={railId(letter)}
								onClick={handleLetter}
							>
								{letter}
							</SpottableDiv>
						))}
					</RailContainer>
				)}
			</div>
		</div>
	);
};

export default MusicArtistsScreen;
