import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import DetailsTabBar from '../../components/DetailsTabBar';
import {keepFocusInView} from '../../utils/focusScroll';
import MusicTrackList from './MusicTrackList';
import {musicArtUrl, songSubtitle} from './musicLibrary';
import {FAVORITE_TABS, PAGE_SIZE, gridRows, rowIndexOf, startingTab} from './musicScreens';
import {
	CoreIcon, MusicCardGrid, ScreenHeader, contentKeyHandler, fetchAudioPlaylists, handleGridKey, indexFromId,
	playQuery, playTracks, toPage, useCardSize, usePagedItems, useScreenBack, useScreenFocus
} from './MusicScreenParts';

import css from './MusicScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('favorites');

const ID = 'music-favorite';
const GAP = 30;
const INSETS = 120;
// How each tab lays out: songs two to a row, the rest as covers or portraits.
const LAYOUT = {
	songs: {columns: 2},
	albums: {columns: 6, cardType: 'square'},
	artists: {columns: 7, cardType: 'circle'},
	playlists: {columns: 6, cardType: 'square'}
};

const fetchFor = (tab, api, libraryId) => {
	const base = {ParentId: libraryId, Recursive: true, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending'};
	const page = (load) => (start, limit) => load(start, limit).then((res) => toPage(res));
	switch (tab) {
		case 'songs': return page((start, limit) => api.getItems({...base, IncludeItemTypes: 'Audio', StartIndex: start, Limit: limit}));
		case 'albums': return page((start, limit) => api.getItems({...base, IncludeItemTypes: 'MusicAlbum', Fields: 'PrimaryImageAspectRatio,ProductionYear,AlbumArtist', StartIndex: start, Limit: limit}));
		case 'artists': return page((start, limit) => api.getArtists({ParentId: libraryId, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName', StartIndex: start, Limit: limit}));
		case 'playlists': return fetchAudioPlaylists(api, {IsFavorite: true});
		default: return null;
	}
};

// The library's favorites in a tab per type, each tab hidden while it has nothing in it.
const MusicFavoritesScreen = ({screen, library, api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [counts, setCounts] = useState(null);
	const [tab, setTab] = useState(null);
	const libraryId = library?.Id;

	// Every count at once. Playlists are counted from their first page, since which of them are
	// audio only shows once they're opened.
	useEffect(() => {
		let cancelled = false;
		const total = (res) => res?.TotalRecordCount || 0;
		const counting = {ParentId: libraryId, Recursive: true, IsFavorite: true, Limit: 0};
		Promise.all([
			api.getItems({...counting, IncludeItemTypes: 'Audio'}).catch(() => null),
			api.getItems({...counting, IncludeItemTypes: 'MusicAlbum'}).catch(() => null),
			api.getArtists({ParentId: libraryId, IsFavorite: true, Limit: 0}).catch(() => null),
			fetchAudioPlaylists(api, {IsFavorite: true})(0, PAGE_SIZE).catch(() => null)
		]).then(([songs, albums, artists, playlists]) => {
			if (cancelled) return;
			const next = {
				songs: total(songs),
				albums: total(albums),
				artists: total(artists),
				playlists: !playlists ? 0 : playlists.total <= PAGE_SIZE ? playlists.items.length : playlists.total
			};
			setCounts(next);
			setTab(startingTab(next, screen.tab));
		});
		return () => { cancelled = true; };
	}, [api, libraryId, screen.tab]);

	const fetchPage = useMemo(() => fetchFor(tab, api, libraryId), [tab, api, libraryId]);
	const {items, loaded, loadMore} = usePagedItems(fetchPage);
	const layout = LAYOUT[tab] || LAYOUT.albums;
	const rows = useMemo(() => gridRows(items.length, layout.columns), [items.length, layout.columns]);
	const {size} = useCardSize(layout.columns, INSETS, GAP);

	useScreenBack(backHandlerRef, onBack);
	const empty = Boolean(counts) && !tab;
	useScreenFocus('favorites', loaded || empty);

	const tabs = useMemo(() => (counts ? FAVORITE_TABS
		.filter((option) => counts[option.id] > 0)
		.map((option) => ({id: option.id, label: `${option.label} ${counts[option.id]}`})) : []), [counts]);

	const base = useMemo(() => ({ParentId: libraryId, IncludeItemTypes: 'Audio', IsFavorite: true, Recursive: true, Limit: 300}), [libraryId]);
	const handlePlayAll = useCallback(() => playQuery(api, onPlay, {...base, SortBy: 'SortName'}), [api, onPlay, base]);
	const handleShuffle = useCallback(() => playQuery(api, onPlay, {...base, SortBy: 'Random'}), [api, onPlay, base]);
	const handleSong = useCallback((song) => playTracks(onPlay, items, items.indexOf(song)), [onPlay, items]);
	const songArt = useCallback((song) => musicArtUrl(song, serverUrl, 120), [serverUrl]);

	const focusIndex = useCallback((index) => Spotlight.focus(`${ID}-${index}`), []);
	const handleKeyDown = useCallback((e) => handleGridKey(e, {rows, index: indexFromId(e.target, ID), focusIndex}), [rows, focusIndex]);
	const handleFocus = useCallback((e) => {
		const index = indexFromId(e.target, ID);
		if (index >= 0 && rowIndexOf(rows, index) >= rows.length - 3) loadMore();
	}, [rows, loadMore]);

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="favorites"
				title={$L('Favorites')}
				titleExtra={tabs.length > 0 ? (
					<DetailsTabBar tabs={tabs} activeId={tab} expanded={false} onActivate={setTab} />
				) : null}
			>
				{tab === 'songs' && (
					<>
						<SpottableDiv className={`${css.pill} ${css.pillPrimary}`} onClick={handlePlayAll}>
							<CoreIcon name="play_arrow" />{$L('Play')}
						</SpottableDiv>
						<SpottableDiv className={css.pill} onClick={handleShuffle}>
							<CoreIcon name="shuffle" />{$L('Shuffle')}
						</SpottableDiv>
					</>
				)}
			</ScreenHeader>

			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{empty ? (
					<div className={css.empty}>{$L('No items found')}</div>
				) : (
					<div className={css.favoritesContent} onKeyDown={handleKeyDown} onFocus={handleFocus}>
						{tab === 'songs' ? (
							<MusicTrackList
								tracks={items}
								artFor={songArt}
								subtitleFor={songSubtitle}
								idPrefix={ID}
								className={css.twoColumns}
								onPlay={handleSong}
							/>
						) : (
							<MusicCardGrid
								items={items}
								rows={rows}
								idPrefix={ID}
								cardType={layout.cardType}
								size={size}
								serverUrl={serverUrl}
								onSelect={onSelectItem}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default MusicFavoritesScreen;
