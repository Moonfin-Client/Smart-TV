import {renderHook, act} from '@testing-library/react';

import {fetchSubtitleData} from '../../services/playback';
import {getItemSecondarySubtitlePref} from '../../services/subtitlePrefs';
import useSecondarySubtitle from './useSecondarySubtitle';

jest.mock('../../services/playback', () => ({
	fetchSubtitleData: jest.fn()
}));
jest.mock('../../services/subtitlePrefs', () => ({
	getItemSecondarySubtitlePref: jest.fn(),
	saveSecondarySubtitlePref: jest.fn()
}));

const stream = (index) => ({index, codec: 'srt', language: 'eng', displayTitle: `Track ${index}`, isExternal: false, isTextBased: true});
const streams = [stream(2), stream(3)];
const item = {Id: 'item'};

const render = (enabled) => renderHook(
	(props) => useSecondarySubtitle({subtitleStreams: streams, primaryIndex: 2, available: true, ...props}),
	{initialProps: {enabled}}
);

describe('useSecondarySubtitle', () => {
	beforeEach(() => {
		fetchSubtitleData.mockResolvedValue({TrackEvents: []});
		getItemSecondarySubtitlePref.mockReset();
	});

	it('asks for the primary or secondary track only once the setting is on', () => {
		const {result, rerender} = render(false);
		expect(result.current.offered).toBe(false);

		rerender({enabled: true});
		expect(result.current.offered).toBe(true);
	});

	it("keeps the step for a track that's already showing, so it can still be turned off", () => {
		const {result, rerender} = render(true);
		act(() => {
			result.current.prepareForItem(item.Id);
			result.current.select(item, streams, 3);
		});

		rerender({enabled: false});
		expect(result.current.index).toBe(3);
		expect(result.current.offered).toBe(true);
	});

	it('puts a remembered track back only while the setting is on', async () => {
		getItemSecondarySubtitlePref.mockResolvedValue({index: 3, ordinal: 1, identity: {language: 'eng', displayTitle: 'Track 3', codec: 'srt', isExternal: false}});
		const {result, rerender} = render(false);
		act(() => result.current.prepareForItem(item.Id));

		await act(() => result.current.restore(item, streams, 2));
		expect(result.current.index).toBe(null);
		expect(getItemSecondarySubtitlePref).not.toHaveBeenCalled();

		rerender({enabled: true});
		await act(() => result.current.restore(item, streams, 2));
		expect(result.current.index).toBe(3);
	});
});
