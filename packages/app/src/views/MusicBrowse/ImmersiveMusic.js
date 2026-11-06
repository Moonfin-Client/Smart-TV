import {useState, useCallback, useMemo, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaCard from '../../components/MediaCard';
import {FavoritesIcon, HomeIcon, SearchIcon, ShuffleIcon} from '../../components/icons/navIcons';
import {useSettings} from '../../context/SettingsContext';
import {rem, rootScale} from '../../utils/rootScale';
import {scrimStyle} from '../../utils/scrimImage';
import {serverBlurredUrl} from '../../utils/serverBlur';
import MusicBrowseSkeleton from './MusicBrowseSkeleton';
import MusicFilterPanel from './MusicFilterPanel';
import {MusicSection, MusicShelf, shelfSeeAllId} from './MusicSection';
import MusicTabs from './MusicTabs';
import MusicTrackList from './MusicTrackList';
import useMusicBrowseRows from './useMusicBrowseRows';
import useMusicBrowseFocus from './useMusicBrowseFocus';
import useMusicFilterPanel from './useMusicFilterPanel';
import {clampMusicNode, rowNode, MUSIC_FOCUS_IDS} from './musicFocus';
import {SEE_ALL_TARGET, handleSectionKey, musicArtUrl, playSongFromAlbum, songSubtitle, subtitleFor} from './musicLibrary';

import classicCss from './MusicBrowse.module.less';
import css from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
const HeaderContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

// The chain's stops, named after the ids they land on.
const TABS = 'tabs';
const PLAY = 'play';
const LATEST = 'latest';
const LAST_PLAYED = 'lastPlayed';
const GENRES = 'genres';
const FIRST_ALBUM_TRACK = 'music-album-track-0';
const GENRES_SEE_ALL = 'music-see-all-genres';

const SHELF_IDS = ['albumArtists', 'favorites', 'playlists', 'artists', 'albums'];

// Dark enough for white labels.
const GENRE_COLORS = ['#7A2E22', '#3B2D5C', '#6B2F4A', '#4D3B72', '#B4472F', '#1F3A5F', '#8A5A1E', '#14505C'];

// Matched to .backdropScrim in the stylesheet.
const TOP_FADE = [{to: 'bottom', rgb: '10, 10, 10', stops: [[0, 0.35], [0.65, 0.7], [1, 1]]}];

// The page's side insets and the grids' gaps from the stylesheet, which the column counts work from.
const INSET = 48;
const LATEST_GAP = 20;
const GENRE_GAP = 16;
// The album's songs only fit beside the hero with this much room inside the insets.
const TRACKS_ROOM = 1000;

const IconFilter = () => (
	<svg viewBox="0 -960 960 960"><path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Z" /></svg>
);
const IconPlay = () => (
	<svg viewBox="0 -960 960 960"><path d="M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z" /></svg>
);
const IconHeartOutline = () => (
	<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" /></svg>
);

const trackCountLabel = (count) => (count === 1 ? $L('1 track') : $L('{count} tracks').replace('{count}', String(count)));

// How many of a grid's cells fit across `available` at `step` apiece, within `min` and `max`.
const columnsFor = (available, gap, step, min, max) => Math.min(max, Math.max(min, Math.floor((available + gap) / step)));

// The Immersive music library: the album being listened to on a hero over its own blurred art,
// with Play, Shuffle and Favorite and its songs beside it, then the newest albums, what played
// last, the genres and the rows.
const ImmersiveMusic = ({library, api, serverUrl, onSelectItem, onOpenGrid, onPlay, onSearch, onHome, backHandlerRef, settingsPreview}) => {
	const {settings, updateSetting} = useSettings();
	const initialFocusRef = useRef(false);
	const {rows, isLoading, featured} = useMusicBrowseRows({api, library, settings});
	const [album, setAlbum] = useState(null);
	const [albumTracks, setAlbumTracks] = useState([]);
	const [genres, setGenres] = useState([]);

	const rowOf = (id) => rows.find((r) => r.id === id);
	const latest = rowOf('latestMusic');
	const lastPlayed = rowOf('lastPlayed');
	const shelves = SHELF_IDS.map(rowOf).filter(Boolean);

	const libraryId = library?.Id;
	const featuredId = featured?.Id;
	const albumId = featured?.Type === 'MusicAlbum' ? featured.Id : featured?.AlbumId;

	useEffect(() => {
		setAlbum(null);
		setAlbumTracks([]);
		if (!albumId) return undefined;
		let cancelled = false;
		Promise.all([api.getItem(albumId), api.getAlbumTracks(albumId)])
			.then(([item, tracks]) => {
				if (cancelled) return;
				setAlbum(item);
				setAlbumTracks(tracks?.Items || []);
			})
			.catch(() => {});
		return () => { cancelled = true; };
	}, [api, albumId]);

	useEffect(() => {
		if (!libraryId) return undefined;
		let cancelled = false;
		api.getMusicGenres({ParentId: libraryId, Limit: 8})
			.then((res) => { if (!cancelled) setGenres(res?.Items || []); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [api, libraryId]);

	const available = window.innerWidth / rootScale() - INSET * 2;
	const shownTracks = useMemo(() => (available >= TRACKS_ROOM ? albumTracks.slice(0, 6) : []), [available, albumTracks]);

	const hasHero = Boolean(featured);
	const hasLatest = Boolean(latest);
	const hasLastPlayed = Boolean(lastPlayed);
	const hasGenres = genres.length > 0;
	const shelfCount = shelves.length;
	const chain = useMemo(() => [
		TABS,
		...(hasHero ? [PLAY] : []),
		...(hasLatest ? [LATEST] : []),
		...(hasLastPlayed ? [LAST_PLAYED] : []),
		...(hasGenres ? [GENRES] : []),
		...Array.from({length: shelfCount}, (_, i) => rowNode(i))
	], [hasHero, hasLatest, hasLastPlayed, hasGenres, shelfCount]);

	const {scrollerRef, chainRef, lastNodeRef, registerRowRef, registerNode, focusNode} = useMusicBrowseFocus(chain);

	// Back on the button that opened the panel, with Up from the content still reaching the tabs.
	const focusFilterButton = useCallback(() => {
		lastNodeRef.current = TABS;
		Spotlight.focus(MUSIC_FOCUS_IDS.filter);
	}, [lastNodeRef]);
	const {showFilter, openFilter, closeFilter} = useMusicFilterPanel(backHandlerRef, focusFilterButton);

	const sectionKey = useCallback((node, extra) => (e) => (
		handleSectionKey(e, {node, chain: chainRef.current, focusNode, ...extra})
	), [chainRef, focusNode]);
	// Up from a section with a See All stops there first, and Down from it goes back into the section.
	const seeAllKeys = useCallback((node, seeAllId) => ({
		onKeyDown: sectionKey(node, {onUp: () => Spotlight.focus(seeAllId)}),
		onSeeAllKeyDown: sectionKey(node, {onDown: () => focusNode(node)})
	}), [sectionKey, focusNode]);

	const focusHeroButton = useCallback(() => Spotlight.focus(album ? 'music-favorite' : 'music-shuffle'), [album]);
	const handleHeaderKey = useMemo(() => sectionKey(TABS), [sectionKey]);
	const handleButtonsKey = useMemo(() => sectionKey(PLAY), [sectionKey]);
	const handleTracksKey = useMemo(() => sectionKey(PLAY, {onLeft: focusHeroButton}), [sectionKey, focusHeroButton]);
	const handleLatestKey = useMemo(() => sectionKey(LATEST), [sectionKey]);
	const handleLastPlayedKey = useMemo(() => sectionKey(LAST_PLAYED), [sectionKey]);
	const genreKeys = useMemo(() => seeAllKeys(GENRES, GENRES_SEE_ALL), [seeAllKeys]);

	const registerTop = useCallback((el) => {
		registerNode(TABS, el);
		registerNode(PLAY, el);
	}, [registerNode]);
	const registerLatest = useCallback((el) => registerNode(LATEST, el), [registerNode]);
	const registerLastPlayed = useCallback((el) => registerNode(LAST_PLAYED, el), [registerNode]);
	const registerGenres = useCallback((el) => registerNode(GENRES, el), [registerNode]);

	const playContext = useMemo(() => ({api, onPlay, onSelectItem}), [api, onPlay, onSelectItem]);

	const handlePlay = useCallback(() => {
		if (!featured) return;
		if (featured.Type === 'Audio') playSongFromAlbum(playContext, featured, albumTracks);
		else if (albumTracks.length > 0) onPlay?.(albumTracks[0], false, {audioPlaylist: albumTracks});
		else onSelectItem?.(featured);
	}, [featured, albumTracks, playContext, onPlay, onSelectItem]);

	const handleShuffle = useCallback(async () => {
		const parentId = albumId || featuredId;
		if (!parentId) return;
		const res = await api.getItems({
			ParentId: parentId,
			IncludeItemTypes: 'Audio',
			Recursive: true,
			SortBy: 'Random',
			Limit: 300,
			Fields: 'MediaSources,MediaStreams'
		}).catch(() => null);
		const tracks = res?.Items || [];
		if (tracks.length > 0) onPlay?.(tracks[0], false, {audioPlaylist: tracks});
	}, [api, albumId, featuredId, onPlay]);

	const isFavorite = Boolean(album?.UserData?.IsFavorite);
	const handleFavorite = useCallback(async () => {
		if (!album) return;
		try {
			await api.setFavorite(album.Id, !isFavorite);
			setAlbum((prev) => (prev?.Id === album.Id ? {...prev, UserData: {...prev.UserData, IsFavorite: !isFavorite}} : prev));
		} catch {
			// The heart keeps showing what the server still has.
		}
	}, [api, album, isFavorite]);

	const handleOpenAlbum = useCallback(() => {
		if (album) onSelectItem?.(album);
		else if (featured) onSelectItem?.(featured);
	}, [album, featured, onSelectItem]);

	// Right off the last button reaches the album's songs listed beside it.
	const handleRightToTracks = useCallback((e) => {
		if (shownTracks.length === 0) return;
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(FIRST_ALBUM_TRACK);
	}, [shownTracks.length]);

	const playAlbumTrack = useCallback((track) => onPlay?.(track, false, {audioPlaylist: albumTracks}), [onPlay, albumTracks]);
	const playSong = useCallback((track) => playSongFromAlbum(playContext, track), [playContext]);
	const songArt = useCallback((track) => musicArtUrl(track, serverUrl, 120), [serverUrl]);

	const handleGenresSeeAll = useCallback(() => onOpenGrid('genres'), [onOpenGrid]);
	const handleGenre = useCallback((e) => {
		const name = e.currentTarget.dataset.genre;
		if (name) onOpenGrid('albums', name);
	}, [onOpenGrid]);

	// First focus once there is something to focus, then a backstop for reloads
	// that pull the focused section out from under us.
	useEffect(() => {
		if (settingsPreview || isLoading || showFilter) return;
		if (!initialFocusRef.current) {
			initialFocusRef.current = true;
			focusNode(chain[1] || chain[0]);
			return;
		}
		const active = document.activeElement;
		if (active && active !== document.body && active.classList?.contains('spottable')) return;
		focusNode(clampMusicNode(chain, lastNodeRef.current || chain[0]));
	}, [isLoading, showFilter, rows, chain, focusNode, lastNodeRef, settingsPreview]);

	const latestColumns = columnsFor(available, LATEST_GAP, 200, 3, 8);
	const latestCard = useMemo(() => {
		const side = Math.floor((available - LATEST_GAP * (latestColumns - 1)) / latestColumns);
		return {width: side, height: side};
	}, [available, latestColumns]);
	const latestItems = latest ? latest.items.slice(0, latestColumns * 2) : [];
	const genreColumns = columnsFor(available, GENRE_GAP, 166, 2, 8);
	const genreWidth = rem((available - GENRE_GAP * (genreColumns - 1)) / genreColumns);

	const heroItem = album || featured;
	const artUrl = musicArtUrl(heroItem, serverUrl, 600);
	const backdropUrl = artUrl && !settings.hideBackdropsInLibraries
		? serverBlurredUrl(artUrl, 40) : null;
	const heroTitle = album?.Name || (featured?.Type === 'Audio' ? featured.Album || featured.Name : featured?.Name);
	const heroMeta = [
		subtitleFor(heroItem),
		heroItem?.ProductionYear ? String(heroItem.ProductionYear) : '',
		albumTracks.length > 0 ? trackCountLabel(albumTracks.length) : ''
	].filter(Boolean).join(' · ');

	return (
		<div className={classicCss.page}>
			<div className={classicCss.scroller} ref={scrollerRef}>
				<div className={css.top} ref={registerTop}>
					{backdropUrl && !isLoading && (
						<>
							<div className={css.backdrop} style={{backgroundImage: `url(${backdropUrl})`}} />
							<div className={css.backdropScrim} style={scrimStyle(TOP_FADE)} />
						</>
					)}
					<HeaderContainer className={css.header} spotlightId={settingsPreview ? undefined : MUSIC_FOCUS_IDS.header} onKeyDown={handleHeaderKey}>
						<SpottableDiv className={css.headerBtn} spotlightId={MUSIC_FOCUS_IDS.home} onClick={onHome} aria-label={$L('Home')}>
							<HomeIcon />
						</SpottableDiv>
						<div className={css.libraryName}>{library?.Name || $L('Music')}</div>
						<MusicTabs onOpenGrid={onOpenGrid} spotlightId={settingsPreview ? 'music-preview-tabs' : undefined} />
						<div className={css.headerActions}>
							<SpottableDiv className={css.headerBtn} spotlightId="music-search-btn" onClick={onSearch} aria-label={$L('Search Music')}>
								<SearchIcon />
							</SpottableDiv>
							<SpottableDiv className={css.headerBtn} spotlightId={MUSIC_FOCUS_IDS.filter} onClick={openFilter} aria-label={$L('Sort & Filter')}>
								<IconFilter />
							</SpottableDiv>
						</div>
					</HeaderContainer>

					{!isLoading && featured && (
						<div className={css.hero}>
							<div className={css.heroArt} onClick={handleOpenAlbum}>
								{artUrl && <img src={artUrl} alt="" />}
							</div>
							<div className={css.heroInfo}>
								<div className={css.eyebrow}>{lastPlayed ? $L('JUMP BACK IN') : $L('RECENTLY ADDED')}</div>
								<div className={css.heroTitle}>{heroTitle}</div>
								{heroMeta && <div className={css.heroMeta}>{heroMeta}</div>}
								<div className={css.heroButtons} onKeyDown={handleButtonsKey}>
									<SpottableDiv className={`${css.heroBtn} ${css.primaryBtn}`} spotlightId={MUSIC_FOCUS_IDS[PLAY]} onClick={handlePlay}>
										<IconPlay />{$L('Play')}
									</SpottableDiv>
									<SpottableDiv className={css.heroBtn} spotlightId="music-shuffle" onClick={handleShuffle} onSpotlightRight={album ? undefined : handleRightToTracks}>
										<ShuffleIcon />{$L('Shuffle')}
									</SpottableDiv>
									{album && (
										<SpottableDiv
											className={`${css.heroBtn} ${css.roundBtn}${isFavorite ? ' ' + css.favoriteOn : ''}`}
											spotlightId="music-favorite"
											onClick={handleFavorite}
											onSpotlightRight={handleRightToTracks}
											aria-label={isFavorite ? $L('Favorited') : $L('Favorite')}
										>
											{isFavorite ? <FavoritesIcon /> : <IconHeartOutline />}
										</SpottableDiv>
									)}
								</div>
							</div>
							{shownTracks.length > 0 && (
								<div className={css.albumTracks} onKeyDown={handleTracksKey}>
									<div className={css.panelLabel}>{$L('FROM THIS ALBUM')}</div>
									<MusicTrackList
										tracks={shownTracks}
										numbered
										activeId={featuredId}
										firstSpotlightId={FIRST_ALBUM_TRACK}
										onPlay={playAlbumTrack}
									/>
								</div>
							)}
						</div>
					)}
				</div>

				{isLoading ? (
					<MusicBrowseSkeleton />
				) : rows.length === 0 ? (
					<div className={classicCss.empty}>{$L('No music items found')}</div>
				) : (
					<>
						{latest && (
							<MusicSection title={latest.title} sectionRef={registerLatest} bodyClassName={css.grid} onKeyDown={handleLatestKey}>
								{latestItems.map((item, index) => (
									<MediaCard
										key={item.Id}
										item={item}
										serverUrl={serverUrl}
										cardType="square"
										onSelect={onSelectItem}
										eagerLoad
										spotlightId={index === 0 ? MUSIC_FOCUS_IDS[LATEST] : `music-latest-${item.Id}`}
										size={latestCard}
									/>
								))}
							</MusicSection>
						)}

						{lastPlayed && (
							<MusicSection title={$L('Last Played')} sectionRef={registerLastPlayed} onKeyDown={handleLastPlayedKey}>
								<MusicTrackList
									tracks={lastPlayed.items.slice(0, 5)}
									artFor={songArt}
									subtitleFor={songSubtitle}
									firstSpotlightId={MUSIC_FOCUS_IDS[LAST_PLAYED]}
									onPlay={playSong}
								/>
							</MusicSection>
						)}

						{hasGenres && (
							<MusicSection
								title={$L('Browse By Genre')}
								sectionRef={registerGenres}
								bodyClassName={css.genres}
								seeAllId={GENRES_SEE_ALL}
								onSeeAll={handleGenresSeeAll}
								{...genreKeys}
							>
								{genres.slice(0, genreColumns).map((genre, index) => (
									<SpottableDiv
										key={genre.Id}
										className={css.genreTile}
										style={{width: genreWidth, background: GENRE_COLORS[index % GENRE_COLORS.length]}}
										data-genre={genre.Name}
										spotlightId={index === 0 ? MUSIC_FOCUS_IDS[GENRES] : undefined}
										onClick={handleGenre}
									>
										<span>{genre.Name}</span>
									</SpottableDiv>
								))}
							</MusicSection>
						)}

						{shelves.map((row, index) => (
							<MusicShelf
								key={row.id}
								row={row}
								rowIndex={index}
								serverUrl={serverUrl}
								onSelectItem={onSelectItem}
								registerRowRef={registerRowRef}
								seeAllTarget={SEE_ALL_TARGET[row.id]}
								onOpenGrid={onOpenGrid}
								settingsPreview={settingsPreview}
								{...seeAllKeys(rowNode(index), shelfSeeAllId(row.id))}
							/>
						))}
					</>
				)}
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

export default ImmersiveMusic;
