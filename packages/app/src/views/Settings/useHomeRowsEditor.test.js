import {renderHook, act, waitFor} from '@testing-library/react';

// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
// The real settings context and the rest of settingsRows both need the framework's own React.
jest.mock('../../context/SettingsContext', () => ({DEFAULT_HOME_ROWS: require('../../utils/homeLayout').DEFAULT_HOME_ROWS}));
jest.mock('./settingsRows', () => ({editedListKey: (items) => JSON.stringify(items)}));

import useHomeRowsEditor from './useHomeRowsEditor';

test('reopening keeps the plugin sections switched on as they were saved', async () => {
	const api = {getGenres: jest.fn().mockResolvedValue({Items: [{Id: 'g1', Name: 'Action'}, {Id: 'g2', Name: 'Drama'}]})};
	const settings = {
		displayGenresRows: true,
		pluginSections: [{id: 'genre:g1', name: 'Action', enabled: true, order: 0, source: 'genres'}]
	};
	const {result} = renderHook(() => useHomeRowsEditor({api, settings, updateSetting: jest.fn(), updateSettings: jest.fn(), pushView: jest.fn()}));

	act(() => result.current.openHomeRows());

	await waitFor(() => expect(result.current.tempPluginSections).toHaveLength(2));
	expect(result.current.tempPluginSections.find((section) => section.id === 'genre:g1').enabled).toBe(true);
	expect(result.current.tempPluginSections.find((section) => section.id === 'genre:g2').enabled).toBe(false);
});
