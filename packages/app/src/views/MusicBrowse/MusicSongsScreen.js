import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {keepFocusInView} from '../../utils/focusScroll';
import MusicTrackList from './MusicTrackList';
import {musicArtUrl, playSongFromAlbum, subtitleFor} from './musicLibrary';
import {SONG_MIXES, countLabel, mixOrder, mixQuery} from './musicScreens';
import {CoreIcon, ScreenHeader, contentKeyHandler, playQuery, useScreenBack, useScreenFocus} from './MusicScreenParts';

import css from './MusicScreens.module.less';
import musicCss from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('songs');

const LIST_LENGTH = 5;
const [, MOST_PLAYED, FRESH] = SONG_MIXES;

const playsLabel = (track) => countLabel(track.UserData?.PlayCount || 0, $L('1 play'), $L('{count} plays'));

// The song mixes, each one press from playing, over the most played and newest songs.
const MusicSongsScreen = ({library, api, serverUrl, onSelectItem, onPlay, onBack, onOpenSongsGrid, backHandlerRef}) => {
	const [count, setCount] = useState(null);
	const [mostPlayed, setMostPlayed] = useState([]);
	const [fresh, setFresh] = useState([]);
	const libraryId = library?.Id;

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('songs', count !== null);

	useEffect(() => {
		let cancelled = false;
		const first = (mix) => api.getItems({...mixQuery(mix, libraryId), Limit: LIST_LENGTH}).catch(() => null);
		Promise.all([
			api.getItems({ParentId: libraryId, IncludeItemTypes: 'Audio', Recursive: true, Limit: 0}).catch(() => null),
			first(MOST_PLAYED),
			first(FRESH)
		]).then(([all, played, newest]) => {
			if (cancelled) return;
			setCount(all?.TotalRecordCount || 0);
			setMostPlayed(played?.Items || []);
			setFresh(newest?.Items || []);
		});
		return () => { cancelled = true; };
	}, [api, libraryId]);

	const handleMix = useCallback((e) => {
		const mix = SONG_MIXES[parseInt(e.currentTarget.dataset.index, 10)];
		if (mix) playQuery(api, onPlay, mixQuery(mix, libraryId), (tracks) => mixOrder(mix, tracks));
	}, [api, onPlay, libraryId]);

	const playContext = useMemo(() => ({api, onPlay, onSelectItem}), [api, onPlay, onSelectItem]);
	const playSong = useCallback((track) => playSongFromAlbum(playContext, track), [playContext]);
	const songArt = useCallback((track) => musicArtUrl(track, serverUrl, 120), [serverUrl]);

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="songs"
				title={$L('Songs')}
				count={count > 0 ? countLabel(count, $L('1 song'), $L('{count} songs')) : null}
			>
				<SpottableDiv className={css.pill} onClick={onOpenSongsGrid}>
					<CoreIcon name="sort_by_alpha" />{$L('All Songs A to Z')}
				</SpottableDiv>
			</ScreenHeader>

			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{count === 0 ? (
					<div className={css.empty}>{$L('No items found')}</div>
				) : count > 0 && (
					<>
						<div className={css.mixes}>
							{SONG_MIXES.map((mix, index) => (
								<SpottableDiv
									key={mix.id}
									className={mix.color ? css.mix : `${css.mix} ${css.mixAccent}`}
									style={mix.color ? {background: mix.color} : undefined}
									data-index={index}
									spotlightId={`music-mix-${index}`}
									onClick={handleMix}
								>
									<span className={css.mixEyebrow}>{mix.eyebrow}</span>
									<span className={css.mixTitle}>{mix.title}</span>
									<span className={css.mixLine}>{mix.line}</span>
									<span className={css.mixPlay}><CoreIcon name="play_arrow" /></span>
								</SpottableDiv>
							))}
						</div>

						<div className={css.lists}>
							{mostPlayed.length > 0 && (
								<div>
									<div className={musicCss.sectionHeader}>
										<h2 className={musicCss.sectionTitle}>{MOST_PLAYED.title}</h2>
									</div>
									<MusicTrackList
										tracks={mostPlayed}
										ranked
										artFor={songArt}
										subtitleFor={subtitleFor}
										metaFor={playsLabel}
										onPlay={playSong}
									/>
								</div>
							)}
							{fresh.length > 0 && (
								<div>
									<div className={musicCss.sectionHeader}>
										<h2 className={musicCss.sectionTitle}>{$L('Recently Added')}</h2>
									</div>
									<MusicTrackList
										tracks={fresh}
										artFor={songArt}
										subtitleFor={subtitleFor}
										onPlay={playSong}
									/>
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default MusicSongsScreen;
