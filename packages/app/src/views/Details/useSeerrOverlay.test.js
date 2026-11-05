import {renderHook, waitFor} from '@testing-library/react';

import useSeerrOverlay from './useSeerrOverlay';
import useSeerrDetailsData from './useSeerrDetailsData';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
jest.mock('../../context/SeerrContext', () => ({
	useSeerr: () => ({isEnabled: true, isAuthenticated: true, user: null, displayName: 'Seerr'})
}));
jest.mock('../../services/seerrApi', () => ({__esModule: true, default: {search: jest.fn()}}));
jest.mock('../../components/seerr/SeerrSections', () => ({hasSeerrChips: () => true}));

const seriesDetails = {name: 'Lupin', seasons: [{seasonNumber: 1}, {seasonNumber: 2}], numberOfSeasons: 2, collection: {id: 1}};

jest.mock('./useSeerrDetailsData', () => jest.fn());
jest.mock('./useSeerrRequests', () => () => ({canReportIssue: true, canRequestHd: true, canRequest4k: false, pendingRequests: []}));
jest.mock('./useSeerrWatchlist', () => () => ({onWatchlist: false, toggleWatchlist: () => {}}));

beforeEach(() => {
	useSeerrDetailsData.mockImplementation(({mediaId}) => ({
		details: mediaId ? seriesDetails : null,
		similar: [{id: 1}],
		recommendations: [],
		loading: false
	}));
});

const episode = {Id: 'e1', Type: 'Episode', SeriesId: 's1', SeriesName: 'Lupin', ParentIndexNumber: 2, IndexNumber: 4};

describe('useSeerrOverlay on a season or episode', () => {
	test('asks Seerr about the series and only offers its actions', async () => {
		const api = {getItem: jest.fn().mockResolvedValue({Name: 'Lupin', ProviderIds: {Tmdb: '96677'}})};
		const {result} = renderHook(() => useSeerrOverlay({item: episode, seerrOnly: false, showsSection: () => true, api}));

		await waitFor(() => expect(result.current.isActive).toBe(true));
		expect(api.getItem).toHaveBeenCalledWith('s1');
		expect(useSeerrDetailsData).toHaveBeenLastCalledWith(expect.objectContaining({mediaId: 96677, mediaType: 'tv'}));

		expect(result.current.showsReportIssue).toBe(true);
		expect(result.current.showsRequest).toBe(true);
		expect(result.current.sheetDetails).toBe(seriesDetails);
		expect(result.current.details).toBeNull();
		expect(result.current.similarCards).toEqual([]);
		expect(result.current.hasTabContent).toBe(false);
		expect(Object.values(result.current.pieces).some(Boolean)).toBe(false);
	});

	test('stays idle when the series has no id Seerr knows', async () => {
		const api = {getItem: jest.fn().mockResolvedValue({ProviderIds: {}})};
		const {result} = renderHook(() => useSeerrOverlay({item: episode, seerrOnly: false, showsSection: () => true, api}));

		await waitFor(() => expect(api.getItem).toHaveBeenCalled());
		expect(result.current.isActive).toBe(false);
	});
});
