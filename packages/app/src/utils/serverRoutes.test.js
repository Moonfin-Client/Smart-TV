import {makeUserRoutes, trimQuerySeparator, legacyAuthHeader, buildUserImageUrl} from './serverRoutes';

const USER = 'u1';
const routesFor = (type) => makeUserRoutes(() => type, () => USER);

describe('user scoped routes on Jellyfin', () => {
	const r = routesFor('jellyfin');

	test('the user id moves into the query string', () => {
		expect(r.items()).toBe(`/Items?userId=${USER}&`);
		expect(r.item('abc')).toBe(`/Items/abc?userId=${USER}&`);
		expect(r.latest()).toBe(`/Items/Latest?userId=${USER}&`);
	});

	test('resume, favorites and played moved to their own routes', () => {
		expect(r.resume()).toBe(`/UserItems/Resume?userId=${USER}&`);
		expect(r.favorite('abc')).toBe(`/UserFavoriteItems/abc?userId=${USER}&`);
		expect(r.played('abc')).toBe(`/UserPlayedItems/abc?userId=${USER}&`);
	});

	test('extras hang off the item rather than the user', () => {
		expect(r.extras('abc', 'Intros')).toBe(`/Items/abc/Intros?userId=${USER}&`);
		expect(r.extras('abc', 'SpecialFeatures')).toBe(`/Items/abc/SpecialFeatures?userId=${USER}&`);
	});

	test('views and configuration follow the same move', () => {
		expect(r.views()).toBe(`/UserViews?userId=${USER}&`);
		expect(r.configuration()).toBe(`/Users/Configuration?userId=${USER}&`);
	});
});

describe('user scoped routes on Emby', () => {
	const r = routesFor('emby');

	test('every route keeps the only spelling Emby knows', () => {
		expect(r.items()).toBe(`/Users/${USER}/Items?`);
		expect(r.item('abc')).toBe(`/Users/${USER}/Items/abc?`);
		expect(r.latest()).toBe(`/Users/${USER}/Items/Latest?`);
		expect(r.resume()).toBe(`/Users/${USER}/Items/Resume?`);
		expect(r.favorite('abc')).toBe(`/Users/${USER}/FavoriteItems/abc?`);
		expect(r.played('abc')).toBe(`/Users/${USER}/PlayedItems/abc?`);
		expect(r.extras('abc', 'Intros')).toBe(`/Users/${USER}/Items/abc/Intros?`);
		expect(r.views()).toBe(`/Users/${USER}/Views?`);
		expect(r.configuration()).toBe(`/Users/${USER}/Configuration?`);
	});
});

describe('the type is read per call, not captured once', () => {
	test('a route switches with the server the client is pointed at', () => {
		let type = 'jellyfin';
		const r = makeUserRoutes(() => type, () => USER);
		expect(r.views()).toBe(`/UserViews?userId=${USER}&`);
		type = 'emby';
		expect(r.views()).toBe(`/Users/${USER}/Views?`);
	});

	test('a user id with characters that need escaping is encoded', () => {
		const r = makeUserRoutes(() => 'jellyfin', () => 'a b&c');
		expect(r.views()).toBe('/UserViews?userId=a%20b%26c&');
	});
});

describe('trimQuerySeparator', () => {
	test('drops the separator a caller added nothing to', () => {
		expect(trimQuerySeparator(`/Items?userId=${USER}&`)).toBe(`/Items?userId=${USER}`);
		expect(trimQuerySeparator(`/Users/${USER}/Items?`)).toBe(`/Users/${USER}/Items`);
	});

	test('leaves a populated query alone', () => {
		expect(trimQuerySeparator('/Items?userId=u1&Limit=5')).toBe('/Items?userId=u1&Limit=5');
		expect(trimQuerySeparator('/Sessions/Playing')).toBe('/Sessions/Playing');
	});
});

describe('legacyAuthHeader', () => {
	test('only Emby is sent the header Jellyfin 12 rejects', () => {
		expect(legacyAuthHeader('emby', 'Emby Token="t"')).toEqual({'X-Emby-Authorization': 'Emby Token="t"'});
		expect(legacyAuthHeader('jellyfin', 'MediaBrowser Token="t"')).toBeNull();
	});
});

describe('buildUserImageUrl', () => {
	test('Jellyfin reads the avatar from the route that replaced the user path', () => {
		expect(buildUserImageUrl('https://s', USER, 'tag1', 'jellyfin'))
			.toBe(`https://s/UserImage?userId=${USER}&tag=tag1`);
	});

	test('a missing tag leaves the parameter off entirely', () => {
		expect(buildUserImageUrl('https://s', USER, null, 'jellyfin'))
			.toBe(`https://s/UserImage?userId=${USER}`);
	});

	test('Emby keeps the resize hints it still honours', () => {
		expect(buildUserImageUrl('https://s', USER, 'tag1', 'emby'))
			.toBe(`https://s/Users/${USER}/Images/Primary?quality=90&maxHeight=150&tag=tag1`);
	});
});
