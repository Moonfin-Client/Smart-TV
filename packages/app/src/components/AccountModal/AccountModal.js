import {useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {parseUrl} from '../../utils/urlCompat';

import css from './AccountModal.module.less';

const SpottableButton = Spottable('button');

const AccountModal = ({
	open,
	onClose,
	onLogout,
	onAddServer,
	onAddUser
}) => {
	const {
		user,
		serverUrl,
		serverName,
		logout,
		logoutAll,
		servers,
		activeServerInfo,
		switchUser,
		removeUser,
		hasMultipleUsers,
		startAddServerFlow
	} = useAuth();

	const [showConfirmRemove, setShowConfirmRemove] = useState(false);
	const [serverToRemove, setServerToRemove] = useState(null);

	const userAvatarUrl = user?.PrimaryImageTag
		? `${serverUrl}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&quality=90&maxHeight=150`
		: null;

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

	const handleAddServer = useCallback(() => {
		startAddServerFlow();
		onClose?.();
		onAddServer?.();
	}, [startAddServerFlow, onClose, onAddServer]);

	const handleSwitchUserClick = useCallback(async (e) => {
		const serverId = e.currentTarget.dataset.serverId;
		const userId = e.currentTarget.dataset.userId;
		if (serverId && userId) {
			await switchUser(serverId, userId);
			onClose?.();
		}
	}, [switchUser, onClose]);

	const handleRemoveUserClick = useCallback((e) => {
		const serverId = e.currentTarget.dataset.serverId;
		const userId = e.currentTarget.dataset.userId;
		const username = e.currentTarget.dataset.username;
		const userServerName = e.currentTarget.dataset.serverName;
		if (serverId && userId) {
			setServerToRemove({serverId, userId, username, serverName: userServerName});
			setShowConfirmRemove(true);
		}
	}, []);

	const handleConfirmRemove = useCallback(async () => {
		if (!serverToRemove) return;
		const success = await removeUser(serverToRemove.serverId, serverToRemove.userId);
		if (success) {
			setShowConfirmRemove(false);
			setServerToRemove(null);
		}
	}, [serverToRemove, removeUser]);

	const handleCancelRemove = useCallback(() => {
		setShowConfirmRemove(false);
		setServerToRemove(null);
	}, []);

	if (!open) return null;

	return (
		<>
			<Popup
				open={open}
				onClose={onClose}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.modal}>
					<div className={css.header}>
						<h2 className={css.title}>{$L('Account')}</h2>
						<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="account-close">
							<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
								<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
							</svg>
						</SpottableButton>
					</div>

					<div className={css.currentUser}>
						{userAvatarUrl ? (
							<img
								src={userAvatarUrl}
								alt={user?.Name}
								className={css.avatarImage}
							/>
						) : (
							<div className={css.avatarFallback}>
								{user?.Name?.charAt(0)?.toUpperCase() || '?'}
							</div>
						)}
						<div className={css.userInfo}>
							<div className={css.userName}>{user?.Name || $L('Not logged in')}</div>
							<div className={css.serverDetails}>
								{serverName && <span className={css.serverName}>{serverName}</span>}
								<span className={css.serverUrl}>{serverUrl || $L('Not connected')}</span>
							</div>
						</div>
					</div>

					{servers.length > 1 && (
						<div className={css.section}>
							<h3 className={css.sectionTitle}>
								{$L('Servers & Users')} ({servers.length})
							</h3>
							<div className={css.serverList}>
								{servers.map((server, index) => {
									const isActive = activeServerInfo?.serverId === server.serverId &&
										activeServerInfo?.userId === server.userId;
									let displayHost = server.url;
									try { displayHost = parseUrl(server.url).hostname; } catch (e) { /* keep raw URL */ }
									return (
										<div
											key={`${server.serverId}-${server.userId}`}
											className={`${css.serverItem} ${isActive ? css.active : ''}`}
										>
											<div className={css.serverItemInfo}>
												<div className={css.serverItemUser}>
													{isActive && user?.PrimaryImageTag ? (
														<img
															src={`${server.url}/Users/${server.userId}/Images/Primary?tag=${user.PrimaryImageTag}&quality=90&maxHeight=100`}
															alt={server.username}
															className={css.serverItemAvatarImg}
														/>
													) : (
														<span className={css.serverItemAvatar}>
															{server.username?.charAt(0)?.toUpperCase() || '?'}
														</span>
													)}
													<span className={css.serverItemUsername}>{server.username}</span>
												</div>
												<div className={css.serverItemServer}>
													{server.name} ({displayHost})
												</div>
											</div>
											<div className={css.serverItemActions}>
												{!isActive && (
													<SpottableButton
														className={css.smallBtn}
														data-server-id={server.serverId}
														data-user-id={server.userId}
														onClick={handleSwitchUserClick}
														spotlightId={`account-switch-${index}`}
													>
														{$L('Switch')}
													</SpottableButton>
												)}
												{(servers.length > 1 || !isActive) && (
													<SpottableButton
														className={`${css.smallBtn} ${css.dangerBtn}`}
														data-server-id={server.serverId}
														data-user-id={server.userId}
														data-server-name={server.name}
														data-username={server.username}
														onClick={handleRemoveUserClick}
														spotlightId={`account-remove-${index}`}
													>
														{$L('Remove')}
													</SpottableButton>
												)}
												{isActive && (
													<span className={css.activeLabel}>{$L('Active')}</span>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					<div className={css.actions}>
						<SpottableButton className={css.actionBtn} onClick={handleAddUser} spotlightId="account-add-user">
							{$L('+ Add User')}
						</SpottableButton>
						<SpottableButton className={css.actionBtn} onClick={handleAddServer} spotlightId="account-add-server">
							{$L('Change Server')}
						</SpottableButton>
						<div className={css.divider} />
						<SpottableButton className={css.actionBtn} onClick={handleLogout} spotlightId="account-logout">
							{$L('Sign Out')}
						</SpottableButton>
						{hasMultipleUsers && (
							<SpottableButton
								className={`${css.actionBtn} ${css.dangerBtn}`}
								onClick={handleLogoutAll}
								spotlightId="account-logout-all"
							>
								{$L('Sign Out All Users')}
							</SpottableButton>
						)}
					</div>
				</div>
			</Popup>

			{showConfirmRemove && serverToRemove && (
				<Popup
					open={showConfirmRemove}
					onClose={handleCancelRemove}
					position="center"
					scrimType="translucent"
					noAutoDismiss
				>
					<div className={css.confirmModal}>
						<h2 className={css.title}>{$L('Remove User')}</h2>
						<p className={css.confirmText}>
							{$L('Are you sure you want to remove {username} from {serverName}?').replace('{username}', serverToRemove.username).replace('{serverName}', serverToRemove.serverName)}
						</p>
						<p className={css.confirmWarning}>
							{$L('You will need to sign in again to use this account.')}
						</p>
						<div className={css.confirmButtons}>
							<Button onClick={handleCancelRemove} size="small" spotlightId="account-cancel-remove">
								{$L('Cancel')}
							</Button>
							<Button
								onClick={handleConfirmRemove}
								size="small"
								className={css.dangerBtn}
								spotlightId="account-confirm-remove"
							>
								{$L('Remove')}
							</Button>
						</div>
					</div>
				</Popup>
			)}
		</>
	);
};

export default AccountModal;
