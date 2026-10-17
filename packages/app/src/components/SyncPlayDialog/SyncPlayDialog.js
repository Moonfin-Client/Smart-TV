import {memo, useCallback, useEffect, useState, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {itemIdKey, useSyncPlay} from '../../context/SyncPlayContext';
import {api} from '../../services/jellyfinApi';
import {MENU_ICON_PATHS} from '../ItemContextMenu/itemMenuActions';
import {isBackKey} from '../../utils/keys';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';
import SpottableInput from '../SpottableInput/SpottableInput';

import css from './SyncPlayDialog.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const GroupsContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const QueueContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

// An episode's name alone often says little, so the series and its number go under it.
const episodeLine = (item) => {
	if (item?.Type !== 'Episode') return '';
	const season = item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}:` : '';
	const number = item.IndexNumber != null ? `${season}E${item.IndexNumber}` : '';
	return [item.SeriesName, number].filter(Boolean).join(' · ');
};

// Queue entries carry only an item id, so the items come from one lookup, keyed on the set of
// ids so a reorder doesn't ask again.
const useQueueItems = (entries) => {
	const [items, setItems] = useState({});
	const idsKey = entries.map((entry) => entry.ItemId).filter(Boolean).sort().join(',');
	useEffect(() => {
		if (!idsKey) return;
		let cancelled = false;
		api.getItems({Ids: idsKey, EnableImages: false, EnableUserData: false})
			.then((result) => {
				if (cancelled) return;
				const next = {};
				(result?.Items || []).forEach((item) => {
					if (item?.Id) next[itemIdKey(item.Id)] = item;
				});
				setItems((prev) => ({...prev, ...next}));
			})
			.catch(() => {});
		return () => { cancelled = true; };
	}, [idsKey]);
	return items;
};

const QueueIcon = ({path}) => (
	<svg className={css.queueIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
		<path d={path} />
	</svg>
);

const SpottableButton = Spottable('button');

const REPEAT_LABELS = {
	RepeatNone: $L('Off'),
	RepeatOne: $L('One'),
	RepeatAll: $L('All')
};

const REPEAT_CYCLE = ['RepeatNone', 'RepeatOne', 'RepeatAll'];

const SyncPlayDialog = ({open, onClose, playingItemId, onWatch}) => {
	const {
		group,
		groups,
		isInGroup,
		createGroup,
		joinGroup,
		leaveGroup,
		refreshGroups,
		playQueue,
		playQueueItem,
		setRepeatMode,
		setShuffleMode,
		ignoreWait,
		toggleIgnoreWait,
		setPlaylistItem,
		movePlaylistItem,
		removeFromPlaylist
	} = useSyncPlay();

	const [groupName, setGroupName] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [isJoining, setIsJoining] = useState(null);
	const [isLeaving, setIsLeaving] = useState(false);
	const refreshIntervalRef = useRef(null);

	useEffect(() => {
		if (open) {
			const t = setTimeout(() => {
				if (isInGroup) {
					if (!Spotlight.focus('syncplay-watch-btn')) Spotlight.focus('syncplay-leave-btn');
				} else {
					Spotlight.focus('syncplay-input');
				}
			}, 100);
			return () => clearTimeout(t);
		}
	}, [open, isInGroup]);

	useEffect(() => {
		if (open && !isInGroup) {
			refreshGroups();
			refreshIntervalRef.current = setInterval(() => {
				refreshGroups();
			}, 5000);
		}
		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
		};
	}, [open, isInGroup, refreshGroups]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isTvKeyboardVisible()) return;
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onClose]);

	const handleCreate = useCallback(async () => {
		const name = groupName.trim();
		if (!name || isCreating) return;
		setIsCreating(true);
		await createGroup(name, playingItemId ? [playingItemId] : undefined);
		setGroupName('');
		setIsCreating(false);
	}, [groupName, isCreating, createGroup, playingItemId]);

	const handleJoin = useCallback(async (groupId) => {
		if (isJoining) return;
		setIsJoining(groupId);
		await joinGroup(groupId);
		setIsJoining(null);
	}, [isJoining, joinGroup]);

	const handleLeave = useCallback(async () => {
		if (isLeaving) return;
		setIsLeaving(true);
		await leaveGroup();
		setIsLeaving(false);
	}, [isLeaving, leaveGroup]);

	const handleInputChange = useCallback((e) => {
		setGroupName(e.target.value);
	}, []);

	const handleInputKeyDown = useCallback((e) => {
		if (e.key === 'Enter') {
			handleCreate();
		}
	}, [handleCreate]);

	const handleWatch = useCallback(() => onWatch?.(playQueueItem), [playQueueItem, onWatch]);

	const handleToggleRepeat = useCallback(() => {
		const current = playQueue?.RepeatMode || 'RepeatNone';
		const idx = REPEAT_CYCLE.indexOf(current);
		const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
		setRepeatMode(next);
	}, [playQueue?.RepeatMode, setRepeatMode]);

	const handleToggleShuffle = useCallback(() => {
		const current = playQueue?.ShuffleMode || 'Sorted';
		setShuffleMode(current === 'Sorted' ? 'Shuffle' : 'Sorted');
	}, [playQueue?.ShuffleMode, setShuffleMode]);

	const handleRemoveFromQueue = useCallback((playlistItemId) => removeFromPlaylist([playlistItemId]), [removeFromPlaylist]);

	if (!open) return null;

	return (
		<div className={css.overlay} onClick={onClose}>
			<DialogContainer
				className={css.dialog}
				spotlightId="syncplay-dialog"
				onClick={(e) => e.stopPropagation()} // eslint-disable-line react/jsx-no-bind
			>
				<div className={css.header}>
					<h2 className={css.title}>{$L('SyncPlay')}</h2>
					<SpottableButton
						className={css.closeBtn}
						onClick={onClose}
						spotlightId="syncplay-close-btn"
					>
						&times;
					</SpottableButton>
				</div>

				<div className={css.content}>
					{isInGroup ? (
						<GroupView
							group={group}
							isLeaving={isLeaving}
							onLeave={handleLeave}
							playQueue={playQueue}
							playQueueItem={playQueueItem}
							playingItemId={playingItemId}
							onWatch={handleWatch}
							onToggleRepeat={handleToggleRepeat}
							onToggleShuffle={handleToggleShuffle}
							ignoreWait={ignoreWait}
							onToggleIgnoreWait={toggleIgnoreWait}
							onPlayQueueItem={setPlaylistItem}
							onMoveQueueItem={movePlaylistItem}
							onRemoveQueueItem={handleRemoveFromQueue}
						/>
					) : (
						<LobbyView
							groups={groups}
							groupName={groupName}
							isCreating={isCreating}
							isJoining={isJoining}
							onInputChange={handleInputChange}
							onInputKeyDown={handleInputKeyDown}
							onCreate={handleCreate}
							onJoin={handleJoin}
						/>
					)}
				</div>
			</DialogContainer>
		</div>
	);
};

const LobbyView = memo(({groups, groupName, isCreating, isJoining, onInputChange, onInputKeyDown, onCreate, onJoin}) => {
	return (
		<>
			<div className={css.createSection}>
				<SpottableInput
					className={css.input}
					type="text"
					value={groupName}
					onChange={onInputChange}
					onKeyDown={onInputKeyDown}
					placeholder={$L('Group name')}
					maxLength={64}
					spotlightId="syncplay-input"
				/>
				<SpottableButton
					className={`${css.btn} ${css.createBtn}`}
					onClick={onCreate}
					disabled={!groupName.trim() || isCreating}
					spotlightId="syncplay-create-btn"
				>
					{isCreating ? $L('Creating...') : $L('Create')}
				</SpottableButton>
			</div>

			<div className={css.divider}>
				<span>{$L('or join an existing group')}</span>
			</div>

			<GroupsContainer className={css.groupsList} spotlightId="syncplay-groups">
				{groups.length === 0 ? (
					<div className={css.emptyState}>{$L('No active groups found')}</div>
				) : (
					groups.map((g) => (
						<SpottableButton
							key={g.GroupId}
							className={`${css.groupCard} ${isJoining === g.GroupId ? css.joining : ''}`}
							onClick={() => onJoin(g.GroupId)} // eslint-disable-line react/jsx-no-bind
							disabled={isJoining === g.GroupId}
						>
							<div className={css.groupInfo}>
								<span className={css.groupName}>{g.GroupName || $L('Unnamed Group')}</span>
								<span className={css.groupMeta}>
									{`${g.Participants?.length || 0} ${(g.Participants?.length || 0) === 1 ? $L('member') : $L('members')}`}
									{' \u00B7 '}
									{g.State || $L('Idle')}
								</span>
							</div>
							<span className={css.joinLabel}>{$L('Join')}</span>
						</SpottableButton>
					))
				)}
			</GroupsContainer>
		</>
	);
});

const GroupView = memo(({
	group, isLeaving, onLeave, playQueue, playQueueItem, playingItemId, onWatch, onToggleRepeat, onToggleShuffle,
	ignoreWait, onToggleIgnoreWait, onPlayQueueItem, onMoveQueueItem, onRemoveQueueItem
}) => {
	if (!group) return null;
	const participants = group.Participants || [];
	const stateLabel = group.State || $L('Idle');
	const repeatMode = playQueue?.RepeatMode || 'RepeatNone';
	const shuffleMode = playQueue?.ShuffleMode || 'Sorted';
	const queueLength = playQueue?.Playlist?.length || 0;
	const queueIndex = playQueue?.PlayingItemIndex ?? -1;
	const nowPlayingLine = episodeLine(playQueueItem);

	return (
		<div className={css.groupView}>
			<div className={css.groupHeader}>
				<h3 className={css.groupTitle}>{group.GroupName || $L('Group')}</h3>
				<span className={`${css.stateBadge} ${css['state' + stateLabel]}`}>
					{stateLabel}
				</span>
			</div>

			{playQueueItem && (
				<div className={css.nowPlaying}>
					<h4 className={css.sectionTitle}>{$L('Now Playing')}</h4>
					<div className={css.nowPlayingInfo}>
						<div className={css.nowPlayingText}>
							<span className={css.nowPlayingTitle}>{playQueueItem.Name || $L('Unknown')}</span>
							{nowPlayingLine && <span className={css.nowPlayingSubtitle}>{nowPlayingLine}</span>}
						</div>
						{queueLength > 1 && (
							<span className={css.nowPlayingMeta}>
								{queueIndex + 1} of {queueLength}
							</span>
						)}
					</div>
					{playQueueItem.Id !== playingItemId && (
						<SpottableButton
							className={`${css.btn} ${css.createBtn} ${css.watchBtn}`}
							onClick={onWatch}
							spotlightId="syncplay-watch-btn"
						>
							{$L('Watch now')}
						</SpottableButton>
					)}
				</div>
			)}

			<div className={css.queueControls}>
				<SpottableButton
					className={`${css.controlBtn} ${ignoreWait ? css.controlActive : ''}`}
					onClick={onToggleIgnoreWait}
					spotlightId="syncplay-ignore-wait-btn"
				>
					{$L('Ignore wait')}: {ignoreWait ? $L('On') : $L('Off')}
				</SpottableButton>
			</div>

			{queueLength > 0 && (
				<div className={css.queueControls}>
					<SpottableButton
						className={`${css.controlBtn} ${shuffleMode === 'Shuffle' ? css.controlActive : ''}`}
						onClick={onToggleShuffle}
						spotlightId="syncplay-shuffle-btn"
					>
						{$L('Shuffle')}: {shuffleMode === 'Shuffle' ? $L('On') : $L('Off')}
					</SpottableButton>
					<SpottableButton
						className={`${css.controlBtn} ${repeatMode !== 'RepeatNone' ? css.controlActive : ''}`}
						onClick={onToggleRepeat}
						spotlightId="syncplay-repeat-btn"
					>
						{$L('Repeat')}: {REPEAT_LABELS[repeatMode] || $L('Off')}
					</SpottableButton>
				</div>
			)}

			{queueLength > 1 && (
				<QueueList
					entries={playQueue.Playlist}
					currentIndex={queueIndex}
					onPlay={onPlayQueueItem}
					onMove={onMoveQueueItem}
					onRemove={onRemoveQueueItem}
				/>
			)}

			<div>
				<h4 className={css.sectionTitle}>{$L('Members ({count})').replace('{count}', String(participants.length))}</h4>
				<ul className={css.membersList}>
					{participants.map((name, i) => (
						<li key={i} className={css.member}>{name}</li>
					))}
					{participants.length === 0 && (
						<li className={css.member}>{$L('Waiting for members...')}</li>
					)}
				</ul>
			</div>

			<div className={css.controls}>
				<SpottableButton
					className={`${css.btn} ${css.leaveBtn}`}
					onClick={onLeave}
					disabled={isLeaving}
					spotlightId="syncplay-leave-btn"
				>
					{isLeaving ? $L('Leaving...') : $L('Leave group')}
				</SpottableButton>
			</div>
		</div>
	);
});

// A move or removal redraws the rows, so focus goes back to the same row, or the next one, when the
// group's new queue arrives. A stale request (one the server never answered) is dropped.
const REFOCUS_WINDOW_MS = 5000;

const QueueList = memo(({entries, currentIndex, onPlay, onMove, onRemove}) => {
	const items = useQueueItems(entries);
	const refocusRef = useRef(null);

	useEffect(() => {
		const target = refocusRef.current;
		refocusRef.current = null;
		if (!target || Date.now() - target.at > REFOCUS_WINDOW_MS) return;
		const row = document.querySelector(`[data-queue-id="${target.id}"]`);
		const button = row && (row.querySelector(`[data-action="${target.action}"]`) || row.querySelector('[data-action="play"]'));
		if (button) Spotlight.focus(button);
	}, [entries]);

	const handleMove = useCallback((id, index, action) => {
		refocusRef.current = {id, action, at: Date.now()};
		onMove(id, index);
	}, [onMove]);

	const handleRemove = useCallback((id, index) => {
		const neighbour = entries[index + 1] || entries[index - 1];
		// Down to one entry the list goes away, so focus moves up to the controls.
		if (entries.length > 2 && neighbour) refocusRef.current = {id: neighbour.PlaylistItemId, action: 'play', at: Date.now()};
		else Spotlight.focus('syncplay-ignore-wait-btn');
		onRemove(id);
	}, [entries, onRemove]);

	return (
		<div>
			<h4 className={css.sectionTitle}>{$L('Group queue')}</h4>
			<QueueContainer className={css.queueList} spotlightId="syncplay-queue">
				{entries.map((entry, index) => (
					<QueueRow
						key={entry.PlaylistItemId || index}
						entry={entry}
						index={index}
						isCurrent={index === currentIndex}
						isFirst={index === 0}
						isLast={index === entries.length - 1}
						title={items[itemIdKey(entry.ItemId)]?.Name}
						subtitle={episodeLine(items[itemIdKey(entry.ItemId)])}
						onPlay={onPlay}
						onMove={handleMove}
						onRemove={handleRemove}
					/>
				))}
			</QueueContainer>
		</div>
	);
});

const QueueRow = memo(({entry, index, isCurrent, isFirst, isLast, title, subtitle, onPlay, onMove, onRemove}) => {
	const id = entry.PlaylistItemId;
	const name = title || $L('Unknown');
	const handlePlay = useCallback(() => {
		if (!isCurrent) onPlay(id);
	}, [isCurrent, onPlay, id]);
	const handleUp = useCallback(() => onMove(id, index - 1, 'up'), [onMove, id, index]);
	const handleDown = useCallback(() => onMove(id, index + 1, 'down'), [onMove, id, index]);
	const handleRemove = useCallback(() => onRemove(id, index), [onRemove, id, index]);

	return (
		<div className={css.queueRow} data-queue-id={id}>
			<SpottableButton
				className={`${css.queueEntry} ${isCurrent ? css.queueCurrent : ''}`}
				data-action="play"
				onClick={handlePlay}
				aria-label={isCurrent ? `${name}, ${$L('Now Playing')}` : `${$L('Watch now')}: ${name}`}
			>
				<span className={css.queueNumber}>{index + 1}</span>
				<span className={css.queueText}>
					<span className={css.queueTitle}>{name}</span>
					{subtitle && <span className={css.queueSubtitle}>{subtitle}</span>}
				</span>
			</SpottableButton>
			{!isFirst && (
				<SpottableButton className={css.queueAction} data-action="up" onClick={handleUp} aria-label={$L('Move Up')}>
					<QueueIcon path={MENU_ICON_PATHS.arrowUpward} />
				</SpottableButton>
			)}
			{!isLast && (
				<SpottableButton className={css.queueAction} data-action="down" onClick={handleDown} aria-label={$L('Move Down')}>
					<QueueIcon path={MENU_ICON_PATHS.arrowDownward} />
				</SpottableButton>
			)}
			<SpottableButton className={css.queueAction} data-action="remove" onClick={handleRemove} aria-label={$L('Remove')}>
				<QueueIcon path={MENU_ICON_PATHS.playlistRemove} />
			</SpottableButton>
		</div>
	);
});

export default memo(SyncPlayDialog);
