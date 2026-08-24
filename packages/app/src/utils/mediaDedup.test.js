import {getDeduplicationKey, deduplicateMediaItems} from './mediaDedup';

describe('getDeduplicationKey', () => {
	test('prefers imdb over tmdb and tvdb', () => {
		const item = {Id: '1', ProviderIds: {Tvdb: '3', Tmdb: '2', Imdb: 'tt123'}};
		expect(getDeduplicationKey(item)).toBe('imdb:tt123');
	});

	test('matches provider names case insensitively and trims values', () => {
		expect(getDeduplicationKey({Id: '1', ProviderIds: {IMDB: ' TT123 '}})).toBe('imdb:tt123');
	});

	test('skips empty provider values', () => {
		const item = {Id: '1', ProviderIds: {Imdb: '  ', Tmdb: '42'}};
		expect(getDeduplicationKey(item)).toBe('tmdb:42');
	});

	test('falls back to episode key when provider id is missing', () => {
		const episode = {Type: 'Episode', SeriesName: 'Breaking Bad', ParentIndexNumber: 1, IndexNumber: 2};
		expect(getDeduplicationKey(episode)).toBe('episode:breaking bad:s1:e2');
	});

	test('falls back to server and id when no provider id or episode key exists', () => {
		expect(getDeduplicationKey({Id: 'abc', _serverId: 's1'})).toBe('item:s1:abc');
		expect(getDeduplicationKey({Id: 'abc'})).toBe('item::abc');
	});
});

describe('deduplicateMediaItems', () => {
	test('merges items sharing a provider id and keeps first appearance order', () => {
		const items = [
			{Id: 'a', Name: 'First', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'b', Name: 'Other', ProviderIds: {Imdb: 'tt2'}},
			{Id: 'c', Name: 'FirstCopy', ProviderIds: {Imdb: 'tt1'}}
		];
		const result = deduplicateMediaItems(items);
		expect(result.map((i) => i.ProviderIds.Imdb)).toEqual(['tt1', 'tt2']);
	});

	test('never merges items without provider ids', () => {
		const items = [
			{Id: 'a', Name: 'Same'},
			{Id: 'b', Name: 'Same'}
		];
		expect(deduplicateMediaItems(items)).toHaveLength(2);
	});

	test('keeps the copy with watch progress', () => {
		const items = [
			{Id: 'a', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'b', ProviderIds: {Imdb: 'tt1'}, UserData: {PlaybackPositionTicks: 500}}
		];
		expect(deduplicateMediaItems(items)[0].Id).toBe('b');
	});

	test('prefers played then favorited copies', () => {
		const played = deduplicateMediaItems([
			{Id: 'a', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'b', ProviderIds: {Imdb: 'tt1'}, UserData: {Played: true}}
		]);
		expect(played[0].Id).toBe('b');
		const favorite = deduplicateMediaItems([
			{Id: 'a', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'b', ProviderIds: {Imdb: 'tt1'}, UserData: {IsFavorite: true}}
		]);
		expect(favorite[0].Id).toBe('b');
	});

	test('breaks ties by server and id order regardless of response order', () => {
		const first = deduplicateMediaItems([
			{Id: 'x', _serverId: 's2', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'x', _serverId: 's1', ProviderIds: {Imdb: 'tt1'}}
		]);
		const second = deduplicateMediaItems([
			{Id: 'x', _serverId: 's1', ProviderIds: {Imdb: 'tt1'}},
			{Id: 'x', _serverId: 's2', ProviderIds: {Imdb: 'tt1'}}
		]);
		expect(first[0]._serverId).toBe('s1');
		expect(second[0]._serverId).toBe('s1');
	});

	test('merges episodes of the same show lacking provider ids', () => {
		const items = [
			{Id: 'ep1_hd', Type: 'Episode', SeriesName: 'Breaking Bad', ParentIndexNumber: 1, IndexNumber: 1},
			{Id: 'ep1_4k', Type: 'Episode', SeriesName: 'Breaking Bad', ParentIndexNumber: 1, IndexNumber: 1, UserData: {PlaybackPositionTicks: 1000}}
		];
		const result = deduplicateMediaItems(items);
		expect(result).toHaveLength(1);
		expect(result[0].Id).toBe('ep1_4k');
	});

	test('handles empty and single item input', () => {
		expect(deduplicateMediaItems(null)).toEqual([]);
		expect(deduplicateMediaItems([])).toEqual([]);
		const one = [{Id: 'a'}];
		expect(deduplicateMediaItems(one)).toBe(one);
	});
});
