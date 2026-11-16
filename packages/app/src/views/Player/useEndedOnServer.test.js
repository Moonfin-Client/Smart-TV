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
	const view = renderHook((current) => useEndedOnServer(current), {initialProps: props});
	return {props, view, finishStop: () => act(async () => finishStop())};
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
		const {props, view, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		view.rerender({...props, itemId: 'movie-2'});
		await finishStop();
		expect(props.close).not.toHaveBeenCalled();
		expect(props.onEndedOnServer).not.toHaveBeenCalled();
	});

	test('the same title picked again while it stops closes like the rest', async () => {
		const {props, view, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		view.rerender({...props});
		// Its load is turned away and reports the end once more.
		act(() => playback.tell('movie-1'));
		await finishStop();
		expect(props.stop).toHaveBeenCalledTimes(1);
		expect(props.close).toHaveBeenCalledTimes(1);
	});

	test('a later end of the same title, after another played, is heard again', async () => {
		const {props, view, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		view.rerender({...props, itemId: 'movie-2'});
		await finishStop();
		view.rerender({...props, itemId: 'movie-1'});
		act(() => playback.tell('movie-1'));
		expect(props.stop).toHaveBeenCalledTimes(2);
	});

	test('a Next App asked for, still being checked before it shows, plays on', async () => {
		let asked = 'movie-1';
		const {props, view, finishStop} = setup();
		view.rerender({...props, askedItemId: () => asked});
		act(() => playback.tell('movie-1'));
		asked = 'movie-2';
		await finishStop();
		expect(props.close).not.toHaveBeenCalled();
	});

	test('a Back that already closed it shows no message', async () => {
		const {props, view, finishStop} = setup();
		view.rerender({...props, close: jest.fn(() => false)});
		act(() => playback.tell('movie-1'));
		await finishStop();
		expect(props.onEndedOnServer).not.toHaveBeenCalled();
	});

	test('a player gone while it stopped closes nothing more', async () => {
		const {props, view, finishStop} = setup();
		act(() => playback.tell('movie-1'));
		view.unmount();
		await finishStop();
		expect(props.close).not.toHaveBeenCalled();
	});

	test('closing the player lets go of what it held', () => {
		const {view} = setup();
		view.unmount();
		expect(playback.releaseEndedOnServer).toHaveBeenCalledTimes(1);
	});
});
