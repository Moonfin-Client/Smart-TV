// Nothing renders here, and the CLI's second copy of React can't load the JSX runtime.
jest.mock('react/jsx-dev-runtime', () => ({}));
jest.mock('../../components/RatingsRow', () => () => null);
jest.mock('../../services/mdblistApi', () => ({isMdblistEnabled: () => false}));
jest.mock('@enact/i18n/$L', () => (text) => text);

import {buildInfoParts, detailTitleFor} from './DetailSection';

const HOUR = 36000000000;

describe('the classic home info area', () => {
	const episode = {
		Type: 'Episode', Name: 'Low Tide', SeriesName: 'Harbor Lights', ParentIndexNumber: 2, IndexNumber: 5,
		ProductionYear: 2023, OfficialRating: 'TV-14', RunTimeTicks: HOUR * 52 / 60, Genres: ['Drama', 'Mystery', 'Crime', 'Thriller']
	};

	test('an episode is titled by its series', () => {
		expect(detailTitleFor(episode)).toBe('Harbor Lights');
		expect(detailTitleFor({...episode, SeriesName: undefined})).toBe('Low Tide');
		expect(detailTitleFor({Type: 'Movie', Name: 'The Long Orbit'})).toBe('The Long Orbit');
	});

	test("an episode's number and name lead the info line", () => {
		expect(buildInfoParts(episode)).toEqual([
			{text: 'S2:E5 - Low Tide', lead: true},
			{text: '2023'},
			{chip: 'TV-14'},
			{text: '52m'},
			{text: 'Drama, Mystery, Crime'}
		]);
	});

	test('a movie leads with its year, and a series leaves out the runtime', () => {
		const movie = {Type: 'Movie', ProductionYear: 2024, OfficialRating: 'PG-13', RunTimeTicks: HOUR * 2 + HOUR * 14 / 60, Genres: ['Science Fiction']};
		expect(buildInfoParts(movie)).toEqual([{text: '2024'}, {chip: 'PG-13'}, {text: '2h 14m'}, {text: 'Science Fiction'}]);
		expect(buildInfoParts({...movie, Type: 'Series'})).toEqual([{text: '2024'}, {chip: 'PG-13'}, {text: 'Science Fiction'}]);
	});
});
