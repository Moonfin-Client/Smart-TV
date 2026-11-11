/* eslint-disable react/jsx-no-bind */
import {useState} from 'react';
import $L from '@enact/i18n/$L';

import {renderToggle} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';
import SettingsView from './SettingsView';

import css from './Settings.module.less';
import SettingsButton from './SettingsButton';

// In unified mode the same library name can appear once per server, so each row says which
// server it came from.
const LibrariesView = ({
	libraries,
	hiddenLibraries,
	showServerName,
	loading,
	saving,
	saveFailures = 0,
	onToggleLibrary,
	onCancel,
	onSave
}) => {
	const [dismissedFailures, setDismissedFailures] = useState(0);
	return (
		<SettingsView spotlightId='libraries-view' title={$L('Hide Libraries')} clean>
			<div className={css.viewDescription}>
				{$L('Hidden libraries are removed from all Jellyfin clients. This is a server-level setting.')}
			</div>
			{loading ? (
				<div className={css.loadingMessage}>{$L('Loading libraries...')}</div>
			) : (
				libraries.map((lib) => {
					const isHidden = hiddenLibraries.includes(lib.Id);
					return (
						<SpottableDiv
							key={`${lib._serverUrl || 'local'}-${lib.Id}`}
							className={css.listItem}
							onClick={() => onToggleLibrary(lib.Id)}
							spotlightId={`lib-${lib.Id}`}
						>
							<div className={css.listItemBody}>
								<div className={css.listItemHeading}>
									{lib.Name}
									{showServerName && lib._serverName ? ` (${lib._serverName})` : ''}
								</div>
								<div className={css.listItemCaption}>{isHidden ? $L('Hidden') : $L('Visible')}</div>
							</div>
							<div className={css.listItemTrailing}>{renderToggle(!isHidden)}</div>
						</SpottableDiv>
					);
				})
			)}
			{!loading && (
				<div className={css.actionBar}>
					<SettingsButton onClick={onCancel} spotlightId='lib-cancel'>
						{$L('Cancel')}
					</SettingsButton>
					<SettingsButton primary onClick={onSave} disabled={saving} spotlightId='lib-save'>
						{saving ? $L('Saving...') : $L('Save')}
					</SettingsButton>
				</div>
			)}
			{saveFailures > dismissedFailures && (
				<div key={saveFailures} className={css.libraryOrderToast} onAnimationEnd={() => setDismissedFailures(saveFailures)}>
					{$L('Could not save your settings.')}
				</div>
			)}
		</SettingsView>
	);
};

export default LibrariesView;
