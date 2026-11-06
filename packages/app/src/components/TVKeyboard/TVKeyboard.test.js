import {act, fireEvent, render} from '@testing-library/react';

import TVKeyboard from './TVKeyboard';
import {openTvKeyboard} from './keyboardBus';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

let mockKeyboardStyle = 'classic';
const mockUpdateSetting = jest.fn();
// Holds the style in state so a pick from the keyboard renders it again, as the real settings do
jest.mock('../../context/SettingsContext', () => ({
	useSettings: () => {
		const [keyboardStyle, setKeyboardStyle] = require('react').useState(mockKeyboardStyle);
		return {
			settings: {...require('../../context/defaultSettings').defaultSettings, keyboardStyle},
			activeTheme: require('../../theme/themeRegistry').resolveThemeById('moonfin'),
			updateSetting: (key, value) => {
				mockUpdateSetting(key, value);
				if (key === 'keyboardStyle') setKeyboardStyle(value);
			}
		};
	}
}));

let mockOnXbox = false;
jest.mock('../../platform', () => ({
	...jest.requireActual('../../platform'),
	isXbox: () => mockOnXbox
}));

const press = (keyCode) => act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', {keyCode, which: keyCode, bubbles: true, cancelable: true})));
const tap = () => {
	press(13);
	act(() => window.dispatchEvent(new window.KeyboardEvent('keyup', {keyCode: 13, which: 13, bubbles: true, cancelable: true})));
};

const UP = 38;
const DOWN = 40;
const LEFT = 37;
const RIGHT = 39;

const Y = 198;
const RIGHT_BUMPER = 199;
const LEFT_BUMPER = 200;
const LEFT_STICK_PRESS = 209;
const RIGHT_STICK_RIGHT = 217;
const RIGHT_STICK_LEFT = 218;
// The left trigger comes in as rewind
const LEFT_TRIGGER = 227;

const shownKey = (label) => document.querySelector(`[data-key="${label}"]`);

const open = (over = {}) => {
	const session = {value: 'ab', onChange: jest.fn(), onClose: jest.fn(), ...over};
	render(<TVKeyboard />);
	act(() => {
		expect(openTvKeyboard(session)).toBe(true);
	});
	return session;
};

describe('the TV keyboard on a controller', () => {
	test('Backspace takes the last character off', () => {
		const {onChange} = open();
		press(8);
		expect(onChange).toHaveBeenLastCalledWith('a', 1);
	});

	test('the Menu button finishes typing as the done key does', () => {
		const {onChange, onClose} = open();
		press(93);
		expect(onClose).toHaveBeenCalledWith({submitted: true, reason: undefined});
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe('the Xbox keyboard shortcuts', () => {
	beforeEach(() => {
		mockOnXbox = true;
	});

	afterEach(() => {
		mockOnXbox = false;
	});

	test('Y types a space', () => {
		const {onChange} = open();
		press(Y);
		expect(onChange).toHaveBeenLastCalledWith('ab ', 3);
	});

	test('the bumpers move the cursor', () => {
		const {onChange} = open();
		press(LEFT_BUMPER);
		expect(onChange).toHaveBeenLastCalledWith('ab', 1);
		press(RIGHT_BUMPER);
		expect(onChange).toHaveBeenLastCalledWith('ab', 2);
	});

	test('pressing the left stick shifts the letters', () => {
		open();
		expect(shownKey('q')).not.toBeNull();
		press(LEFT_STICK_PRESS);
		expect(shownKey('Q')).not.toBeNull();
		press(LEFT_STICK_PRESS);
		expect(shownKey('q')).not.toBeNull();
	});

	test('the left trigger flips between the letters and the symbols', () => {
		open();
		press(LEFT_TRIGGER);
		expect(shownKey('ABC')).not.toBeNull();
		press(LEFT_TRIGGER);
		expect(shownKey('123')).not.toBeNull();
	});

	test('the right stick walks the suggestions and A takes one', () => {
		const {onChange} = open({purpose: 'url'});
		press(RIGHT_STICK_RIGHT);
		press(RIGHT_STICK_RIGHT);
		press(13);
		expect(onChange).toHaveBeenLastCalledWith('abhttp://', 9);
	});

	test('the right stick to the left starts from the last suggestion', () => {
		const {onChange} = open({purpose: 'email'});
		press(RIGHT_STICK_LEFT);
		press(13);
		expect(onChange).toHaveBeenLastCalledWith('ab.', 3);
	});

	test('a shortcut does nothing on a layout without its key', () => {
		const {onChange} = open({value: '12', purpose: 'numeric'});
		press(Y);
		press(LEFT_TRIGGER);
		press(LEFT_STICK_PRESS);
		expect(onChange).not.toHaveBeenCalled();
		expect(shownKey('ABC')).toBeNull();
		press(LEFT_BUMPER);
		expect(onChange).toHaveBeenLastCalledWith('12', 1);
	});

	test('the shortcuts do nothing on other platforms', () => {
		mockOnXbox = false;
		const {onChange} = open();
		press(LEFT_TRIGGER);
		press(Y);
		expect(onChange).not.toHaveBeenCalled();
		expect(shownKey('123')).not.toBeNull();
	});
});

describe('the docked keyboard', () => {
	beforeEach(() => {
		mockKeyboardStyle = 'docked';
	});

	afterEach(() => {
		mockKeyboardStyle = 'classic';
		mockOnXbox = false;
	});

	test('starts on the first letter rather than the rail', () => {
		const {onChange} = open();
		tap();
		expect(onChange).toHaveBeenLastCalledWith('abq', 3);
	});

	test('Right from space skips the rest of the bar to the cursor key', () => {
		const {onChange} = open();
		[DOWN, DOWN, DOWN, RIGHT].forEach(press);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('ab', 1);
	});

	test('Up from space goes back to the column it was entered from', () => {
		const {onChange} = open();
		[RIGHT, RIGHT, RIGHT, DOWN, DOWN, DOWN].forEach(press);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('ab ', 3);
		press(UP);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('ab v', 4);
	});

	test('Left from the rail wraps to Delete, and one Down crosses it to Done', () => {
		const {onChange, onClose} = open();
		[LEFT, LEFT].forEach(press);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('a', 1);
		press(DOWN);
		press(LEFT);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('a@', 2);
		press(RIGHT);
		tap();
		expect(onClose).toHaveBeenCalledWith({submitted: true, reason: undefined});
	});

	test('Right from the action column wraps to the rail, and a mode key keeps focus', () => {
		const {onChange} = open();
		[DOWN, LEFT, LEFT].forEach(press);
		press(RIGHT);
		tap();
		expect(shownKey('Q')).not.toBeNull();
		press(RIGHT);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('abA', 3);
		[LEFT, DOWN].forEach(press);
		tap();
		expect(shownKey('1')).not.toBeNull();
		press(RIGHT);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('abA-', 4);
		[LEFT, UP, UP].forEach(press);
		tap();
		expect(shownKey('q')).not.toBeNull();
	});

	test('finishes the first suggestion that would replace the text', () => {
		open({value: 'https://de', purpose: 'url', recents: ['https://demo.moonfin.org']});
		expect(document.querySelector('.ghost').textContent).toBe('mo.moonfin.org');
	});

	test('leaves the ghost off a helper that gets added to the text', () => {
		open({value: 'ht', purpose: 'url'});
		expect(document.querySelector('.ghost')).toBeNull();
	});

	test('echoes a password as dots', () => {
		open({value: 'secret', purpose: 'password', password: true});
		expect(document.body.textContent).toContain('••••••');
		expect(document.body.textContent).not.toContain('secret');
	});

	test('shows a password from the chip above the keys, and starts as dots again next time', () => {
		const {onReveal} = open({value: 'secret', purpose: 'password', password: true, onReveal: jest.fn()});
		press(UP);
		tap();
		expect(onReveal).toHaveBeenLastCalledWith(true);
		expect(document.body.textContent).toContain('secret');
		expect(document.body.textContent).toContain('Hide password');
		act(() => {
			openTvKeyboard({value: 'secret', purpose: 'password', password: true});
		});
		expect(document.body.textContent).not.toContain('secret');
	});

	test('doesnt mark a hidden password inside the chip\'s own words', () => {
		open({value: 'pass', purpose: 'password', password: true});
		expect(document.body.textContent).toContain('Show password');
		expect(document.querySelector('.match')).toBeNull();
	});

	test('a number field gets only the pad, with no rail or hints', () => {
		const {onChange} = open({value: '12', purpose: 'numeric'});
		expect(shownKey('MODE_LOWER')).toBeNull();
		expect(document.body.textContent).not.toContain('hold for accents');
		[RIGHT, DOWN].forEach(press);
		tap();
		expect(onChange).toHaveBeenLastCalledWith('125', 3);
	});

	test('the left stick on an Xbox switches the rail to capitals', () => {
		mockOnXbox = true;
		open();
		press(LEFT_STICK_PRESS);
		expect(shownKey('Q')).not.toBeNull();
	});
});

describe('the glass keyboard', () => {
	beforeEach(() => {
		mockKeyboardStyle = 'glass';
	});

	afterEach(() => {
		mockKeyboardStyle = 'classic';
	});

	test('types on the classic grid, with the accents hint and a Search key', () => {
		const {onChange} = open({purpose: 'search'});
		expect(document.body.textContent).toContain('hold for accents');
		expect(document.body.textContent).toContain('Search');
		press(39);
		press(13);
		expect(onChange).toHaveBeenLastCalledWith('abw', 3);
	});
});

describe('the keyboard style picker', () => {
	const styleRows = () => [...document.querySelectorAll('[data-value]')];
	const checked = () => styleRows().filter((row) => row.querySelector('svg')).map((row) => row.dataset.value);
	// The keyboard key sits second from the end of the bottom row, or at the foot of the docked rail
	const openPicker = (style) => {
		if (style === 'docked') [DOWN, DOWN, DOWN, LEFT].forEach(press);
		else [DOWN, DOWN, DOWN, LEFT, LEFT].forEach(press);
		tap();
	};

	beforeEach(() => {
		mockUpdateSetting.mockClear();
	});

	afterEach(() => {
		mockKeyboardStyle = 'classic';
	});

	test.each(['classic', 'glass', 'docked'])('opens from the %s keyboard key with that style checked', (style) => {
		mockKeyboardStyle = style;
		open();
		openPicker(style);
		expect(styleRows().map((row) => row.textContent)).toEqual(['Native', 'Classic', 'Glass', 'Docked']);
		expect(checked()).toEqual([style]);
	});

	test('starts on the current style, so OK right away keeps it', () => {
		const {onClose} = open();
		openPicker('classic');
		tap();
		expect(mockUpdateSetting).toHaveBeenLastCalledWith('keyboardStyle', 'classic');
		expect(styleRows()).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();
	});

	test('Down picks the next style, which saves it and switches the open keyboard', () => {
		const {onChange} = open();
		openPicker('classic');
		press(DOWN);
		tap();
		expect(mockUpdateSetting).toHaveBeenLastCalledWith('keyboardStyle', 'glass');
		expect(document.body.textContent).toContain('hold for accents');
		tap();
		expect(onChange).toHaveBeenLastCalledWith('abq', 3);
	});

	test('Up wraps from the top, and Docked starts on its first letter', () => {
		const {onChange} = open();
		openPicker('classic');
		press(UP);
		press(UP);
		tap();
		expect(mockUpdateSetting).toHaveBeenLastCalledWith('keyboardStyle', 'docked');
		expect(shownKey('MODE_LOWER')).not.toBeNull();
		tap();
		expect(onChange).toHaveBeenLastCalledWith('abq', 3);
	});

	test('Native saves it and hands the field to the TV keyboard', () => {
		const onSystemKeyboard = jest.fn();
		const {onClose} = open({onSystemKeyboard});
		openPicker('classic');
		press(UP);
		tap();
		expect(mockUpdateSetting).toHaveBeenLastCalledWith('keyboardStyle', 'native');
		expect(onClose).toHaveBeenCalledWith({submitted: false, reason: undefined});
		expect(onSystemKeyboard).toHaveBeenCalled();
	});

	test.each([27, 461, 10009])('Back (%i) closes only the picker', (code) => {
		mockKeyboardStyle = 'docked';
		const {onClose} = open();
		openPicker('docked');
		press(code);
		expect(styleRows()).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();
		expect(mockUpdateSetting).not.toHaveBeenCalled();
		expect(shownKey('MODE_LOWER')).not.toBeNull();
	});

	test('a click on a style picks it without opening the picker again', () => {
		const {onClose} = open();
		fireEvent.click(shownKey('IME'));
		expect(checked()).toEqual(['classic']);
		fireEvent.click(document.querySelector('[data-value="docked"]'));
		expect(mockUpdateSetting).toHaveBeenLastCalledWith('keyboardStyle', 'docked');
		expect(styleRows()).toHaveLength(0);
		expect(shownKey('MODE_LOWER')).not.toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});
});
