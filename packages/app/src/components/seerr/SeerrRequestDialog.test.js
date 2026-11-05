import {fireEvent, render, screen} from '@testing-library/react';

import SeerrRequestDialog from './SeerrRequestDialog';
import {CancelRequestPopup} from './CancelRequestPopup';
import {resolveAdvancedRequest} from './SeerrAdvancedRequestOptions';
import seerrApi from '../../services/seerrApi';

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
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));
// The app's react-dom would pull in the CLI's React, so the portal draws in place instead.
jest.mock('react-dom', () => ({createPortal: (node) => node}));
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {getSonarrServerDetails: jest.fn(), getRadarrServerDetails: jest.fn()}
}));

const series = {
	seasons: [{seasonNumber: 1}, {seasonNumber: 2}, {seasonNumber: 3}],
	numberOfSeasons: 3,
	mediaInfo: {status: 4, status4k: 1, seasons: [{seasonNumber: 1, status: 5, status4k: 1}]}
};

const setup = (props = {}) => {
	const onSubmit = jest.fn();
	render(
		<SeerrRequestDialog
			details={series}
			isTv
			is4k={false}
			activeRequests={[]}
			onSubmit={onSubmit}
			onClose={() => {}}
			{...props}
		/>
	);
	return onSubmit;
};

describe('SeerrRequestDialog', () => {
	test('asks for every season by default', () => {
		const onSubmit = setup();
		expect(screen.getByText('Request {type}'.replace('{type}', 'Series'))).toBeTruthy();
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith({is4k: false, seasons: null, serverId: null, profileId: null, rootFolder: null});
	});

	test('opened from a season card asks for just that season', () => {
		const onSubmit = setup({season: 2});
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith({is4k: false, seasons: [2], serverId: null, profileId: null, rootFolder: null});
	});

	test('names the track in the title when there is no switch', () => {
		setup({is4k: true});
		expect(screen.getByText('Request 4K Series')).toBeTruthy();
		expect(screen.queryByText('4K')).toBeNull();
	});

	test('picks seasons one by one, leaving the ones already in the library alone', () => {
		const onSubmit = setup();
		fireEvent.click(screen.getByText('All Seasons'));
		fireEvent.click(screen.getByText('S1'));
		fireEvent.click(screen.getByText('S3'));
		fireEvent.click(screen.getByText('S2'));
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({seasons: [2, 3]}));
	});

	test('sends nothing while no season is picked', () => {
		const onSubmit = setup();
		fireEvent.click(screen.getByText('All Seasons'));
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test('the switch moves the request to 4K', () => {
		const onSubmit = setup({qualityToggle: true});
		expect(screen.getByText('Request Series')).toBeTruthy();
		fireEvent.click(screen.getByText('4K'));
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({is4k: true}));
	});

	test('blocks the request when the seasons asked for are over quota', () => {
		const onSubmit = setup({quota: {limit: 5, remaining: 1}});
		expect(screen.getByText('Request limit reached')).toBeTruthy();
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test('counts quota against the seasons picked', () => {
		const onSubmit = setup({quota: {limit: 5, remaining: 1}});
		fireEvent.click(screen.getByText('All Seasons'));
		fireEvent.click(screen.getByText('S2'));
		expect(screen.getByText('1 of 5 season requests remaining')).toBeTruthy();
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({seasons: [2]}));
	});

	test('shows the continuing banner only for a running series with everything in', () => {
		setup({isContinuing: true});
		expect(screen.queryByText(/Series Continuing/)).toBeNull();
		setup({isContinuing: true, details: {...series, mediaInfo: {...series.mediaInfo, status: 5}}});
		expect(screen.getByText(/Series Continuing/)).toBeTruthy();
	});

	test('sends the default server for a viewer allowed to override it', async () => {
		seerrApi.getSonarrServerDetails.mockResolvedValue({
			server: {id: 4, name: 'Sonarr', is4k: false, isDefault: true, activeProfileId: 7, activeDirectory: '/tv'},
			profiles: [{id: 7, name: 'HD'}],
			rootFolders: [{id: 1, path: '/tv'}]
		});
		const onSubmit = setup({canRequestAdvanced: true, servers: [{id: 4}]});
		fireEvent.click(screen.getByText('Advanced Options'));
		expect(await screen.findByText('Sonarr')).toBeTruthy();
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith({is4k: false, seasons: null, serverId: 4, profileId: 7, rootFolder: '/tv'});
	});
});

describe('resolveAdvancedRequest', () => {
	const hd = {server: {id: 1, is4k: false, isDefault: false, activeProfileId: 10, activeDirectory: '/b'}, profiles: [], rootFolders: [{id: 1, path: '/a'}, {id: 2, path: '/b'}]};
	const uhd = {
		server: {id: 2, is4k: true, isDefault: true, activeProfileId: 20, activeDirectory: '/x', activeAnimeProfileId: 21, activeAnimeDirectory: '/anime'},
		profiles: [],
		rootFolders: [{id: 3, path: '/x'}, {id: 4, path: '/anime'}]
	};
	const none = {serverId: null, profileId: null, rootFolderId: null};

	test('falls back to the server for the track and its defaults', () => {
		expect(resolveAdvancedRequest([uhd, hd], none, {is4k: false})).toMatchObject({serverId: 1, profileId: 10, rootFolder: '/b'});
		expect(resolveAdvancedRequest([hd, uhd], none, {is4k: true})).toMatchObject({serverId: 2, profileId: 20, rootFolder: '/x'});
	});

	test('takes the anime profile and folder for an anime series', () => {
		expect(resolveAdvancedRequest([uhd], none, {is4k: true, isAnime: true})).toMatchObject({profileId: 21, rootFolder: '/anime'});
	});

	test('keeps what the viewer picked', () => {
		expect(resolveAdvancedRequest([hd], {serverId: 1, profileId: 11, rootFolderId: 1}, {})).toMatchObject({profileId: 11, rootFolder: '/a'});
	});

	test('sends nothing without any servers', () => {
		expect(resolveAdvancedRequest(null, none, {})).toMatchObject({serverId: null, profileId: null, rootFolder: null});
	});
});

describe('CancelRequestPopup', () => {
	test('names the track and how many requests go', () => {
		const onConfirm = jest.fn();
		render(
			<CancelRequestPopup open requests={[{id: 1, is4k: true}, {id: 2, is4k: true}]} title="Dune" onConfirm={onConfirm} onClose={() => {}} />
		);
		expect(screen.getByText('Cancel {count} requests for "{title}"?'.replace('{count}', 2).replace('{title}', 'Dune'))).toBeTruthy();
		expect(screen.getByText('Keep')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', {name: 'Cancel 4K Request'}));
		expect(onConfirm).toHaveBeenCalled();
	});

	test('stays shut with nothing to cancel', () => {
		render(<CancelRequestPopup open requests={[]} title="Dune" onConfirm={() => {}} onClose={() => {}} />);
		expect(screen.queryByText('Keep')).toBeNull();
	});
});
