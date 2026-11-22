import {searchArtworkOptions, searchArtworkSource, shouldMountSearchRow} from './searchWindow';

describe('searchArtworkSource', () => {
	test("an episode with no still shows its own backdrop, then its series'", () => {
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {Primary: 'still'}}))
			.toEqual({id: 'e', type: 'Primary', tag: 'still'});
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {}, BackdropImageTags: ['own']}))
			.toEqual({id: 'e', type: 'Backdrop', tag: 'own'});
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {}, BackdropImageTags: [], ParentBackdropItemId: 's', ParentBackdropImageTags: ['series']}))
			.toEqual({id: 's', type: 'Backdrop', tag: 'series'});
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {}, ParentThumbItemId: 's', ParentThumbImageTag: 'thumb', ParentBackdropItemId: 's', ParentBackdropImageTags: ['series']}))
			.toEqual({id: 's', type: 'Thumb', tag: 'thumb'});
	});

	test('a programme shows its own thumbnail before any backdrop', () => {
		expect(searchArtworkSource({Id: 'p', Type: 'Program', ImageTags: {Thumb: 'own'}, BackdropImageTags: ['b'], ParentThumbItemId: 's', ParentThumbImageTag: 'series'}))
			.toEqual({id: 'p', type: 'Thumb', tag: 'own'});
	});

	test("an episode or season with only its series' poster shows that", () => {
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {}, SeriesId: 's', SeriesPrimaryImageTag: 'poster'}))
			.toEqual({id: 's', type: 'Primary', tag: 'poster'});
		expect(searchArtworkSource({Id: 'e', Type: 'Episode', ImageTags: {}, SeriesId: 's', SeriesPrimaryImageTag: 'poster', ParentBackdropItemId: 's', ParentBackdropImageTags: ['wide']}))
			.toEqual({id: 's', type: 'Backdrop', tag: 'wide'});
		expect(searchArtworkSource({Id: 'n', Type: 'Season', ImageTags: {}, SeriesId: 's', SeriesPrimaryImageTag: 'poster'}))
			.toEqual({id: 's', type: 'Primary', tag: 'poster'});
	});

	test("a movie never borrows a backdrop, and a track shows its album's cover", () => {
		expect(searchArtworkSource({Id: 'm', Type: 'Movie', ImageTags: {}, BackdropImageTags: ['b']})).toBeNull();
		expect(searchArtworkSource({Id: 't', Type: 'Audio', ImageTags: {}, AlbumId: 'a', AlbumPrimaryImageTag: 'cover'}))
			.toEqual({id: 'a', type: 'Primary', tag: 'cover'});
	});
});

describe('search result windowing', () => {
	// The windowing rules are proven in utils/rowWindow.test.js. This only checks that search still
	// reaches them under the name it has always used.
	it('still reaches the shared windowing', () => {
		expect(shouldMountSearchRow(1, 0)).toBe(true);
		expect(shouldMountSearchRow(2, 0)).toBe(false);
	});

	// The same sizes and quality the rest of the app asks for, so search reads
	// the images the server already rendered.
	test('sizes artwork for its card shape', () => {
		expect(searchArtworkOptions('poster', 'poster-tag')).toEqual({
			maxHeight: 300,
			quality: 80,
			tag: 'poster-tag'
		});
		expect(searchArtworkOptions('wide')).toEqual({maxWidth: 400, quality: 80});
		expect(searchArtworkOptions('square')).toEqual({maxWidth: 400, quality: 80});
	});
});
