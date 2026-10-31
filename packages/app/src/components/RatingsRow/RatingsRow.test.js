import {render, screen} from '@testing-library/react';

import RatingsRow from './RatingsRow';

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
jest.mock('../../services/jellyfinApi', () => ({getApiKey: () => '', getServerUrl: () => '', api: {}}));
jest.mock('../../services/moonbaseEndpoint', () => ({
	moonbaseEndpoint: async (base) => ({base, headers: {}}),
	moonbaseAssetUrl: (base, path) => `${base}${path}`
}));
jest.mock('../../utils/requestQueue', () => ({mediaServerQueue: {run: (task) => task()}}));

const mockSettings = {
	mdblistRatingSources: ['stars', 'tomatoes'],
	showRatingLabels: true,
	showRatingBadges: true,
	homeRowsMdblistRatingSources: ['tomatoes'],
	homeRowsShowRatingLabels: true,
	homeRowsShowRatingBadges: true,
	mediaBarMdblistRatingSources: ['stars'],
	mediaBarShowRatingLabels: false,
	mediaBarShowRatingBadges: true
};
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));

const movie = {Id: 'm1', Type: 'Movie', CommunityRating: 7.4, CriticRating: 91};

const draw = (surface) => render(<RatingsRow item={movie} serverUrl='http://server' pluginEnabled={false} surface={surface} />);

describe('RatingsRow surfaces', () => {
	test('reads the plain settings without a surface', () => {
		draw();
		expect(screen.getByText('7.4')).toBeTruthy();
		expect(screen.getByText('Community')).toBeTruthy();
	});

	test('home rows follow their own sources', () => {
		draw('homeRows');
		expect(screen.queryByText('7.4')).toBeNull();
		expect(screen.getByText('91%')).toBeTruthy();
		expect(screen.getByText('Rotten Tomatoes')).toBeTruthy();
	});

	test('the media bar follows its own labels', () => {
		draw('mediaBar');
		expect(screen.getByText('7.4')).toBeTruthy();
		expect(screen.queryByText('Community')).toBeNull();
	});
});

describe('RatingsRow plugin ratings on a surface', () => {
	afterEach(() => {
		delete global.fetch;
	});

	test('keep only the surface sources, in the surface order', async () => {
		// The plugin answers with every source any surface wants, the global list first.
		global.fetch = jest.fn(() => Promise.resolve({
			ok: true,
			json: () => Promise.resolve({success: true, ratings: [
				{source: 'tomatoes', score: 81},
				{source: 'metacritic', score: 83},
				{source: 'imdb', value: 7.9, score: 79}
			]})
		}));
		const saved = mockSettings.homeRowsMdblistRatingSources;
		mockSettings.homeRowsMdblistRatingSources = ['imdb', 'tomatoes'];
		try {
			render(<RatingsRow item={{...movie, Id: 'm2', ProviderIds: {Tmdb: '19995'}}} serverUrl='http://server' surface='homeRows' />);
			await screen.findByText('7.9');
			const values = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));
			expect(values).toEqual(['IMDb', 'Rotten Tomatoes']);
		} finally {
			mockSettings.homeRowsMdblistRatingSources = saved;
		}
	});
});
