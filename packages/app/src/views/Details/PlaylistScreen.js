import {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import PropTypes from 'prop-types';
import $L from '@enact/i18n/$L';

import useItemMenuHold, {itemWithIdAt} from '../../hooks/useItemMenuHold';
import {formatDuration, getImageUrl} from '../../utils/helpers';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {handleSeasonButtonKeyDown} from './detailsFocus';
import {PosterBadges} from './DetailBadges';
import PlaylistSortFilterBar, {EmptyPlaylistFilterState, EmptyPlaylistState} from '../../components/PlaylistSortFilterBar';
import {
	sortAndFilterPlaylistTracks,
	PLAYLIST_SORT_ORDER,
	PLAYLIST_SORT_RANDOM,
	SORT_DIR_ASC,
	PLAYED_ALL
} from '../../utils/playlistSortFilter';

import css from './Details.module.less';

const PlaylistScreen = ({
	item,
	serverUrl,
	showsSection,
	posterUrl,
	genres,
	playlistItems = [],
	onPlay,
	onShuffle,
	onToggleFavorite,
	onItemSelect,
	onItemKeyDown,
	onFocusRow,
	playlistMenu,
	spotlightBackRef
}) => {
	const sortFilterBackRef = useRef(null);
	useEffect(() => {
		if (!spotlightBackRef) return undefined;
		const handler = () => Boolean(sortFilterBackRef.current?.());
		spotlightBackRef.current = handler;
		return () => {
			if (spotlightBackRef.current === handler) spotlightBackRef.current = null;
		};
	}, [spotlightBackRef]);

	const [sortBy, setSortBy] = useState(PLAYLIST_SORT_ORDER);
	const [sortDirection, setSortDirection] = useState(SORT_DIR_ASC);
	const [playedFilter, setPlayedFilter] = useState(PLAYED_ALL);
	const [favoriteOnly, setFavoriteOnly] = useState(false);
	const [mediaTypeFilter, setMediaTypeFilter] = useState(null);
	const [randomSeed, setRandomSeed] = useState(42);

	const availableMediaTypes = useMemo(() => {
		const set = new Set();
		playlistItems.forEach((t) => {
			const type = t.MediaType || t.Type;
			if (type) set.add(type);
		});
		return Array.from(set);
	}, [playlistItems]);

	const displayedTracks = useMemo(() => sortAndFilterPlaylistTracks({
		tracks: playlistItems,
		sortBy,
		sortDirection,
		playedFilter,
		favoriteOnly,
		mediaTypeFilter,
		randomSeed
	}), [playlistItems, sortBy, sortDirection, playedFilter, favoriteOnly, mediaTypeFilter, randomSeed]);

	const isDefaultOrder = sortBy === PLAYLIST_SORT_ORDER &&
		sortDirection === SORT_DIR_ASC &&
		playedFilter === PLAYED_ALL &&
		!favoriteOnly &&
		(!mediaTypeFilter || mediaTypeFilter === 'all');

	const handleSortChange = useCallback((newSort, newDir) => {
		setSortBy(newSort);
		setSortDirection(newDir);
		if (newSort === PLAYLIST_SORT_RANDOM) {
			setRandomSeed(Date.now());
		}
	}, []);

	const handleFilterChange = useCallback(({playedFilter: pf, favoriteOnly: fo, mediaTypeFilter: mtf}) => {
		if (pf !== undefined) setPlayedFilter(pf);
		if (fo !== undefined) setFavoriteOnly(fo);
		if (mtf !== undefined) setMediaTypeFilter(mtf);
	}, []);

	const handleReset = useCallback(() => {
		setSortBy(PLAYLIST_SORT_ORDER);
		setSortDirection(SORT_DIR_ASC);
		setPlayedFilter(PLAYED_ALL);
		setFavoriteOnly(false);
		setMediaTypeFilter(null);
		setRandomSeed(Date.now());
	}, []);

	const handlePlayClick = useCallback(() => {
		if (displayedTracks.length > 0) {
			onPlay?.(displayedTracks[0], displayedTracks);
		}
	}, [displayedTracks, onPlay]);

	const handleShuffleClick = useCallback(() => {
		if (displayedTracks.length > 1) {
			onShuffle?.(displayedTracks);
		}
	}, [displayedTracks, onShuffle]);

	const handleItemClick = useCallback((ev) => {
		const card = ev.currentTarget;
		const idxStr = card?.getAttribute?.('data-index');
		const idx = idxStr != null ? parseInt(idxStr, 10) : -1;
		const track = (idx >= 0 && idx < displayedTracks.length)
			? displayedTracks[idx]
			: displayedTracks.find((t) => (t.PlaylistItemId || t.Id) === card?.dataset?.playlistItemId);
		if (track) {
			if (onItemSelect) {
				onItemSelect(ev, track, displayedTracks);
			} else {
				onPlay?.(track, displayedTracks);
			}
		}
	}, [displayedTracks, onItemSelect, onPlay]);

	const playlistItemCount = displayedTracks.length;
	// Holding OK on a row opens its menu.
	const rowAt = useCallback((target) => {
		const card = target.closest('[data-index]');
		const idx = card ? parseInt(card.getAttribute('data-index'), 10) : -1;
		if (idx >= 0 && idx < displayedTracks.length) return displayedTracks[idx];
		return itemWithIdAt(displayedTracks, 'data-playlist-item-id', target);
	}, [displayedTracks]);
	const menuHold = useItemMenuHold(rowAt, playlistMenu);
	const totalDuration = displayedTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);

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
					<h1 className={css.seasonDetailTitle}>{item.Name}</h1>
					<span className={css.seasonDetailCount}>
						{playlistItemCount} {playlistItemCount !== 1 ? $L('Items') : $L('Item')}
						{totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
					</span>
					{genres.length > 0 && (
						<span className={css.seasonDetailCount}>{genres.join(', ')}</span>
					)}
					{item.Overview && <p className={css.overview}>{item.Overview}</p>}
				</div>
			</div>

			<HorizontalContainer className={css.actionButtons} onKeyDown={handleSeasonButtonKeyDown} onFocus={onFocusRow}>
				{displayedTracks.length > 0 && (
					<SpottableDiv className={css.btnWrapper} onClick={handlePlayClick} onFocus={onFocusRow} spotlightId="details-primary-btn">
						<div className={css.btnAction}>
							<span className={css.btnIcon}>▶</span>
						</div>
						<span className={css.btnLabel}>{$L('Play')}</span>
					</SpottableDiv>
				)}
				{displayedTracks.length > 1 && (
					<SpottableDiv className={css.btnWrapper} onClick={handleShuffleClick}>
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

			<PlaylistSortFilterBar
				sortBy={sortBy}
				sortDirection={sortDirection}
				onSortChange={handleSortChange}
				playedFilter={playedFilter}
				favoriteOnly={favoriteOnly}
				mediaTypeFilter={mediaTypeFilter}
				availableMediaTypes={availableMediaTypes}
				onFilterChange={handleFilterChange}
				onReset={handleReset}
				backHandlerRef={sortFilterBackRef}
			/>

			{isDefaultOrder && displayedTracks.length > 0 && (
				<p className={css.playlistHint}>{$L('◀ ▶ to re-order · DEL to remove')}</p>
			)}

			{playlistItems.length === 0 ? (
				<EmptyPlaylistState />
			) : displayedTracks.length === 0 ? (
				<EmptyPlaylistFilterState onReset={handleReset} />
			) : (
				<div className={`${css.trackList} ${css.playlistItemsList}`} onKeyDown={isDefaultOrder ? onItemKeyDown : undefined} {...menuHold}>
					{displayedTracks.map((plItem, idx) => {
						const plDuration = plItem.RunTimeTicks ? formatDuration(plItem.RunTimeTicks) : '';
						const plArtist = plItem.AlbumArtist || plItem.Artists?.[0] || '';
						const isAudio = plItem.MediaType === 'Audio';
						const thumbUrl = plItem.ImageTags?.Primary
							? getImageUrl(serverUrl, plItem.Id, 'Primary', {maxHeight: 80, quality: 80})
							: null;

						return (
							<SpottableDiv
								key={plItem.PlaylistItemId || plItem.Id}
								className={css.playlistItem}
								data-playlist-item-id={plItem.Id}
								data-playlist-index={idx}
								data-index={idx}
								onClick={handleItemClick}
							>
								<span className={css.trackNumber}>{idx + 1}</span>
								{thumbUrl && (
									<div className={css.playlistItemThumb}>
										<img src={thumbUrl} alt="" />
									</div>
								)}
								<div className={css.trackInfo}>
									<span className={css.trackTitle}>{plItem.Name}</span>
									{plArtist && <span className={css.trackArtist}>{plArtist}</span>}
									{!isAudio && plItem.Type && <span className={css.trackArtist}>{plItem.Type}</span>}
								</div>
								<span className={css.trackDuration}>{plDuration}</span>
								{isDefaultOrder && (
									<div className={css.playlistReorderArrows}>
										<span className={`${css.reorderArrow} ${idx === 0 ? css.reorderArrowDisabled : ''}`}>▲</span>
										<span className={`${css.reorderArrow} ${idx === displayedTracks.length - 1 ? css.reorderArrowDisabled : ''}`}>▼</span>
									</div>
								)}
							</SpottableDiv>
						);
					})}
				</div>
			)}
		</>
	);
};

PlaylistScreen.propTypes = {
	genres: PropTypes.arrayOf(PropTypes.string),
	item: PropTypes.object.isRequired,
	onFocusRow: PropTypes.func,
	onItemKeyDown: PropTypes.func,
	onItemSelect: PropTypes.func,
	onPlay: PropTypes.func,
	onShuffle: PropTypes.func,
	onToggleFavorite: PropTypes.func,
	playlistItems: PropTypes.arrayOf(PropTypes.object),
	playlistMenu: PropTypes.object,
	posterUrl: PropTypes.string,
	serverUrl: PropTypes.string,
	showsSection: PropTypes.func.isRequired,
	spotlightBackRef: PropTypes.oneOfType([
		PropTypes.func,
		PropTypes.shape({current: PropTypes.any})
	])
};

export default PlaylistScreen;
