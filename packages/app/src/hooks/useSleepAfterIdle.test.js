import {renderHook, act} from '@testing-library/react';

import * as remoteControl from '../services/remoteControl';
import {exitApp} from '../utils/appLifecycle';
import useSleepAfterIdle from './useSleepAfterIdle';

jest.mock('../services/remoteControl', () => ({releasePlayer: jest.fn()}));
jest.mock('../utils/appLifecycle', () => ({exitApp: jest.fn()}));

const MINUTE = 60 * 1000;

const flush = async () => {
	await act(async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve();
	});
};

const press = () => act(() => {
	window.dispatchEvent(new window.KeyboardEvent('keydown', {bubbles: true}));
});

beforeEach(() => {
	jest.useFakeTimers();
	remoteControl.releasePlayer.mockResolvedValue();
});
afterEach(() => jest.useRealTimers());

test('closes the app once the set time passes with nothing pressed, after the player reports its stop', async () => {
	const {unmount} = renderHook(() => useSleepAfterIdle(30, true, false));
	act(() => jest.advanceTimersByTime(29 * MINUTE));
	await flush();
	expect(exitApp).not.toHaveBeenCalled();

	act(() => jest.advanceTimersByTime(MINUTE));
	await flush();
	expect(remoteControl.releasePlayer).toHaveBeenCalledTimes(1);
	expect(exitApp).toHaveBeenCalledTimes(1);
	unmount();
});

test('a button press starts the wait over', async () => {
	const {unmount} = renderHook(() => useSleepAfterIdle(30, true, false));
	act(() => jest.advanceTimersByTime(20 * MINUTE));
	press();
	act(() => jest.advanceTimersByTime(20 * MINUTE));
	await flush();
	expect(exitApp).not.toHaveBeenCalled();

	act(() => jest.advanceTimersByTime(10 * MINUTE));
	await flush();
	expect(exitApp).toHaveBeenCalledTimes(1);
	unmount();
});

test('closing the screensaver starts the wait over, since the key that woke it goes no further', async () => {
	const {rerender, unmount} = renderHook(({shown}) => useSleepAfterIdle(30, true, shown), {initialProps: {shown: false}});
	act(() => jest.advanceTimersByTime(20 * MINUTE));
	rerender({shown: true});
	rerender({shown: false});
	act(() => jest.advanceTimersByTime(20 * MINUTE));
	await flush();
	expect(exitApp).not.toHaveBeenCalled();
	unmount();
});

test('never closes while something plays or with the setting off', async () => {
	const {unmount: unmountPlaying} = renderHook(() => useSleepAfterIdle(30, false, false));
	const {unmount: unmountOff} = renderHook(() => useSleepAfterIdle(0, true, false));
	act(() => jest.advanceTimersByTime(5 * 60 * MINUTE));
	await flush();
	expect(exitApp).not.toHaveBeenCalled();
	unmountPlaying();
	unmountOff();
});

test('a stop report that never answers holds the close back five seconds at most', async () => {
	remoteControl.releasePlayer.mockReturnValue(new Promise(() => {}));
	const {unmount} = renderHook(() => useSleepAfterIdle(15, true, false));
	act(() => jest.advanceTimersByTime(15 * MINUTE));
	await flush();
	expect(exitApp).not.toHaveBeenCalled();

	act(() => jest.advanceTimersByTime(5000));
	await flush();
	expect(exitApp).toHaveBeenCalledTimes(1);
	unmount();
});
