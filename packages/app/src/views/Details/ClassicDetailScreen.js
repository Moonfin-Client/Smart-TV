import {Fragment, useState, useEffect, useMemo} from 'react';
import $L from '@enact/i18n/$L';

import MediaRow from '../../components/MediaRow';
import MediaCard from '../../components/MediaCard';
import RatingsRow from '../../components/RatingsRow';
import {formatDuration, getImageUrl} from '../../utils/helpers';
import {castPhotoUrl, hidesMediaDescription, seriesThumbUrl} from './detailsMedia';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {formatTime} from '../Player/PlayerConstants';
import {SeerrStatusBadge, SeerrDownloadBars, SeerrSeasonDot} from '../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrCollectionBanner, hasSeerrChips} from '../../components/seerr/SeerrSections';
import {hasMediaFacts} from '../../utils/seerrMediaFacts';
import {SpottableDiv, RowContainer} from './detailsSpottables';
import ExpandableOverview from './ExpandableOverview';
import {handleSectionKeyDown, handleScrollerFocus} from './detailsFocus';
import {PosterBadges, WatchedCheckIcon, FavoriteHeartIcon} from './DetailBadges';
import DetailMetadata from './DetailMetadata';
import NextUpCard from './NextUpCard';
import {DETAIL_METADATA, arrange} from '../../utils/detailMetadataLayout';
import {fetchUpcomingEpisode, formatUpcomingEpisode} from '../../utils/upcomingEpisode';
import {DETAIL_ICON_PATHS} from './detailIcons';

import css from './Details.module.less';

const EPISODE_THUMB = {maxWidth: 400, quality: 80};
const CHAPTER_THUMB = {maxWidth: 400, quality: 90};

// The v1 detail layout, used for anything with a video behind it: movies, series, episodes
// and box sets. The action row arrives already built, because what belongs in it depends on
// state this screen has no other use for.
const ClassicDetailScreen = ({
	item,
	serverUrl,
	serverToken,
	settings,
	isEpisode,
	isSeries,
	isBoxSet,
	logoUrl,
	logoFailed,
	onLogoError,
	posterUrl,
	year,
	runtime,
	endsAt,
	officialRating,
	seasonCount,
	genres,
	techBadges,
	techSize,
	overviewBackRef,
	tagline,
	actionButtons,
	seerr,
	seerrNav,
	onSelectSeerrCard,
	seasons,
	episodes,
	episodeRatings,
	nextUp,
	nextEpisode,
	collectionItems,
	extras,
	cast,
	parentCollection,
	parentCollectionName,
	similar,
	onSeasonSelect,
	onEpisodeSelect,
	onChapterSelect,
	onExtraSelect,
	onCastSelect,
	onSelectItem
}) => {
	const [upcomingEpisode, setUpcomingEpisode] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!isSeries && item?.Type !== 'Series') {
			setUpcomingEpisode(null);
			return undefined;
		}
		fetchUpcomingEpisode({item, settings, serverUrl, serverToken})
			.then((res) => {
				if (!cancelled) setUpcomingEpisode(res);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item, isSeries, settings, serverUrl, serverToken]);

	const upcomingEpisodeText = useMemo(() => formatUpcomingEpisode(upcomingEpisode), [upcomingEpisode]);

	const orderedItems = arrange(DETAIL_METADATA, {
		order: settings.detailMetadataOrderTv,
		hidden: settings.hiddenDetailMetadataTv
	});

	const renderMetadataPiece = (id) => {
		switch (id) {
			case 'year':
				return year ? <span key="year" className={css.infoItem}>{year}</span> : null;
			case 'parentalRating':
				return officialRating ? (
					<span key="parentalRating" className={css.infoItem}>
						<span className={`${css.badge} ${css.badgeRating}`}>{officialRating}</span>
					</span>
				) : null;
			case 'runtimeAndSeasons':
				if (isSeries && seasonCount > 0) {
					return (
						<span key="runtimeAndSeasons" className={css.infoItem}>
							{seasonCount}&nbsp;{seasonCount !== 1 ? $L('Seasons') : $L('Season')}
						</span>
					);
				}
				if (runtime && !isSeries) {
					return (
						<Fragment key="runtimeAndSeasons">
							<span className={css.infoItem}>{runtime}</span>
							{endsAt && <span className={css.infoItem}>{endsAt}</span>}
						</Fragment>
					);
				}
				return null;
			case 'status':
				if (isSeries && (item.Status === 'Continuing' || item.Status === 'Ended')) {
					return (
						<span key="status" className={css.infoItem}>
							<span className={`${css.badge} ${item.Status === 'Continuing' ? css.badgeContinuing : css.badgeEnded}`}>
								{item.Status === 'Continuing' ? $L('Continuing') : $L('Ended')}
							</span>
						</span>
					);
				}
				return null;
			case 'upcomingEpisodeDate':
				if (upcomingEpisodeText) {
					return (
						<span key="upcomingEpisodeDate" className={css.infoItem}>
							<span className={`${css.badge} ${css.badgeUpcoming}`}>
								<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" style={{width: 16, height: 16, marginRight: 6, verticalAlign: -2}}>
									<path d={DETAIL_ICON_PATHS.calendar} />
								</svg>
								{upcomingEpisodeText}
							</span>
						</span>
					);
				}
				return null;
			case 'genres':
				return genres.length > 0 ? (
					<span key="genres" className={css.infoItem}>{genres.slice(0, 3).join(' • ')}</span>
				) : null;
			case 'seerrAvailability':
				return seerr?.statusPills?.length > 0 ? (
					<span key="seerrAvailability" className={css.infoItem}>
						<SeerrStatusBadge seerr={seerr} />
					</span>
				) : null;
			default:
				return null;
		}
	};

	const metadataElements = useMemo(
		() => orderedItems.map((meta) => renderMetadataPiece(meta.id)).filter(Boolean),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[orderedItems, year, officialRating, isSeries, seasonCount, runtime, endsAt, item.Status, upcomingEpisodeText, genres, seerr]
	);

	return (
		<>
			<div className={css.detailsHeader}>
				<div className={css.infoSection}>
					{isEpisode && (
						<div className={css.episodeHeader}>
							{item.SeriesName && <span className={css.seriesName}>{item.SeriesName}</span>}
							{item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined && (
								<span className={css.episodeNumber}>S{item.ParentIndexNumber} E{item.IndexNumber}</span>
							)}
						</div>
					)}

					<div className={css.titleSection}>
						{logoUrl && !logoFailed ? (
							<img
								src={logoUrl}
								className={css.logoImage}
								alt={item.Name}
								onError={onLogoError}
							/>
						) : (
							<h1 className={css.title}>{item.Name}</h1>
						)}
					</div>

					<div className={css.infoRow}>
						<div className={css.infoTextItems}>
							{techSize && <span className={css.infoItem}>{techSize}</span>}
							{metadataElements}
						</div>
						{techBadges.length > 0 && (
							<div className={css.infoBadges}>
								{techBadges.map((badge, i) => (
									<span key={i} className={`${css.badge} ${css[badge.type]}`}>{badge.label}</span>
								))}
							</div>
						)}
					</div>

				<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />

				{!hidesMediaDescription(item, settings) && (
					<>
						{tagline && <p className={css.tagline}>&ldquo;{tagline}&rdquo;</p>}
						<ExpandableOverview text={item.Overview} itemId={item.Id} className={css.overviewSlot} variant="classic" backRef={overviewBackRef} />
					</>
				)}
			</div>

			<div className={`${css.posterSection} ${isEpisode ? css.posterLandscape : ''}`}>
				<div className={css.poster}>
					{posterUrl ? (
						<img src={posterUrl} alt="" />
					) : (
						<div className={css.posterPlaceholder}>
							<svg viewBox="0 0 24 24" fill="currentColor">
								<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
							</svg>
						</div>
					)}
					<PosterBadges userData={item.UserData} />
				</div>
			</div>
		</div>

		{actionButtons}

		<SeerrDownloadBars seerr={seerr} />

		<DetailMetadata item={item} />

		<div className={css.sectionsContainer} onKeyDown={handleSectionKeyDown}>
			{nextUp.length > 0 && (
				<NextUpCard episode={nextUp[0]} title={$L('Next Up')} serverUrl={serverUrl} settings={settings} onSelectItem={onSelectItem} />
			)}

			{isSeries && seasons.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{$L('Seasons')}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{seasons.map(season => {
							const seasonPosterUrl = season.ImageTags?.Primary
								? getImageUrl(serverUrl, season.Id, 'Primary', {maxHeight: 350, quality: 80})
								: null;
							const isWatched = season.UserData?.Played;
							const unplayed = season.UserData?.UnplayedItemCount;

							return (
								<SpottableDiv key={season.Id} className={css.seasonCard} data-season-id={season.Id} onClick={onSeasonSelect}>
									<div className={css.seasonPosterWrapper}>
										{seasonPosterUrl ? (
											<img src={seasonPosterUrl} alt="" />
										) : (
											<div className={css.seasonPosterPlaceholder}>
												<span>{season.Name}</span>
											</div>
										)}
										<SeerrSeasonDot status={settings.showSeerrAvailabilityBadges !== false ? seerr.seasonMarkers.get(season.IndexNumber) : null} />
										{isWatched && (
											<div className={css.watchedIndicator}>
												<WatchedCheckIcon />
											</div>
										)}
										{!isWatched && unplayed > 0 && (
											<div className={css.unplayedCount}>{unplayed}</div>
										)}
									</div>
									<span className={css.seasonName}>{season.Name}</span>
								</SpottableDiv>
							);
						})}
					</div>
				</RowContainer>
			)}

			{isEpisode && nextEpisode && (
				<NextUpCard episode={nextEpisode} title={$L('Next Episode')} serverUrl={serverUrl} settings={settings} onSelectItem={onSelectItem} />
			)}

			{isEpisode && episodes.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>
							{item.ParentIndexNumber !== undefined ? $L('Season {number} Episodes').replace('{number}', item.ParentIndexNumber) : $L('Episodes')}
						</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{episodes.map(ep => {
							// The episode carries the series artwork on most records, and the
							// screen's own item stands in for the ones that don't.
							const seriesThumb = settings.detailUseSeriesThumbnails
								? (seriesThumbUrl(serverUrl, ep, EPISODE_THUMB) || seriesThumbUrl(serverUrl, item, EPISODE_THUMB))
								: null;
							const epThumbUrl = seriesThumb ||
								(ep.ImageTags?.Primary ? getImageUrl(serverUrl, ep.Id, 'Primary', EPISODE_THUMB) : null);
							const isCurrentEp = ep.Id === item.Id;
							const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
							const epProgress = ep.UserData?.PlayedPercentage || 0;

							return (
								<SpottableDiv
									key={ep.Id}
									className={`${css.episodeCard} ${isCurrentEp ? css.episodeCurrent : ''}`}
									data-episode-id={ep.Id}
									onClick={onEpisodeSelect}
								>
									<div className={css.episodeThumb}>
										{epThumbUrl ? (
											<img src={epThumbUrl} alt="" />
										) : (
											<div className={css.episodeThumbPlaceholder}>
												<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z"/></svg>
											</div>
										)}
										{epProgress > 0 && (
											<div className={css.episodeProgress}>
												<div className={css.episodeProgressBar} style={{width: `${Math.min(epProgress, 100)}%`}} />
											</div>
										)}
										{ep.UserData?.Played && (
											<div className={css.watchedIndicator}>
												<WatchedCheckIcon compact />
											</div>
										)}
										{ep.UserData?.IsFavorite && (
											<div className={css.favoriteBadge}>
												<FavoriteHeartIcon />
											</div>
										)}
									</div>
									<div className={css.episodeInfo}>
										<span className={css.episodeEpNumber}>E{ep.IndexNumber || '?'}</span>
										<span className={css.episodeEpTitle}>{ep.Name}</span>
										{epRuntime && <span className={css.episodeEpRuntime}>{epRuntime}</span>}
										{episodeRatings[ep.IndexNumber] != null && (
											<span className={css.tmdbBadge}>
												<img className={css.tmdbIcon} src={`${serverUrl}/Moonfin/Assets/tmdb.svg`} alt="TMDB" />
												{episodeRatings[ep.IndexNumber].toFixed(1)}
											</span>
										)}
									</div>
								</SpottableDiv>
							);
						})}
					</div>
				</RowContainer>
			)}

			{isBoxSet && collectionItems.length > 0 && (
				<MediaRow
					title={$L('Items in Collection')}
					items={collectionItems}
					serverUrl={serverUrl}
					onSelectItem={onSelectItem}
					className={css.inlineRow}
				/>
			)}

			{item.Chapters?.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{$L('Chapters')}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{item.Chapters.map((chapter, index) => {
							const seriesThumb = settings.detailUseSeriesThumbnails
								? seriesThumbUrl(serverUrl, item, CHAPTER_THUMB)
								: null;
							const chapterImageUrl = seriesThumb ||
								(chapter.ImageTag ? `${serverUrl}/Items/${item.Id}/Images/Chapter/${index}?maxWidth=400&tag=${chapter.ImageTag}` : null);

							return (
								<SpottableDiv
									key={index}
									className={css.chapterCard}
									data-start-ticks={chapter.StartPositionTicks}
									onClick={onChapterSelect}
								>
									<div className={css.chapterThumb}>
										{chapterImageUrl ? (
											<img src={chapterImageUrl} alt="" />
										) : (
											<div className={css.chapterThumbPlaceholder}>
												<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" /></svg>
											</div>
										)}
									</div>
									<div className={css.chapterInfo}>
										<span className={css.chapterName}>{chapter.Name}</span>
										<span className={css.chapterTime}>{formatTime(chapter.StartPositionTicks / 10000000)}</span>
									</div>
								</SpottableDiv>
							);
						})}
					</div>
				</RowContainer>
			)}

			{extras.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{$L('Extras')}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{extras.map(extra => {
							const extraThumbUrl = extra.ImageTags?.Primary
								? getImageUrl(serverUrl, extra.Id, 'Primary', {maxWidth: 400, quality: 80})
								: null;
							const extraDuration = extra.RunTimeTicks ? formatDuration(extra.RunTimeTicks) : '';

							return (
								<SpottableDiv
									key={extra.Id}
									className={css.extraCard}
									data-extra-id={extra.Id}
									onClick={onExtraSelect}
								>
									<div className={css.extraThumb}>
										{extraThumbUrl ? (
											<img src={extraThumbUrl} alt="" />
										) : (
											<div className={css.extraThumbPlaceholder}>
												<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
											</div>
										)}
									</div>
									<div className={css.extraInfo}>
										<span className={css.extraName}>{extra.Name}</span>
										{extraDuration && <span className={css.extraDuration}>{extraDuration}</span>}
									</div>
								</SpottableDiv>
							);
						})}
					</div>
				</RowContainer>
			)}

			{cast.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{$L('Cast')}</h3>
					</div>
					<div className={css.castScroller} onFocus={handleScrollerFocus}>
						{cast.map(person => (
							<SpottableDiv key={person.Id} className={css.castCard} data-person-id={person.Id} onClick={onCastSelect}>
								<div className={css.castImageWrapper}>
									{castPhotoUrl(person, serverUrl, 280) ? (
										<img
											src={castPhotoUrl(person, serverUrl, 280)}
											className={css.castImage}
											alt=""
										/>
									) : (
										<div className={css.castPlaceholder}>
											{person.Name?.charAt(0)}
										</div>
									)}
								</div>
								<span className={css.castName}>{person.Name}</span>
								<span className={css.castRole}>{person.Role || person.Type}</span>
							</SpottableDiv>
						))}
					</div>
				</RowContainer>
			)}

			{parentCollection.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{parentCollectionName}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{parentCollection.map(colItem => (
							<MediaCard
								key={colItem.Id}
								item={colItem}
								serverUrl={serverUrl}
								onSelect={onSelectItem}
							/>
						))}
					</div>
				</RowContainer>
			)}

			{similar.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{$L('More Like This')}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{similar.map(simItem => (
							<MediaCard
								key={simItem.Id}
								item={simItem}
								serverUrl={serverUrl}
								onSelect={onSelectItem}
							/>
						))}
					</div>
				</RowContainer>
			)}

			{seerr.isActive && hasSeerrChips(seerr.details) && (
				<RowContainer className={css.section}>
					<SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />
				</RowContainer>
			)}

			{seerr.isActive && seerr.details?.collection && seerrNav?.onOpenCollection && (
				<RowContainer className={css.section}>
					<SeerrCollectionBanner collection={seerr.details.collection} onOpen={seerrNav.onOpenCollection} />
				</RowContainer>
			)}

			{seerr.isActive && hasMediaFacts(seerr.details, seerr.mediaType) && (
				<RowContainer className={css.section}>
					<SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />
				</RowContainer>
			)}

			{seerr.isActive && seerr.recommendationCards.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{`${seerr.displayName} · ${$L('Recommendations')}`}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{seerr.recommendationCards.map(card => (
							<MediaCard key={card.Id} item={card} serverUrl={serverUrl} onSelect={onSelectSeerrCard} />
						))}
					</div>
				</RowContainer>
			)}

			{seerr.isActive && seerr.similarCards.length > 0 && (
				<RowContainer className={css.section}>
					<div className={css.sectionHeader}>
						<h3 className={css.sectionTitle}>{`${seerr.displayName} · ${$L('Similar')}`}</h3>
					</div>
					<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
						{seerr.similarCards.map(card => (
							<MediaCard key={card.Id} item={card} serverUrl={serverUrl} onSelect={onSelectSeerrCard} />
						))}
					</div>
				</RowContainer>
			)}
		</div>
	</>
	);
};

export default ClassicDetailScreen;
