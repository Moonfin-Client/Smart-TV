import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {keepFocusInView} from '../../utils/focusScroll';
import {formatDuration} from '../../utils/helpers';
import {shuffleArray} from '../Details/detailsMedia';
import MusicTrackList from './MusicTrackList';
import {handleSectionKey, musicArtUrl, subtitleFor} from './musicLibrary';
import {countLabel} from './musicScreens';
import {
	CoreIcon, ScreenHeader, fetchAudioPlaylists, focusRail, focusStrip, playTracks, usePagedItems, useScreenBack, useScreenFocus
} from './MusicScreenParts';

import css from './MusicScreens.module.less';
import musicCss from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
// Moves inside a list are measured there first, not across the whole screen.
const Section = SpotlightContainerDecorator({}, 'div');

const ROW_ID = 'music-playlist';
const PLAY_ID = 'music-playlist-play';
const FIRST_SONG_ID = 'music-playlist-song';
// Long enough that scrolling the list doesn't ask for every playlist it passes.
const SHOW_DELAY = 250;

const playlistMeta = (playlist) => [
	playlist.ChildCount > 0 ? countLabel(playlist.ChildCount, $L('1 song'), $L('{count} songs')) : '',
	formatDuration(playlist.CumulativeRunTimeTicks || playlist.RunTimeTicks)
].filter(Boolean).join(' · ');

const PlaylistArt = ({playlist, serverUrl, maxHeight, className}) => {
	const art = musicArtUrl(playlist, serverUrl, maxHeight);
	return art
		? <img className={className} src={art} alt="" loading="lazy" />
		: <span className={`${className} ${css.artPlaceholder}`}><CoreIcon name="queue_music" /></span>;
};

// The audio playlists down the left, and the one in focus on the right with its songs.
const MusicPlaylistsScreen = ({api, serverUrl, onSelectItem, onPlay, onBack, backHandlerRef}) => {
	const [shownIndex, setShownIndex] = useState(0);
	const [songs, setSongs] = useState(null);
	const timerRef = useRef(null);
	const fetchPage = useMemo(() => fetchAudioPlaylists(api), [api]);
	const {items, total, loaded, complete, loadMore} = usePagedItems(fetchPage);
	const shown = items[shownIndex] || null;
	const shownId = shown?.Id;

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('playlists', items.length > 0 || complete);

	// A page that held no audio playlists says nothing yet, so the next one is asked for.
	useEffect(() => {
		if (loaded && !complete && items.length === 0) loadMore();
	}, [loaded, complete, items.length, loadMore]);

	useEffect(() => () => clearTimeout(timerRef.current), []);

	useEffect(() => {
		setSongs(null);
		if (!shownId) return undefined;
		let cancelled = false;
		api.getPlaylistItems(shownId)
			.then((res) => { if (!cancelled) setSongs(res?.Items || []); })
			.catch(() => { if (!cancelled) setSongs([]); });
		return () => { cancelled = true; };
	}, [api, shownId]);

	const handleRowFocus = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setShownIndex(index), SHOW_DELAY);
		if (index >= items.length - 5) loadMore();
	}, [items.length, loadMore]);

	const handleRowClick = useCallback((e) => {
		const playlist = items[parseInt(e.currentTarget.dataset.index, 10)];
		if (playlist) onSelectItem?.(playlist);
	}, [items, onSelectItem]);

	// Right shows the playlist in focus straight away rather than waiting out the pause. The screen
	// has no controls of its own, so Up off the top goes back to the strip, and Left to the rail.
	const handleListKey = useCallback((e) => handleSectionKey(e, {
		chain: [],
		onUp: focusStrip,
		onLeft: focusRail,
		onRight: () => {
			const index = parseInt(e.target.dataset?.index, 10);
			clearTimeout(timerRef.current);
			if (index >= 0) setShownIndex(index);
			Spotlight.focus(PLAY_ID);
		}
	}), []);

	const focusShownRow = useCallback(() => Spotlight.focus(`${ROW_ID}-${shownIndex}`), [shownIndex]);
	const focusPlay = useCallback(() => Spotlight.focus(PLAY_ID), []);
	const focusFirstSong = useCallback(() => Spotlight.focus(FIRST_SONG_ID), []);
	const handleButtonsKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onLeft: focusShownRow, onUp: focusStrip, onDown: focusFirstSong
	}), [focusShownRow, focusFirstSong]);
	const handleSongsKey = useCallback((e) => handleSectionKey(e, {
		chain: [], onLeft: focusShownRow, onUp: focusPlay
	}), [focusShownRow, focusPlay]);

	const handlePlay = useCallback(() => playTracks(onPlay, songs || []), [onPlay, songs]);
	const handleShuffle = useCallback(() => playTracks(onPlay, shuffleArray(songs || [])), [onPlay, songs]);
	const handleOpen = useCallback(() => shown && onSelectItem?.(shown), [shown, onSelectItem]);
	const handleSong = useCallback((song) => playTracks(onPlay, songs || [], (songs || []).indexOf(song)), [onPlay, songs]);
	const songArt = useCallback((song) => musicArtUrl(song, serverUrl, 120), [serverUrl]);

	// The server's total counts playlists that turn out not to be audio, so the list's own length
	// takes over once it's all in.
	const count = complete ? items.length : total;
	const empty = complete && items.length === 0;
	const header = (
		<ScreenHeader
			screenId="playlists"
			title={$L('Playlists')}
			count={count > 0 ? countLabel(count, $L('1 playlist'), $L('{count} playlists')) : null}
			flush={!empty}
		/>
	);

	if (empty) {
		return (
			<div className={css.screen}>
				{header}
				<div className={css.empty}>{$L('No items found')}</div>
			</div>
		);
	}

	return (
		<div className={css.screen}>
			<div className={css.split}>
				<div className={css.listColumn}>
					{header}
					<Section className={css.playlistList} onKeyDown={handleListKey} onFocus={keepFocusInView}>
						{items.map((playlist, index) => (
							<SpottableDiv
								key={playlist.Id}
								className={index === shownIndex ? `${css.playlistRow} ${css.playlistShown}` : css.playlistRow}
								data-index={index}
								spotlightId={`${ROW_ID}-${index}`}
								onFocus={handleRowFocus}
								onClick={handleRowClick}
							>
								<PlaylistArt playlist={playlist} serverUrl={serverUrl} maxHeight={120} className={css.playlistArt} />
								<div className={css.playlistText}>
									<div className={css.playlistName}>{playlist.Name}</div>
									<div className={css.subMeta}>{playlistMeta(playlist)}</div>
								</div>
							</SpottableDiv>
						))}
					</Section>
				</div>

				{shown && (
					<div className={css.detail} onFocus={keepFocusInView}>
						<div className={css.detailTop}>
							<PlaylistArt playlist={shown} serverUrl={serverUrl} maxHeight={400} className={css.detailArt} />
							<div className={css.detailInfo}>
								<div className={css.eyebrow}>{$L('Playlist')}</div>
								<div className={css.detailTitle}>{shown.Name}</div>
								<div className={css.meta}>{playlistMeta(shown)}</div>
								<Section className={css.panelButtons} onKeyDown={handleButtonsKey}>
									<SpottableDiv className={`${musicCss.heroBtn} ${musicCss.primaryBtn}`} spotlightId={PLAY_ID} onClick={handlePlay}>
										<CoreIcon name="play_arrow" />{$L('Play')}
									</SpottableDiv>
									<SpottableDiv className={musicCss.heroBtn} onClick={handleShuffle}>
										<CoreIcon name="shuffle" />{$L('Shuffle')}
									</SpottableDiv>
									<SpottableDiv className={musicCss.heroBtn} onClick={handleOpen}>
										<CoreIcon name="queue_music" />{$L('Open Playlist')}
									</SpottableDiv>
								</Section>
							</div>
						</div>
						<Section className={css.detailTracks} onKeyDown={handleSongsKey}>
							{songs ? (
								<MusicTrackList
									tracks={songs}
									artFor={songArt}
									subtitleFor={subtitleFor}
									firstSpotlightId={FIRST_SONG_ID}
									onPlay={handleSong}
								/>
							) : (
								<div className={css.loading}>{$L('Loading...')}</div>
							)}
						</Section>
					</div>
				)}
			</div>
		</div>
	);
};

export default MusicPlaylistsScreen;
