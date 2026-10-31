import {api, createApiForServer, getTokenParam, getUserImageUrl, setAuth, setServer, setServerType} from './jellyfinApi';
import {setSiloTokens, siloAccount} from './siloSession';
import {corsFreeFetch, platformFetch} from './secureFetch';
import {getImageUrl} from '../utils/helpers';
import {forgetSiloImages, registerSiloImage} from '../utils/siloUrls';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn(), platformFetch: jest.fn()}));
jest.mock('./userDataSync', () => ({}));
jest.mock('../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('./siloAccounts', () => ({siloProfileOf: () => ({accountId: 'account-1', profileToken: null})}));

const SILO = 'http://silo:8090';
const tokens = {accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3600000, lifetimeMs: 3600000};
setSiloTokens(siloAccount(SILO, 'account-1'), tokens);
setSiloTokens(siloAccount('http://other-silo:8090', 'account-1'), tokens);

const reply = (body) => Promise.resolve({ok: true, status: 200, headers: {get: () => null}, text: () => Promise.resolve(JSON.stringify(body))});

beforeEach(() => {
	corsFreeFetch.mockReset();
	platformFetch.mockReset();
	corsFreeFetch.mockImplementation(() => reply({items: [{id: 1, name: 'Movies', type: 'movies'}]}));
	platformFetch.mockImplementation(() => reply({Items: []}));
});

afterEach(() => setServerType('jellyfin'));

test('a Silo server answers the app\'s calls with the Silo client, as the profile on the account', async () => {
	setServer(SILO);
	setServerType('silo');
	setAuth('profile-1', 'tok');
	const {Items} = await api.getLibraries();
	expect(Items[0]).toMatchObject({Id: '1', Name: 'Movies', CollectionType: 'movies'});
	const [url, init] = corsFreeFetch.mock.calls[0];
	expect(url).toBe(`${SILO}/api/v2/user/libraries`);
	expect(init.headers).toMatchObject({Authorization: 'Bearer tok', 'X-Profile-Id': 'profile-1'});
	expect(platformFetch).not.toHaveBeenCalled();
});

test('what Silo has no answer for is refused instead of reaching for a Jellyfin route', async () => {
	setServer(SILO);
	setServerType('silo');
	await expect(api.getLiveTvChannels()).rejects.toMatchObject({status: 501, message: expect.stringContaining('Silo')});
	expect(platformFetch).not.toHaveBeenCalled();
});

test('going back to a Jellyfin server brings the Jellyfin calls back', async () => {
	setServer(SILO);
	setServerType('silo');
	setServer('http://jelly:8096');
	setServerType('jellyfin');
	setAuth('user-1', 'tok');
	await api.getLibraries();
	expect(corsFreeFetch).not.toHaveBeenCalled();
	expect(platformFetch).toHaveBeenCalled();
});

test('another Silo server gets a client of its own', async () => {
	await createApiForServer('http://other-silo:8090', 'tok', 'profile-2', 'silo').getLibraries();
	const [url, init] = corsFreeFetch.mock.calls[0];
	expect(url).toBe('http://other-silo:8090/api/v2/user/libraries');
	expect(init.headers['X-Profile-Id']).toBe('profile-2');
});

test('media on Silo takes its token as token, and a profile\'s avatar is its signed address', () => {
	expect(getTokenParam('silo')).toBe('token');
	const avatar = `${SILO}/api/v2/artwork/avatars/p1.png?exp=1&sig=2`;
	expect(getUserImageUrl(SILO, 'p1', avatar, 'silo')).toBe(avatar);
	expect(getUserImageUrl(SILO, 'p1', null, 'silo')).toBeNull();
});

test('a Silo image is its tag, or the item\'s last seen artwork without one', () => {
	forgetSiloImages();
	setServer(SILO);
	setServerType('silo');
	const poster = registerSiloImage(SILO, 'movie-x', 'Primary', '/api/v2/artwork/movie-x/poster.webp?sig=1');
	expect(getImageUrl(SILO, 'movie-x', 'Primary', {tag: poster, maxWidth: 300})).toBe(poster);
	expect(getImageUrl(SILO, 'movie-x', 'Primary')).toBe(poster);
	expect(getImageUrl(SILO, 'movie-y', 'Primary')).toBeNull();
});
