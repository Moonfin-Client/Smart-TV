import $L from '@enact/i18n/$L';

import {DETAIL_ICON_PATHS} from '../../views/Details/detailIcons';

// The long press menu on a card: what can be done to that one item without opening it. Which
// entries show depends on the item's type and on what the signed in user may do.

const MEDIA_TYPES = ['Movie', 'Episode', 'Series', 'Season', 'Audio', 'MusicAlbum', 'BoxSet'];

// The types the server can look up by name, where Identify has anything to search. Episodes and
// seasons qualify because Identify goes to their series.
const IDENTIFIABLE_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'BoxSet', 'Person', 'MusicAlbum', 'MusicArtist', 'Book', 'Trailer', 'MusicVideo'];

const ARTWORK_FOLDER_TYPES = ['Folder', 'CollectionFolder', 'UserView', 'Genre', 'MusicGenre', 'Studio', 'Network'];

export const MENU_ICON_PATHS = {
	visibility: 'M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z',
	visibilityOff: 'm644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z',
	favoriteBorder: 'm480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z',
	playlistRemove: 'M576-280l-56-56 104-104-104-104 56-56 104 104 104-104 56 56-104 104 104 104-56 56-104-104-104 104ZM120-360v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Z',
	info: 'M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z',
	arrowUpward: 'M450-160v-526L202-438l-42-42 320-320 320 320-42 42-248-248v526h-60Z',
	arrowDownward: 'M450-800v526L202-522l-42 42 320 320 320-320-42-42-248 248v-526h-60Z',
	refresh: 'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z',
	search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T220-580q0 75 52.5 127.5T380-400Z'
};

// A series has no position of its own, so it counts as under way once some of it is watched and
// some isn't. Anything else goes by its resume point.
const hasProgress = (item) => {
	const userData = item.UserData || {};
	if (item.Type === 'Series') {
		const total = item.RecursiveItemCount || 0;
		const unplayed = userData.UnplayedItemCount ?? total;
		return !userData.Played && unplayed > 0 && unplayed < total;
	}
	return (userData.PlayedPercentage || 0) > 0 || (userData.PlaybackPositionTicks || 0) > 0;
};

// `playlist` is set when the menu opened on a row of a playlist: `canManage` adds the entries
// that change the playlist, `canMove` is false while the rows show some other order, and
// `first` and `last` say which way the row can still move.
export const itemMenuActions = (item, {
	isAdmin = false,
	isJellyfin = true,
	canManageCollections = false,
	inCollection = false,
	playlist = null,
	isContinueWatchingOrNextUp = false,
	playImmediately = false
} = {}) => {
	if (!item) return [];
	const type = item.Type;
	const userData = item.UserData || {};
	const played = Boolean(userData.Played);
	const hasSeries = Boolean(item.SeriesId);
	const actions = [];

	if (MEDIA_TYPES.indexOf(type) !== -1) {
		if (isContinueWatchingOrNextUp && playImmediately) {
			if (type !== 'Audio') {
				actions.push({id: 'viewDetails', icon: MENU_ICON_PATHS.info, label: $L('Go to Details')});
			}
		} else {
			actions.push({id: 'play', icon: DETAIL_ICON_PATHS.play, label: hasProgress(item) ? $L('Resume') : $L('Play')});
			// A press on a playlist row plays from there, so opening the item moves in here. A song
			// has no page of its own to open.
			if (playlist && type !== 'Audio') {
				actions.push({id: 'viewDetails', icon: MENU_ICON_PATHS.info, label: $L('View Details')});
			}
		}
		actions.push({
			id: 'watched',
			icon: played ? MENU_ICON_PATHS.visibilityOff : MENU_ICON_PATHS.visibility,
			label: played ? $L('Mark as Unwatched') : $L('Mark as Watched')
		});
		if ((userData.PlaybackPositionTicks || 0) > 0 && !played) {
			actions.push({id: 'hideContinueWatching', icon: MENU_ICON_PATHS.visibilityOff, label: $L('Hide from Continue Watching')});
		}
		if (type === 'Episode' && hasSeries) {
			actions.push({id: 'hideNextUp', icon: MENU_ICON_PATHS.visibilityOff, label: $L('Hide from Next Up')});
		}
		actions.push({
			id: 'favorite',
			icon: userData.IsFavorite ? DETAIL_ICON_PATHS.favorite : MENU_ICON_PATHS.favoriteBorder,
			label: userData.IsFavorite ? $L('Remove from Favorites') : $L('Add to Favorites')
		});
		if (canManageCollections) {
			actions.push({id: 'addToCollection', icon: DETAIL_ICON_PATHS.collection, label: $L('Add to Collection')});
			// Only for the collection whose page the menu was opened from. An item can belong to
			// several, and pulling it out of one the viewer isn't looking at would be a surprise.
			if (inCollection) {
				actions.push({id: 'removeFromCollection', icon: MENU_ICON_PATHS.playlistRemove, label: $L('Remove from Collection')});
			}
		}
		actions.push({id: 'addToPlaylist', icon: DETAIL_ICON_PATHS.playlist, label: $L('Add to Playlist')});
		if (playlist?.canManage) {
			actions.push({id: 'removeFromPlaylist', icon: MENU_ICON_PATHS.playlistRemove, label: $L('Delete from Playlist')});
			const canMove = playlist.canMove !== false;
			if (canMove && !playlist.first) actions.push({id: 'moveUp', icon: MENU_ICON_PATHS.arrowUpward, label: $L('Move Up')});
			if (canMove && !playlist.last) actions.push({id: 'moveDown', icon: MENU_ICON_PATHS.arrowDownward, label: $L('Move Down')});
		}
		if (isJellyfin && isAdmin) {
			actions.push({id: 'refreshMetadata', icon: MENU_ICON_PATHS.refresh, label: $L('Refresh Metadata')});
			if (IDENTIFIABLE_TYPES.indexOf(type) !== -1) {
				actions.push({id: 'identify', icon: MENU_ICON_PATHS.search, label: $L('Identify')});
			}
		}
	}

	const artworkType = MEDIA_TYPES.indexOf(type) !== -1 || ARTWORK_FOLDER_TYPES.indexOf(type) !== -1;
	if (artworkType && isJellyfin && isAdmin) {
		actions.push({id: 'changeArtwork', icon: DETAIL_ICON_PATHS.artwork, label: $L('Change Artwork')});
	}

	if (type === 'Episode' && hasSeries) {
		actions.push({id: 'goToSeries', icon: DETAIL_ICON_PATHS.series, label: $L('Go to Series')});
	}

	return actions;
};
