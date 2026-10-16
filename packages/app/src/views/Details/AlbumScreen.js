import $L from '@enact/i18n/$L';

import MediaRow from '../../components/MediaRow';
import RatingsRow from '../../components/RatingsRow';
import {formatDuration} from '../../utils/helpers';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {handleSeasonButtonKeyDown} from './detailsFocus';
import {PosterBadges, WatchedCheckIcon} from './DetailBadges';
import {hidesMediaDescription} from './detailsMedia';

import css from './Details.module.less';

const AlbumScreen = ({
	item,
	serverUrl,
	settings,
	showsSection,
	posterUrl,
	year,
	genres,
	albumTracks,
	similar,
	onPlay,
	onShuffle,
	onToggleFavorite,
	onTrackPlay,
	onSelectItem,
	onFocusRow
}) => {
	const albumArtist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || '';
	const trackCount = albumTracks.length;
	const totalDuration = albumTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);

	return (
		<>
			<div className={css.seasonDetailHeader}>
				{showsSection('poster') && posterUrl && (
					<div className={css.seasonDetailPoster}>
						<img src={posterUrl} alt="" />
						<PosterBadges userData={item.UserData} />
					</div>
				)}
				<div className={css.seasonDetailInfo}>
					{albumArtist && <span className={css.seasonDetailSeries}>{albumArtist}</span>}
					<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
					<span className={css.seasonDetailCount}>
						{year ? `${year} · ` : ''}{trackCount} {trackCount !== 1 ? $L('Tracks') : $L('Track')}
						{totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
					</span>
					{genres.length > 0 && (
						<span className={css.seasonDetailCount}>{genres.join(', ')}</span>
					)}
					<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
				</div>
			</div>

			<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={onFocusRow}>
				{albumTracks.length > 0 && (
					<SpottableDiv className={css.btnWrapper} onClick={onPlay} onFocus={onFocusRow} spotlightId="details-primary-btn">
						<div className={css.btnAction}>
							<span className={css.btnIcon}>▶</span>
						</div>
						<span className={css.btnLabel}>{$L('Play')}</span>
					</SpottableDiv>
				)}
				{albumTracks.length > 1 && (
					<SpottableDiv className={css.btnWrapper} onClick={onShuffle}>
						<div className={css.btnAction}>
							<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
								<path d={DETAIL_ICON_PATHS.shuffle}/>
							</svg>
						</div>
						<span className={css.btnLabel}>{$L('Shuffle')}</span>
					</SpottableDiv>
				)}
				<SpottableDiv className={css.btnWrapper} onClick={onToggleFavorite} spotlightId="details-favorite-btn">
					<div className={css.btnAction}>
						<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
							<path d={DETAIL_ICON_PATHS.favorite}/>
						</svg>
					</div>
					<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
				</SpottableDiv>
			</HorizontalContainer>

			<div className={css.trackList}>
				<div className={css.sectionHeader}>
					<h3 className={css.sectionTitle}>Tracks ({trackCount})</h3>
				</div>
				{albumTracks.map((track, idx) => {
					const trackDuration = track.RunTimeTicks ? formatDuration(track.RunTimeTicks) : '';
					const isPlayed = track.UserData?.Played;
					const trackArtist = track.AlbumArtist || track.Artists?.[0] || '';
					const showArtist = trackArtist && trackArtist !== albumArtist;

					return (
						<SpottableDiv key={track.Id} className={css.trackItem} data-track-id={track.Id} onClick={onTrackPlay}>
							<span className={css.trackNumber}>{track.IndexNumber || idx + 1}</span>
							<div className={css.trackInfo}>
								<span className={css.trackTitle}>{track.Name}</span>
								{showArtist && <span className={css.trackArtist}>{trackArtist}</span>}
							</div>
							{isPlayed && (
								<span className={css.trackPlayed}>
									<WatchedCheckIcon width="16" height="16" />
								</span>
							)}
							<span className={css.trackDuration}>{trackDuration}</span>
						</SpottableDiv>
					);
				})}
			</div>

			{item.Overview && !hidesMediaDescription(item, settings) && (
				<div className={css.albumOverview}>
					<p className={css.overview}>{item.Overview}</p>
				</div>
			)}

			<div className={css.sectionsContainer}>
				{similar.length > 0 && (
					<MediaRow
						title={$L('More Like This')}
						items={similar}
						serverUrl={serverUrl}
						cardType="square"
						onSelectItem={onSelectItem}
						className={css.inlineRow}
						rowIndex={0}
					/>
				)}
			</div>
		</>
	);
};

export default AlbumScreen;
