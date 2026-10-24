import $L from '@enact/i18n/$L';

import RatingsRow from '../../components/RatingsRow';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {PosterBadges} from './DetailBadges';
import {hidesMediaDescription} from './detailsMedia';

import css from './Details.module.less';

const AudioTrackScreen = ({item, serverUrl, settings, showsSection, posterUrl, year, runtime, onPlay, onToggleFavorite, onFocusRow}) => {
	const trackArtist = item.AlbumArtist || item.Artists?.[0] || '';
	const albumName = item.Album || '';

	return (
		<>
			<div className={css.detailsHeader}>
				<div className={css.infoSection}>
					{trackArtist && <span className={css.seriesName}>{trackArtist}</span>}
					<div className={css.titleSection}>
						<h1 className={css.title}>{item.Name}</h1>
					</div>
					<div className={css.infoRow}>
						<div className={css.infoTextItems}>
							{albumName && <span className={css.infoItem}>{albumName}</span>}
							{year && <span className={css.infoItem}>{year}</span>}
							{runtime && <span className={css.infoItem}>{runtime}</span>}
						</div>
						<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
					</div>
					{item.Overview && !hidesMediaDescription(item, settings) && <p className={css.overview}>{item.Overview}</p>}
				</div>
				{showsSection('poster') && (
					<div className={css.posterSection}>
						<div className={css.poster}>
							{posterUrl ? (
								<img src={posterUrl} alt="" />
							) : (
								<div className={css.posterPlaceholder}>
									<svg viewBox="0 -960 960 960" fill="currentColor">
										<path d={DETAIL_ICON_PATHS.audio}/>
									</svg>
								</div>
							)}
							<PosterBadges userData={item.UserData} />
						</div>
					</div>
				)}
			</div>

			<HorizontalContainer className={css.actionButtons} spotlightId="details-action-buttons">
				<SpottableDiv className={css.btnWrapper} onClick={onPlay} onFocus={onFocusRow} spotlightId="details-primary-btn">
					<div className={css.btnAction}>
						<span className={css.btnIcon}>▶</span>
					</div>
					<span className={css.btnLabel}>{$L('Play')}</span>
				</SpottableDiv>
				<SpottableDiv className={css.btnWrapper} onClick={onToggleFavorite} spotlightId="details-favorite-btn">
					<div className={css.btnAction}>
						<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
							<path d={DETAIL_ICON_PATHS.favorite}/>
						</svg>
					</div>
					<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
				</SpottableDiv>
			</HorizontalContainer>
		</>
	);
};

export default AudioTrackScreen;
