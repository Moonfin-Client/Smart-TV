import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import CoreDialog, {CoreDialogRow} from '../CoreDialog';
import {SeerrFocusRow, SeerrSelectorRow} from './SeerrDialogControls';
import {MaterialIcon} from '../icons/materialIcons';

import css from './SeerrRequestDialog.module.less';

const NO_PICKS = {serverId: null, profileId: null, rootFolderId: null};

const defaultServer = (servers, is4k) =>
	servers.find((s) => s.server.is4k === is4k && s.server.isDefault) ||
	servers.find((s) => s.server.is4k === is4k) ||
	servers[0];

/**
 * Where a request goes, from what the viewer picked with each server's own defaults filling
 * in the rest. An anime series takes the server's anime profile and folder when it has them.
 *
 * @param {Array|null} servers - Radarr or Sonarr server details, as Seerr sends them
 * @param {Object} picks - serverId, profileId and rootFolderId the viewer chose, null for default
 * @param {Object} options - is4k and isAnime
 * @returns {{server: Object|null, serverId: number|null, profileId: number|null, rootFolder: string|null, folder: Object|null}}
 */
export const resolveAdvancedRequest = (servers, picks, {is4k = false, isAnime = false} = {}) => {
	if (!servers || !servers.length) {
		return {server: null, serverId: picks.serverId, profileId: picks.profileId, rootFolder: null, folder: null};
	}
	const server = (picks.serverId != null && servers.find((s) => s.server.id === picks.serverId)) ||
		defaultServer(servers, is4k);
	const {activeAnimeProfileId, activeAnimeDirectory, activeProfileId, activeDirectory} = server.server;
	const folders = server.rootFolders || [];
	let profileId = picks.profileId;
	if (profileId == null) profileId = isAnime && activeAnimeProfileId != null ? activeAnimeProfileId : activeProfileId;
	const dir = isAnime && activeAnimeDirectory ? activeAnimeDirectory : activeDirectory;
	const folder = picks.rootFolderId != null
		? folders.find((f) => f.id === picks.rootFolderId)
		: (dir && folders.find((f) => f.path === dir)) || folders[0];
	return {
		server,
		serverId: picks.serverId != null ? picks.serverId : server.server.id,
		profileId: profileId ?? null,
		rootFolder: folder?.path ?? null,
		folder: folder || null
	};
};

/**
 * The server, profile and folder choice behind a request. Server details only load for a viewer
 * allowed to override them, and anyone else sends nothing so Seerr uses its own defaults.
 *
 * @param {Object} params - enabled, isTv, isAnime, is4k and the servers Seerr lists
 */
export const useSeerrAdvancedRequest = ({enabled, isTv, isAnime, is4k, servers}) => {
	const [details, setDetails] = useState(null);
	const [loading, setLoading] = useState(enabled);
	const [picks, setPicks] = useState(NO_PICKS);

	useEffect(() => {
		if (!enabled) return undefined;
		let live = true;
		const loadDetails = isTv ? seerrApi.getSonarrServerDetails : seerrApi.getRadarrServerDetails;
		(async () => {
			try {
				const list = await Promise.all((servers || []).map((s) => loadDetails(s.id)));
				if (live) setDetails(list);
			} catch (e) {
				void e;
			} finally {
				if (live) setLoading(false);
			}
		})();
		return () => {
			live = false;
		};
	}, [enabled, isTv, servers]);

	const resolved = useMemo(
		() => resolveAdvancedRequest(details, picks, {is4k, isAnime}),
		[details, picks, is4k, isAnime]
	);

	const reset = useCallback(() => setPicks(NO_PICKS), []);
	const pickServer = useCallback((serverId) => setPicks({...NO_PICKS, serverId}), []);
	const pickProfile = useCallback((profileId) => setPicks((p) => ({...p, profileId})), []);
	const pickRootFolder = useCallback((rootFolderId) => setPicks((p) => ({...p, rootFolderId})), []);

	return {servers: details, loading, resolved, reset, pickServer, pickProfile, pickRootFolder};
};

// The list a selector row opens, with the current choice marked and focused.
const OptionPicker = ({title, labels, selectedIndex, onPick, onClose}) => {
	const handleClick = useCallback((e) => {
		onPick(Number(e.currentTarget.dataset.index));
	}, [onPick]);

	return (
		<CoreDialog open title={title} showCancel onClose={onClose} spotlightId="seerr-option-picker">
			{labels.map((label, i) => (
				<CoreDialogRow key={i} label={label} selected={i === selectedIndex} data-index={i} onClick={handleClick} />
			))}
		</CoreDialog>
	);
};

const serverLabel = (s) => `${s.server.name}${s.server.is4k ? ' (4K)' : ''}`;

// A collapsed section with the server, quality profile and root folder pickers, driven by
// useSeerrAdvancedRequest.
export const SeerrAdvancedRequestOptions = ({controller}) => {
	const [expanded, setExpanded] = useState(false);
	const [picker, setPicker] = useState(null);
	const {servers, loading, resolved, pickServer, pickProfile, pickRootFolder} = controller;

	const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
	const closePicker = useCallback(() => setPicker(null), []);

	const rows = useMemo(() => {
		if (!servers || !servers.length) return [];
		const server = resolved.server;
		const profiles = server.profiles || [];
		const folders = server.rootFolders || [];
		const row = (key, label, items, labelOf, selectedId, onChange) => {
			const ids = items.map((item) => item.id);
			const resolvedId = selectedId ?? ids[0];
			const index = ids.indexOf(resolvedId);
			const current = index >= 0 ? items[index] : items[0];
			return {key, label, labels: items.map(labelOf), ids, value: current ? labelOf(current) : '', index: Math.max(index, 0), onChange};
		};
		return [
			row('server', $L('Server'), servers.map((s) => ({...s, id: s.server.id})), serverLabel, resolved.serverId, pickServer),
			row('profile', $L('Quality Profile'), profiles, (p) => p.name, resolved.profileId, pickProfile),
			row('folder', $L('Root Folder'), folders, (f) => f.path, resolved.folder?.id, pickRootFolder)
		];
	}, [servers, resolved, pickServer, pickProfile, pickRootFolder]);

	const openPicker = useCallback((e) => setPicker(e.currentTarget.dataset.picker), []);
	const active = rows.find((r) => r.key === picker);
	const handlePick = useCallback((index) => {
		active.onChange(active.ids[index]);
		setPicker(null);
	}, [active]);

	let body = null;
	if (loading) {
		body = <div className={css.advancedLoading}><div className={css.spinner} /></div>;
	} else if (rows.length) {
		body = rows.map((r) => (
			<SeerrSelectorRow
				key={r.key}
				className={css.advancedRow}
				label={r.label}
				value={r.value}
				data-picker={r.key}
				onClick={openPicker}
			/>
		));
	} else {
		body = <div className={css.advancedEmpty}>{$L('No service servers configured')}</div>;
	}

	return (
		<div>
			<SeerrFocusRow className={css.advancedHeader} onClick={toggleExpanded}>
				<span className={css.advancedTitle}>{$L('Advanced Options')}</span>
				<MaterialIcon name={expanded ? 'expandLess' : 'expandMore'} className={css.advancedChevron} />
			</SeerrFocusRow>
			{expanded && <div className={css.advancedBody}>{body}</div>}
			{active && (
				<OptionPicker
					title={active.label}
					labels={active.labels}
					selectedIndex={active.index}
					onPick={handlePick}
					onClose={closePicker}
				/>
			)}
		</div>
	);
};
