import {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {useAuth} from './AuthContext';
import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';

const SyncPlayContext = createContext(null);

export const useSyncPlay = () => useContext(SyncPlayContext);

export const SyncPlayProvider = ({children}) => {
	const {isAuthenticated} = useAuth();
	const [group, setGroup] = useState(null);
	const [groups, setGroups] = useState([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [lastCommand, setLastCommand] = useState(null);
	const [playQueueItem, setPlayQueueItem] = useState(null);
	const [playQueue, setPlayQueue] = useState(null);
	const listenerRef = useRef(null);

	useEffect(() => {
		if (isAuthenticated) {
			syncPlayService.connectWebSocket();
		}
		return () => {
			syncPlayService.disconnectWebSocket();
		};
	}, [isAuthenticated]);

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
					setPlayQueueItem(null);
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
					if (queue?.length > 0) {
						const queueItem = queue[index];
						const itemId = queueItem?.ItemId || queueItem;
						if (itemId) {
							api.getItem(itemId).then(item => {
								if (item) setPlayQueueItem(item);
							}).catch(() => {});
						}
					}
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

	const handleCreateGroup = useCallback(async (name) => {
		const success = await syncPlayService.createGroup(name);
		if (success) {
			await refreshGroups();
		}
		return success;
	}, [refreshGroups]);

	const handleJoinGroup = useCallback(async (groupId) => {
		const success = await syncPlayService.joinGroup(groupId);
		if (success) {
			await refreshGroups();
		}
		return success;
	}, [refreshGroups]);

	const handleLeaveGroup = useCallback(async () => {
		const success = await syncPlayService.leaveGroup();
		if (success) {
			setGroup(null);
			setPlayQueue(null);
			setPlayQueueItem(null);
		}
		return success;
	}, []);

	const openDialog = useCallback(() => {
		setIsDialogOpen(true);
		refreshGroups();
	}, [refreshGroups]);

	const closeDialog = useCallback(() => {
		setIsDialogOpen(false);
	}, []);

	const value = {
		group,
		groups,
		isInGroup: !!group,
		isDialogOpen,
		lastCommand,
		playQueueItem,
		playQueue,
		clearPlayQueueItem: useCallback(() => setPlayQueueItem(null), []),
		refreshGroups,
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
		sendBuffering: syncPlayService.sendBufferingRequest,
		sendReady: syncPlayService.sendReadyRequest,
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
