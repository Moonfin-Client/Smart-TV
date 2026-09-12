import {trackRuntimeLabel, trackTitle, trackSubtitle, trackSecondLine, trackNumber, spansMultipleDiscs, trackRowsFor} from './trackRows';

const mins = (m) => m * 60 * 10000000;

describe('trackRuntimeLabel', () => {
	it('reads audio as minutes and seconds, zero padded', () => {
		expect(trackRuntimeLabel(mins(3) + 5 * 10000000, true)).toBe('3:05');
	});

	it('reads anything longer as hours and minutes', () => {
		expect(trackRuntimeLabel(mins(95), false)).toBe('1h 35m');
		expect(trackRuntimeLabel(mins(42), false)).toBe('42m');
	});

	it('says nothing without a runtime', () => {
		expect(trackRuntimeLabel(0, true)).toBe('');
	});
});

describe('trackTitle', () => {
	it('leads an episode with its series', () => {
		expect(trackTitle({Type: 'Episode', SeriesName: 'Show', Name: 'Pilot'})).toBe('Show');
	});

	it('falls back to the episode name when the series is unknown', () => {
		expect(trackTitle({Type: 'Episode', Name: 'Pilot'})).toBe('Pilot');
	});

	it('names a track as itself', () => {
		expect(trackTitle({Type: 'Audio', Name: 'A Song'})).toBe('A Song');
	});
});

describe('trackSubtitle', () => {
	it('gives an episode its season and number', () => {
		expect(trackSubtitle({Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 5, Name: 'Pilot'})).toBe('S2:E5 - Pilot');
		expect(trackSubtitle({Type: 'Episode', Name: 'Pilot'})).toBe('Pilot');
	});

	it('says nothing for an audiobook chapter', () => {
		expect(trackSubtitle({Type: 'Audio', Artists: ['A']}, {isAudiobook: true})).toBe('');
	});

	it('names the artists, falling back to the album artist', () => {
		expect(trackSubtitle({Type: 'Audio', Artists: ['A', 'B']})).toBe('A, B');
		expect(trackSubtitle({Type: 'Audio', AlbumArtist: 'Various'})).toBe('Various');
	});

	it('leads with the album when a playlist asks for it', () => {
		expect(trackSubtitle({Type: 'Audio', Album: 'Record', Artists: ['A']}, {showAlbum: true})).toBe('Record • A');
		expect(trackSubtitle({Type: 'Audio', Album: 'Record'}, {showAlbum: true})).toBe('Record');
	});
});

describe('trackSecondLine', () => {
	it('joins what there is to say and drops what there is not', () => {
		expect(trackSecondLine({Type: 'Audio', Artists: ['A'], RunTimeTicks: mins(3)})).toBe('A • 3:00');
		expect(trackSecondLine({Type: 'Audio', RunTimeTicks: mins(3)})).toBe('3:00');
		expect(trackSecondLine({Type: 'Audio', Artists: ['A']})).toBe('A');
	});
});

describe('trackNumber', () => {
	it('counts playlist positions rather than the numbers tracks carry', () => {
		expect(trackNumber({IndexNumber: 7}, 0, true)).toBe(1);
	});

	it('keeps the track number on an album', () => {
		expect(trackNumber({IndexNumber: 7}, 0, false)).toBe(7);
		expect(trackNumber({}, 2, false)).toBe(3);
	});
});

describe('spansMultipleDiscs', () => {
	it('is only true when the discs actually differ', () => {
		expect(spansMultipleDiscs([{ParentIndexNumber: 1}, {ParentIndexNumber: 2}])).toBe(true);
		expect(spansMultipleDiscs([{ParentIndexNumber: 1}, {ParentIndexNumber: 1}])).toBe(false);
		expect(spansMultipleDiscs([{}, {}])).toBe(false);
	});
});

describe('trackRowsFor', () => {
	const tracks = [
		{Id: 'a', ParentIndexNumber: 1}, {Id: 'b', ParentIndexNumber: 1}, {Id: 'c', ParentIndexNumber: 2}
	];

	it('heads each disc when an album spans more than one', () => {
		expect(trackRowsFor(tracks, true).map((row) => row.kind))
			.toEqual(['disc', 'track', 'track', 'disc', 'track']);
	});

	it('leaves a single disc album without headings', () => {
		expect(trackRowsFor(tracks.slice(0, 2), true).every((row) => row.kind === 'track')).toBe(true);
	});

	it('never heads discs when it was not asked to', () => {
		expect(trackRowsFor(tracks, false).every((row) => row.kind === 'track')).toBe(true);
	});

	it('keys a playlist row by its entry, so the same track twice stays apart', () => {
		const rows = trackRowsFor([{Id: 'a', PlaylistItemId: 'e1'}, {Id: 'a', PlaylistItemId: 'e2'}]);
		expect(rows.map((row) => row.key)).toEqual(['track-e1-0', 'track-e2-1']);
	});
});
