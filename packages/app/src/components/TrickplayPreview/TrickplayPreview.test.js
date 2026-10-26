import {render, waitFor} from '@testing-library/react';

import TrickplayPreview from './TrickplayPreview';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

jest.mock('../../services/jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	getApiKey: () => 'key',
	getTokenParam: () => 'ApiKey',
	getServerType: () => 'jellyfin',
	userRoutes: {item: (id) => `/Items/${id}?`}
}));

// One width of ten by ten tiles every ten seconds, so a sheet covers 1000 seconds
const MANIFEST = {320: {Width: 320, Height: 132, TileWidth: 10, TileHeight: 10, ThumbnailCount: 870, Interval: 10000}};
const TICKS_PER_MS = 10000;
const DURATION = 8700 * 1000 * TICKS_PER_MS;

let requested = [];
const sheetsAskedFor = () => requested.map((src) => (/Trickplay\/320\/(\d+)\.jpg/.exec(src) || [])[1]).filter(Boolean);

beforeEach(() => {
	requested = [];
	global.fetch = jest.fn(async () => ({ok: true, json: async () => ({Trickplay: {source: MANIFEST}})}));
	jest.spyOn(window, 'Image').mockImplementation(() => {
		const image = {};
		Object.defineProperty(image, 'src', {set (value) { requested.push(value); }});
		return image;
	});
});

afterEach(() => {
	jest.restoreAllMocks();
});

const preview = (positionSeconds, props = {}) => (
	<TrickplayPreview itemId="item" mediaSourceId="source" positionTicks={positionSeconds * 1000 * TICKS_PER_MS} durationTicks={DURATION} stepSeconds={10} {...props} />
);

describe('TrickplayPreview', () => {
	test('loads the sheet under the playhead while the controls are hidden, and the next one as playback reaches it', async () => {
		const {rerender} = render(preview(0));
		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
		expect(sheetsAskedFor()).toEqual([]);

		rerender(preview(5));
		await waitFor(() => expect(sheetsAskedFor()).toEqual(['0']));

		rerender(preview(900));
		expect(sheetsAskedFor()).toEqual(['0']);

		rerender(preview(1005));
		await waitFor(() => expect(sheetsAskedFor()).toEqual(['0', '1']));
	});
});
