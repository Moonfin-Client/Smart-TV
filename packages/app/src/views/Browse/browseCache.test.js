import {clearMemoryCache, memoryCache} from './browseCache';

// The module reaches storage on save and load, neither of which this touches.
jest.mock('../../services/storage', () => ({
	getFromStorage: () => Promise.resolve(null),
	saveToStorage: () => Promise.resolve()
}));

const fill = () => {
	memoryCache.rowData = [{id: 'resume', items: []}];
	memoryCache.libraries = [{Id: 'lib1'}];
	memoryCache.timestamp = 1;
	memoryCache.rowConfigKey = 'per-library';
	memoryCache.featuredItems = [{Id: 'item1'}];
	memoryCache.featuredConfigKey = 'key';
};

describe('clearMemoryCache', () => {
	beforeEach(fill);

	test('throws the rows away', () => {
		clearMemoryCache({keepFeatured: true});

		expect(memoryCache.rowData).toBeNull();
		expect(memoryCache.libraries).toBeNull();
		expect(memoryCache.timestamp).toBeNull();
		expect(memoryCache.rowConfigKey).toBeNull();
	});

	// Playback ending, marking watched and returning home don't change what the bar may hold.
	test('keeps the media bar when asked to', () => {
		clearMemoryCache({keepFeatured: true});

		expect(memoryCache.featuredItems).toEqual([{Id: 'item1'}]);
		expect(memoryCache.featuredConfigKey).toBe('key');
	});

	// An account change, and a library being hidden or shown, both have to redraw it.
	test('takes the media bar with it by default', () => {
		clearMemoryCache();

		expect(memoryCache.featuredItems).toBeNull();
		expect(memoryCache.featuredConfigKey).toBeNull();
	});
});
