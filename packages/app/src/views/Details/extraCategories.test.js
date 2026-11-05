import {compareFeatures, getExtraCategoryLabel, groupExtrasByCategory, splitAdditionalParts} from './extraCategories';

const part = {Id: 'cd2', _additionalPart: true};
const trailer = {Id: 'trailer', ExtraType: 'Trailer'};
const unlabelled = {Id: 'extra'};

describe('extraCategories', () => {
	it("leads with a movie's other parts under their own heading", () => {
		const groups = groupExtrasByCategory([trailer, unlabelled, part]);

		expect(groups.map((group) => group.key)).toEqual(['additionalParts', 'extras', 'trailers']);
		expect(groups[0].items).toEqual([part]);
		expect(getExtraCategoryLabel('additionalParts')).toBe('Additional Parts');
	});

	it('splits the parts from the rest of the extras', () => {
		expect(splitAdditionalParts([trailer, part, unlabelled])).toEqual({parts: [part], others: [trailer, unlabelled]});
	});
});

describe('compareFeatures', () => {
	const ids = (list) => list.map((feature) => feature.Id);

	it('sorts by number first, ignoring the season number', () => {
		const f1 = {Id: 'f1', ParentIndexNumber: 2, IndexNumber: 1, Name: 'Feature B'};
		const f2 = {Id: 'f2', ParentIndexNumber: 1, IndexNumber: 2, Name: 'Feature A'};

		expect(ids([f2, f1].sort(compareFeatures))).toEqual(['f1', 'f2']);
	});

	it('breaks ties by name, ignoring case', () => {
		const a = {Id: 'a', IndexNumber: 1, Name: 'behind the Scenes'};
		const b = {Id: 'b', IndexNumber: 1, Name: 'Making of'};

		expect(ids([b, a].sort(compareFeatures))).toEqual(['a', 'b']);
	});

	it('counts a feature with no number as zero', () => {
		const numbered = {Id: 'numbered', IndexNumber: 1, Name: 'A'};
		const unnumbered = {Id: 'unnumbered', Name: 'Z'};

		expect(ids([numbered, unnumbered].sort(compareFeatures))).toEqual(['unnumbered', 'numbered']);
	});
});
