import {
	spotlightItemImageUrl,
	spotlightLandscapeImageUrl,
	firstLandscapeImageUrl,
	firstChapterImageUrl
} from './spotlightImages';

const SERVER = 'https://tv.example';

describe('spotlightItemImageUrl', () => {
	it('asks the server for a tagged poster', () => {
		const url = spotlightItemImageUrl(SERVER, {Id: 'a1', Type: 'Movie', ImageTags: {Primary: 'tag1'}});
		expect(url).toBe(`${SERVER}/Items/a1/Images/Primary?maxHeight=360&quality=90&tag=tag1`);
	});

	it('takes the TMDB art a Seerr title carries rather than asking the server', () => {
		const url = spotlightItemImageUrl(SERVER, {Id: 'seerr-movie-9', Type: 'Movie', _seerr: true, ImageTags: {Primary: 'tag1'}, _externalPosterUrl: 'https://image.tmdb.org/t/p/w342/p.jpg'});
		expect(url).toBe('https://image.tmdb.org/t/p/w342/p.jpg');
	});

	it('asks for a box set poster without a tag, since the record can arrive without one', () => {
		expect(spotlightItemImageUrl(SERVER, {Id: 'b1', Type: 'BoxSet'}))
			.toBe(`${SERVER}/Items/b1/Images/Primary?maxHeight=360&quality=90`);
	});

	it('leaves any other untagged item alone rather than fetching a 404', () => {
		expect(spotlightItemImageUrl(SERVER, {Id: 'f1', Type: 'Folder'})).toBeNull();
		expect(spotlightItemImageUrl(SERVER, null)).toBeNull();
	});
});

describe('spotlightLandscapeImageUrl', () => {
	const movie = {Id: 'm1', Type: 'Movie'};

	it('takes a thumb ahead of anything else', () => {
		const item = {...movie, ImageTags: {Thumb: 't'}, BackdropImageTags: ['b']};
		expect(spotlightLandscapeImageUrl(SERVER, item)).toContain('/Images/Thumb?');
	});

	it('falls to the item backdrop, then the one inherited from a parent', () => {
		expect(spotlightLandscapeImageUrl(SERVER, {...movie, BackdropImageTags: ['b']}))
			.toBe(`${SERVER}/Items/m1/Images/Backdrop?maxWidth=640&quality=90&tag=b`);
		expect(spotlightLandscapeImageUrl(SERVER, {...movie, ParentBackdropItemId: 'p1', ParentBackdropImageTags: ['pb']}))
			.toBe(`${SERVER}/Items/p1/Images/Backdrop?maxWidth=640&quality=90&tag=pb`);
	});

	it('hands back the fallback when the item has no landscape art', () => {
		expect(spotlightLandscapeImageUrl(SERVER, movie, {fallbackUrl: 'fb'})).toBe('fb');
		expect(spotlightLandscapeImageUrl(SERVER, null, {fallbackUrl: 'fb'})).toBe('fb');
	});
});

describe('firstLandscapeImageUrl', () => {
	it('walks past the items with no artwork', () => {
		const items = [{Id: 'a', Type: 'Movie'}, {Id: 'b', Type: 'Movie', BackdropImageTags: ['bt']}];
		expect(firstLandscapeImageUrl(SERVER, items)).toContain('/Items/b/Images/Backdrop');
		expect(firstLandscapeImageUrl(SERVER, [])).toBeNull();
	});
});

describe('firstChapterImageUrl', () => {
	it('takes the first chapter that has a still', () => {
		const item = {Id: 'm1', Chapters: [{Name: 'One'}, {Name: 'Two', ImageTag: 'ct'}]};
		expect(firstChapterImageUrl(SERVER, item)).toBe(`${SERVER}/Items/m1/Images/Chapter/1?maxWidth=480&quality=90&tag=ct`);
	});

	it('has nothing to show when no chapter carries one', () => {
		expect(firstChapterImageUrl(SERVER, {Id: 'm1', Chapters: [{Name: 'One'}]})).toBeNull();
		expect(firstChapterImageUrl(SERVER, {Id: 'm1'})).toBeNull();
	});
});
