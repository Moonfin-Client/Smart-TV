import $L from '@enact/i18n/$L';

import RatingsRow from '../../components/RatingsRow';
import {formatDuration, getImageUrl} from '../../utils/helpers';
import {hidesMediaDescription} from './detailsMedia';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {handleSeasonButtonKeyDown} from './detailsFocus';
import {PosterBadges, WatchedCheckIcon, FavoriteHeartIcon} from './DetailBadges';

import css from './Details.module.less';

const SeasonScreen = ({
	item,
	serverUrl,
	settings,
	posterUrl,
	episodes,
	episodeRatings,
	onPlay,
	onShuffle,
	onToggleWatched,
	onToggleFavorite,
	onEpisodeSelect,
	onFocusRow
}) => (
	<>
		<div className={css.seasonDetailHeader}>
			{posterUrl && (
				<div className={css.seasonDetailPoster}>
					<img src={posterUrl} alt="" />
					<PosterBadges userData={item.UserData} />
				</div>
			)}
			<div className={css.seasonDetailInfo}>
				{item.SeriesName && <span className={css.seasonDetailSeries}>{item.SeriesName}</span>}
				<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
				<div className={css.infoTextItems}>
					{item.ProductionYear && <span className={css.infoItem}>{item.ProductionYear}</span>}
					{item.OfficialRating && (
						<span className={css.infoItem}>
							<span className={`${css.badge} ${css.badgeRating}`}>{item.OfficialRating}</span>
						</span>
					)}
					<span className={css.infoItem}>
						{episodes.length} {episodes.length !== 1 ? $L('Episodes') : $L('Episode')}
					</span>
					{item.Genres?.length > 0 && <span className={css.infoItem}>{item.Genres.slice(0, 3).join(' • ')}</span>}
				</div>
				<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
			</div>
		</div>

		{episodes.length > 0 && (
			<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={onFocusRow}>
				<SpottableDiv className={css.btnWrapper} onClick={onPlay} onFocus={onFocusRow} spotlightId="details-primary-btn">
					<div className={css.btnAction}>
						<span className={css.btnIcon}>▶</span>
					</div>
					<span className={css.btnLabel}>{$L('Play')}</span>
				</SpottableDiv>
				<SpottableDiv className={css.btnWrapper} onClick={onShuffle}>
					<div className={css.btnAction}>
						<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor">
							<path d={DETAIL_ICON_PATHS.shuffle}/>
						</svg>
					</div>
					<span className={css.btnLabel}>{$L('Shuffle')}</span>
				</SpottableDiv>
				<SpottableDiv className={css.btnWrapper} onClick={onToggleWatched} spotlightId="season-watched-btn">
					<div className={css.btnAction}>
						<svg className={`${css.btnIcon} ${item.UserData?.Played ? css.watched : ''}`} viewBox="0 -960 960 960" fill="currentColor">
							<path d={DETAIL_ICON_PATHS.watched}/>
						</svg>
					</div>
					<span className={css.btnLabel}>{item.UserData?.Played ? $L('Watched') : $L('Unwatched')}</span>
				</SpottableDiv>
				<SpottableDiv className={css.btnWrapper} onClick={onToggleFavorite} spotlightId="season-favorite-btn">
					<div className={css.btnAction}>
						<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
							<path d={DETAIL_ICON_PATHS.favorite}/>
						</svg>
					</div>
					<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
				</SpottableDiv>
			</HorizontalContainer>
		)}

		<div className={css.seasonEpisodesList}>
			{episodes.map(ep => {
				const epThumbUrl = ep.ImageTags?.Primary
					? getImageUrl(serverUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80})
					: null;
				const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
				const epProgress = ep.UserData?.PlayedPercentage || 0;
				const isPlayed = ep.UserData?.Played;

				return (
					<SpottableDiv key={ep.Id} className={css.seasonEp} data-episode-id={ep.Id} onClick={onEpisodeSelect}>
						<div className={css.seasonEpThumb}>
							{epThumbUrl ? (
								<img src={epThumbUrl} alt="" />
							) : (
								<div className={css.seasonEpThumbPlaceholder}>
									<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z"/></svg>
								</div>
							)}
							{epProgress > 0 && (
								<div className={css.episodeProgress}>
									<div className={css.episodeProgressBar} style={{width: `${Math.min(epProgress, 100)}%`}} />
								</div>
							)}
							{isPlayed && (
								<div className={css.watchedIndicator}>
									<WatchedCheckIcon />
								</div>
							)}
							{ep.UserData?.IsFavorite && (
								<div className={css.favoriteBadge}>
									<FavoriteHeartIcon />
								</div>
							)}
						</div>
						<div className={css.seasonEpBody}>
							<div className={css.seasonEpTop}>
								<span className={css.seasonEpNumber}>{$L('Episode')} {ep.IndexNumber || '?'}</span>
								<span className={css.seasonEpMeta}>
									{epRuntime && <span>{epRuntime}</span>}
									{episodeRatings[ep.IndexNumber] != null && (
										<span className={css.tmdbBadge}>
											<img className={css.tmdbIcon} src={`${serverUrl}/Moonfin/Assets/tmdb.svg`} alt="TMDB" />
											{episodeRatings[ep.IndexNumber].toFixed(1)}
										</span>
									)}
								</span>
							</div>
							<span className={css.seasonEpTitle}>{ep.Name}</span>
							{!hidesMediaDescription(ep, settings) && ep.Overview && <p className={css.seasonEpOverview}>{ep.Overview}</p>}
						</div>
					</SpottableDiv>
				);
			})}
		</div>
	</>
);

export default SeasonScreen;
