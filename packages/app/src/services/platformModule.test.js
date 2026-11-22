jest.mock('../platform', () => ({getPlatform: jest.fn()}));
jest.mock('@moonfin/platform-tizen/storage', () => ({name: 'tizen'}));
jest.mock('@moonfin/platform-webos/storage', () => ({name: 'webos'}));
jest.mock('@moonfin/platform-vega/storage', () => ({name: 'vega'}));
jest.mock('@moonfin/platform-xbox/storage', () => ({name: 'xbox'}));

import {getPlatform} from '../platform';
import {resolvePlatformModule} from './platformModule';

describe('resolvePlatformModule', () => {
	test.each(['tizen', 'webos', 'vega', 'xbox'])('loads the %s module', async (platform) => {
		getPlatform.mockReturnValue(platform);
		expect((await resolvePlatformModule('storage')).name).toBe(platform);
	});

	test('a platform it doesnt know gets the webOS module', async () => {
		getPlatform.mockReturnValue('unknown');
		expect((await resolvePlatformModule('storage')).name).toBe('webos');
	});

	test('a module it doesnt know is refused', async () => {
		getPlatform.mockReturnValue('vega');
		await expect(resolvePlatformModule('keyboard')).rejects.toThrow('keyboard');
	});
});
