import {useCallback, useMemo, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {HomeIcon, SearchIcon} from '../../components/icons/navIcons';
import {useSettings} from '../../context/SettingsContext';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rem, rootScale} from '../../utils/rootScale';
import MusicBrowseSkeleton from './MusicBrowseSkeleton';
import MusicFilterPanel from './MusicFilterPanel';
import {MusicSection, MusicShelf, shelfSeeAllId} from './MusicSection';
import MusicTrackList from './MusicTrackList';
import useMusicBrowseRows from './useMusicBrowseRows';
import useMusicBrowseFocus from './useMusicBrowseFocus';
import useMusicFilterPanel from './useMusicFilterPanel';
import {clampMusicNode, rowNode, MUSIC_FOCUS_IDS, HEADER} from './musicFocus';
import {MUSIC_CATEGORIES, SEE_ALL_TARGET, handleSectionKey, musicArtUrl, playSongFromAlbum, quickItems, songSubtitle} from './musicLibrary';

import classicCss from './MusicBrowse.module.less';
import css from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
const HeaderContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
// Up, down and left stop at the rail's ends, and right goes back into the content by hand.
const RailContainer = SpotlightContainerDecorator({enterTo: 'last-focused', leaveFor: {up: '', down: '', left: ''}}, 'div');

const QUICK = 'quick';
const LAST_PLAYED = 'lastPlayed';

// Playlists live in the rail and the grid here, so they get no row.
const SHELF_IDS = ['latestMusic', 'albumArtists', 'favorites', 'artists', 'albums'];

// The rail's width, the content's side insets and the tiles' gap from the stylesheet.
const RAIL_WIDTH = 248;
const INSET = 32;
const QUICK_GAP = 10;

const IconFilter = () => (
	<svg viewBox="0 -960 960 960"><path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Z" /></svg>
);
const IconOverview = () => (
	<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>
);
export const IconCategory = ({d}) => (
	<svg viewBox="0 -960 960 960"><path d={d} /></svg>
);

// The Quick Access music library: a rail of categories and playlists down the left, and the
// albums and playlists played last as a grid to jump straight back into, over the rows.
const QuickAccessMusic = ({library, api, serverUrl, onSelectItem, onOpenGrid, onPlay, onSearch, onHome, backHandlerRef}) => {
	const {settings, updateSetting} = useSettings();
	const initialFocusRef = useRef(false);
	const {rows, isLoading} = useMusicBrowseRows({api, library, settings});

	const rowOf = (id) => rows.find((r) => r.id === id);
	const lastPlayed = rowOf('lastPlayed');
	const playlistRow = rowOf('playlists');
	const playlists = useMemo(() => playlistRow?.items || [], [playlistRow]);
	const shelves = SHELF_IDS.map(rowOf).filter(Boolean);
	// Last Played sits under Latest, or first when Latest is hidden.
	const lastPlayedAt = shelves[0]?.id === 'latestMusic' ? 1 : 0;
	const quick = useMemo(() => quickItems(lastPlayed?.items, playlists), [lastPlayed, playlists]);

	const hasQuick = quick.length > 0;
	const hasLastPlayed = Boolean(lastPlayed);
	const shelfCount = shelves.length;
	const chain = useMemo(() => {
		const rowNodes = Array.from({length: shelfCount}, (_, i) => rowNode(i));
		return [
			HEADER,
			...(hasQuick ? [QUICK] : []),
			...rowNodes.slice(0, lastPlayedAt),
			...(hasLastPlayed ? [LAST_PLAYED] : []),
			...rowNodes.slice(lastPlayedAt)
		];
	}, [hasQuick, hasLastPlayed, shelfCount, lastPlayedAt]);

	const {scrollerRef, chainRef, lastNodeRef, registerRowRef, registerNode, focusNode} = useMusicBrowseFocus(chain);

	// Back on the button that opened the panel.
	const focusFilterButton = useCallback(() => {
		lastNodeRef.current = HEADER;
		Spotlight.focus(MUSIC_FOCUS_IDS.filter);
	}, [lastNodeRef]);
	const {showFilter, openFilter, closeFilter} = useMusicFilterPanel(backHandlerRef, focusFilterButton);

	const focusRail = useCallback(() => Spotlight.focus(MUSIC_FOCUS_IDS.railOverview), []);
	// Onto the first stop under the header, like the rail's Overview.
	const focusContent = useCallback(() => {
		const current = chainRef.current;
		focusNode(current[1] || current[0]);
	}, [chainRef, focusNode]);

	const sectionKey = useCallback((node, extra) => (e) => (
		handleSectionKey(e, {node, chain: chainRef.current, focusNode, onLeft: focusRail, ...extra})
	), [chainRef, focusNode, focusRail]);
	// Up from a row with a See All stops there first, and Down from it goes back into the row.
	const seeAllKeys = useCallback((node, seeAllId) => ({
		onKeyDown: sectionKey(node, {onUp: () => Spotlight.focus(seeAllId)}),
		onSeeAllKeyDown: sectionKey(node, {onLeft: null, onDown: () => focusNode(node)})
	}), [sectionKey, focusNode]);
	const handleHeaderKey = useMemo(() => sectionKey(HEADER), [sectionKey]);
	const handleQuickKey = useMemo(() => sectionKey(QUICK), [sectionKey]);
	const handleLastPlayedKey = useMemo(() => sectionKey(LAST_PLAYED), [sectionKey]);

	const handleRailKey = useCallback((e) => {
		if (e.keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		focusContent();
	}, [focusContent]);

	// The grid scrolls the page to the top, so the header over it stays in view.
	const registerHeader = useCallback((el) => {
		registerNode(HEADER, el);
		registerNode(QUICK, el);
	}, [registerNode]);
	const registerLastPlayed = useCallback((el) => registerNode(LAST_PLAYED, el), [registerNode]);

	const playContext = useMemo(() => ({api, onPlay, onSelectItem}), [api, onPlay, onSelectItem]);
	const playSong = useCallback((track) => playSongFromAlbum(playContext, track), [playContext]);
	const songArt = useCallback((track) => musicArtUrl(track, serverUrl, 120), [serverUrl]);

	const handleQuick = useCallback((e) => {
		const item = quick[parseInt(e.currentTarget.dataset.index, 10)];
		if (!item) return;
		if (item.Type === 'Audio') playSong(item);
		else onSelectItem?.(item);
	}, [quick, playSong, onSelectItem]);

	const handleCategory = useCallback((e) => onOpenGrid(e.currentTarget.dataset.category), [onOpenGrid]);

	const handlePlaylist = useCallback((e) => {
		const playlist = playlists[parseInt(e.currentTarget.dataset.index, 10)];
		if (playlist) onSelectItem?.(playlist);
	}, [playlists, onSelectItem]);

	// First focus once there is something to focus, then a backstop for reloads
	// that pull the focused section out from under us.
	useEffect(() => {
		if (isLoading || showFilter) return;
		if (!initialFocusRef.current) {
			initialFocusRef.current = true;
			focusNode(chain[1] || chain[0]);
			return;
		}
		const active = document.activeElement;
		if (active && active !== document.body && active.classList?.contains('spottable')) return;
		focusNode(clampMusicNode(chain, lastNodeRef.current || chain[0]));
	}, [isLoading, showFilter, rows, chain, focusNode, lastNodeRef]);

	const gridWidth = window.innerWidth / rootScale() - RAIL_WIDTH - INSET * 2;
	const quickColumns = Math.min(4, Math.max(2, Math.floor(gridWidth / 240)));
	const quickWidth = rem((gridWidth - QUICK_GAP * (quickColumns - 1)) / quickColumns);

	const renderShelf = (row, index) => {
		const seeAllTarget = SEE_ALL_TARGET[row.id];
		return (
			<MusicShelf
				key={row.id}
				row={row}
				rowIndex={index}
				serverUrl={serverUrl}
				onSelectItem={onSelectItem}
				registerRowRef={registerRowRef}
				seeAllTarget={seeAllTarget}
				onOpenGrid={onOpenGrid}
				{...(seeAllTarget ? seeAllKeys(rowNode(index), shelfSeeAllId(row.id)) : {onKeyDown: sectionKey(rowNode(index))})}
			/>
		);
	};

	return (
		<div className={classicCss.page}>
			<div className={css.quickBody}>
				<RailContainer className={css.rail} spotlightId="music-rail" onKeyDown={handleRailKey} onFocus={keepFocusInView}>
					<div className={css.railHeader}>
						<SpottableDiv className={css.headerBtn} spotlightId={MUSIC_FOCUS_IDS.home} onClick={onHome} aria-label={$L('Home')}>
							<HomeIcon />
						</SpottableDiv>
						<div className={css.libraryName}>{library?.Name || $L('Music')}</div>
					</div>
					<SpottableDiv className={css.railItem} onClick={onSearch}>
						<SearchIcon /><span>{$L('Search Music')}</span>
					</SpottableDiv>
					<SpottableDiv className={`${css.railItem} ${css.railSelected}`} spotlightId={MUSIC_FOCUS_IDS.railOverview} onClick={focusContent}>
						<IconOverview /><span>{$L('Overview')}</span>
					</SpottableDiv>
					{MUSIC_CATEGORIES.map((category) => (
						<SpottableDiv key={category.id} className={css.railItem} data-category={category.id} onClick={handleCategory}>
							<IconCategory d={category.icon} /><span>{category.label}</span>
						</SpottableDiv>
					))}
					{playlists.length > 0 && <div className={css.railLabel}>{$L('PLAYLISTS')}</div>}
					{playlists.map((playlist, index) => {
						const art = musicArtUrl(playlist, serverUrl, 120);
						return (
							<SpottableDiv key={playlist.Id} className={`${css.railItem} ${css.railPlaylist}`} data-index={index} onClick={handlePlaylist}>
								{art ? <img src={art} alt="" loading="lazy" /> : <div className={css.railArt} />}
								<span>{playlist.Name}</span>
							</SpottableDiv>
						);
					})}
				</RailContainer>

				<div className={`${classicCss.scroller} ${css.quickContent}`} ref={scrollerRef}>
					<HeaderContainer
						className={css.quickHeader}
						ref={registerHeader}
						spotlightId={MUSIC_FOCUS_IDS[HEADER]}
						onKeyDown={handleHeaderKey}
					>
						<div className={css.quickTitle}>{hasQuick ? $L('Jump Back In') : (library?.Name || $L('Music'))}</div>
						<SpottableDiv className={css.filterPill} spotlightId={MUSIC_FOCUS_IDS.filter} onClick={openFilter}>
							<IconFilter />{$L('Sort & Filter')}
						</SpottableDiv>
					</HeaderContainer>

					{isLoading ? (
						<MusicBrowseSkeleton />
					) : rows.length === 0 ? (
						<div className={classicCss.empty}>{$L('No music items found')}</div>
					) : (
						<>
							{hasQuick && (
								<div className={css.quickGrid} onKeyDown={handleQuickKey}>
									{quick.map((item, index) => {
										const art = musicArtUrl(item, serverUrl, 160);
										return (
											<SpottableDiv
												key={`${item.Type}-${item.Id}`}
												className={css.quickTile}
												style={{width: quickWidth}}
												data-index={index}
												spotlightId={index === 0 ? MUSIC_FOCUS_IDS[QUICK] : undefined}
												onClick={handleQuick}
											>
												{art ? <img src={art} alt="" /> : <div className={css.quickArt} />}
												<span>{item.Name}</span>
											</SpottableDiv>
										);
									})}
								</div>
							)}

							{shelves.slice(0, lastPlayedAt).map(renderShelf)}

							{lastPlayed && (
								<MusicSection title={$L('Last Played')} sectionRef={registerLastPlayed} onKeyDown={handleLastPlayedKey}>
									<MusicTrackList
										tracks={lastPlayed.items.slice(0, 6)}
										artFor={songArt}
										subtitleFor={songSubtitle}
										firstSpotlightId={MUSIC_FOCUS_IDS[LAST_PLAYED]}
										onPlay={playSong}
									/>
								</MusicSection>
							)}

							{shelves.slice(lastPlayedAt).map((row, i) => renderShelf(row, i + lastPlayedAt))}
						</>
					)}
				</div>
			</div>

			{showFilter && (
				<MusicFilterPanel
					settings={settings}
					onUpdateSetting={updateSetting}
					onClose={closeFilter}
				/>
			)}
		</div>
	);
};

export default QuickAccessMusic;
