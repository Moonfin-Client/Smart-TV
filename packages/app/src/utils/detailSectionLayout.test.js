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
			'seerrGenresTags', 'seerrStats', 'seerrRecommendations', 'seerrSimilar',
			'seerrCollection', 'seerrPersonAppearances', 'seerrPersonCrew'
		]));
	});

	it('only lists what a style draws', () => {
		expect(isAvailableIn(byId('poster'), 'v1')).toBe(true);
		expect(isAvailableIn(byId('poster'), 'v2')).toBe(false);
		expect(isAvailableIn(byId('mediaInfo'), 'v1')).toBe(false);
		expect(isAvailableIn(byId('mediaInfo'), 'v4')).toBe(true);
		expect(isAvailableIn(byId('mediaInfo'), 'v3')).toBe(true);
	});

	it('lists for Minimalist whatever Spotlight draws for the pages it hands over', () => {
		const ids = (style) => new Set(offeredSections(style, true).map((section) => section.id));
		const minimalist = ids('v5');
		ids('v3').forEach((id) => expect(minimalist.has(id)).toBe(true));
		expect(minimalist.has('logo')).toBe(true);
		expect(minimalist.has('poster')).toBe(false);
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
