import {renderHook} from '@testing-library/react';
import useGamepadButtons from './useGamepadButtons';

let frames;
let pads;
const pad = (pressed) => ({buttons: Array.from({length: 17}, (_, index) => ({pressed: pressed.includes(index)}))});
const nextFrame = () => {
	const due = frames;
	frames = [];
	due.forEach((cb) => cb());
};

beforeEach(() => {
	frames = [];
	pads = [];
	Object.defineProperty(navigator, 'getGamepads', {value: () => pads, configurable: true});
	window.requestAnimationFrame = (cb) => frames.push(cb);
	window.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
	delete navigator.getGamepads;
});

test('reports each change on the first connected pad', () => {
	const onButton = jest.fn();
	renderHook(() => useGamepadButtons(onButton));

	pads = [null, pad([0]), pad([5])];
	nextFrame();
	nextFrame();
	pads = [null, pad([])];
	nextFrame();

	expect(onButton.mock.calls).toEqual([[0, true], [0, false]]);
});

test('starts over when the pad goes away', () => {
	const onButton = jest.fn();
	renderHook(() => useGamepadButtons(onButton));

	pads = [pad([9])];
	nextFrame();
	pads = [];
	nextFrame();
	pads = [pad([9])];
	nextFrame();

	expect(onButton.mock.calls).toEqual([[9, true], [9, true]]);
});

test('stops polling once unmounted', () => {
	const {unmount} = renderHook(() => useGamepadButtons(jest.fn()));

	unmount();

	expect(window.cancelAnimationFrame).toHaveBeenCalled();
});
