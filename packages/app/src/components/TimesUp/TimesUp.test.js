import {act, fireEvent, render, screen} from '@testing-library/react';

import TimesUp, {describeNextAccess} from './TimesUp';

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

jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightDefault, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({children, ...props}) => React.createElement(type, props, children);
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));

// 2026-10-19 is a Monday.
const NOW = new Date(2026, 9, 19, 21, 0);

const press = (keyCode) => {
	const event = new window.KeyboardEvent('keydown', {keyCode, which: keyCode, bubbles: true, cancelable: true});
	act(() => {
		window.dispatchEvent(event);
	});
	return event;
};

describe('describeNextAccess', () => {
	test('says today, tomorrow or the day', () => {
		expect(describeNextAccess(new Date(2026, 9, 19, 23, 30), NOW, '24-hour'))
			.toBe('You can use it again today at 23:30.');
		expect(describeNextAccess(new Date(2026, 9, 20, 8), NOW, '12-hour'))
			.toBe('You can use it again tomorrow at 8:00 AM.');
		expect(describeNextAccess(new Date(2026, 9, 26, 8), NOW, '24-hour'))
			.toMatch(/^You can use it again on .+ at 08:00\.$/);
	});

	test('says nothing when no entry opens soon', () => {
		expect(describeNextAccess(null, NOW, '24-hour')).toBeNull();
	});
});

describe('the Time\'s up screen', () => {
	const show = (over = {}) => render(
		<TimesUp nextAccess={new Date(2026, 9, 20, 8)} now={NOW} clockDisplay="24-hour" onSwitchUser={jest.fn()} {...over} />
	);

	test('tells the viewer when they can use it again', () => {
		show();

		screen.getByText('Time\'s up');
		screen.getByText('You can use it again tomorrow at 08:00.');
	});

	test('leaves the opening line out when there is none', () => {
		show({nextAccess: null});

		expect(screen.queryByText(/You can use it again/)).toBeNull();
	});

	test('Switch User asks to leave the account', () => {
		const onSwitchUser = jest.fn();
		show({onSwitchUser});

		fireEvent.click(screen.getByText('Switch User'));

		expect(onSwitchUser).toHaveBeenCalledTimes(1);
	});

	test.each([[27, 'Escape'], [8, 'Backspace'], [38, 'Up'], [40, 'Down'], [37, 'Left'], [39, 'Right']])(
		'key %i (%s) is taken before anything behind the screen sees it', (code) => {
			show();
			const behind = jest.fn();
			window.addEventListener('keydown', behind);

			const event = press(code);
			window.removeEventListener('keydown', behind);

			expect(event.defaultPrevented).toBe(true);
			expect(behind).not.toHaveBeenCalled();
		}
	);

	test('Enter is left for the button', () => {
		show();

		expect(press(13).defaultPrevented).toBe(false);
	});

	test('stops taking keys once it is gone', () => {
		const {unmount} = show();
		unmount();

		expect(press(38).defaultPrevented).toBe(false);
	});
});
