import {renderHook, act} from '@testing-library/react';

import useButtonLayoutEditor from './useButtonLayoutEditor';
import {OSD_ORDER_KEY, OSD_HIDDEN_KEY} from '../../utils/buttonLayout';

// The rest of settingsRows loads Spotlight, which needs the framework's own React.
jest.mock('./settingsRows', () => ({editedListKey: (items) => JSON.stringify(items)}));

const openPlayerButtons = () => {
	const updateSettings = jest.fn();
	const {result} = renderHook(() => useButtonLayoutEditor({settings: {}, updateSettings, pushView: jest.fn()}));
	act(() => result.current.openOsdButtons());
	return {result, updateSettings};
};

describe('the Player Buttons list', () => {
	it('lists Episodes right after Chapters, switched on', () => {
		const {result} = openPlayerButtons();
		const buttons = result.current.tempButtons;
		const at = buttons.findIndex((button) => button.id === 'chapters');
		const [chapters, episodes] = buttons.slice(at, at + 2);
		expect([chapters.id, episodes.id]).toEqual(['chapters', 'episodes']);
		expect(episodes.enabled).toBe(true);
	});

	it('lists SyncPlay first, switched on, as Core does', () => {
		const {result} = openPlayerButtons();
		const [syncPlay] = result.current.tempButtons;
		expect(syncPlay.id).toBe('syncPlay');
		expect(syncPlay.enabled).toBe(true);
	});

	it('saves Episodes where it was moved to, and as hidden once switched off', () => {
		const {result, updateSettings} = openPlayerButtons();
		act(() => result.current.moveLayoutButton('episodes', -1));
		act(() => result.current.toggleLayoutButton('episodes'));
		act(() => result.current.commitButtonLayout());
		const saved = updateSettings.mock.calls[0][0];
		expect(saved[OSD_ORDER_KEY].slice(0, 3)).toEqual(['syncPlay', 'episodes', 'chapters']);
		expect(saved[OSD_HIDDEN_KEY]).toEqual(['episodes']);
	});
});
