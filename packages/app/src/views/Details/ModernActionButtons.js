import {Fragment, useState, useCallback, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {arrange, seerrOnlyRow, countSplit, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY} from '../../utils/buttonLayout';
import {KEYS} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import {personalRatingIconPath, personalRatingLabel} from './personalRatingAction';
import {SpottableDiv, RowContainer} from './detailsSpottables';

import css from './ModernDetailContent.module.less';

const Icon = ({path}) => (
	<svg className={css.icon} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

// A circular icon button that expands into a labeled pill when focused.
export const ActionButton = ({path, label, detail, onClick, active, group, primary, spotlightId}) => (
	<SpottableDiv
		className={`${css.actionBtn} ${primary ? css.actionPrimary : ''} ${active ? css.actionActive : ''} ${group ? css.actionGroup : ''}`}
		onClick={onClick}
		spotlightId={spotlightId}
	>
		<span className={css.actionIcon}><Icon path={path} /></span>
		<span className={css.actionText}>
			<span className={css.actionLabel}>{label}</span>
			{detail && <span className={css.actionDetail}>{detail}</span>}
		</span>
	</SpottableDiv>
);

const MenuContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// The action row shared by the Modern and Spotlight detail screens. Play and Resume always
// lead it, and everything after them is in whatever order the viewer arranged in settings,
// with anything they hid left out.
//
// `maxVisibleButtons` caps the row and folds the rest behind an ellipsis. Modern leaves it
// off and shows every button inline, which is what it has always done.
const ModernActionButtons = (props) => {
	const {
		item, settings, seerr, seerrOnly,
		isSeries, isSeason, isBoxSet, isEpisode, isBook, isReadableBook,
		hasPlaybackPosition, resumeTimeText, hasTech, hasTrailer, played, isFavorite,
		inSyncPlayGroup, onWatchWithGroup,
		supportsMediaSourceSelection, hasMultipleVersions, hasMultipleAudio,
		handlePlay, handleResume, handleShuffle, handleTrailer, handleToggleWatched, handleToggleFavorite, handleGoToSeries,
		showsPersonalRating, personalRatingStyle, handleOpenRatingDialog,
		handleOpenVersionModal, handleOpenAudioModal, handleOpenSubtitleModal, handleOpenPlaylistModal,
		handleOpenCollectionModal, handleOpenDeleteDialog, handleOpenIdentifyModal,
		canChangeArtwork, handleOpenArtworkModal,
		onFocusRow, downTarget, maxVisibleButtons, overflowAsMenu, menuBackRef
	} = props;

	const [menuOpen, setMenuOpen] = useState(false);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
		setTimeout(() => Spotlight.focus('details-action-buttons'), 50);
	}, []);

	const handleOpenMenu = useCallback(() => {
		setMenuOpen(true);
		setTimeout(() => Spotlight.focus('details-overflow-menu'), 50);
	}, []);

	// App closes the screen on BACK unless something says it took the press, so the open menu
	// answers through the ref the host owns.
	useEffect(() => {
		if (!menuBackRef) return undefined;
		menuBackRef.current = () => {
			if (!menuOpen) return false;
			closeMenu();
			return true;
		};
		return () => {
			menuBackRef.current = null;
		};
	});

	const handleKeyDown = useCallback((ev) => {
		if (ev.keyCode === KEYS.DOWN) {
			// Down moves to whatever sits under the row, which 5-way does not reach on its own.
			if (downTarget && Spotlight.focus(downTarget)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		if (ev.keyCode !== KEYS.LEFT && ev.keyCode !== KEYS.RIGHT) return;
		const buttons = Array.from(ev.currentTarget.querySelectorAll(`.${css.actionBtn}`));
		const idx = buttons.indexOf(document.activeElement);
		if (idx === -1) return;
		const atLeftEdge = ev.keyCode === KEYS.LEFT && idx === 0;
		const atRightEdge = ev.keyCode === KEYS.RIGHT && idx === buttons.length - 1;
		if (atLeftEdge && settings.navbarPosition === 'left') {
			if (Spotlight.focus('navbar')) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		// The next up card sits beside the row with nothing else near it, so the end of the
		// row is the way across. An edge that leads nowhere stays put rather than letting
		// focus leak out of the row.
		if (atRightEdge && Spotlight.focus('details-up-next')) {
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}
		if (atLeftEdge || atRightEdge) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, [settings.navbarPosition, downTarget]);

	// Asking and taking back are separate buttons sharing one arrangement
	// slot, so a partly available series with an open request offers both at
	// once.
	const offered = [
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
		{id: 'shuffle', when: isSeries || isSeason || isBoxSet, render: () => <ActionButton path={DETAIL_ICON_PATHS.shuffle} label={$L('Shuffle')} onClick={handleShuffle} />},
		{id: 'version', when: hasMultipleVersions, render: () => <ActionButton path={DETAIL_ICON_PATHS.version} label={$L('Version')} onClick={handleOpenVersionModal} />},
		{id: 'audio', when: hasMultipleAudio, render: () => <ActionButton path={DETAIL_ICON_PATHS.audio} label={$L('Audio')} onClick={handleOpenAudioModal} />},
		{id: 'subtitles', when: supportsMediaSourceSelection, render: () => <ActionButton path={DETAIL_ICON_PATHS.subtitle} label={$L('Subtitle')} onClick={handleOpenSubtitleModal} />},
		{id: 'trailer', when: hasTrailer, render: () => <ActionButton path={DETAIL_ICON_PATHS.trailer} label={$L('Trailer')} onClick={handleTrailer} />},
		// Offered while in a SyncPlay group and lit in the accent so it reads
		// as the group's, next to a Play that stays as it is.
		{id: 'watchWithGroup', when: inSyncPlayGroup && !isBook, render: () => <ActionButton path={DETAIL_ICON_PATHS.group} label={$L('Watch with group')} group onClick={onWatchWithGroup} spotlightId="details-watch-with-group-btn" />},
		{id: 'watched', when: true, render: () => <ActionButton path={DETAIL_ICON_PATHS.watched} label={played ? $L('Watched') : $L('Mark as Watched')} active={played} onClick={handleToggleWatched} spotlightId="details-watched-btn" />},
		{id: 'favorite', when: true, render: () => <ActionButton path={DETAIL_ICON_PATHS.favorite} label={isFavorite ? $L('Favorited') : $L('Favorite')} active={isFavorite} onClick={handleToggleFavorite} spotlightId="details-favorite-btn" />},
		{id: 'personalRating', when: showsPersonalRating, render: () => <ActionButton path={personalRatingIconPath(personalRatingStyle, item.UserData)} label={personalRatingLabel(personalRatingStyle, item.UserData)} onClick={handleOpenRatingDialog} spotlightId="details-rating-btn" />},
		{id: 'goToSeries', when: isEpisode && item.SeriesId, render: () => <ActionButton path={DETAIL_ICON_PATHS.series} label={$L('Series')} onClick={handleGoToSeries} />},
		{id: 'playlist', when: true, render: () => <ActionButton path={DETAIL_ICON_PATHS.playlist} label={$L('Add to Playlist')} onClick={handleOpenPlaylistModal} />},
		{id: 'collection', when: Boolean(handleOpenCollectionModal), render: () => <ActionButton path={DETAIL_ICON_PATHS.collection} label={$L('Add to Collection')} onClick={handleOpenCollectionModal} />},
		{id: 'deleteFiles', when: item.CanDelete, render: () => <ActionButton path={DETAIL_ICON_PATHS.delete} label={$L('Delete')} onClick={handleOpenDeleteDialog} />},
		{id: 'artwork', when: canChangeArtwork, render: () => <ActionButton path={DETAIL_ICON_PATHS.artwork} label={$L('Change Artwork')} onClick={handleOpenArtworkModal} spotlightId="details-artwork-btn" />},
		{id: 'seerrWatchlist', when: seerr.showsWatchlist, render: () => <ActionButton path={seerr.onWatchlist ? DETAIL_ICON_PATHS.watchlistOn : DETAIL_ICON_PATHS.watchlist} label={seerr.onWatchlist ? $L('On Watchlist') : $L('Add to Watchlist')} active={seerr.onWatchlist} onClick={seerr.toggleWatchlist} />},
		{id: 'seerrReportIssue', when: seerr.showsReportIssue, render: () => <ActionButton path={DETAIL_ICON_PATHS.reportIssue} label={$L('Report Issue')} onClick={seerr.handleReportIssueClick} />},
		{id: 'seerrManage', when: seerr.showsManage, render: () => <ActionButton path={DETAIL_ICON_PATHS.manageRequests} label={$L('Manage Requests')} onClick={seerr.handleManageRequestsClick} />},
		{id: 'admin', when: Boolean(handleOpenIdentifyModal), render: () => <ActionButton path={DETAIL_ICON_PATHS.admin} label={$L('Admin Controls')} onClick={handleOpenIdentifyModal} />}
	];
	const rowButtons = seerrOnly ? seerrOnlyRow(offered) : offered;
	const customizable = arrange(
		rowButtons.filter((btn) => btn.when),
		{order: settings[DETAIL_ORDER_KEY], hidden: settings[DETAIL_HIDDEN_KEY]}
	);

	// Resume and Restart both lead the row when there is somewhere to resume from, so the
	// leading slots are counted rather than assumed to be one.
	const showsResume = !seerrOnly && hasPlaybackPosition && !isBook;
	const showsPlay = !seerrOnly && (isBook ? isReadableBook : true);
	const leading = (showsResume ? 1 : 0) + (showsPlay ? 1 : 0);
	const {visibleCount, needsOverflow} = countSplit({
		totalButtons: leading + customizable.length,
		maxVisible: maxVisibleButtons || 0,
		overflowAsMenu,
		countCapped: Boolean(maxVisibleButtons)
	});
	const inline = needsOverflow ? customizable.slice(0, Math.max(0, visibleCount - leading)) : customizable;
	const behindMenu = needsOverflow ? customizable.slice(Math.max(0, visibleCount - leading)) : [];

	return (
		<>
			<RowContainer className={`${css.actions} ${hasTech ? css.actionsTight : ''}`} spotlightId="details-action-buttons" onFocus={onFocusRow} onKeyDown={handleKeyDown}>
				{showsResume && (
					<ActionButton primary path={DETAIL_ICON_PATHS.play} label={$L('Resume')} detail={resumeTimeText} onClick={handleResume} spotlightId="details-primary-btn" />
				)}
				{showsPlay && (
					<ActionButton
						primary={!hasPlaybackPosition}
						path={isBook ? DETAIL_ICON_PATHS.book : hasPlaybackPosition ? DETAIL_ICON_PATHS.restart : DETAIL_ICON_PATHS.play}
						label={isBook ? $L('Read') : hasPlaybackPosition ? $L('Restart') : $L('Play')}
						onClick={handlePlay}
						spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}
					/>
				)}
				{inline.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
				{behindMenu.length > 0 && (
					<ActionButton path={DETAIL_ICON_PATHS.moreHoriz} label={$L('More actions')} onClick={handleOpenMenu} />
				)}
			</RowContainer>
			{menuOpen && (
				<div className={css.overflowMenu}>
					<MenuContainer className={css.overflowPanel} spotlightId="details-overflow-menu">
						<div className={css.overflowTitle}>{$L('More Actions')}</div>
						<div className={css.overflowList}>
							{behindMenu.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
						</div>
					</MenuContainer>
				</div>
			)}
		</>
	);
};

export default ModernActionButtons;
