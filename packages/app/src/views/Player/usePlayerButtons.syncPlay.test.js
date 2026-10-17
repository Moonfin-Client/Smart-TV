import {renderHook} from '@testing-library/react';

import {usePlayerButtons} from './PlayerControls';
import {OSD_HIDDEN_KEY} from '../../utils/buttonLayout';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('@enact/spotlight/Spottable', () => ({__esModule: true, default: (tag) => tag}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => ({__esModule: true, default: (config, tag) => tag}));
jest.mock('../../utils/spotlightContainers', () => ({ModalContainer: 'div'}));
// Only the button lists are under test, so the parts of the controls that draw things stay out.
jest.mock('@enact/sandstone/Scroller', () => () => null);
jest.mock('../../services/playback', () => ({}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => 'http://server'}));
jest.mock('../../components/TrickplayPreview', () => () => null);
jest.mock('./SubtitleOffsetOverlay', () => () => null);
jest.mock('./SubtitleSettingsOverlay', () => () => null);
jest.mock('./EpisodeBrowser', () => () => null);
jest.mock('./SyncPlayPlayerPanel', () => () => null);
jest.mock('../../components/TrackOptionRow', () => ({__esModule: true, default: () => null, TrackDivider: () => null}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));

let mockSettings;
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));

const baseProps = {
	isPaused: false, audioStreams: [], subtitleStreams: [], chapters: [],
	nextEpisode: null, isAudioMode: false, isLiveTV: false, hasNextTrack: false, hasPrevTrack: false,
	shuffleMode: false, repeatMode: 'off', selectedQuality: null,
	selectedSubtitleIndex: -1, canDownloadRemoteSubtitles: false, hasCastMembers: false,
	zoomModeLabel: 'Fit', zoomModeKey: 'fit', sleepMinutes: null
};

const rowIds = (props) => {
	const {result} = renderHook(() => usePlayerButtons({...baseProps, ...props}));
	return result.current.bottomButtons.map((button) => button.id);
};

beforeEach(() => {
	mockSettings = {};
});

describe('the SyncPlay player button', () => {
	test('leads the row while this device is in a group, and opens the SyncPlay panel', () => {
		const {result} = renderHook(() => usePlayerButtons({...baseProps, inSyncPlayGroup: true}));
		const [first] = result.current.bottomButtons;
		expect(first.id).toBe('syncPlay');
		expect(first.action).toBe('syncPlay');
	});

	test('is not there outside a group', () => {
		expect(rowIds({})).not.toContain('syncPlay');
		expect(rowIds({inSyncPlayGroup: false})).not.toContain('syncPlay');
	});

	test('stays off when hidden in Player Buttons', () => {
		mockSettings = {[OSD_HIDDEN_KEY]: ['syncPlay']};
		const {result} = renderHook(() => usePlayerButtons({...baseProps, inSyncPlayGroup: true}));
		expect(result.current.bottomButtons.map((button) => button.id)).not.toContain('syncPlay');
	});

	test('is not offered on live TV or music, where Core has none either', () => {
		expect(rowIds({inSyncPlayGroup: true, isLiveTV: true})).not.toContain('syncPlay');
		expect(rowIds({inSyncPlayGroup: true, isAudioMode: true})).not.toContain('syncPlay');
	});
});
