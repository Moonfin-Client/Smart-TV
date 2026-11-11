import {renderHook, act} from '@testing-library/react';

import useChannelCarousel from './useChannelCarousel';

jest.mock('@enact/spotlight', () => ({focus: () => {}}));

jest.mock('../../services/jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	api: {getLiveTvChannels: () => Promise.resolve({Items: []})}
}));

const mockSetChannelFavorite = jest.fn();
jest.mock('../../services/channelCarouselPrewarm', () => ({
	createChannelCarouselPrewarm: () => ({store: {setChannelFavorite: mockSetChannelFavorite}, tuned: () => {}, dispose: () => {}})
}));

jest.mock('../../services/liveTvLastChannel', () => ({setLiveTvLastChannelId: () => {}}));

const channelA = {Id: 'a', Name: 'Channel A', Type: 'TvChannel'};
const channelB = {Id: 'b', Name: 'Channel B', Type: 'TvChannel'};
const lineup = [channelA, channelB];

const setup = () => {
	const onSwitchChannel = jest.fn();
	const props = {
		item: channelA,
		isLiveTV: true,
		liveTvChannels: lineup,
		sortBy: 'number',
		error: null,
		controlsVisible: false,
		showControls: () => {},
		hideControls: () => {},
		setFocusRow: () => {},
		onSwitchChannel
	};
	const {result, rerender} = renderHook((current) => useChannelCarousel(current), {initialProps: props});
	const update = (changes) => {
		Object.assign(props, changes);
		rerender({...props});
	};
	act(() => result.current.openCarousel());
	act(() => result.current.carouselProps.onSelect(channelB));
	return {result, update, onSwitchChannel};
};

afterEach(() => jest.useRealTimers());

test('a channel that starts playing closes the carousel', () => {
	const {result, update, onSwitchChannel} = setup();
	expect(onSwitchChannel).toHaveBeenCalledWith(channelB);
	update({item: channelB});
	act(() => result.current.markChannelPlaying());
	expect(result.current.carouselProps).toBe(null);
});

test('a channel that fails plays the previous one again and keeps the carousel up on it', () => {
	const {result, update, onSwitchChannel} = setup();
	update({item: channelB});
	update({error: 'API Error: 500'});
	expect(onSwitchChannel).toHaveBeenLastCalledWith(channelA);
	const props = result.current.carouselProps;
	expect(props).not.toBe(null);
	expect(props.selectionRevision).toBe(1);
	expect(props.notice.message).toBe('Failed to play Channel B');

	update({item: channelA});
	update({error: null});
	act(() => result.current.markChannelPlaying());
	expect(result.current.carouselProps).not.toBe(null);
	expect(onSwitchChannel).toHaveBeenCalledTimes(2);
});

test('an error left over from the channel before doesnt fail the switch, a new one does', () => {
	const {update, onSwitchChannel} = setup();
	update({item: channelB, error: 'old error'});
	expect(onSwitchChannel).toHaveBeenCalledTimes(1);
	update({error: 'new error'});
	expect(onSwitchChannel).toHaveBeenLastCalledWith(channelA);
});

test('a switch that never starts playing fails after the timeout', () => {
	jest.useFakeTimers();
	const {update, onSwitchChannel} = setup();
	update({item: channelB});
	act(() => jest.advanceTimersByTime(35000));
	expect(onSwitchChannel).toHaveBeenLastCalledWith(channelA);
});

test('picking another channel while a switch is running does nothing', () => {
	const {result, onSwitchChannel} = setup();
	act(() => result.current.carouselProps.onSelect(channelA));
	expect(onSwitchChannel).toHaveBeenCalledTimes(1);
});

test('a favorite set in the player shows in the lineup and the warm guide data', () => {
	const {result} = setup();
	act(() => result.current.markChannelFavorite('b', true));
	expect(result.current.carouselProps.channels.find((channel) => channel.Id === 'b').UserData.IsFavorite).toBe(true);
	expect(result.current.carouselProps.channels.find((channel) => channel.Id === 'a').UserData).toBeUndefined();
	expect(mockSetChannelFavorite).toHaveBeenCalledWith('b', true);
});
