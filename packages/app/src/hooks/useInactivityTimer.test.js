import {renderHook, act} from '@testing-library/react';
import useInactivityTimer from './useInactivityTimer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const remoteKey = (type, keyCode = 13) => {
	const event = new Event(type, {bubbles: true, cancelable: true});
	event.keyCode = keyCode;
	event.fromRemote = true;
	return event;
};

test('the first remote tap wakes without selecting covered content', () => {
	const {result, unmount} = renderHook(() => useInactivityTimer(10, true));
	const button = document.createElement('button');
	document.body.appendChild(button);
	const selected = jest.fn();
	button.addEventListener('keydown', selected);
	button.addEventListener('keyup', selected);
	act(() => jest.advanceTimersByTime(10000));
	expect(result.current.isInactive).toBe(true);
	act(() => {
		button.dispatchEvent(remoteKey('keydown'));
		button.dispatchEvent(remoteKey('keyup'));
	});
	expect(result.current.isInactive).toBe(false);
	expect(selected).not.toHaveBeenCalled();
	act(() => {
		button.dispatchEvent(remoteKey('keydown'));
		button.dispatchEvent(remoteKey('keyup'));
	});
	expect(selected).toHaveBeenCalledTimes(2);
	button.remove();
	unmount();
});

test('Search text interaction resets the existing timer rather than adding one', () => {
	const {result, unmount} = renderHook(() => useInactivityTimer(10, true));
	act(() => jest.advanceTimersByTime(9000));
	act(() => result.current.dismiss());
	act(() => jest.advanceTimersByTime(2000));
	expect(result.current.isInactive).toBe(false);
	act(() => jest.advanceTimersByTime(8000));
	expect(result.current.isInactive).toBe(true);
	unmount();
	expect(jest.getTimerCount()).toBe(0);
});
