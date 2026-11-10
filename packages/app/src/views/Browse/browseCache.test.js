import {clearBrowseCache, clearMemoryCache, memoryCache, saveBrowseCache} from './browseCache';

const mockSaveToStorage = jest.fn();
const mockRemoveFromStorage = jest.fn();
jest.mock('../../services/storage', () => ({
	getFromStorage: () => Promise.resolve(null),
	saveToStorage: (...args) => mockSaveToStorage(...args),
	removeFromStorage: (...args) => Promise.resolve(mockRemoveFromStorage(...args))
}));

const fill = () => {
	memoryCache.rowData = [{id: 'resume', items: []}];
	memoryCache.libraries = [{Id: 'lib1'}];
	memoryCache.timestamp = 1;
	memoryCache.rowConfigKey = 'per-library';
	memoryCache.featuredItems = [{Id: 'item1'}];
	memoryCache.featuredConfigKey = 'key';
	memoryCache.recentAt = 1;
};

describe('clearMemoryCache', () => {
	beforeEach(fill);

	test('throws the rows away', () => {
		clearMemoryCache({keepFeatured: true});

		expect(memoryCache.rowData).toBeNull();
		expect(memoryCache.libraries).toBeNull();
		expect(memoryCache.timestamp).toBeNull();
		expect(memoryCache.rowConfigKey).toBeNull();
		expect(memoryCache.recentAt).toBeNull();
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

describe('saveBrowseCache', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		fill();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('saves the media bar key the items were drawn for', () => {
		saveBrowseCache(memoryCache.rowData, memoryCache.libraries, memoryCache.featuredItems, {serverUrl: 'http://server', userId: 'user'});
		memoryCache.featuredItems = [{Id: 'item2'}];
		memoryCache.featuredConfigKey = 'newer';
		jest.runAllTimers();

		const saved = mockSaveToStorage.mock.calls[0][1];
		expect(saved.featuredItems).toEqual([{Id: 'item1'}]);
		expect(saved.featuredConfigKey).toBe('key');
	});

	// A write after only Continue Watching and Next Up were read again mustn't make the recent rows look new.
	test('saves when the recent rows were read, not the time of the write', () => {
		memoryCache.recentAt = 1;
		mockSaveToStorage.mockClear();
		saveBrowseCache([{id: 'nextup', items: []}], memoryCache.libraries, memoryCache.featuredItems, {serverUrl: 'http://server', userId: 'user'});
		jest.runAllTimers();

		const saved = mockSaveToStorage.mock.calls[0][1];
		expect(saved.recentAt).toBe(1);
	});
});

describe('clearBrowseCache', () => {
	test('drops the stored rows, so the next load asks the server', async () => {
		await clearBrowseCache();
		expect(mockRemoveFromStorage).toHaveBeenCalledWith('browse_cache_v5');
	});
});
