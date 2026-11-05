import {
	CELL_KINDS, artworkSource, buildRowCells, carouselLayoutFor, carouselNeighborhood, categoryTags, channelComparator,
	channelIndexFor, clampAnchorInto, episodeLine, floorToHalfHour, genreFor, guideWindowFor,
	matchesFilter, programAiringAt, reanchorSelection, resolveCellIndexAt
} from './liveTvGuide';

const at = (hh, mm) => new Date(2026, 8, 22, hh, mm, 0, 0).getTime();
const iso = (hh, mm) => new Date(at(hh, mm)).toISOString();
const program = (id, startH, startM, endH, endM, extra = {}) => ({
	Id: id, StartDate: iso(startH, startM), EndDate: iso(endH, endM), ...extra
});

describe('channel order', () => {
	const channels = [
		{Id: 'a', Name: 'Zed', ChannelNumber: '10.10'},
		{Id: 'b', Name: 'alpha', ChannelNumber: '10.2'},
		{Id: 'c', Name: 'Mid', ChannelNumber: 'x', UserData: {IsFavorite: true}},
		{Id: 'd', Name: 'Beta', ChannelNumber: '2'}
	];

	test('compares numbers segment by segment, with unnumbered channels last', () => {
		expect([...channels].sort(channelComparator('number')).map((c) => c.Id)).toEqual(['d', 'b', 'a', 'c']);
	});

	test('sorts by name without regard to case', () => {
		expect([...channels].sort(channelComparator('name')).map((c) => c.Id)).toEqual(['b', 'd', 'c', 'a']);
	});

	test('puts favorites first, then by number', () => {
		expect([...channels].sort(channelComparator('favoritesFirst')).map((c) => c.Id)).toEqual(['c', 'd', 'b', 'a']);
	});
});

describe('program facts', () => {
	test('reads the episode title and its numbering on their own', () => {
		expect(episodeLine({EpisodeTitle: 'Pilot', ParentIndexNumber: 1, IndexNumber: 5})).toBe('Pilot (S1:E5)');
		expect(episodeLine({EpisodeTitle: 'Pilot'})).toBe('Pilot');
		expect(episodeLine({ParentIndexNumber: 2, IndexNumber: 3})).toBe('(S2:E3)');
		expect(episodeLine({})).toBe('');
	});

	test('leaves out a title that repeats the program name', () => {
		expect(episodeLine({Name: 'College Football', EpisodeTitle: 'College Football'})).toBe('');
		expect(episodeLine({Name: 'College Football', EpisodeTitle: 'College Football', ParentIndexNumber: 2, IndexNumber: 9})).toBe('(S2:E9)');
		expect(episodeLine({Name: 'College Football', EpisodeTitle: 'South Alabama at Kentucky'})).toBe('South Alabama at Kentucky');
	});

	test('unescapes quotes a guide source left escaped', () => {
		expect(episodeLine({EpisodeTitle: '\\"Raygun\\"'})).toBe('"Raygun"');
	});

	test('finds artwork on the program, the series, then the parent', () => {
		expect(artworkSource({Id: 'p', ImageTags: {Primary: 't'}})).toEqual({itemId: 'p', tag: 't', isThumb: false});
		expect(artworkSource({Id: 'p', SeriesId: 's', SeriesPrimaryImageTag: 't'})).toEqual({itemId: 's', tag: 't', isThumb: false});
		expect(artworkSource({Id: 'p', ParentThumbItemId: 'x', ParentThumbImageTag: 't'})).toEqual({itemId: 'x', tag: 't', isThumb: true});
		expect(artworkSource({Id: 'p'})).toBeNull();
	});

	test('takes the first genre in the fixed order', () => {
		expect(genreFor({IsSeries: true, IsKids: true}).label).toBe('Kids');
		expect(genreFor({})).toBeNull();
	});

	test('lists categories in the chip order', () => {
		expect(categoryTags({IsPremiere: true, IsMovie: true, IsNews: true})).toEqual(['movies', 'news', 'premiere']);
		expect(matchesFilter('sports', {IsSports: true})).toBe(true);
		expect(matchesFilter('sports', {IsNews: true})).toBe(false);
		expect(matchesFilter('all', {})).toBe(true);
	});

	test('picks the program airing at a moment, counting its first instant', () => {
		const programs = [program('a', 7, 0, 7, 30), program('b', 7, 30, 8, 0)];
		expect(programAiringAt(programs, at(7, 30)).Id).toBe('b');
		expect(programAiringAt(programs, at(8, 0))).toBeNull();
	});
});

describe('the window', () => {
	test('starts on the half hour at or before now', () => {
		expect(floorToHalfHour(at(7, 44))).toBe(at(7, 30));
		expect(floorToHalfHour(at(7, 29))).toBe(at(7, 0));
	});
});

describe('row cells', () => {
	const windowStart = at(7, 0);
	const windowEnd = at(10, 0);

	test('clip programs to the window and fill the holes with gaps', () => {
		const cells = buildRowCells({
			visible: [program('b', 8, 0, 9, 0), program('a', 6, 30, 7, 30)],
			unfiltered: [],
			windowStart,
			windowEnd,
			loaded: true
		});
		expect(cells.map((c) => [c.kind, c.start, c.end])).toEqual([
			['program', at(7, 0), at(7, 30)],
			['gap', at(7, 30), at(8, 0)],
			['program', at(8, 0), at(9, 0)],
			['gap', at(9, 0), at(10, 0)]
		]);
	});

	test('tell a hole a filter made from a real gap', () => {
		const cells = buildRowCells({
			visible: [program('a', 7, 0, 8, 0)],
			unfiltered: [program('h', 8, 0, 8, 30)],
			windowStart,
			windowEnd,
			loaded: true
		});
		expect(cells.map((c) => c.kind)).toEqual(['program', 'filtered', 'gap']);
	});

	test('skip the part of an overlapping program already covered', () => {
		const cells = buildRowCells({
			visible: [program('a', 7, 0, 8, 0), program('b', 7, 30, 8, 30)],
			unfiltered: [],
			windowStart,
			windowEnd,
			loaded: true
		});
		expect(cells[1]).toMatchObject({kind: 'program', start: at(8, 0), end: at(8, 30)});
	});

	test('are one placeholder while the row is loading', () => {
		const cells = buildRowCells({visible: [], unfiltered: [], windowStart, windowEnd, loaded: false});
		expect(cells).toEqual([{start: windowStart, end: windowEnd, kind: CELL_KINDS.loading}]);
	});
});

describe('the selection', () => {
	const cells = [
		{start: at(7, 0), end: at(7, 30), kind: 'program', program: {Id: 'a'}},
		{start: at(7, 30), end: at(8, 0), kind: 'program', program: {Id: 'b'}}
	];

	test('resolves a clock time to the cell covering it', () => {
		expect(resolveCellIndexAt(cells, at(7, 45))).toBe(1);
		expect(resolveCellIndexAt(cells, at(6, 0))).toBe(0);
		expect(resolveCellIndexAt(cells, at(9, 0))).toBe(1);
	});

	test('clamps an anchor inside a cell', () => {
		expect(clampAnchorInto(cells[1], at(7, 0))).toBe(at(7, 30));
		expect(clampAnchorInto(cells[0], at(7, 30))).toBe(at(7, 30) - 1);
	});

	test('keeps the selected program when the window moves', () => {
		const current = {channelId: 'c', anchorTime: at(7, 40), programId: 'b'};
		expect(reanchorSelection({current, cells, now: at(7, 10)})).toEqual(current);
	});

	test('falls back to the airing cell when the program has gone', () => {
		const current = {channelId: 'c', anchorTime: at(6, 40), programId: 'old'};
		expect(reanchorSelection({current, cells, now: at(7, 10)})).toEqual({channelId: 'c', anchorTime: at(7, 10), programId: 'a'});
	});
});

describe('guide geometry', () => {
	// The standalone guide on the television canvas, less its padding.
	test('fits a three hour window at a readable density', () => {
		expect(guideWindowFor(1276)).toBe(180 * 60000);
	});

	test('never drops below two and a half hours', () => {
		expect(guideWindowFor(400)).toBe(150 * 60000);
	});
});

describe('channel carousel', () => {
	test('wraps an index both ways', () => {
		expect(channelIndexFor(-1, 5)).toBe(4);
		expect(channelIndexFor(12, 5)).toBe(2);
	});

	test('fits four cards across the television canvas', () => {
		const layout = carouselLayoutFor(1324 - 66);
		expect(layout.count).toBe(4);
		expect(layout.width).toBeCloseTo(304.5, 1);
	});

	test('asks for the run around the centred channel, wrapping', () => {
		const channels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((Id) => ({Id}));
		expect(carouselNeighborhood(channels, 'a', 3)).toEqual(['f', 'g', 'h', 'a', 'b', 'c', 'd']);
	});
});
