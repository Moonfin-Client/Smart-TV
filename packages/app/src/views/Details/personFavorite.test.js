import {offersFavorite} from './personFavorite';
import {registerPlexServer} from '../../utils/plexUrls';

describe('offersFavorite', () => {
	beforeAll(() => registerPlexServer('http://plex.local', 'token'));

	it('offers it on anything that is not a person, and on a person outside Plex', () => {
		expect(offersFavorite(false, 'http://plex.local')).toBe(true);
		expect(offersFavorite(true, 'http://jellyfin.local')).toBe(true);
	});

	it('leaves it off a person on Plex', () => {
		expect(offersFavorite(true, 'http://plex.local')).toBe(false);
	});
});
