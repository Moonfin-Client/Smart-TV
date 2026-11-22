import {fireEvent, render} from '@testing-library/react';

import {ChecklistDialog} from './BrowseViews';

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
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
// Containers and spottables become plain elements that carry their spotlight id.
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});

const OPTIONS = [
	{value: 'c', label: 'Charlie'},
	{value: 'a', label: 'alpha'},
	{value: 'b', label: 'Bravo'},
	{value: 'd', label: 'Delta'}
];

const rowLabels = (container) => [...container.querySelectorAll('[data-spotlight-id^="chk-"]')]
	.map((node) => node.getAttribute('data-spotlight-id'))
	.filter((id) => /^chk-\d+$/.test(id))
	.map((id) => container.querySelector(`[data-spotlight-id="${id}"]`).textContent);

const byId = (container, id) => container.querySelector(`[data-spotlight-id="${id}"]`);
const press = (container, id) => fireEvent.click(byId(container, id));

describe('ChecklistDialog', () => {
	test('lists the ticked rows first, sorted by label when asked, and keeps that order', () => {
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['d', 'b']} sortByLabel onSave={() => {}} onCancel={() => {}} />
		);
		expect(rowLabels(container)).toEqual(['Bravo', 'Delta', 'alpha', 'Charlie']);
		press(container, 'chk-0');
		expect(rowLabels(container)).toEqual(['Bravo', 'Delta', 'alpha', 'Charlie']);
	});

	test('saves picks in the order they were made and keeps picks the list never showed until Clear', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['b', 'gone']} onSave={onSave} onCancel={() => {}} />
		);
		// Rows: Bravo, Charlie, alpha, Delta
		press(container, 'chk-3');
		press(container, 'chk-1');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith(['b', 'gone', 'd', 'c']);
		press(container, 'chk-clear');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	test('Select All adds the rest and Clear empties the list', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['b']} onSave={onSave} onCancel={() => {}} />
		);
		press(container, 'chk-select-all');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith(['b', 'c', 'a', 'd']);
		press(container, 'chk-clear');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	test('with a cap there is no Select All, and an unticked row ignores a tick once the cap is reached', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['a']} max={2} onSave={onSave} onCancel={() => {}} />
		);
		expect(byId(container, 'chk-select-all')).toBeNull();
		press(container, 'chk-1');
		press(container, 'chk-2');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenCalledWith(['a', 'c']);
	});

	test('Cancel saves nothing', () => {
		const onSave = jest.fn();
		const onCancel = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={[]} onSave={onSave} onCancel={onCancel} />
		);
		press(container, 'chk-0');
		press(container, 'chk-cancel');
		expect(onCancel).toHaveBeenCalled();
		expect(onSave).not.toHaveBeenCalled();
	});
});
