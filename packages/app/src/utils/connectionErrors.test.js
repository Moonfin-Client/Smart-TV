import {detectServerType, supportsQuickConnectWebLink} from './connectionErrors';

describe('detectServerType', () => {
	test('takes a server at its word when it names itself', () => {
		expect(detectServerType('Jellyfin Server', '10.9.11')).toBe('jellyfin');
		expect(detectServerType('Emby Server', '4.8.0.0')).toBe('emby');
		expect(detectServerType('jellyfin', null)).toBe('jellyfin');
	});

	test('reads an unnamed four part version below 10 as Emby', () => {
		expect(detectServerType(null, '4.8.0.80')).toBe('emby');
		expect(detectServerType('', '4.8.0.80')).toBe('emby');
	});

	test('leaves anything else undecided', () => {
		expect(detectServerType(null, '10.9.11')).toBeNull();
		expect(detectServerType('Plex', '1.40.0')).toBeNull();
		expect(detectServerType(null, null)).toBeNull();
		expect(detectServerType(undefined, undefined)).toBeNull();
	});

	// The version shape is the only clue left once a server declines to name
	// itself, so anything wearing four parts below 10 is read as Emby.
	test('a four part version wins over an unfamiliar name', () => {
		expect(detectServerType('Something Else', '1.40.0.1')).toBe('emby');
	});
});

describe('supportsQuickConnectWebLink', () => {
	test('is on from Jellyfin 10.9', () => {
		expect(supportsQuickConnectWebLink('10.9.0')).toBe(true);
		expect(supportsQuickConnectWebLink('10.11.0')).toBe(true);
		expect(supportsQuickConnectWebLink('11.0.0')).toBe(true);
	});

	test('is off before 10.9, where the page has no prefill', () => {
		expect(supportsQuickConnectWebLink('10.8.13')).toBe(false);
		expect(supportsQuickConnectWebLink('9.9.9')).toBe(false);
	});

	test('counts a version that does not parse as recent enough', () => {
		expect(supportsQuickConnectWebLink('')).toBe(true);
		expect(supportsQuickConnectWebLink(null)).toBe(true);
		expect(supportsQuickConnectWebLink('unknown')).toBe(true);
	});
});
