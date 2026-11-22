import {useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {trackRuntimeLabel} from '../../components/DetailTrackList/trackRows';

import css from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');

// Songs as one-line rows: the track number or the album art, the title with `subtitleFor`'s line
// under it when there is one, and the length at the end, or `metaFor`'s text in its place.
// `ranked` puts the place in the list ahead of the art. `activeId` marks the song an album was
// left on. With `idPrefix` every row gets the spotlight id `${idPrefix}-${index}`.
const MusicTrackList = ({tracks, numbered = false, ranked = false, subtitleFor, artFor, metaFor, activeId, firstSpotlightId, idPrefix, className, onPlay}) => {
	const handleClick = useCallback((e) => {
		const track = tracks[parseInt(e.currentTarget.dataset.index, 10)];
		if (track) onPlay(track);
	}, [tracks, onPlay]);

	return (
		<div className={className}>
			{tracks.map((track, index) => {
				const subtitle = subtitleFor?.(track);
				const art = artFor?.(track);
				const length = metaFor ? metaFor(track) : trackRuntimeLabel(track.RunTimeTicks, true);
				return (
					<SpottableDiv
						key={track.PlaylistItemId || track.Id}
						className={track.Id === activeId ? `${css.track} ${css.trackActive}` : css.track}
						data-index={index}
						spotlightId={idPrefix ? `${idPrefix}-${index}` : index === 0 ? firstSpotlightId : undefined}
						onClick={handleClick}
					>
						{ranked && <span className={css.trackRank}>{index + 1}</span>}
						{numbered
							? <span className={css.trackNumber}>{track.IndexNumber ?? index + 1}</span>
							: art
								? <img className={css.trackArt} src={art} alt="" loading="lazy" />
								: <span className={css.trackArt} />}
						<span className={css.trackText}>
							<span className={css.trackTitle}>{track.Name}</span>
							{subtitle && <span className={css.trackSubtitle}>{subtitle}</span>}
						</span>
						{length && <span className={css.trackLength}>{length}</span>}
					</SpottableDiv>
				);
			})}
		</div>
	);
};

export default MusicTrackList;
