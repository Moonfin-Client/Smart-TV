import {fireEvent, render} from '@testing-library/react';

import PhotoViewer from './PhotoViewer';

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
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: {}})}));
jest.mock('../../services/video', () => ({initVideo: () => Promise.resolve(), keepScreenOn: jest.fn()}));
jest.mock('../../utils/helpers', () => ({getImageUrl: (url, id) => `${url}/${id}`}));

const photo = {Id: 'p1', Type: 'Photo', Name: 'Beach'};
const video = {Id: 'v1', Type: 'Video', Name: 'Waves'};
const items = [photo, video, {Id: 'p2', Type: 'Photo', Name: 'Pier'}];

const open = (props) => {
	const handlers = {onClose: jest.fn(), onPlayVideo: jest.fn()};
	const view = render(<PhotoViewer item={photo} items={items} serverUrl="http://server" {...handlers} {...props} />);
	return {...view, ...handlers};
};
const press = (keyCode) => fireEvent.keyDown(window, {keyCode});
const stillOf = (container, id) => container.querySelector(`img[data-id="${id}"]`);

test('browsing onto a video shows its still and leaves the player alone', () => {
	const {container, onPlayVideo} = open();
	press(39);

	expect(onPlayVideo).not.toHaveBeenCalled();
	expect(stillOf(container, 'v1')).toBeTruthy();
});

test('a running slideshow hands a video it reaches to the player', () => {
	const {container, onPlayVideo} = open({running: true});
	press(39);

	expect(onPlayVideo).toHaveBeenCalledWith(video, 1);
	expect(stillOf(container, 'v1')).toBeNull();
});

test('a slideshow that passes over videos shows one it is stepped onto as its still', () => {
	const {container, onPlayVideo} = open({running: true, videos: false});
	press(39);

	expect(onPlayVideo).not.toHaveBeenCalled();
	expect(stillOf(container, 'v1')).toBeTruthy();
});

// The info shows for the first few seconds after the viewer opens.
test('Back closes the viewer straight away, with the info still up', () => {
	const {onClose} = open();
	press(27);

	expect(onClose).toHaveBeenCalledWith(photo);
});
