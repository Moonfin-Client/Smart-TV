import {spotlightMetaPieces} from './spotlightMeta';

const mins = (m) => m * 60 * 10000000;
const kinds = (pieces) => pieces.map((p) => p.kind);
const texts = (pieces) => pieces.map((p) => p.text);

describe('spotlightMetaPieces', () => {
	it('leads with the year and the rating', () => {
		const pieces = spotlightMetaPieces({item: {Type: 'Movie'}, year: 1979, officialRating: 'R'});
		expect(texts(pieces)).toEqual(['1979', 'R']);
	});

	it('counts seasons on a series and episodes on a season', () => {
		expect(texts(spotlightMetaPieces({item: {Type: 'Series'}, seasonCount: 4}))).toEqual(['4 Seasons']);
		expect(texts(spotlightMetaPieces({item: {Type: 'Season'}, episodeCount: 10}))).toEqual(['10 Episodes']);
	});

	it('names where an episode sits', () => {
		expect(texts(spotlightMetaPieces({item: {Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 5}}))).toEqual(['S2:E5']);
	});

	it('marks a series as running or finished', () => {
		const running = spotlightMetaPieces({item: {Type: 'Series', Status: 'Continuing'}});
		expect(running[0]).toEqual({kind: 'status', text: 'Continuing', ended: false});
		const done = spotlightMetaPieces({item: {Type: 'Series', Status: 'Ended'}});
		expect(done[0]).toEqual({kind: 'status', text: 'Ended', ended: true});
	});

	it('ignores a status it has no pill for', () => {
		expect(spotlightMetaPieces({item: {Type: 'Series', Status: 'Unreleased'}})).toEqual([]);
	});

	it('gives a runtime to everything but a series', () => {
		expect(kinds(spotlightMetaPieces({item: {Type: 'Movie', RunTimeTicks: mins(95)}}))).toEqual(['runtime']);
		expect(spotlightMetaPieces({item: {Type: 'Series', RunTimeTicks: mins(45)}})).toEqual([]);
	});

	it('names at most three genres', () => {
		const pieces = spotlightMetaPieces({item: {Type: 'Movie'}, genres: ['A', 'B', 'C', 'D']});
		expect(texts(pieces)).toEqual(['A · B · C']);
	});

	it('has nothing to say about an item carrying nothing', () => {
		expect(spotlightMetaPieces({item: {Type: 'Movie'}})).toEqual([]);
	});
});
