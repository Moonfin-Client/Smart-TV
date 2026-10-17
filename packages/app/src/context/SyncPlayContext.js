import {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {useAuth} from './AuthContext';
import {useSettings} from './SettingsContext';
import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';

const SyncPlayContext = createContext(null);

// Queue entries carry the GUID with dashes, item DTOs without them.
export const itemIdKey = (id) => String(id || '').replace(/-/g, '').toLowerCase();
const sameItemId = (a, b) => !!a && !!b && itemIdKey(a) === itemIdKey(b);

// A reorder, a removal or a repeat/shuffle change only moves a player showing something else.
// With nothing playing, this device stays where it is, as on Core.
export const followsQueueUpdate = (update, playingItemId) =>
	update.startsPlayback || (Boolean(playingItemId) && !sameItemId(playingItemId, update.item.Id));

export const useSyncPlay = () => useContext(SyncPlayContext);

export const SyncPlayProvider = ({children}) => {
	const {isAuthenticated, serverType} = useAuth();
	const {settings} = useSettings();
	const [group, setGroup] = useState(null);
	const [groups, setGroups] = useState([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [lastCommand, setLastCommand] = useState(null);
	const [playQueue, setPlayQueue] = useState(null);
	// A fresh object per server play queue, so consumers can tell a new queue
	// apart from the same item still sitting there.
	const [playQueueUpdate, setPlayQueueUpdate] = useState(null);
	// The server never reports this back, so it follows what this device last set. Off in a new group.
	const [ignoreWait, setIgnoreWaitState] = useState(false);
	const queueSeqRef = useRef(0);
	const queueItemRef = useRef(null);
	const listenerRef = useRef(null);

	useEffect(() => {
		// Emby has no SyncPlay, and asking it for the clock or a ping only earns 404s.
		if (isAuthenticated && serverType !== 'emby' && settings.syncplayEnabled !== false) {
			syncPlayService.start();
		} else {
			syncPlayService.stop();
		}
		return () => {
			syncPlayService.stop();
		};
	}, [isAuthenticated, serverType, settings.syncplayEnabled]);

	useEffect(() => {
		if (settings.syncplayEnabled !== false) return;
		setIsDialogOpen(false);
		setGroup(null);
		setGroups([]);
		setPlayQueue(null);
		setPlayQueueUpdate(null);
	}, [settings.syncplayEnabled]);

	useEffect(() => {
		if (listenerRef.current) {
			listenerRef.current();
		}

		listenerRef.current = syncPlayService.addListener((event, data) => {
			switch (event) {
				case 'groupJoined':
					setGroup(data);
					setIgnoreWaitState(false);
					break;
				case 'groupLeft':
					setGroup(null);
					setPlayQueue(null);
					setPlayQueueUpdate(null);
					setIgnoreWaitState(false);
					break;
				case 'stateUpdate':
					setGroup(prev => prev ? {...prev, State: data?.State} : null);
					break;
				case 'groupUpdated':
					refreshGroups(); // eslint-disable-line no-use-before-define
					break;
				case 'playbackCommand':
					setLastCommand(data);
					break;
				case 'playQueue': {
					setPlayQueue(data);
					const queue = data?.Playlist;
					const index = data?.PlayingItemIndex ?? 0;
					const queueItem = queue?.length > 0 ? queue[index] : null;
					const itemId = queueItem?.ItemId || queueItem;
					if (!itemId) {
						setPlayQueueUpdate(null);
						break;
					}
					const reason = data?.Reason || null;
					const publish = (item) => {
						queueItemRef.current = item;
						setPlayQueueUpdate({
							item,
							reason,
							startsPlayback: !reason || syncPlayService.QUEUE_START_REASONS.includes(reason)
						});
					};
					// Reorders and repeat/shuffle toggles carry the same item, so
					// they don't need another round trip for it. The sequence still
					// moves on so an older fetch can't land after this.
					const seq = ++queueSeqRef.current;
					if (sameItemId(queueItemRef.current?.Id, itemId)) {
						publish(queueItemRef.current);
						break;
					}
					api.getItem(itemId).then(item => {
						// A newer queue may have landed while this one was loading.
						if (item && seq === queueSeqRef.current) publish(item);
					}).catch(() => {});
					break;
				}
				default:
					break;
			}
		});

		return () => {
			if (listenerRef.current) {
				listenerRef.current();
				listenerRef.current = null;
			}
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const refreshGroups = useCallback(async () => {
		const result = await syncPlayService.listGroups();
		setGroups(result);
		return result;
	}, []);

	// The lobby list is gone once the join lands, so neither of these waits on
	// the refresh.
	const handleCreateGroup = useCallback(async (name, itemIds) => {
		const success = await syncPlayService.createGroup(name);
		if (!success) return false;
		refreshGroups();
		// A group created from over the player starts on what is already
		// playing, otherwise it sits idle and nobody who joins gets the movie.
		if (itemIds?.length) await syncPlayService.setNewQueue(itemIds);
		return true;
	}, [refreshGroups]);

	const handleJoinGroup = useCallback(async (groupId) => {
		const success = await syncPlayService.joinGroup(groupId);
		if (success) refreshGroups();
		return success;
	}, [refreshGroups]);

	const handleLeaveGroup = useCallback(async () => {
		const success = await syncPlayService.leaveGroup();
		if (success) {
			setGroup(null);
			setPlayQueue(null);
			setPlayQueueUpdate(null);
			setIgnoreWaitState(false);
		}
		return success;
	}, []);

	const toggleIgnoreWait = useCallback(async () => {
		const enabled = !ignoreWait;
		setIgnoreWaitState(enabled);
		if (!(await syncPlayService.setIgnoreWait(enabled))) setIgnoreWaitState(!enabled);
	}, [ignoreWait]);

	// Where the group is now, from its last queue update or command and the
	// time since.
	const getGroupPositionTicks = useCallback(() => syncPlayService.getGroupPositionTicks(), []);

	// Moving on inside a group is the group's to do, as on Core. The next or previous entry goes
	// by its own request, which the server ignores once the group has already moved on.
	const moveGroupTo = useCallback((itemId) => {
		const entries = playQueue?.Playlist || [];
		const index = playQueue?.PlayingItemIndex ?? -1;
		const entry = entries.find((e) => sameItemId(e.ItemId, itemId));
		if (!entry) syncPlayService.setNewQueue([itemId]);
		else if (index >= 0 && entry === entries[index + 1]) syncPlayService.nextItem();
		else if (index > 0 && entry === entries[index - 1]) syncPlayService.previousItem();
		else syncPlayService.setPlaylistItem(entry.PlaylistItemId);
	}, [playQueue]);

	const openDialog = useCallback(() => {
		if (settings.syncplayEnabled === false) return;
		setIsDialogOpen(true);
		refreshGroups();
	}, [refreshGroups, settings.syncplayEnabled]);

	const closeDialog = useCallback(() => {
		setIsDialogOpen(false);
	}, []);

	const value = {
		group,
		groups,
		isInGroup: !!group,
		isDialogOpen,
		lastCommand,
		playQueueItem: playQueueUpdate?.item ?? null,
		playQueue,
		playQueueUpdate,
		refreshGroups,
		getGroupPositionTicks,
		moveGroupTo,
		getGroup: syncPlayService.getGroup,
		createGroup: handleCreateGroup,
		joinGroup: handleJoinGroup,
		leaveGroup: handleLeaveGroup,
		openDialog,
		closeDialog,
		sendPlay: syncPlayService.sendPlayRequest,
		sendPause: syncPlayService.sendPauseRequest,
		sendStop: syncPlayService.sendStopRequest,
		sendSeek: syncPlayService.sendSeekRequest,
		setNewQueue: syncPlayService.setNewQueue,
		setPlaylistItem: syncPlayService.setPlaylistItem,
		removeFromPlaylist: syncPlayService.removeFromPlaylist,
		movePlaylistItem: syncPlayService.movePlaylistItem,
		queueItems: syncPlayService.queueItems,
		nextItem: syncPlayService.nextItem,
		previousItem: syncPlayService.previousItem,
		setRepeatMode: syncPlayService.setRepeatMode,
		setShuffleMode: syncPlayService.setShuffleMode,
		ignoreWait,
		toggleIgnoreWait
	};

	return (
		<SyncPlayContext.Provider value={value}>
			{children}
		</SyncPlayContext.Provider>
	);
};
