import {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {useAuth} from './AuthContext';
import {useSettings} from './SettingsContext';
import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';

const SyncPlayContext = createContext(null);

export const useSyncPlay = () => useContext(SyncPlayContext);

export const SyncPlayProvider = ({children}) => {
	const {isAuthenticated, serverType} = useAuth();
	const {settings} = useSettings();
	const [group, setGroup] = useState(null);
	const [groups, setGroups] = useState([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [lastCommand, setLastCommand] = useState(null);
	const [playQueueItem, setPlayQueueItem] = useState(null);
	const [playQueue, setPlayQueue] = useState(null);
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
		setPlayQueueItem(null);
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
				case 'displayMessage':
					setDisplayMessage(data);
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
		playQueueItem,
		playQueue,
		clearDisplayMessage: useCallback(() => setDisplayMessage(null), []),
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
