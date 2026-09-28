import {renderHook, act} from '@testing-library/react';
import useInactivityTimer from './useInactivityTimer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('wake answers true only while the screensaver is showing', () => {
	const {result, unmount} = renderHook(() => useInactivityTimer(10, true));
	expect(result.current.wake()).toBe(false);
	act(() => jest.advanceTimersByTime(10000));
	expect(result.current.isInactive).toBe(true);
	let woke;
	act(() => { woke = result.current.wake(); });
	expect(woke).toBe(true);
	expect(result.current.isInactive).toBe(false);
	expect(result.current.wake()).toBe(false);
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
