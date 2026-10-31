import {fireEvent, renderHook} from '@testing-library/react';

import useOffsetHold, {holdOffsetSeconds} from './useOffsetHold';

const ENTER = 13;

const keyDown = (props) => props.onKeyDown({keyCode: ENTER});
const keyUp = () => fireEvent.keyUp(window, {keyCode: ENTER});
const click = (props) => props.onClick();

describe('holdOffsetSeconds', () => {
	test('grows from a tenth of a second to half a second and then a second over a hold', () => {
		expect([1, 3, 4, 9, 10, 40].map(holdOffsetSeconds)).toEqual([0.1, 0.1, 0.5, 0.5, 1, 1]);
	});
});

describe('useOffsetHold', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const setup = (offset = 0, limit = 60) => {
		const onChange = jest.fn();
		const view = renderHook(() => useOffsetHold(offset, onChange, limit));
		return {onChange, props: (direction) => view.result.current.buttonProps(direction)};
	};

	test('a press shorter than a hold moves one step, whichever way it is', () => {
		const {onChange, props} = setup(0.3);
		keyDown(props(-1));
		jest.advanceTimersByTime(300);
		keyUp();
		click(props(-1));
		expect(onChange.mock.calls).toEqual([[0.2]]);
	});

	test('a held press keeps moving, growing its step and never adding one on the way out', () => {
		const {onChange, props} = setup(0);
		keyDown(props(1));
		jest.advanceTimersByTime(3000);
		expect(onChange.mock.calls.map(([seconds]) => seconds)).toEqual([
			0.1, 0.2, 0.3, 0.8, 1.3, 1.8, 2.3, 2.8, 3.3, 4.3, 5.3, 6.3, 7.3
		]);
		keyUp();
		click(props(1));
		expect(onChange).toHaveBeenCalledTimes(13);
	});

	test('waits for the hold before repeating, so a quick press never moves early', () => {
		const {onChange, props} = setup(0);
		keyDown(props(1));
		jest.advanceTimersByTime(599);
		expect(onChange).not.toHaveBeenCalled();
	});

	test('a repeat from the remote does not restart the wait for the hold', () => {
		const {onChange, props} = setup(0);
		keyDown(props(1));
		jest.advanceTimersByTime(300);
		keyDown(props(1));
		jest.advanceTimersByTime(400);
		expect(onChange.mock.calls).toEqual([[0.1]]);
	});

	test('stops at the limit, says nothing more once there, and still swallows the release', () => {
		const {onChange, props} = setup(4.9, 5);
		keyDown(props(1));
		jest.advanceTimersByTime(1000);
		keyUp();
		click(props(1));
		expect(onChange.mock.calls).toEqual([[5]]);
	});

	test('a single step never passes the limit either', () => {
		const {onChange, props} = setup(5, 5);
		keyDown(props(1));
		keyUp();
		click(props(1));
		expect(onChange.mock.calls).toEqual([[5]]);
	});

	test('stops when the overlay unmounts', () => {
		const onChange = jest.fn();
		const view = renderHook(() => useOffsetHold(0, onChange, 60));
		keyDown(view.result.current.buttonProps(1));
		jest.advanceTimersByTime(600);
		view.unmount();
		jest.advanceTimersByTime(2000);
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});
