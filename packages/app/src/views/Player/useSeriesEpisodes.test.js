import {renderHook, waitFor, act} from '@testing-library/react';

import useSeriesEpisodes, {clearSeriesEpisodesCache} from './useSeriesEpisodes';

const mockApi = {getSeasons: jest.fn(), getEpisodes: jest.fn()};
const mockCreateApi = jest.fn(() => mockApi);
jest.mock('../../services/jellyfinApi', () => ({
	get api() { return mockApi; },
	createApiForServer: (...args) => mockCreateApi(...args)
}));
jest.mock('../../services/parentalControls', () => ({
	withoutBlockedItems: (items) => items.filter((entry) => !entry.Blocked)
}));

const item = {Id: 'e2', Type: 'Episode', SeriesId: 'series', SeasonId: 's2'};
const seasons = {Items: [{Id: 's1', Name: 'Season 1'}, {Id: 's2', Name: 'Season 2'}]};
const episodesOf = (season) => ({
	Items: [
		{Id: `${season}-a`, Name: 'A'},
		{Id: `${season}-virtual`, Name: 'Missing', LocationType: 'Virtual'},
		{Id: `${season}-blocked`, Name: 'Blocked', Blocked: true}
	]
});

beforeEach(() => {
	clearSeriesEpisodesCache();
	mockApi.getSeasons.mockReset().mockResolvedValue(seasons);
	mockApi.getEpisodes.mockReset().mockImplementation((series, season) => Promise.resolve(episodesOf(season)));
	mockCreateApi.mockReset().mockReturnValue(mockApi);
});

describe('useSeriesEpisodes', () => {
	it('fetches nothing until the browser is opened', () => {
		renderHook(() => useSeriesEpisodes({item, enabled: false}));
		expect(mockApi.getSeasons).not.toHaveBeenCalled();
		expect(mockApi.getEpisodes).not.toHaveBeenCalled();
	});

	it('opens on the season that is playing, and lists only its playable, unblocked episodes', async () => {
		const {result} = renderHook(() => useSeriesEpisodes({item, enabled: true}));
		expect(result.current.episodes).toBeNull();

		await waitFor(() => expect(result.current.episodes).not.toBeNull());
		expect(mockApi.getSeasons).toHaveBeenCalledWith('series');
		expect(mockApi.getEpisodes).toHaveBeenCalledWith('series', 's2');
		expect(result.current.selectedSeasonId).toBe('s2');
		expect(result.current.seasons.map((s) => s.Name)).toEqual(['Season 1', 'Season 2']);
		expect(result.current.episodes.map((e) => e.Id)).toEqual(['s2-a']);
		expect(result.current.failed).toBe(false);
	});

	it('fetches another season once, the first time it is chosen', async () => {
		const {result} = renderHook(() => useSeriesEpisodes({item, enabled: true}));
		await waitFor(() => expect(result.current.episodes).not.toBeNull());

		act(() => result.current.selectSeason('s1'));
		expect(result.current.episodes).toBeNull();
		await waitFor(() => expect(result.current.episodes).not.toBeNull());
		expect(result.current.episodes.map((e) => e.Id)).toEqual(['s1-a']);

		act(() => result.current.selectSeason('s2'));
		expect(result.current.episodes.map((e) => e.Id)).toEqual(['s2-a']);
		act(() => result.current.selectSeason('s1'));
		expect(mockApi.getEpisodes).toHaveBeenCalledTimes(2);
	});

	it('asks the server the playing episode came from and tags what it gets back', async () => {
		const other = {...item, _serverUrl: 'http://b', _serverAccessToken: 't', _serverUserId: 'u', _serverType: 'jellyfin'};
		const {result} = renderHook(() => useSeriesEpisodes({item: other, enabled: true}));
		await waitFor(() => expect(result.current.episodes).not.toBeNull());
		expect(mockCreateApi).toHaveBeenCalledWith('http://b', 't', 'u', 'jellyfin');
		expect(result.current.episodes[0]).toMatchObject({_serverUrl: 'http://b', _serverAccessToken: 't', _serverUserId: 'u'});
	});

	it('reports a failure to load the seasons', async () => {
		mockApi.getSeasons.mockRejectedValue(new Error('down'));
		const {result} = renderHook(() => useSeriesEpisodes({item, enabled: true}));
		await waitFor(() => expect(result.current.failed).toBe(true));
	});

	it('reports a failure to load a season\'s episodes', async () => {
		mockApi.getEpisodes.mockRejectedValue(new Error('down'));
		const {result} = renderHook(() => useSeriesEpisodes({item, enabled: true}));
		await waitFor(() => expect(result.current.failed).toBe(true));
		expect(result.current.episodes).toBeNull();
	});

	describe('speed', () => {
		it('asks for the playing season\'s episodes at the same moment as the season list, not after it', () => {
			mockApi.getSeasons.mockReturnValue(new Promise(() => {}));
			renderHook(() => useSeriesEpisodes({item, enabled: true}));
			expect(mockApi.getSeasons).toHaveBeenCalledTimes(1);
			expect(mockApi.getEpisodes).toHaveBeenCalledWith('series', 's2');
		});

		it('shows the episodes even while the season list is still on its way', async () => {
			mockApi.getSeasons.mockReturnValue(new Promise(() => {}));
			const {result} = renderHook(() => useSeriesEpisodes({item, enabled: true}));
			await waitFor(() => expect(result.current.episodes).not.toBeNull());
			expect(result.current.selectedSeasonId).toBe('s2');
			expect(result.current.seasons).toBeNull();
		});

		const open = (playing = item) => renderHook(() => useSeriesEpisodes({item: playing, enabled: true}));

		it('draws straight from memory the next time the series is opened, then refreshes behind it', async () => {
			const {result: firstResult, unmount: closeFirst} = open();
			await waitFor(() => expect(firstResult.current.episodes).not.toBeNull());
			await waitFor(() => expect(firstResult.current.seasons).not.toBeNull());
			closeFirst();
			mockApi.getSeasons.mockClear();
			mockApi.getEpisodes.mockClear();

			const {result: secondResult, unmount: closeSecond} = open();
			// Nothing has resolved yet, and it is already all there.
			expect(secondResult.current.seasons.map((entry) => entry.Id)).toEqual(['s1', 's2']);
			expect(secondResult.current.episodes.map((entry) => entry.Id)).toEqual(['s2-a']);
			// And the server is asked again, so a watched mark that changed is picked up.
			expect(mockApi.getSeasons).toHaveBeenCalledTimes(1);
			expect(mockApi.getEpisodes).toHaveBeenCalledWith('series', 's2');
			mockApi.getEpisodes.mockResolvedValue({Items: [{Id: 's2-a', Name: 'A', UserData: {Played: true}}]});
			closeSecond();
			const {result: thirdResult} = open();
			await waitFor(() => expect(thirdResult.current.episodes[0].UserData?.Played).toBe(true));
		});

		it('keeps what it was showing when the refresh fails', async () => {
			const {result: firstResult, unmount: closeFirst} = open();
			await waitFor(() => expect(firstResult.current.episodes).not.toBeNull());
			closeFirst();
			mockApi.getEpisodes.mockRejectedValue(new Error('down'));
			const {result: secondResult} = open();
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
			});
			expect(secondResult.current.episodes.map((entry) => entry.Id)).toEqual(['s2-a']);
			expect(secondResult.current.failed).toBe(false);
		});

		it('keeps each series apart in memory', async () => {
			const {result: firstResult, unmount: closeFirst} = open();
			await waitFor(() => expect(firstResult.current.episodes).not.toBeNull());
			closeFirst();
			const {result: otherResult} = open({...item, SeriesId: 'other'});
			expect(otherResult.current.episodes).toBeNull();
		});
	});
});

