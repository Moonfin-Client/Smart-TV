import {
	DETAIL_SECTIONS,
	DETAIL_SECTIONS_HIDDEN_KEY,
	DETAIL_SECTION_GROUPS,
	isAvailableIn,
	offeredSections,
	sectionVisibility,
	toggleHiddenSection
} from './detailSectionLayout';

const byId = (id) => DETAIL_SECTIONS.find((section) => section.id === id);

describe('detailSectionLayout', () => {
	it('stores under the key Moonfin Core and the plugin use', () => {
		expect(DETAIL_SECTIONS_HIDDEN_KEY).toBe('hiddenDetailSectionsTv');
	});

	it('keeps ids unique, since they are what gets stored', () => {
		const ids = DETAIL_SECTIONS.map((section) => section.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('puts every section in a known group', () => {
		const groups = DETAIL_SECTION_GROUPS.map((group) => group.id);
		DETAIL_SECTIONS.forEach((section) => expect(groups).toContain(section.group));
	});

	it('gives every Seerr piece a switch of its own', () => {
		const seerr = DETAIL_SECTIONS.filter((section) => section.group === 'seerr').map((section) => section.id);
		expect(seerr).toEqual(expect.arrayContaining([
			'seerrGenresTags', 'seerrStats', 'seerrStreaming', 'seerrRecommendations', 'seerrSimilar',
			'seerrCollection', 'seerrPersonAppearances', 'seerrPersonCrew'
		]));
	});

	it('only lists what a style draws', () => {
		expect(isAvailableIn(byId('poster'), 'v1')).toBe(true);
		expect(isAvailableIn(byId('poster'), 'v2')).toBe(false);
		expect(isAvailableIn(byId('mediaInfo'), 'v1')).toBe(false);
		expect(isAvailableIn(byId('mediaInfo'), 'v4')).toBe(true);
		expect(isAvailableIn(byId('mediaInfo'), 'v3')).toBe(true);
		expect(isAvailableIn(byId('versionBadge'), 'v3')).toBe(true);
		expect(isAvailableIn(byId('versionBadge'), 'v1')).toBe(false);
	});

	it('lists for Minimalist whatever Spotlight draws for the pages it hands over', () => {
		const ids = (style) => new Set(offeredSections(style, true).map((section) => section.id));
		const minimalist = ids('v5');
		ids('v3').forEach((id) => expect(minimalist.has(id)).toBe(true));
		expect(minimalist.has('logo')).toBe(true);
		expect(minimalist.has('poster')).toBe(false);
	});

	it.each([['Stage', 'v6'], ['Premiere', 'v7']])('lists for %s what it draws, plus what Modern draws on the person and collection pages', (name, style) => {
		const offered = new Set(offeredSections(style, true).map((section) => section.id));
		['logo', 'tagline', 'cast', 'crew', 'studios', 'extras', 'collections', 'moreLikeThis', 'moreEpisodes', 'seerrSimilar']
			.forEach((id) => expect(offered.has(id)).toBe(true));
		['biography', 'playlistOrder', 'seerrPersonCrew'].forEach((id) => expect(offered.has(id)).toBe(true));
		['poster', 'chapters', 'reviews', 'mediaInfo', 'upNext', 'seerrCollection'].forEach((id) => expect(offered.has(id)).toBe(false));
	});

	it('lists for Frost what its tabs draw, plus what Modern draws on the person and collection pages', () => {
		const offered = new Set(offeredSections('v9', true).map((section) => section.id));
		[
			'cast', 'crew', 'studios', 'extras', 'moreLikeThis', 'moreEpisodes', 'mediaInfo',
			'seerrRecommendations', 'seerrSimilar', 'seerrStats', 'seerrStreaming', 'seerrGenresTags'
		].forEach((id) => expect(offered.has(id)).toBe(true));
		['biography', 'playlistOrder', 'seerrPersonCrew'].forEach((id) => expect(offered.has(id)).toBe(true));
		['logo', 'tagline', 'poster', 'chapters', 'reviews', 'collections', 'upNext', 'seerrCollection']
			.forEach((id) => expect(offered.has(id)).toBe(false));
	});

	it('lists for Quick Look what Modern draws, since that is its full page', () => {
		const modern = offeredSections('v2', true).map((section) => section.id);
		expect(offeredSections('v8', true).map((section) => section.id)).toEqual(modern);
	});

	it('offers the Seerr pieces only when Seerr is', () => {
		const without = offeredSections('v2', false).map((section) => section.id);
		expect(without).not.toContain('seerrStats');
		expect(without).toContain('cast');
		expect(offeredSections('v2', true).map((section) => section.id)).toContain('seerrStats');
	});

	it('reads the hidden ids from an array or the comma joined string Core stores', () => {
		const shows = sectionVisibility(['cast', 'seerrStats']);
		expect(shows('cast')).toBe(false);
		expect(shows('seerrStats')).toBe(false);
		expect(shows('crew')).toBe(true);
		expect(sectionVisibility('cast,crew')('crew')).toBe(false);
		expect(sectionVisibility(undefined)('cast')).toBe(true);
	});

	it('toggles one id and leaves the ids other clients stored alone', () => {
		expect(toggleHiddenSection(['versionBadge'], 'cast')).toEqual(['versionBadge', 'cast']);
		expect(toggleHiddenSection(['versionBadge', 'cast'], 'cast')).toEqual(['versionBadge']);
		expect(toggleHiddenSection(undefined, 'logo')).toEqual(['logo']);
	});
});
