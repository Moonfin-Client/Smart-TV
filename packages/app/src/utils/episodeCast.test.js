import {
	actorsOf,
	formatEpisodeDirectorRole,
	formatEpisodeWriterRole,
	formatGuestStarRole,
	mergeEpisodeCast,
	mergeEpisodePeople,
	resolveParentCast
} from './episodeCast';

jest.mock('@enact/i18n/$L', () => ({
	__esModule: true,
	default: (str) => str
}));

describe('formatGuestStarRole', () => {
	it('formats empty or null role as Guest Star', () => {
		expect(formatGuestStarRole()).toBe('Guest Star');
		expect(formatGuestStarRole('')).toBe('Guest Star');
		expect(formatGuestStarRole('   ')).toBe('Guest Star');
	});

	it('formats named character role with Guest Star suffix', () => {
		expect(formatGuestStarRole('Detective Miller')).toBe('Detective Miller (Guest Star)');
	});

	it('does not duplicate Guest Star when already present', () => {
		expect(formatGuestStarRole('Guest Star')).toBe('Guest Star');
		expect(formatGuestStarRole('Detective Miller (Guest Star)')).toBe('Detective Miller (Guest Star)');
		expect(formatGuestStarRole('Special guest star')).toBe('Special guest star');
	});

	it('does not treat guesthouse as guest star', () => {
		expect(formatGuestStarRole('Guesthouse Owner')).toBe('Guesthouse Owner (Guest Star)');
	});
});

describe('formatEpisodeDirectorRole', () => {
	it('formats empty, director, or Episode Director as Episode Director', () => {
		expect(formatEpisodeDirectorRole()).toBe('Episode Director');
		expect(formatEpisodeDirectorRole('')).toBe('Episode Director');
		expect(formatEpisodeDirectorRole('Director')).toBe('Episode Director');
		expect(formatEpisodeDirectorRole('director')).toBe('Episode Director');
		expect(formatEpisodeDirectorRole('Episode Director')).toBe('Episode Director');
	});

	it('formats custom director role with Episode Director annotation', () => {
		expect(formatEpisodeDirectorRole('Co-Director')).toBe('Co-Director (Episode Director)');
	});
});

describe('formatEpisodeWriterRole', () => {
	it('formats empty, writer, or Episode Writer as Episode Writer', () => {
		expect(formatEpisodeWriterRole()).toBe('Episode Writer');
		expect(formatEpisodeWriterRole('')).toBe('Episode Writer');
		expect(formatEpisodeWriterRole('Writer')).toBe('Episode Writer');
		expect(formatEpisodeWriterRole('writer')).toBe('Episode Writer');
		expect(formatEpisodeWriterRole('Episode Writer')).toBe('Episode Writer');
	});

	it('formats custom writer role with Episode Writer annotation', () => {
		expect(formatEpisodeWriterRole('Story')).toBe('Story (Episode Writer)');
	});
});

describe('actorsOf', () => {
	it('returns only actors and guest stars from an item', async () => {
		const apiClient = {
			getItem: jest.fn().mockResolvedValue({
				People: [
					{Id: '1', Name: 'Actor 1', Type: 'Actor'},
					{Id: '2', Name: 'Guest 1', Type: 'GuestStar'},
					{Id: '3', Name: 'Director 1', Type: 'Director'}
				]
			})
		};

		const actors = await actorsOf(apiClient, 'item1');
		expect(actors).toEqual([
			{Id: '1', Name: 'Actor 1', Type: 'Actor'},
			{Id: '2', Name: 'Guest 1', Type: 'GuestStar'}
		]);
	});

	it('returns empty array when getItem fails or has no people', async () => {
		const apiClient = {
			getItem: jest.fn().mockRejectedValue(new Error('Network error'))
		};

		const actors = await actorsOf(apiClient, 'item1');
		expect(actors).toEqual([]);
	});
});

describe('resolveParentCast', () => {
	it('returns season actors when season has actors', async () => {
		const apiClient = {
			getItem: jest.fn().mockImplementation((id) => {
				if (id === 'season1') {
					return Promise.resolve({
						People: [{Id: 's1', Name: 'Season Actor', Type: 'Actor'}]
					});
				}
				if (id === 'series1') {
					return Promise.resolve({
						People: [{Id: 'ser1', Name: 'Series Actor', Type: 'Actor'}]
					});
				}
				return Promise.reject(new Error('Not found'));
			})
		};

		const actors = await resolveParentCast({
			apiClient,
			seasonId: 'season1',
			seriesId: 'series1'
		});
		expect(actors).toEqual([{Id: 's1', Name: 'Season Actor', Type: 'Actor'}]);
		expect(apiClient.getItem).toHaveBeenCalledWith('season1');
		expect(apiClient.getItem).not.toHaveBeenCalledWith('series1');
	});

	it('falls back to series actors when season has no actors', async () => {
		const apiClient = {
			getItem: jest.fn().mockImplementation((id) => {
				if (id === 'season1') {
					return Promise.resolve({
						People: [{Id: 'd1', Name: 'Director', Type: 'Director'}]
					});
				}
				if (id === 'series1') {
					return Promise.resolve({
						People: [{Id: 'ser1', Name: 'Series Actor', Type: 'Actor'}]
					});
				}
				return Promise.reject(new Error('Not found'));
			})
		};

		const actors = await resolveParentCast({
			apiClient,
			seasonId: 'season1',
			seriesId: 'series1'
		});
		expect(actors).toEqual([{Id: 'ser1', Name: 'Series Actor', Type: 'Actor'}]);
	});

	it('returns empty list when neither season nor series has actors', async () => {
		const apiClient = {
			getItem: jest.fn().mockResolvedValue({People: []})
		};

		const actors = await resolveParentCast({
			apiClient,
			seasonId: 'season1',
			seriesId: 'series1'
		});
		expect(actors).toEqual([]);
	});
});

describe('mergeEpisodeCast', () => {
	it('formats guest stars and appends parent regulars', () => {
		const episodeActors = [
			{Id: 'g1', Name: 'Guest', Type: 'GuestStar', Role: 'Villain'},
			{Id: 'a1', Name: 'Regular in Ep', Type: 'Actor', Role: 'Hero'}
		];
		const parentActors = [
			{Id: 'a1', Name: 'Regular in Ep', Type: 'Actor', Role: 'Hero'},
			{Id: 'a2', Name: 'Regular Not in Ep', Type: 'Actor', Role: 'Sidekick'}
		];

		const result = mergeEpisodeCast({episodeActors, parentActors});
		expect(result).toEqual([
			{Id: 'g1', Name: 'Guest', Type: 'GuestStar', Role: 'Villain (Guest Star)'},
			{Id: 'a1', Name: 'Regular in Ep', Type: 'Actor', Role: 'Hero'},
			{Id: 'a2', Name: 'Regular Not in Ep', Type: 'Actor', Role: 'Sidekick'}
		]);
	});

	it('preserves distinct actors who share a name but have different IDs', () => {
		const episodeActors = [
			{Id: 'id1', Name: 'John Smith', Type: 'GuestStar', Role: 'Guest John'}
		];
		const parentActors = [
			{Id: 'id2', Name: 'John Smith', Type: 'Actor', Role: 'Regular John'}
		];

		const result = mergeEpisodeCast({episodeActors, parentActors});
		expect(result).toHaveLength(2);
		expect(result[0].Id).toBe('id1');
		expect(result[1].Id).toBe('id2');
	});

	it('deduplicates by name when IDs are missing', () => {
		const episodeActors = [
			{Name: 'John Smith', Type: 'GuestStar', Role: 'Guest John'}
		];
		const parentActors = [
			{Name: 'John Smith', Type: 'Actor', Role: 'Regular John'}
		];

		const result = mergeEpisodeCast({episodeActors, parentActors});
		expect(result).toHaveLength(1);
		expect(result[0].Role).toBe('Guest John (Guest Star)');
	});
});

describe('mergeEpisodePeople', () => {
	it('orders episode cast first, then parent regulars, then episode crew', () => {
		const episodePeople = [
			{Id: 'd1', Name: 'Director Dan', Type: 'Director', Role: 'Director'},
			{Id: 'g1', Name: 'Guest Gina', Type: 'GuestStar', Role: 'Witness'},
			{Id: 'w1', Name: 'Writer Will', Type: 'Writer', Role: 'Writer'}
		];
		const parentActors = [
			{Id: 'r1', Name: 'Regular Rachel', Type: 'Actor', Role: 'Detective'}
		];

		const result = mergeEpisodePeople({episodePeople, parentActors});
		expect(result.map((p) => p.Name)).toEqual([
			'Guest Gina',
			'Regular Rachel',
			'Director Dan',
			'Writer Will'
		]);
		expect(result[0].Role).toBe('Witness (Guest Star)');
		expect(result[2].Role).toBe('Episode Director');
		expect(result[3].Role).toBe('Episode Writer');
	});
});

