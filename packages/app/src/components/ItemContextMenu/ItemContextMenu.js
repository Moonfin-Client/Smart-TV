import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {getApiForItem} from '../../services/connectionPool';
import {api as activeApi, getServerType} from '../../services/jellyfinApi';
import {parseHiddenMap} from '../../views/Browse/browseFilters';
import AddToCollectionModal from '../AddToCollectionModal';
import AddToPlaylistModal from '../AddToPlaylistModal';
import ChangeArtworkModal from '../ChangeArtworkModal';
import IdentifyModal from '../IdentifyModal';
import {iconViewBox} from '../icons/iconViewBox';
import {hideFromResume, itemMenuActions} from './itemMenuActions';

import css from './ItemContextMenu.module.less';

const SpottableDiv = Spottable('div');
const MenuContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const MENU_ID = 'item-context-menu';

const ItemMenuContext = createContext(null);

export const useItemMenu = () => useContext(ItemMenuContext);

const Icon = ({path}) => (
	<svg className={css.icon} viewBox={iconViewBox(path)} aria-hidden="true"><path d={path} /></svg>
);

// A Seerr card stands for a title the server doesn't hold, so nothing here applies to it.
const fromSeerr = (item) => Boolean(item._seerr || item._seerrRaw || item._seerrCredit) ||
	String(item.Id || '').indexOf('seerr-') === 0;

const hiddenMapWith = (stored, id) => JSON.stringify({...parseHiddenMap(stored), [id]: new Date().toISOString()});

// A request the server turned down names its status, and anything else says what went wrong.
const describeError = (err) => {
	const status = err?.status;
	if (status === 401) return 'Unauthorized';
	if (status === 403) return 'Forbidden';
	if (status === 404) return 'Not found';
	if (status) return `HTTP ${status}`;
	return err?.message || 'HTTP error';
};

// The series behind an episode or season, carrying the server it came from so it opens there.
const seriesOf = (item) => {
	const series = {Id: item.SeriesId, Type: 'Series', Name: item.SeriesName};
	['_serverUrl', '_serverAccessToken', '_serverUserId', '_serverName', '_serverId', '_serverType'].forEach((key) => {
		if (item[key]) series[key] = item[key];
	});
	return series;
};

// Holds the long press menu for every card in the app, along with the dialogs its entries open.
// A card asks for it through useItemMenu. `backRef` is how the app's back key reaches whatever
// is open here before it reaches the screen underneath.
export const ItemMenuProvider = ({children, onPlay, onOpenItem, backRef}) => {
	const {user, serverUrl} = useAuth();
	const {settings, updateSetting, updateSettings} = useSettings();
	const [menu, setMenu] = useState(null);
	const [dialog, setDialog] = useState(null);
	const [toast, setToast] = useState(null);
	const returnFocusRef = useRef(null);
	const artworkBackRef = useRef(null);

	const actionsFor = useCallback((item, options) => {
		if (!item || fromSeerr(item)) return [];
		const isJellyfin = (item._serverType || getServerType()) === 'jellyfin';
		const isAdmin = Boolean(user?.Policy?.IsAdministrator);
		// Jellyfin only lets a user touch collections on their own server with the permission for
		// it. An item from another server is left to that server to refuse.
		const sameServer = !item._serverUrl || item._serverUrl === serverUrl;
		const canManageCollections = !(getServerType() === 'jellyfin' && sameServer) ||
			Boolean(user?.Policy?.EnableCollectionManagement) || isAdmin;
		const playlist = options?.playlist;
		return itemMenuActions(item, {
			isAdmin,
			isJellyfin,
			canManageCollections,
			inCollection: Boolean(options?.collectionRemoval),
			playlist: playlist ? {canManage: playlist.canManage, canRemove: playlist.canRemove, canMove: playlist.canMove, ...playlist.positionOf(item)} : null,
			isContinueWatchingOrNextUp: Boolean(options?.isContinueWatchingOrNextUp),
			playImmediately: Boolean(options?.playImmediately)
		});
	}, [user, serverUrl]);

	const restoreFocus = useCallback(() => {
		const node = returnFocusRef.current;
		if (node && document.body.contains(node)) Spotlight.focus(node);
	}, []);

	const showToast = useCallback((message) => setToast({message, key: Date.now()}), []);
	const clearToast = useCallback(() => setToast(null), []);

	const closeDialog = useCallback(() => {
		setDialog(null);
		restoreFocus();
	}, [restoreFocus]);

	const open = useCallback((item, options) => {
		const actions = actionsFor(item, options);
		if (!actions.length) return;
		returnFocusRef.current = Spotlight.getCurrent();
		setMenu({item, actions, collectionRemoval: options?.collectionRemoval || null, playlist: options?.playlist || null});
	}, [actionsFor]);

	const canOpen = useCallback((item, options) => actionsFor(item, options).length > 0, [actionsFor]);

	useEffect(() => {
		if (menu) Spotlight.focus(MENU_ID);
	}, [menu]);

	useEffect(() => {
		if (dialog?.kind === 'removeConfirm') Spotlight.focus(`${MENU_ID}-confirm`);
	}, [dialog]);

	const run = useCallback(async (id, item, collectionRemoval, playlist) => {
		const api = getApiForItem(item) || activeApi;
		const userData = item.UserData || {};
		switch (id) {
			// From a playlist row, Play means the playlist from that row on.
			case 'play':
				if (playlist) playlist.play(item);
				else onPlay(item);
				break;
			case 'viewDetails':
				onOpenItem(item);
				break;
			case 'watched':
				await api.setWatched(item.Id, !userData.Played).catch(() => {});
				break;
			case 'hideContinueWatching':
				updateSetting('hiddenContinueWatchingItems', hiddenMapWith(settings.hiddenContinueWatchingItems, item.SeriesId || item.Id));
				await hideFromResume(api, item, item._serverType || getServerType());
				break;
			case 'hideNextUp':
				updateSettings({
					hiddenNextUpSeries: hiddenMapWith(settings.hiddenNextUpSeries, item.SeriesId),
					hiddenContinueWatchingItems: hiddenMapWith(settings.hiddenContinueWatchingItems, item.SeriesId)
				});
				await hideFromResume(api, item, item._serverType || getServerType());
				break;
			case 'favorite':
				await api.setFavorite(item.Id, !userData.IsFavorite).catch(() => {});
				break;
			case 'addToCollection':
				setDialog({kind: 'collection', item, api});
				break;
			case 'removeFromCollection':
				setDialog({kind: 'removeConfirm', item, collectionRemoval});
				break;
			case 'addToPlaylist':
				setDialog({kind: 'playlist', item, api});
				break;
			case 'removeFromPlaylist':
				playlist.remove(item);
				break;
			case 'moveUp':
				playlist.move(item, -1);
				break;
			case 'moveDown':
				playlist.move(item, 1);
				break;
			case 'refreshMetadata':
				try {
					await api.refreshItem(item.Id);
					showToast($L('Metadata refresh requested'));
				} catch (err) {
					showToast($L('Failed to refresh metadata: {error}').replace('{error}', describeError(err)));
				}
				break;
			// Identify matches a whole show, so an episode or a season hands over its series.
			case 'identify': {
				const tvChild = (item.Type === 'Episode' || item.Type === 'Season') && item.SeriesId;
				setDialog({kind: 'identify', item: tvChild ? {...seriesOf(item), ProductionYear: null} : item, api});
				break;
			}
			case 'changeArtwork':
				setDialog({kind: 'artwork', item, api});
				break;
			case 'goToSeries':
				onOpenItem(seriesOf(item));
				break;
			default:
				break;
		}
	}, [onPlay, onOpenItem, settings.hiddenContinueWatchingItems, settings.hiddenNextUpSeries, updateSetting, updateSettings, showToast]);

	const handleSelect = useCallback((ev) => {
		const id = ev.currentTarget.dataset.action;
		const {item, collectionRemoval, playlist} = menu;
		setMenu(null);
		restoreFocus();
		run(id, item, collectionRemoval, playlist);
	}, [menu, restoreFocus, run]);

	const closeMenu = useCallback(() => {
		setMenu(null);
		restoreFocus();
	}, [restoreFocus]);

	// A pointer clicking beside the menu means never mind, the same as back.
	const handleScrimClick = useCallback((ev) => {
		if (ev.target === ev.currentTarget) closeMenu();
	}, [closeMenu]);

	const confirmRemoval = useCallback(async () => {
		const {item, collectionRemoval} = dialog;
		closeDialog();
		try {
			await collectionRemoval.remove(item);
		} catch (err) {
			showToast(`${$L('Failed to remove from collection')}: ${describeError(err)}`);
		}
	}, [dialog, closeDialog, showToast]);

	useEffect(() => {
		if (!backRef) return undefined;
		backRef.current = () => {
			if (dialog?.kind === 'artwork' && artworkBackRef.current?.()) return true;
			if (dialog) {
				closeDialog();
				return true;
			}
			if (menu) {
				closeMenu();
				return true;
			}
			return false;
		};
		return () => {
			backRef.current = null;
		};
	}, [backRef, dialog, menu, closeDialog, closeMenu]);

	const value = useMemo(() => ({open, canOpen}), [open, canOpen]);

	return (
		<ItemMenuContext.Provider value={value}>
			{children}
			{menu && (
				<div className={css.scrim} onClick={handleScrimClick}>
					<MenuContainer className={css.panel} spotlightId={MENU_ID}>
						{menu.item.Name && <div className={css.title}>{menu.item.Name}</div>}
						{menu.actions.map((action, index) => (
							<SpottableDiv
								key={action.id}
								className={index === 0 ? `${css.row} spottable-default` : css.row}
								data-action={action.id}
								onClick={handleSelect}
							>
								<Icon path={action.icon} />
								<span className={css.label}>{action.label}</span>
							</SpottableDiv>
						))}
					</MenuContainer>
				</div>
			)}
			{dialog?.kind === 'removeConfirm' && (
				<div className={css.scrim}>
					<MenuContainer className={`${css.panel} ${css.confirm}`} spotlightId={`${MENU_ID}-confirm`}>
						<div className={css.title}>{$L('Remove from Collection')}</div>
						<div className={css.message}>
							{$L('Remove {item} from {collection}? The item stays in your library.')
								.replace('{item}', dialog.item.Name || '')
								.replace('{collection}', dialog.collectionRemoval.collectionName || '')}
						</div>
						<div className={css.buttons}>
							<SpottableDiv className={`${css.button} spottable-default`} onClick={closeDialog}>{$L('Cancel')}</SpottableDiv>
							<SpottableDiv className={`${css.button} ${css.buttonStrong}`} onClick={confirmRemoval}>{$L('Remove')}</SpottableDiv>
						</div>
					</MenuContainer>
				</div>
			)}
			<AddToPlaylistModal
				open={dialog?.kind === 'playlist'}
				itemId={dialog?.item?.Id}
				api={dialog?.api}
				onClose={closeDialog}
				onSuccess={showToast}
			/>
			<AddToCollectionModal
				open={dialog?.kind === 'collection'}
				itemId={dialog?.item?.Id}
				api={dialog?.api}
				onClose={closeDialog}
				onSuccess={showToast}
			/>
			<IdentifyModal
				open={dialog?.kind === 'identify'}
				item={dialog?.item}
				api={dialog?.api}
				onClose={closeDialog}
				onSuccess={showToast}
			/>
			<ChangeArtworkModal
				open={dialog?.kind === 'artwork'}
				item={dialog?.item}
				api={dialog?.api}
				serverUrl={dialog?.item?._serverUrl || serverUrl}
				onClose={closeDialog}
				onSuccess={showToast}
				backHandlerRef={artworkBackRef}
			/>
			{toast && <div key={toast.key} className={css.toast} onAnimationEnd={clearToast}>{toast.message}</div>}
		</ItemMenuContext.Provider>
	);
};
