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
jest.mock('../../services/jellyfinApi', () => ({getAuthHeader: () => '', getServerUrl: () => '', api: {}}));
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

describe('RatingsRow sample ratings', () => {
	const sample = [
		{source: 'imdb', name: 'IMDb', formatted: '7.8', iconUrl: 'data:image/svg+xml,imdb'},
		{source: 'tomatoes', name: 'Rotten Tomatoes', formatted: '88%', iconUrl: 'data:image/svg+xml,rt'}
	];

	afterEach(() => {
		delete global.fetch;
	});

	test('stand in for the plugin, in the surface order, without asking the server', () => {
		global.fetch = jest.fn();
		const saved = mockSettings.homeRowsMdblistRatingSources;
		mockSettings.homeRowsMdblistRatingSources = ['tomatoes', 'imdb'];
		try {
			render(<RatingsRow item={{...movie, Id: 'm3', ProviderIds: {Tmdb: '603'}}} serverUrl='http://server' surface='homeRows' sampleRatings={sample} />);
			const values = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));
			expect(values).toEqual(['Rotten Tomatoes', 'IMDb']);
			expect(screen.getByText('88%')).toBeTruthy();
			expect(global.fetch).not.toHaveBeenCalled();
		} finally {
			mockSettings.homeRowsMdblistRatingSources = saved;
		}
	});

	test('leave the server ratings alone with the plugin off', () => {
		render(<RatingsRow item={movie} serverUrl='http://server' pluginEnabled={false} sampleRatings={sample} />);
		expect(screen.queryByText('88%')).toBeNull();
		expect(screen.getByText('91%')).toBeTruthy();
		expect(screen.getByText('7.4')).toBeTruthy();
	});
});
