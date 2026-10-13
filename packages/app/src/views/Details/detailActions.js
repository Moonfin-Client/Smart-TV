import {useCallback, useState} from 'react';
import $L from '@enact/i18n/$L';

import {DETAIL_ICON_PATHS} from './detailIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import LoopMarquee from '../../components/LoopMarquee';
import {personalRatingIconPath, personalRatingLabel} from './personalRatingAction';
import {SpottableDiv} from './detailsSpottables';

import css from './ModernDetailContent.module.less';

const Icon = ({path}) => (
	<svg className={css.icon} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

// A circular icon button that expands into a labeled pill when focused. A label longer than the
// opened pill scrolls while it has focus, and Play and Resume grow to fit theirs instead.
export const ActionButton = ({path, label, detail, onClick, active, group, primary, spotlightId}) => {
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);

	return (
		<SpottableDiv
			className={`${css.actionBtn} ${primary ? css.actionPrimary : ''} ${active ? css.actionActive : ''} ${group ? css.actionGroup : ''}`}
			onClick={onClick}
			onFocus={handleFocus}
			onBlur={handleBlur}
			spotlightId={spotlightId}
		>
			<span className={css.actionIcon}><Icon path={path} /></span>
			<span className={css.actionText}>
				{primary
					? <span className={css.actionLabel}>{label}</span>
					: <LoopMarquee className={css.actionLabel} text={label} active={focused} />}
				{detail && <span className={css.actionDetail}>{detail}</span>}
			</span>
		</SpottableDiv>
	);
};

// Every action a detail screen can offer, in one place because the screens draw the same set
// differently. Modern and Spotlight lay them out in a single capped row, Nouveau keeps three
// beside the primary and folds the rest away. A button added here reaches all of them at once.
//
// Play and Resume are not in here. They always lead a row and never move, so each screen places
// them itself rather than arranging them alongside the rest.
export const detailActionCatalogue = (props) => {
	const {
		item, seerr,
		isSeries, isSeason, isBoxSet, isEpisode, isBook, isPerson, isPlaylist, playlistTracks,
		hasTrailer, played, isFavorite, inSyncPlayGroup, onWatchWithGroup,
		supportsMediaSourceSelection, hasMultipleVersions, hasMultipleAudio,
		handleShuffle, handleTrailer, handleToggleWatched, handleToggleFavorite, handleGoToSeries,
		showsPersonalRating, personalRatingStyle, handleOpenRatingDialog,
		handleOpenVersionModal, handleOpenAudioModal, handleOpenSubtitleModal, handleOpenPlaylistModal,
		handleOpenCollectionModal, handleOpenDeleteDialog, handleOpenIdentifyModal,
		canChangeArtwork, handleOpenArtworkModal
	} = props;

	// Asking and taking back are separate buttons sharing one arrangement
	// slot, so a partly available series with an open request offers both at
	// once.
	return [
		{id: 'seerrRequest', when: seerr.showsRequest, render: () => (
			<>
				{seerr.offersRequest && (
					<ActionButton
						path={DETAIL_ICON_PATHS.request}
						label={seerr.requestLabel}
						onClick={seerr.onRequestPrimary}
					/>
				)}
				{seerr.canCancelHd && (
					<ActionButton
						path={DETAIL_ICON_PATHS.cancelRequest}
						label={$L('Cancel Request')}
						onClick={seerr.onCancel}
					/>
				)}
			</>
		)},
		{id: 'seerrRequest4k', when: seerr.showsRequest4k, render: () => (
			<>
				{seerr.offersRequest4k && (
					<ActionButton
						path={DETAIL_ICON_PATHS.request}
						label={seerr.requestLabel4k}
						onClick={seerr.onRequest4k}
					/>
				)}
				{seerr.canCancel4k && (
					<ActionButton
						path={DETAIL_ICON_PATHS.cancelRequest}
						label={$L('Cancel 4K Request')}
						onClick={seerr.onCancel4k}
					/>
				)}
			</>
		)},
		{id: 'shuffle', when: isSeries || isSeason || isBoxSet || (isPlaylist && (playlistTracks ? playlistTracks.length > 1 : (item.ChildCount > 1 || item.RecursiveItemCount > 1))), render: () => <ActionButton path={DETAIL_ICON_PATHS.shuffle} label={$L('Shuffle')} onClick={handleShuffle} />},
		{id: 'version', when: hasMultipleVersions, render: () => <ActionButton path={DETAIL_ICON_PATHS.version} label={$L('Version')} onClick={handleOpenVersionModal} />},
		{id: 'audio', when: hasMultipleAudio, render: () => <ActionButton path={DETAIL_ICON_PATHS.audio} label={$L('Audio')} onClick={handleOpenAudioModal} />},
		{id: 'subtitles', when: supportsMediaSourceSelection, render: () => <ActionButton path={DETAIL_ICON_PATHS.subtitle} label={$L('Subtitle')} onClick={handleOpenSubtitleModal} />},
		{id: 'trailer', when: hasTrailer, render: () => <ActionButton path={DETAIL_ICON_PATHS.trailer} label={$L('Trailer')} onClick={handleTrailer} />},
		// Offered while in a SyncPlay group and lit in the accent so it reads
		// as the group's, next to a Play that stays as it is.
		{id: 'watchWithGroup', when: inSyncPlayGroup && !isBook, render: () => <ActionButton path={DETAIL_ICON_PATHS.group} label={$L('Watch with group')} group onClick={onWatchWithGroup} spotlightId="details-watch-with-group-btn" />},
		{id: 'watched', when: !isPerson, render: () => <ActionButton path={DETAIL_ICON_PATHS.watched} label={played ? $L('Watched') : $L('Mark as Watched')} active={played} onClick={handleToggleWatched} spotlightId="details-watched-btn" />},
		{id: 'favorite', when: true, render: () => <ActionButton path={DETAIL_ICON_PATHS.favorite} label={isFavorite ? $L('Favorited') : $L('Favorite')} active={isFavorite} onClick={handleToggleFavorite} spotlightId="details-favorite-btn" />},
		{id: 'personalRating', when: showsPersonalRating, render: () => <ActionButton path={personalRatingIconPath(personalRatingStyle, item.UserData)} label={personalRatingLabel(personalRatingStyle, item.UserData)} onClick={handleOpenRatingDialog} spotlightId="details-rating-btn" />},
		{id: 'goToSeries', when: isEpisode && item.SeriesId, render: () => <ActionButton path={DETAIL_ICON_PATHS.series} label={$L('Series')} onClick={handleGoToSeries} />},
		{id: 'playlist', when: !isPerson, render: () => <ActionButton path={DETAIL_ICON_PATHS.playlist} label={$L('Add to Playlist')} onClick={handleOpenPlaylistModal} />},
		{id: 'collection', when: Boolean(handleOpenCollectionModal), render: () => <ActionButton path={DETAIL_ICON_PATHS.collection} label={$L('Add to Collection')} onClick={handleOpenCollectionModal} />},
		{id: 'deleteFiles', when: item.CanDelete, render: () => <ActionButton path={DETAIL_ICON_PATHS.delete} label={$L('Delete')} onClick={handleOpenDeleteDialog} />},
		{id: 'artwork', when: canChangeArtwork, render: () => <ActionButton path={DETAIL_ICON_PATHS.artwork} label={$L('Change Artwork')} onClick={handleOpenArtworkModal} spotlightId="details-artwork-btn" />},
		{id: 'seerrWatchlist', when: seerr.showsWatchlist, render: () => <ActionButton path={seerr.onWatchlist ? DETAIL_ICON_PATHS.watchlistOn : DETAIL_ICON_PATHS.watchlist} label={seerr.onWatchlist ? $L('On Watchlist') : $L('Add to Watchlist')} active={seerr.onWatchlist} onClick={seerr.toggleWatchlist} />},
		{id: 'seerrReportIssue', when: seerr.showsReportIssue, render: () => <ActionButton path={DETAIL_ICON_PATHS.reportIssue} label={$L('Report Issue')} onClick={seerr.handleReportIssueClick} />},
		{id: 'seerrManage', when: seerr.showsManage, render: () => <ActionButton path={DETAIL_ICON_PATHS.manageRequests} label={$L('Manage Requests')} onClick={seerr.handleManageRequestsClick} />},
		{id: 'admin', when: Boolean(handleOpenIdentifyModal), render: () => <ActionButton path={DETAIL_ICON_PATHS.admin} label={$L('Admin Controls')} onClick={handleOpenIdentifyModal} />}
	];
};
