/* eslint-disable react/jsx-no-bind */
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {renderCheck} from './settingsIcons';
import {SpottableDiv, SpottableButton} from './settingsSpottables';
import {InfoRow} from './settingsRows';

import css from './Settings.module.less';

// Slotted into the plugin screen by the schema rather than being a screen of its own. It
// shows the connection once signed in, and the sign in form the rest of the time.
const SeerrAccountPanel = ({
	pluginEnabled,
	plex,
	seerr,
	seerrLabel,
	authType,
	username,
	password,
	submitting,
	message,
	error,
	onAuthTypeChange,
	onUsernameChange,
	onPasswordChange,
	onPasswordKeyDown,
	onLogin,
	onLogout
}) => {
	const seerrDisabledByServer = seerr.pluginInfo?.seerrEnabled === false;
	const signedIn = seerr.isEnabled && seerr.isAuthenticated && seerr.isMoonfin;
	// On Plex the first choice signs in with the Plex account signed in to the app, so it asks for nothing.
	const plexAccount = plex && authType !== 'local';
	let methodLabel = $L('Jellyfin Account');
	if (authType === 'local') methodLabel = $L('Local Account');
	else if (plex) methodLabel = $L('Plex Account');

	return (
		<>
			{!pluginEnabled && (
				<div className={css.authHint}>
					{$L('Enable the Moonfin plugin first to sign in to {seerrLabel}.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
			{pluginEnabled && seerrDisabledByServer && (
				<div className={css.authHint}>
					{$L('{seerrLabel} is disabled by your server administrator.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
			{pluginEnabled && !seerrDisabledByServer && signedIn && (
				<>
					<InfoRow id='seerrConnStatus' label={$L('Status')} value={$L('Connected via Moonfin')} />
					<InfoRow id='seerrAuthType' label={$L('Sign-In Method')} value={methodLabel} />
					{seerr.serverUrl && <InfoRow id='seerrUrl' label={$L('{seerrLabel} URL').replace('{seerrLabel}', seerrLabel)} value={seerr.serverUrl} />}
					{seerr.user && <InfoRow id='seerrUser' label={$L('User')} value={seerr.user.displayName || $L('Moonfin User')} />}
					<div className={css.actionBarInline}>
						<SpottableButton
							className={`${css.actionButton} ${css.dangerButton}`}
							onClick={onLogout}
							disabled={submitting}
							spotlightId='seerr-signout'
						>
							{submitting ? $L('Signing Out...') : $L('Sign Out')}
						</SpottableButton>
					</div>
				</>
			)}
			{pluginEnabled && !seerrDisabledByServer && !signedIn && (
				<>
					<div className={css.viewDescription}>
						{$L('Sign in directly through the Moonfin plugin. No app backend is required.')}
					</div>
					<SpottableDiv
						className={`${css.listItem} ${authType === 'jellyfin' ? css.listItemSelected : ''}`}
						onClick={() => onAuthTypeChange('jellyfin')}
						spotlightId='seerr-auth-jellyfin'
					>
						<div className={css.listItemBody}>
							<div className={css.listItemHeading}>{plex ? $L('Plex Account') : $L('Jellyfin Account')}</div>
							<div className={css.listItemCaption}>{plex ? $L('Use the Plex account you signed in with') : $L('Use your Jellyfin username and password')}</div>
						</div>
						<div className={css.listItemTrailing}>{renderCheck(authType === 'jellyfin')}</div>
					</SpottableDiv>
					<SpottableDiv
						className={`${css.listItem} ${authType === 'local' ? css.listItemSelected : ''}`}
						onClick={() => onAuthTypeChange('local')}
						spotlightId='seerr-auth-local'
					>
						<div className={css.listItemBody}>
							<div className={css.listItemHeading}>{$L('Local Account')}</div>
							<div className={css.listItemCaption}>{$L('Use your local {seerrLabel} account credentials').replace('{seerrLabel}', seerrLabel)}</div>
						</div>
						<div className={css.listItemTrailing}>{renderCheck(authType === 'local')}</div>
					</SpottableDiv>

					{!plexAccount && (
						<>
							<div className={css.inputGroup}>
								<label>{$L('Username / Email')}</label>
								<SpottableInput
									className={css.input}
									type='text'
									purpose={authType === 'local' ? 'email' : 'username'}
									value={username}
									onChange={(e) => onUsernameChange(e.target.value)}
									placeholder={authType === 'local' ? $L('Local username or email') : $L('Jellyfin username')}
									autoComplete='username'
									disabled={submitting}
									spotlightId='seerr-username-input'
								/>
							</div>

							<div className={css.inputGroup}>
								<label>{$L('Password')}</label>
								<SpottableInput
									className={css.input}
									type='password'
									purpose='password'
									value={password}
									onChange={(e) => onPasswordChange(e.target.value)}
									onKeyDown={onPasswordKeyDown}
									autoComplete='current-password'
									disabled={submitting}
									spotlightId='seerr-password-input'
								/>
							</div>
						</>
					)}

					<div className={css.actionBarInline}>
						<SpottableButton
							className={css.actionButton}
							onClick={onLogin}
							disabled={submitting || (!plexAccount && !username.trim())}
							spotlightId='seerr-signin'
						>
							{submitting ? $L('Signing In...') : $L('Sign In')}
						</SpottableButton>
					</div>
				</>
			)}
			{message && <div className={css.statusMessage}>{message}</div>}
			{error && <div className={`${css.statusMessage} ${css.statusError}`}>{error}</div>}
		</>
	);
};

export default SeerrAccountPanel;
