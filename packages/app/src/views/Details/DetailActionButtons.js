import {Fragment} from 'react';
import $L from '@enact/i18n/$L';

import {arrange, seerrOnlyRow, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY} from '../../utils/buttonLayout';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import {personalRatingIconPath, personalRatingLabel} from './personalRatingAction';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {handleButtonRowKeyDown} from './detailsFocus';

import css from './Details.module.less';

const BtnIcon = ({path, stateClass}) => (
	<svg className={stateClass ? `${css.btnIcon} ${stateClass}` : css.btnIcon} viewBox={iconViewBox(path)} fill="currentColor">
		<path d={path}/>
	</svg>
);

// The row under the header. Play and Resume always lead it, and everything after them is in
// whatever order the viewer arranged in settings, with anything they hid left out.
const DetailActionButtons = ({
	item,
	settings,
	seerr,
	seerrOnly,
	isSeries,
	isSeason,
	isEpisode,
	isBook,
	isReadableBook,
	hasPlaybackPosition,
	resumeTimeText,
	inSyncPlayGroup,
	onWatchWithGroup,
	mediaSource,
	supportsMediaSourceSelection,
	hasMultipleVersions,
	hasMultipleAudio,
	selectedVersionIndex,
	selectedAudioIndex,
	selectedSubtitleIndex,
	currentAudioStream,
	currentSubtitleStream,
	canAddToCollection,
	canIdentify,
	playLongPress,
	resumeLongPress,
	onFocusRow,
	onShuffle,
	onOpenVersionModal,
	onOpenAudioModal,
	onOpenSubtitleModal,
	onTrailer,
	onToggleWatched,
	onToggleFavorite,
	showsPersonalRating,
	personalRatingStyle,
	onOpenRatingDialog,
	onGoToSeries,
	onOpenPlaylistModal,
	onOpenCollectionModal,
	onOpenDeleteDialog,
	onOpenIdentifyModal
}) => {
	// Asking and taking back are separate buttons sharing one arrangement slot,
	// so a partly available series with an open request offers both at once.
	const seerrButton = (label, icon, onClick) => (
		<SpottableDiv className={css.btnWrapper} onClick={onClick}>
			<div className={css.btnAction}>
				<BtnIcon path={icon}/>
			</div>
			<span className={css.btnLabel}>{label}</span>
		</SpottableDiv>
	);

	// Declaration order is where a button the user never placed ends up, so keep it stable.
	const offered = [
		{id: 'seerrRequest', when: seerr.showsRequest, render: () => (
			<>
				{seerr.offersRequest && seerrButton(seerr.requestLabel, DETAIL_ICON_PATHS.request, seerr.onRequestPrimary)}
				{seerr.canCancelHd && seerrButton($L('Cancel Request'), DETAIL_ICON_PATHS.cancelRequest, seerr.onCancel)}
			</>
		)},
		{id: 'seerrRequest4k', when: seerr.showsRequest4k, render: () => (
			<>
				{seerr.offersRequest4k && seerrButton(seerr.requestLabel4k, DETAIL_ICON_PATHS.request, seerr.onRequest4k)}
				{seerr.canCancel4k && seerrButton($L('Cancel 4K Request'), DETAIL_ICON_PATHS.cancelRequest, seerr.onCancel4k)}
			</>
		)},
		{id: 'shuffle', when: isSeries || isSeason, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onShuffle}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.shuffle}/>
				</div>
				<span className={css.btnLabel}>{$L('Shuffle')}</span>
			</SpottableDiv>
		)},
		{id: 'version', when: hasMultipleVersions, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenVersionModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.version}/>
				</div>
				<span className={css.btnLabel}>{$L('Version')}</span>
				<span className={css.btnDetail}>{mediaSource?.Name || `${$L('Version')} ${selectedVersionIndex + 1}`}</span>
			</SpottableDiv>
		)},
		{id: 'audio', when: hasMultipleAudio, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenAudioModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.audio}/>
				</div>
				<span className={css.btnLabel}>{$L('Audio')}</span>
				{currentAudioStream && (
					<span className={css.btnDetail}>
						{currentAudioStream.DisplayTitle || currentAudioStream.Language || `${$L('Track')} ${selectedAudioIndex + 1}`}
					</span>
				)}
			</SpottableDiv>
		)},
		{id: 'subtitles', when: supportsMediaSourceSelection, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenSubtitleModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.subtitle}/>
				</div>
				<span className={css.btnLabel}>{$L('Subtitle')}</span>
				{currentSubtitleStream ? (
					<span className={css.btnDetail}>
						{currentSubtitleStream.DisplayTitle || currentSubtitleStream.Language || `${$L('Track')} ${selectedSubtitleIndex + 1}`}
					</span>
				) : (
					<span className={css.btnDetail}>{$L('Off')}</span>
				)}
			</SpottableDiv>
		)},
		{id: 'trailer', when: item.LocalTrailerCount > 0 || item.RemoteTrailers?.length > 0, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onTrailer}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.trailer}/>
				</div>
				<span className={css.btnLabel}>{$L('Trailer')}</span>
			</SpottableDiv>
		)},
		// Same button as Core: offered while in a SyncPlay group, and lit in the
		// accent so it reads as the group's, next to a Play that stays as it is.
		{id: 'watchWithGroup', when: inSyncPlayGroup && !isBook, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onWatchWithGroup} spotlightId="details-watch-with-group-btn">
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.group} stateClass={css.watched}/>
				</div>
				<span className={css.btnLabel}>{$L('Watch with group')}</span>
			</SpottableDiv>
		)},
		{id: 'watched', when: true, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onToggleWatched} spotlightId="details-watched-btn">
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.watched} stateClass={item.UserData?.Played ? css.watched : ''}/>
				</div>
				<span className={css.btnLabel}>{item.UserData?.Played ? $L('Watched') : $L('Mark as Watched')}</span>
			</SpottableDiv>
		)},
		{id: 'favorite', when: true, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onToggleFavorite} spotlightId="details-favorite-btn">
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.favorite} stateClass={item.UserData?.IsFavorite ? css.favorited : ''}/>
				</div>
				<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
			</SpottableDiv>
		)},
		{id: 'personalRating', when: showsPersonalRating, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenRatingDialog} spotlightId="details-rating-btn">
				<div className={css.btnAction}>
					<BtnIcon path={personalRatingIconPath(personalRatingStyle, item.UserData)}/>
				</div>
				<span className={css.btnLabel}>{personalRatingLabel(personalRatingStyle, item.UserData)}</span>
			</SpottableDiv>
		)},
		{id: 'goToSeries', when: isEpisode && item.SeriesId, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onGoToSeries}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.series}/>
				</div>
				<span className={css.btnLabel}>{$L('Series')}</span>
			</SpottableDiv>
		)},
		{id: 'playlist', when: true, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenPlaylistModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.playlist}/>
				</div>
				<span className={css.btnLabel}>{$L('Add to Playlist')}</span>
			</SpottableDiv>
		)},
		{id: 'collection', when: canAddToCollection, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenCollectionModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.collection}/>
				</div>
				<span className={css.btnLabel}>{$L('Add to Collection')}</span>
			</SpottableDiv>
		)},
		{id: 'deleteFiles', when: item.CanDelete, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenDeleteDialog}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.delete}/>
				</div>
				<span className={css.btnLabel}>{$L('Delete')}</span>
			</SpottableDiv>
		)},
		{id: 'seerrWatchlist', when: seerr.showsWatchlist, render: () => (
			seerrButton(
				seerr.onWatchlist ? $L('On Watchlist') : $L('Add to Watchlist'),
				seerr.onWatchlist ? DETAIL_ICON_PATHS.watchlistOn : DETAIL_ICON_PATHS.watchlist,
				seerr.toggleWatchlist
			)
		)},
		{id: 'seerrReportIssue', when: seerr.showsReportIssue, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={seerr.handleReportIssueClick}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.reportIssue}/>
				</div>
				<span className={css.btnLabel}>{$L('Report Issue')}</span>
			</SpottableDiv>
		)},
		{id: 'seerrManage', when: seerr.showsManage, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={seerr.handleManageRequestsClick}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.manageRequests}/>
				</div>
				<span className={css.btnLabel}>{$L('Manage Requests')}</span>
			</SpottableDiv>
		)},
		{id: 'admin', when: canIdentify, render: () => (
			<SpottableDiv className={css.btnWrapper} onClick={onOpenIdentifyModal}>
				<div className={css.btnAction}>
					<BtnIcon path={DETAIL_ICON_PATHS.admin}/>
				</div>
				<span className={css.btnLabel}>{$L('Admin Controls')}</span>
			</SpottableDiv>
		)}
	];
	const rowButtons = seerrOnly ? seerrOnlyRow(offered) : offered;
	const customizable = arrange(
		rowButtons.filter((btn) => btn.when),
		{order: settings[DETAIL_ORDER_KEY], hidden: settings[DETAIL_HIDDEN_KEY]}
	);

	return (
		<HorizontalContainer className={css.actionButtons} onKeyDown={handleButtonRowKeyDown} onFocus={onFocusRow} spotlightId="details-action-buttons">
			{!seerrOnly && !isBook && hasPlaybackPosition && (
				<SpottableDiv className={css.btnWrapper} {...resumeLongPress} spotlightId="details-primary-btn">
					<div className={css.btnAction}>
						<span className={css.btnIcon}>▶</span>
					</div>
					<span className={css.btnLabel}>{$L('Resume')}</span>
					<span className={css.btnDetail}>{resumeTimeText}</span>
				</SpottableDiv>
			)}
			{!seerrOnly && (isBook ? isReadableBook : true) && (
				<SpottableDiv className={css.btnWrapper} {...playLongPress} onFocus={onFocusRow} spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}>
					<div className={css.btnAction}>
						{hasPlaybackPosition && !isBook ? (
							<BtnIcon path={DETAIL_ICON_PATHS.restart}/>
						) : isBook ? (
							<BtnIcon path={DETAIL_ICON_PATHS.book}/>
						) : (
							<span className={css.btnIcon}>▶</span>
						)}
					</div>
					<span className={css.btnLabel}>{isBook ? $L('Read') : hasPlaybackPosition ? $L('Restart') : $L('Play')}</span>
				</SpottableDiv>
			)}
			{customizable.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
		</HorizontalContainer>
	);
};

export default DetailActionButtons;
