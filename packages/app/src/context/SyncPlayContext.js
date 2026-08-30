import {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {useAuth} from './AuthContext';
import {useSettings} from './SettingsContext';
import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';

const SyncPlayContext = createContext(null);

// Queue entries carry the GUID with dashes, item DTOs without them.
const sameItemId = (a, b) => !!a && !!b && String(a).replace(/-/g, '').toLowerCase() === String(b).replace(/-/g, '').toLowerCase();

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
	const queueSeqRef = useRef(0);
	const queueItemRef = useRef(null);
	// The group's position as of the last play queue update, and when that
	// was, so a player opened for the group can start where the group is
	// rather than at the beginning and be seeked from there.
	const [displayMessage, setDisplayMessage] = useState(null);
	const listenerRef = useRef(null);

	useEffect(() => {
		// Emby has no SyncPlay; opening the socket just spams /SyncPlay/Ping with 404s.
		if (isAuthenticated && serverType !== 'emby' && settings.syncplayEnabled !== false) {
			syncPlayService.connectWebSocket();
		} else {
			syncPlayService.disconnectWebSocket();
		}
		return () => {
			syncPlayService.disconnectWebSocket();
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
					break;
				case 'groupLeft':
					setGroup(null);
					setPlayQueue(null);
					setPlayQueueUpdate(null);
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
				case 'displayMessage':
					setDisplayMessage(data);
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
		}
		return success;
	}, []);

	// Where the group is now, from its last queue update or command and the
	// time since.
	const getGroupPositionTicks = useCallback(() => syncPlayService.getGroupPositionTicks(), []);

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
		displayMessage,
		playQueueItem: playQueueUpdate?.item ?? null,
		playQueue,
		playQueueUpdate,
		clearDisplayMessage: useCallback(() => setDisplayMessage(null), []),
		refreshGroups,
		getGroupPositionTicks,
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
		setIgnoreWait: syncPlayService.setIgnoreWait
	};

	return (
		<SyncPlayContext.Provider value={value}>
			{children}
		</SyncPlayContext.Provider>
	);
};
