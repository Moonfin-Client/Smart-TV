import {renderHook, act, waitFor} from '@testing-library/react';

// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
// The real settings context and the rest of settingsRows both need the framework's own React.
jest.mock('../../context/SettingsContext', () => ({DEFAULT_HOME_ROWS: require('../../utils/homeLayout').DEFAULT_HOME_ROWS}));
jest.mock('./settingsRows', () => ({editedListKey: (list) => list.map((item) => `${item.id}:${item.enabled ? 1 : 0}`).join(',')}));
jest.mock('../../services/jellyfinApi', () => ({createApiForServer: jest.fn(), getServerType: () => 'jellyfin'}));

import {createApiForServer} from '../../services/jellyfinApi';
import {DEFAULT_HOME_ROWS} from '../../utils/homeLayout';
import {makePickedRow} from '../../utils/pickedRows';
import useHomeRowsEditor from './useHomeRowsEditor';

const SERVER = 'http://server';
const rows = (...specs) => specs.map(([id, enabled], order) => ({id, name: id, enabled, order}));
const enabledIds = (list) => list.filter((row) => row.enabled).map((row) => row.id);
const collection = (itemId, name, serverUrl = SERVER) => makePickedRow({source: 'collections', serverUrl, itemId, name}, true, 0);
const items = (...pairs) => ({Items: pairs.map(([Id, Name]) => ({Id, Name}))});

// The editor looks up Live TV and the lists in the background as it opens, so let that settle
const openWith = async (homeRows, {channels = [{Id: 'channel'}], collections = null, servers = [], extra = {}} = {}) => {
	const settings = {homeRows, displayCollectionsRows: collections !== null, ...extra};
	const api = {
		getLiveTvChannels: jest.fn().mockResolvedValue({Items: channels}),
		getCollections: jest.fn().mockResolvedValue(collections)
	};
	const updateSetting = jest.fn();
	const updateSettings = jest.fn();
	const {result} = renderHook(() => useHomeRowsEditor({api, serverUrl: SERVER, servers, settings, updateSetting, updateSettings, pushView: jest.fn()}));
	act(() => result.current.openHomeRows());
	await waitFor(() => expect(result.current.loading).toBe(false));
	return {result, updateSetting, updateSettings};
};

test('opening lists the collections found switched off and keeps the picks as saved', async () => {
	const {result} = await openWith([...rows(['resume', true]), collection('c1', 'Alien')], {collections: items(['c1', 'Alien'], ['c2', 'Bond'])});

	expect(result.current.tempHomeRows.map((row) => [row.itemId, row.enabled])).toEqual([[undefined, true], ['c1', true], ['c2', false]]);
});

test('a pick the server no longer has is dropped and saved right away', async () => {
	const {updateSetting} = await openWith([...rows(['resume', true]), collection('gone', 'Gone')], {collections: items(['c1', 'Alien'])});

	expect(updateSetting).toHaveBeenCalledWith('homeRows', [{id: 'resume', name: 'resume', enabled: true, order: 0}]);
});

test('closing saves a found row only once it is switched on', async () => {
	const {result, updateSettings} = await openWith(rows(['resume', true]), {collections: items(['c1', 'Alien'], ['c2', 'Bond'])});

	act(() => result.current.commitHomeRows());
	expect(updateSettings).not.toHaveBeenCalled();

	act(() => result.current.toggleHomeRow(collection('c2', 'Bond').id));
	act(() => result.current.commitHomeRows());
	expect(updateSettings.mock.calls[0][0].homeRows.map((row) => row.itemId)).toEqual([undefined, 'c2']);
});

test('a reset keeps no picks and lists them again switched off', async () => {
	const {result, updateSettings} = await openWith([...rows(['resume', true]), collection('c1', 'Alien')], {collections: items(['c1', 'Alien'])});

	act(() => result.current.resetHomeRows());
	expect(result.current.tempHomeRows.filter((row) => row.source).map((row) => [row.itemId, row.enabled])).toEqual([['c1', false]]);

	act(() => result.current.commitHomeRows());
	expect(updateSettings.mock.calls[0][0].homeRows.map((row) => row.id)).toEqual(DEFAULT_HOME_ROWS.map((row) => row.id));
});

test('another server lists its collections while multi-server libraries is on', async () => {
	createApiForServer.mockReturnValue({getCollections: jest.fn().mockResolvedValue(items(['o1', 'Other']))});
	const servers = [{url: SERVER, name: 'Here'}, {url: 'http://other/', name: 'There', accessToken: 't', userId: 'u'}];
	const {result} = await openWith(rows(['resume', true]), {collections: items(), servers, extra: {unifiedLibraryMode: true}});

	expect(createApiForServer).toHaveBeenCalledTimes(1);
	expect(result.current.tempHomeRows.find((row) => row.itemId === 'o1').id).toBe('pluginDynamic:collections:http://other:collection:o1');
});

test('switching a row on puts it at the bottom of the enabled rows', async () => {
	const {result} = await openWith(rows(['resume', true], ['livetv', false], ['nextup', true], ['rewatch', false]));

	act(() => result.current.toggleHomeRow('livetv'));

	expect(enabledIds(result.current.tempHomeRows)).toEqual(['resume', 'nextup', 'livetv']);
});

test('a move passes the next enabled row and skips the disabled ones between', async () => {
	const {result} = await openWith(rows(['resume', true], ['livetv', false], ['nextup', true]));

	act(() => result.current.moveHomeRow('resume', 1));

	expect(enabledIds(result.current.tempHomeRows)).toEqual(['nextup', 'resume']);
});

test('a server without Live TV channels hides the Live TV rows from moves', async () => {
	const {result} = await openWith(rows(['resume', true], ['livetv', true], ['nextup', true]), {channels: []});

	act(() => result.current.moveHomeRow('resume', 1));

	expect(result.current.serverHasLiveTv).toBe(false);
	expect(enabledIds(result.current.tempHomeRows)).toEqual(['nextup', 'livetv', 'resume']);
});
