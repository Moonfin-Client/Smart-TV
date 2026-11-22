import {fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../context/defaultSettings';
import HomeRowsView from './HomeRowsView';

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
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	// Spotlight's own key handlers mean nothing to a plain element.
	return ({spotlightId, className, ...props}) => React.createElement(type, {
		...Object.fromEntries(Object.entries(props).filter(([name]) => !name.startsWith('onSpotlight'))),
		className: className ? `${className} spottable` : 'spottable',
		'data-spotlight-id': spotlightId
	});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('../../components/LoadingSpinner', () => () => null);

const ROWS = [
	{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
	{id: 'nextup', name: 'Next Up', enabled: false, order: 1}
];

const draw = (loading) => (
	<HomeRowsView
		settings={defaultSettings}
		serverUrl='http://server'
		servers={[]}
		tempHomeRows={ROWS}
		loading={loading}
		serverHasLiveTv
		onToggleHomeRow={() => {}}
		onMoveHomeRow={() => {}}
		onReset={() => {}}
		onLeave={() => {}}
	/>
);

describe('HomeRowsView', () => {
	test('every disabled group starts closed and opens when picked', () => {
		render(draw(false));
		expect(screen.getByText('Continue Watching')).toBeTruthy();
		expect(screen.queryByText('Next Up')).toBeNull();
		fireEvent.click(screen.getByText('General'));
		expect(screen.getByText('Next Up')).toBeTruthy();
	});

	test('focus lands on the first row once the lists are in, not on Reset in the title', () => {
		Spotlight.focus.mockClear();
		const {rerender} = render(draw(true));
		expect(Spotlight.focus).not.toHaveBeenCalled();
		rerender(draw(false));
		expect(Spotlight.focus).toHaveBeenLastCalledWith(document.querySelector('[data-spotlight-id="homerow-resume"]'));
	});
});
