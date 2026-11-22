import {requestedArtwork} from './cardArtwork';

describe('requestedArtwork', () => {
	test('a merged library tile asks for the artwork of the library it borrows from', () => {
		const tile = {Id: 'merged-movies', _imageItemId: 'm1', ImageTags: {Thumb: 't', Banner: 'b', Logo: 'l'}, BackdropImageTags: ['x']};
		['thumb', 'backdrop', 'banner', 'logo'].forEach((type) => {
			expect(requestedArtwork(tile, type, 'http://jf')).toContain('/Items/m1/');
		});
	});

	test('any other item asks for its own artwork', () => {
		expect(requestedArtwork({Id: 'i1', ImageTags: {Thumb: 't'}}, 'thumb', 'http://jf')).toBe('http://jf/Items/i1/Images/Thumb?maxWidth=400&quality=80');
	});
});
