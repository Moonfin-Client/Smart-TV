import {act, renderHook} from '@testing-library/react';

import * as playback from '../../services/playback';
import useEndedOnServer from './useEndedOnServer';

jest.mock('../../services/playback', () => {
	const listeners = new Set();
	return {
		onEndedOnServer: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		releaseEndedOnServer: jest.fn(),
		tell: (itemId) => listeners.forEach((listener) => listener(itemId))
	};
});

const setup = (itemId = 'movie-1') => {
	let finishStop;
	const props = {
		itemId,
		stop: jest.fn(() => new Promise((resolve) => {
			finishStop = resolve;
		})),
		close: jest.fn(),
		onEndedOnServer: jest.fn()
	};
	const hook = renderHook((current) => useEndedOnServer(current), {initialProps: props});
	return {props, hook, finishStop: () => act(async () => finishStop())};
};

beforeEach(() => jest.clearAllMocks());

describe('the player when Silo ended its session', () => {
	test('stops at once, then says why and closes, once', async () => {
		const {props, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		expect(props.stop).toHaveBeenCalledTimes(1);
		expect(props.close).not.toHaveBeenCalled();
		// The replan, the reconnect and a fallback hear it too while it stops.
		act(() => playback.tell('movie-1'));
		await finishStop();
		expect(props.stop).toHaveBeenCalledTimes(1);
		expect(props.onEndedOnServer).toHaveBeenCalledTimes(1);
		expect(props.close).toHaveBeenCalledTimes(1);
	});

	test('another item\'s end closes nothing', () => {
		const {props} = setup();
		act(() => playback.tell('movie-2'));
		expect(props.stop).not.toHaveBeenCalled();
	});

	test('a Next or another title picked while it stops plays on', async () => {
		const {props, hook, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		hook.rerender({...props, itemId: 'movie-2'});
		await finishStop();
		expect(props.close).not.toHaveBeenCalled();
		expect(props.onEndedOnServer).not.toHaveBeenCalled();
	});

	test('the same title picked again while it stops closes like the rest', async () => {
		const {props, hook, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		hook.rerender({...props});
		// Its load is turned away and reports the end once more.
		await act(async () => hook.result.current('movie-1'));
		await finishStop();
		expect(props.stop).toHaveBeenCalledTimes(1);
		expect(props.close).toHaveBeenCalledTimes(1);
	});

	test('a later end of the same title, after another played, is heard again', async () => {
		const {props, hook, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		hook.rerender({...props, itemId: 'movie-2'});
		await finishStop();
		hook.rerender({...props, itemId: 'movie-1'});
		act(() => playback.tell('movie-1'));
		expect(props.stop).toHaveBeenCalledTimes(2);
	});

	test('closing the player lets go of what it held', () => {
		const {hook} = setup();
		hook.unmount();
		expect(playback.releaseEndedOnServer).toHaveBeenCalledTimes(1);
	});
});
