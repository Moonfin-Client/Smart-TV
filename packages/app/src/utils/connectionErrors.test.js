import {detectServerType, getSignInMessage, isSignInForbidden, supportsQuickConnectWebLink} from './connectionErrors';

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

describe('a refused sign in', () => {
	const refused = (status) => Object.assign(new Error('API Error: ' + status), {status});

	test('a 403 is the account being refused, whatever the reason', () => {
		expect(isSignInForbidden(refused(403))).toBe(true);
	});

	test('other failures are not', () => {
		expect(isSignInForbidden(refused(401))).toBe(false);
		expect(isSignInForbidden(refused(500))).toBe(false);
		expect(isSignInForbidden(new Error('network down'))).toBe(false);
		expect(isSignInForbidden(null)).toBe(false);
		expect(isSignInForbidden(undefined)).toBe(false);
	});

	test('says the account cannot sign in right now instead of blaming the password', () => {
		const message = getSignInMessage(refused(403));

		expect(message).toMatch(/can't sign in right now/);
		expect(message).not.toMatch(/password/i);
	});

	test('a wrong password still reads as one', () => {
		expect(getSignInMessage(refused(401))).toBe('Invalid username or password.');
	});

	test('other failures keep their own messages', () => {
		expect(getSignInMessage(refused(500))).toBe('Login failed. Please try again.');
	});
});
