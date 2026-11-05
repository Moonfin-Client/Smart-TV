import {renderHook, act} from '@testing-library/react';

import useButtonLayoutEditor from './useButtonLayoutEditor';
import {OSD_ORDER_KEY, OSD_HIDDEN_KEY} from '../../utils/buttonLayout';
import {canKeepAsComplete} from '../../services/incompleteRecordings';

// The rest of settingsRows loads Spotlight, which needs the framework's own React.
jest.mock('./settingsRows', () => ({editedListKey: (items) => JSON.stringify(items)}));
jest.mock('../../services/incompleteRecordings', () => ({canKeepAsComplete: jest.fn()}));

const detailButtonIds = (hasLiveTv) => {
	const {result} = renderHook(() => useButtonLayoutEditor({settings: {}, updateSettings: jest.fn(), pushView: jest.fn(), hasLiveTv}));
	act(() => result.current.openDetailButtons());
	return result.current.tempButtons.map((btn) => btn.id);
};

describe('the Details Buttons list', () => {
	it('offers Keep as Complete only when the server has Live TV and the user can manage it', () => {
		canKeepAsComplete.mockReturnValue(true);
		expect(detailButtonIds(true)).toContain('keepAsComplete');
		expect(detailButtonIds(false)).not.toContain('keepAsComplete');
		canKeepAsComplete.mockReturnValueOnce(false);
		expect(detailButtonIds(true)).not.toContain('keepAsComplete');
	});
});

const openPlayerButtons = () => {
	const updateSettings = jest.fn();
	const {result} = renderHook(() => useButtonLayoutEditor({settings: {}, updateSettings, pushView: jest.fn()}));
	act(() => result.current.openOsdButtons());
	return {result, updateSettings};
};

describe('the Player Buttons list', () => {
	it('lists Episodes right after Chapters, switched on', () => {
		const {result} = openPlayerButtons();
		const [chapters, episodes] = result.current.tempButtons;
		expect([chapters.id, episodes.id]).toEqual(['chapters', 'episodes']);
		expect(episodes.enabled).toBe(true);
	});

	it('saves Episodes where it was moved to, and as hidden once switched off', () => {
		const {result, updateSettings} = openPlayerButtons();
		act(() => result.current.moveLayoutButton('episodes', -1));
		act(() => result.current.toggleLayoutButton('episodes'));
		act(() => result.current.commitButtonLayout());
		const saved = updateSettings.mock.calls[0][0];
		expect(saved[OSD_ORDER_KEY].slice(0, 2)).toEqual(['episodes', 'chapters']);
		expect(saved[OSD_HIDDEN_KEY]).toEqual(['episodes']);
	});
});
