import {useCallback, useState, useEffect, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import Popup from '@enact/sandstone/Popup';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';

import css from './AccountModal.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');

const UserIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#FFFFFF" className={css.placeholderIcon}>
		<path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z" />
	</svg>
);

const UserAvatar = ({url, userId, username, imageTag, className, placeholderClass}) => {
	const [failed, setFailed] = useState(false);
	const handleError = useCallback(() => setFailed(true), []);
	const avatarUrl = `${url}/Users/${userId}/Images/Primary?quality=90&maxHeight=150${imageTag ? `&tag=${imageTag}` : ''}`;

	if (failed) {
		return (
			<div className={placeholderClass}>
				<UserIcon />
			</div>
		);
	}

	return (
		<img
			src={avatarUrl}
			alt={username}
			className={className}
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

	const [showConfirmRemove, setShowConfirmRemove] = useState(false);
	const [serverToRemove, setServerToRemove] = useState(null);
	const [focusOnReturn, setFocusOnReturn] = useState(null);
	const lastFocusedUserRef = useRef(0);

	useEffect(() => {
		if (open && !showConfirmRemove) {
			setTimeout(() => {
				if (focusOnReturn) {
					Spotlight.focus(`[data-spotlight-id="${focusOnReturn}"]`);
					setFocusOnReturn(null);
				} else {
					const activeIdx = servers.findIndex(
						s => activeServerInfo?.serverId === s.serverId && activeServerInfo?.userId === s.userId
					);
					Spotlight.focus(`[data-spotlight-id="account-user-${activeIdx >= 0 ? activeIdx : 0}"]`);
				}
			}, 100);
		}
	}, [open, showConfirmRemove, servers, activeServerInfo, focusOnReturn]);

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

	const handleRemoveUserClick = useCallback((e) => {
		e.stopPropagation();
		const serverId = e.currentTarget.dataset.serverId;
		const userId = e.currentTarget.dataset.userId;
		const username = e.currentTarget.dataset.username;
		const userServerName = e.currentTarget.dataset.serverName;
		const index = e.currentTarget.dataset.index;
		if (serverId && userId) {
			setFocusOnReturn(`account-user-${index || '0'}`);
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

	const handleGridDown = useCallback((e) => {
		e.stopPropagation();
		Spotlight.focus('[data-spotlight-id="account-add-server"]');
	}, []);

	const handleActionsUp = useCallback((e) => {
		e.stopPropagation();
		Spotlight.focus(`[data-spotlight-id="account-user-${lastFocusedUserRef.current}"]`);
	}, []);

	const handleUserCardFocus = useCallback((index) => {
		lastFocusedUserRef.current = index;
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
						<h2 className={css.title}>{$L('Switch Account')}</h2>
						<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="account-close">
							<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
								<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
							</svg>
						</SpottableButton>
					</div>

					<div className={css.userGrid}>
						{servers.map((server, index) => {
							const isActive = activeServerInfo?.serverId === server.serverId &&
								activeServerInfo?.userId === server.userId;
							const imageTag = isActive ? (user?.PrimaryImageTag || server.primaryImageTag) : server.primaryImageTag;
							return (
								<SpottableDiv
									key={`${server.serverId}-${server.userId}`}
									data-spotlight-id={`account-user-${index}`}
									data-server-id={server.serverId}
									data-user-id={server.userId}
									className={`${css.userCard} ${isActive ? css.activeCard : ''}`}
									onClick={handleUserCardClick}
									onSpotlightDown={handleGridDown}
									onSpotlightFocus={() => handleUserCardFocus(index)} // eslint-disable-line react/jsx-no-bind
								>
									<UserAvatar
										url={server.url}
										userId={server.userId}
										username={server.username}
										imageTag={imageTag}
										className={css.userAvatar}
										placeholderClass={css.userAvatarPlaceholder}
									/>
									<span className={css.userName}>{server.username}</span>
									<span className={css.userServerName}>{server.name}</span>
									{isActive && <span className={css.activeIndicator}>{$L('Active')}</span>}
									{(servers.length > 1 || !isActive) && (
										<button
											className={css.removeBtn}
											data-server-id={server.serverId}
											data-user-id={server.userId}
											data-server-name={server.name}
											data-username={server.username}
											data-index={index}
											onClick={handleRemoveUserClick}
											tabIndex={-1}
										>
											×
										</button>
									)}
								</SpottableDiv>
							);
						})}
						<SpottableDiv
							className={css.addUserCard}
							onClick={handleAddUser}
							spotlightId="account-add-user"
							onSpotlightDown={handleGridDown}
						>
							<div className={css.addUserCircle}>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={css.addUserIcon}>
									<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
								</svg>
							</div>
							<span className={css.userName}>{$L('Add User')}</span>
						</SpottableDiv>
					</div>

					<div className={css.actions}>
						<div className={css.actionRow}>
							<SpottableButton className={css.actionBtn} onClick={handleAddServer} spotlightId="account-add-server" onSpotlightUp={handleActionsUp}>
								{$L('Change Server')}
							</SpottableButton>
							<SpottableButton className={css.actionBtn} onClick={handleLogout} spotlightId="account-logout" onSpotlightUp={handleActionsUp}>
								{$L('Sign Out')}
							</SpottableButton>
						</div>
						{hasMultipleUsers && (
							<SpottableButton
								className={`${css.actionBtn} ${css.dangerBtn}`}
								onClick={handleLogoutAll}
								spotlightId="account-logout-all"
								onSpotlightUp={handleActionsUp}
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
							<SpottableButton className={css.actionBtn} onClick={handleCancelRemove} spotlightId="account-cancel-remove">
								{$L('Cancel')}
							</SpottableButton>
							<SpottableButton
								onClick={handleConfirmRemove}
								className={`${css.actionBtn} ${css.dangerBtn}`}
								spotlightId="account-confirm-remove"
							>
								{$L('Remove')}
							</SpottableButton>
						</div>
					</div>
				</Popup>
			)}
		</>
	);
};

export default AccountModal;
