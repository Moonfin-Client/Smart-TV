import {NO_FILTERS, buildFilterParams, facetRows, hasActiveFilters} from './libraryFilters';

describe('library filters', () => {
	it('asks for nothing when nothing is picked', () => {
		expect(buildFilterParams()).toEqual({});
		expect(buildFilterParams({featureFilters: [], tagFilters: []})).toEqual({});
	});

	it('sends each feature as its own flag', () => {
		const params = buildFilterParams({featureFilters: ['HasSubtitles', 'HasTrailer']});
		expect(params.HasSubtitles).toBe('true');
		expect(params.HasTrailer).toBe('true');
		expect(params.HasThemeSong).toBeUndefined();
	});

	it('cancels the definition flag when both sides are picked', () => {
		expect(buildFilterParams({qualityFilters: ['hd']}).IsHD).toBe('true');
		expect(buildFilterParams({qualityFilters: ['sd']}).IsHD).toBe('false');
		expect(buildFilterParams({qualityFilters: ['sd', 'hd']}).IsHD).toBeUndefined();
	});

	it('keeps 4K and 3D separate from the definition flag', () => {
		const params = buildFilterParams({qualityFilters: ['uhd', 'threeD']});
		expect(params.Is4K).toBe('true');
		expect(params.Is3D).toBe('true');
		expect(params.IsHD).toBeUndefined();
	});

	it('pipe delimits the values that can hold a comma', () => {
		const params = buildFilterParams({
			genreFilters: ['Action', 'Sci-Fi, Fantasy'],
			ratingFilters: ['PG-13'],
			tagFilters: ['imax', 'remux']
		});
		expect(params.Genres).toBe('Action|Sci-Fi, Fantasy');
		expect(params.OfficialRatings).toBe('PG-13');
		expect(params.Tags).toBe('imax|remux');
	});

	it('comma delimits the values that cant', () => {
		const params = buildFilterParams({
			yearFilters: ['1999', '2004'],
			videoSourceFilters: ['BluRay', 'Iso'],
			audioLanguageFilters: ['jpn'],
			subtitleLanguageFilters: ['eng', 'spa']
		});
		expect(params.Years).toBe('1999,2004');
		expect(params.VideoTypes).toBe('BluRay,Iso');
		expect(params.AudioLanguages).toBe('jpn');
		expect(params.SubtitleLanguages).toBe('eng,spa');
	});
});

describe('facet rows', () => {
	const tags = ['action', 'Amélie', 'anime', 'biopic', 'comedy', 'cult', 'drama', 'heist', 'noir', 'western'];

	it('offers a search only once a list reaches ten values', () => {
		expect(facetRows(tags, [], '', 50).searchable).toBe(true);
		expect(facetRows(tags.slice(0, 9), [], '', 50).searchable).toBe(false);
	});

	it('matches the search without case or accents', () => {
		expect(facetRows(tags, [], 'AMELIE', 50).visible.map((row) => row.value)).toEqual(['Amélie']);
		expect(facetRows(tags, [], ' an', 50).visible.map((row) => row.value)).toEqual(['anime']);
	});

	it('says so when nothing matches', () => {
		const rows = facetRows(tags, [], 'zzz', 50);
		expect(rows.noMatches).toBe(true);
		expect(rows.visible).toEqual([]);
	});

	it('leaves a short list as it is, whatever is typed', () => {
		expect(facetRows(tags.slice(0, 3), [], 'zzz', 50).visible).toHaveLength(3);
	});

	it('matches language names, not the codes behind them', () => {
		const languages = tags.map((name, i) => ({name, value: `code${i}`}));
		expect(facetRows(languages, [], 'noir', 50).visible).toEqual([{name: 'noir', value: 'code8'}]);
	});

	it('keeps a picked value on screen past the page limit and counts what is left', () => {
		const rows = facetRows(tags, ['western'], '', 2);
		expect(rows.visible.map((row) => row.value)).toEqual(['action', 'Amélie', 'western']);
		expect(rows.remaining).toBe(7);
		expect(rows.chosen).toBe(1);
	});
});

describe('hasActiveFilters', () => {
	test('nothing picked has nothing to clear', () => {
		expect(hasActiveFilters(NO_FILTERS)).toBe(false);
		expect(hasActiveFilters({})).toBe(false);
	});

	test('any series status counts', () => {
		expect(hasActiveFilters({...NO_FILTERS, seriesFilter: 'continuing'})).toBe(true);
		expect(hasActiveFilters({...NO_FILTERS, seriesFilter: 'ended'})).toBe(true);
	});

	test('a status, a flag or a list each count', () => {
		expect(hasActiveFilters({...NO_FILTERS, playedFilter: 'watched'})).toBe(true);
		expect(hasActiveFilters({...NO_FILTERS, favoritesOnly: true})).toBe(true);
		expect(hasActiveFilters({...NO_FILTERS, subtitleLanguageFilters: ['eng']})).toBe(true);
	});

	test('the saved filters go straight into the query', () => {
		expect(buildFilterParams({...NO_FILTERS, tagFilters: ['4K']})).toEqual({Tags: '4K'});
	});
});
