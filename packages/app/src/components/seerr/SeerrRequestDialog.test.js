import {act, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

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
	default: {getSonarrServerDetails: jest.fn(), getRadarrServerDetails: jest.fn(), lookupSonarrSeries: jest.fn()}
}));

const series = {
	id: 99,
	externalIds: {tvdbId: 81189},
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

describe('SeerrRequestDialog for a series with no TVDB id', () => {
	const unmatched = {...series, externalIds: {}};
	const matches = Array.from({length: 7}, (_, i) => ({tvdbId: 100 + i, title: `Braunschlag ${i}`, year: 2012, overview: 'An Austrian village.'}));
	const settle = () => act(() => Promise.resolve());

	test('asks which of Sonarr\'s first six series it is and sends the pick as tvdbId', async () => {
		seerrApi.lookupSonarrSeries.mockResolvedValue(matches);
		const onSubmit = setup({details: unmatched});
		expect(seerrApi.lookupSonarrSeries).toHaveBeenCalledWith(99);
		expect(screen.queryByText('Submit Request')).toBeNull();
		expect(await screen.findByText("We couldn't match this series automatically. Pick the right one below.")).toBeTruthy();
		expect(screen.getAllByText(/^Braunschlag/)).toHaveLength(6);
		expect(Spotlight.focus).toHaveBeenLastCalledWith('seerr-match-100');
		// Next waits for a pick.
		fireEvent.click(screen.getByText('Next'));
		expect(screen.queryByText('Submit Request')).toBeNull();
		fireEvent.click(screen.getByText('Braunschlag 2'));
		expect(Spotlight.focus).toHaveBeenLastCalledWith('seerr-match-next');
		fireEvent.click(screen.getByText('Next'));
		// The sheet names the pick, and Back steps out to the picker with it still picked.
		expect(screen.getByText('Braunschlag 2')).toBeTruthy();
		fireEvent.click(screen.getByText('Back'));
		expect(Spotlight.focus).toHaveBeenLastCalledWith('seerr-match-102');
		fireEvent.click(screen.getByText('Next'));
		fireEvent.click(screen.getByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith({is4k: false, seasons: null, serverId: null, profileId: null, rootFolder: null, tvdbId: 102});
	});

	test('a series Seerr already holds a TVDB id for goes straight to the request', () => {
		setup({details: {...unmatched, mediaInfo: {...series.mediaInfo, tvdbId: 5}}});
		expect(seerrApi.lookupSonarrSeries).not.toHaveBeenCalled();
		expect(screen.getByText('Submit Request')).toBeTruthy();
	});

	test('with no Sonarr to ask the request goes out as it would without the step', async () => {
		seerrApi.lookupSonarrSeries.mockResolvedValue(null);
		const onSubmit = setup({details: unmatched});
		fireEvent.click(await screen.findByText('Submit Request'));
		expect(onSubmit).toHaveBeenCalledWith({is4k: false, seasons: null, serverId: null, profileId: null, rootFolder: null});
	});

	test('no match leaves only Close', async () => {
		seerrApi.lookupSonarrSeries.mockResolvedValue([]);
		setup({details: unmatched});
		expect(await screen.findByText("We couldn't find a match for this series, so it can't be requested.")).toBeTruthy();
		expect(screen.getByText('Close')).toBeTruthy();
		expect(screen.queryByText('Next')).toBeNull();
		expect(Spotlight.focus).toHaveBeenLastCalledWith('seerr-match-next');
	});

	test('a failed lookup stays on the step with a Retry that asks again', async () => {
		seerrApi.lookupSonarrSeries.mockRejectedValueOnce(new Error('Moonfin proxy error: 500')).mockResolvedValueOnce(matches.slice(0, 1));
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		setup({details: unmatched});
		expect(await screen.findByText(/Sonarr couldn't find a match for this series, or couldn't be reached/)).toBeTruthy();
		expect(screen.queryByText('Submit Request')).toBeNull();
		fireEvent.click(screen.getByText('Retry'));
		await settle();
		expect(seerrApi.lookupSonarrSeries).toHaveBeenCalledTimes(2);
		expect(screen.getByText('Braunschlag 0')).toBeTruthy();
	});

	test('a movie never asks', () => {
		setup({details: {...unmatched, mediaInfo: {status: 1}}, isTv: false});
		expect(seerrApi.lookupSonarrSeries).not.toHaveBeenCalled();
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
