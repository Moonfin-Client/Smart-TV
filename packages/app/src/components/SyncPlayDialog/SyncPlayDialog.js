import {memo, useCallback, useEffect, useState, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSyncPlay} from '../../context/SyncPlayContext';
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
		setShuffleMode
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

const GroupView = memo(({group, isLeaving, onLeave, playQueue, playQueueItem, playingItemId, onWatch, onToggleRepeat, onToggleShuffle}) => {
	if (!group) return null;
	const participants = group.Participants || [];
	const stateLabel = group.State || $L('Idle');
	const repeatMode = playQueue?.RepeatMode || 'RepeatNone';
	const shuffleMode = playQueue?.ShuffleMode || 'Sorted';
	const queueLength = playQueue?.Playlist?.length || 0;
	const queueIndex = playQueue?.PlayingItemIndex ?? -1;

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
						<span className={css.nowPlayingTitle}>{playQueueItem.Name || $L('Unknown')}</span>
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

export default memo(SyncPlayDialog);
