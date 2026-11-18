import {HOME_CORE_ICON_PATHS} from './homeIconPaths';
import {libraryOrderIcon} from '../../views/Settings/libraryOrder';

describe('HOME_CORE_ICON_PATHS', () => {
	test('has every icon the navbar draws for a library', () => {
		['movies', 'tvshows', 'music', 'books', 'audiobooks', 'livetv', 'homevideos', 'photos', 'boxsets', 'playlists', 'folders', '']
			.forEach((type) => {
				expect(typeof HOME_CORE_ICON_PATHS[libraryOrderIcon({CollectionType: type})]).toBe('string');
			});
		expect(typeof HOME_CORE_ICON_PATHS.sports_esports).toBe('string');
	});
});
