import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {getPlexMoonbaseAddress, normalizeMoonbaseAddress, setPlexMoonbaseAddress} from '../../services/plexMoonbase';
import {plexMoonbaseUrl} from '../../utils/plexUrls';

import css from './Settings.module.less';

// Where Moonbase for Plex runs for this Plex server. Plex can't run plugins, so left empty the app looks next to the
// Plex server. Saved on Enter, and onSaved looks for Moonbase again.
const MoonbaseAddressRow = ({serverId, serverUrl, onSaved}) => {
	const [address, setAddress] = useState('');

	useEffect(() => {
		let stale = false;
		if (serverId) getPlexMoonbaseAddress(serverId).then((saved) => !stale && setAddress(saved), () => {});
		return () => {
			stale = true;
		};
	}, [serverId]);

	const handleChange = useCallback((e) => setAddress(e.target.value), []);

	const handleKeyDown = useCallback(async (e) => {
		if (e.keyCode !== 13 || !serverId) return;
		e.preventDefault();
		const saved = normalizeMoonbaseAddress(address);
		await setPlexMoonbaseAddress(serverId, saved);
		setAddress(saved);
		onSaved();
	}, [serverId, address, onSaved]);

	return (
		<div className={css.inputGroup}>
			<label>{$L('Moonbase Address')}</label>
			<SpottableInput
				className={css.input}
				type='text'
				purpose='url'
				value={address}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder={plexMoonbaseUrl(serverUrl) || ''}
				spotlightId='setting-moonbaseAddress'
			/>
		</div>
	);
};

export default MoonbaseAddressRow;
