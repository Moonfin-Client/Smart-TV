jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isLegacyWebOS: () => true, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));
jest.mock('./moonbaseEndpoint', () => ({moonbaseEndpoint: jest.fn(), isSiloLogin: () => false}));

const probes = [];
class FakeImage {
	set src(value) {
		this.url = value;
		probes.push(this);
	}
}

describe('getImageUrl on a TV that may not trust TMDB over HTTPS', () => {
	let getImageUrl;
	const realImage = window.Image;

	beforeEach(() => {
		probes.length = 0;
		window.Image = FakeImage;
		jest.isolateModules(() => {
			({getImageUrl} = require('./seerrApi'));
		});
	});
	afterEach(() => {
		window.Image = realImage;
	});

	test('starts on HTTP and moves to HTTPS once a picture loads over it', () => {
		expect(getImageUrl('/a.jpg')).toBe('http://image.tmdb.org/t/p/w500/a.jpg');
		expect(probes.map((p) => p.url)).toEqual(['https://image.tmdb.org/t/p/w500/a.jpg']);

		probes[0].onload();
		expect(getImageUrl('/b.jpg')).toBe('https://image.tmdb.org/t/p/w500/b.jpg');
		expect(probes).toHaveLength(1);
	});

	test('stays on HTTP when HTTPS fails', () => {
		getImageUrl('/a.jpg');
		expect(getImageUrl('https://image.tmdb.org/t/p/w92/b.jpg')).toBe('http://image.tmdb.org/t/p/w92/b.jpg');
		expect(probes).toHaveLength(1);
	});
});
