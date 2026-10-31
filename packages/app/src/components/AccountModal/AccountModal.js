import {useCallback, useState, useEffect, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {getUserImageUrl} from '../../services/jellyfinApi';
import CoreDialog, {CoreAlertDialog} from '../CoreDialog';
import {MaterialIcon} from '../icons/materialIcons';

import css from './AccountModal.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');

const UserAvatar = ({url, userId, username, imageTag, serverType}) => {
	const [failed, setFailed] = useState(false);
	const handleError = useCallback(() => setFailed(true), []);

	const src = getUserImageUrl(url, userId, imageTag, serverType);
	// A Silo profile without an avatar has no address, and an image without one never fails.
	if (failed || !src) return <MaterialIcon name="person" className={css.placeholderIcon} />;

	return (
		<img
			src={src}
			alt={username}
			className={css.avatarImage}
			onError={handleError}
		/>
	);
};

const AccountModal = ({
	open,
	onClose,
	onLogout,
	onAddServer,
	onAddUser
}) => {
	const {
		user,
		logout,
		logoutAll,
		servers,
		activeServerInfo,
		switchUser,
		removeUser,
		hasMultipleUsers,
		startAddServerFlow
	} = useAuth();
	const {settings} = useSettings();

	const sortedServers = useMemo(() => {
		const list = Array.isArray(servers) ? [...servers] : [];
		const sortBy = settings.serverSortBy || 'name';
		if (sortBy === 'recent') {
			return list.sort((a, b) => {
				const aTime = a.lastConnected ? Date.parse(a.lastConnected) : 0;
				const bTime = b.lastConnected ? Date.parse(b.lastConnected) : 0;
				if (aTime !== bTime) return bTime - aTime;
				return (a.username || '').localeCompare(b.username || '', undefined, {sensitivity: 'base'});
			});
		}
		if (sortBy === 'added') {
			return list.sort((a, b) => {
				const aTime = a.addedDate ? Date.parse(a.addedDate) : 0;
				const bTime = b.addedDate ? Date.parse(b.addedDate) : 0;
				if (aTime !== bTime) return bTime - aTime;
				return (a.username || '').localeCompare(b.username || '', undefined, {sensitivity: 'base'});
			});
		}
		return list.sort((a, b) => {
			const serverCompare = (a.name || '').localeCompare(b.name || '', undefined, {sensitivity: 'base'});
			if (serverCompare !== 0) return serverCompare;
			return (a.username || '').localeCompare(b.username || '', undefined, {sensitivity: 'base'});
		});
	}, [servers, settings.serverSortBy]);

	const [serverToRemove, setServerToRemove] = useState(null);
	const [refocusAfterRemove, setRefocusAfterRemove] = useState(false);

	// Closing the confirm hands focus back to a card that may be gone, so the switcher takes it back.
	useEffect(() => {
		if (!open || serverToRemove || !refocusAfterRemove) return undefined;
		const timer = setTimeout(() => {
			Spotlight.focus('account-modal');
			setRefocusAfterRemove(false);
		}, 150);
		return () => clearTimeout(timer);
	}, [open, serverToRemove, refocusAfterRemove]);

	const handleLogout = useCallback(async () => {
		await logout();
		onClose?.();
		onLogout?.();
	}, [logout, onClose, onLogout]);

	const handleLogoutAll = useCallback(async () => {
		await logoutAll();
		onClose?.();
		onLogout?.();
	}, [logoutAll, onClose, onLogout]);

	const handleAddUser = useCallback(() => {
		onClose?.();
		onAddUser?.();
	}, [onClose, onAddUser]);

	const handleSelectServer = useCallback(() => {
		startAddServerFlow();
		onClose?.();
		onAddServer?.();
	}, [startAddServerFlow, onClose, onAddServer]);

	const handleUserCardClick = useCallback(async (e) => {
		const serverId = e.currentTarget.dataset.serverId;
		const userId = e.currentTarget.dataset.userId;
		if (!serverId || !userId) return;

		const isActive = activeServerInfo?.serverId === serverId && activeServerInfo?.userId === userId;
		if (isActive) {
			onClose?.();
			return;
		}
		await switchUser(serverId, userId);
		onClose?.();
	}, [switchUser, onClose, activeServerInfo]);

	// Only a pointer reaches this, since the remote has no way onto it.
	const handleRemoveUserClick = useCallback((e) => {
		e.stopPropagation();
		const {serverId, userId, username, serverName} = e.currentTarget.dataset;
		if (serverId && userId) setServerToRemove({serverId, userId, username, serverName});
	}, []);

	const handleConfirmRemove = useCallback(async () => {
		if (!serverToRemove) return;
		const success = await removeUser(serverToRemove.serverId, serverToRemove.userId);
		if (success) {
			setServerToRemove(null);
			setRefocusAfterRemove(true);
		}
	}, [serverToRemove, removeUser]);

	const handleCancelRemove = useCallback(() => {
		setServerToRemove(null);
		setRefocusAfterRemove(true);
	}, []);

	const activeIndex = sortedServers.findIndex(
		(s) => activeServerInfo?.serverId === s.serverId && activeServerInfo?.userId === s.userId
	);
	const initialIndex = activeIndex >= 0 ? activeIndex : 0;

	return (
		<>
			<CoreDialog
				open={open}
				onClose={onClose}
				title={$L('Switch User')}
				spotlightId="account-modal"
				className={css.panel}
			>
				<div className={css.cardStrip}>
					<div className={css.cardRow}>
						{sortedServers.map((server, index) => {
							const isActive = index === activeIndex;
							const imageTag = isActive ? (user?.PrimaryImageTag || server.primaryImageTag) : server.primaryImageTag;
							return (
								<SpottableDiv
									key={`${server.serverId}-${server.userId}`}
									data-spotlight-id={`account-user-${index}`}
									data-selected={index === initialIndex ? 'true' : undefined}
									data-server-id={server.serverId}
									data-user-id={server.userId}
									className={css.card}
									onClick={handleUserCardClick}
								>
									<div className={css.avatar}>
										<UserAvatar
											url={server.url}
											serverType={server.serverType}
											userId={server.userId}
											username={server.username}
											imageTag={imageTag}
										/>
									</div>
									<div className={css.userName}>{server.username}</div>
									<div className={css.serverName}>{server.name}</div>
									{isActive && <div className={css.active}>{$L('Active')}</div>}
									{(sortedServers.length > 1 || !isActive) && (
										<button
											className={css.removeBtn}
											data-server-id={server.serverId}
											data-user-id={server.userId}
											data-server-name={server.name}
											data-username={server.username}
											onClick={handleRemoveUserClick}
											tabIndex={-1}
										>
											<MaterialIcon name="close" className={css.removeIcon} />
										</button>
									)}
								</SpottableDiv>
							);
						})}
						<SpottableDiv
							className={`${css.card} ${css.addCard}`}
							data-spotlight-id="account-add-user"
							data-selected={sortedServers.length === 0 ? 'true' : undefined}
							onClick={handleAddUser}
						>
							<div className={css.avatar}>
								<MaterialIcon name="add" className={css.addIcon} />
							</div>
							<div className={css.userName}>{$L('Add User')}</div>
						</SpottableDiv>
					</div>
				</div>

				<div className={css.actions}>
					<div className={css.actionPair}>
						<SpottableButton className={css.actionBtn} onClick={handleSelectServer} data-spotlight-id="account-add-server">
							{$L('Select Server')}
						</SpottableButton>
						<SpottableButton className={css.actionBtn} onClick={handleLogout} data-spotlight-id="account-logout">
							{$L('Sign Out')}
						</SpottableButton>
					</div>
					{hasMultipleUsers && (
						<SpottableButton
							className={`${css.actionBtn} ${css.dangerBtn}`}
							onClick={handleLogoutAll}
							data-spotlight-id="account-logout-all"
						>
							{$L('Sign Out All Users')}
						</SpottableButton>
					)}
				</div>
			</CoreDialog>

			<CoreAlertDialog
				open={open && Boolean(serverToRemove)}
				onClose={handleCancelRemove}
				title={$L('Remove User')}
				spotlightId="account-remove-confirm"
				actions={[
					{label: $L('Cancel'), onClick: handleCancelRemove, spotlightId: 'account-cancel-remove'},
					{label: $L('Remove'), onClick: handleConfirmRemove, spotlightId: 'account-confirm-remove'}
				]}
			>
				{serverToRemove && (
					<>
						<p className={css.confirmText}>
							{$L('Are you sure you want to remove {username} from {serverName}?')
								.replace('{username}', serverToRemove.username)
								.replace('{serverName}', serverToRemove.serverName)}
						</p>
						<p className={css.confirmText}>{$L('You will need to sign in again to use this account.')}</p>
					</>
				)}
			</CoreAlertDialog>
		</>
	);
};

export default AccountModal;
