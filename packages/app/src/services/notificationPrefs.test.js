import {getMoonfinNotificationPrefs, saveMoonfinNotificationPrefs} from './seerrApi';
import {
	loadNotificationPrefs, pushNotificationPrefs, setNotificationPref, subscribeNotificationPrefs, syncNotificationPrefs
} from './notificationPrefs';

const mockStore = {values: {}};
jest.mock('./storage', () => ({
	getFromStorage: (key) => Promise.resolve(mockStore.values[key] ? JSON.parse(JSON.stringify(mockStore.values[key])) : null),
	saveToStorage: (key, value) => {
		mockStore.values[key] = JSON.parse(JSON.stringify(value));
		return Promise.resolve();
	}
}));
jest.mock('./seerrApi', () => ({getMoonfinNotificationPrefs: jest.fn(), saveMoonfinNotificationPrefs: jest.fn()}));

const SERVER = 'https://jf.example/';
const stored = (userId) => mockStore.values.seerrNotificationPrefs[`https://jf.example/${userId}`];

beforeEach(() => {
	mockStore.values = {};
	jest.spyOn(console, 'warn').mockImplementation(() => {});
	saveMoonfinNotificationPrefs.mockResolvedValue(true);
});

describe('notification choices', () => {
	test('start from the plugin\'s defaults, with New Media off', async () => {
		await expect(loadNotificationPrefs(SERVER, 'u1')).resolves.toEqual({
			notifyOnNewRequests: true, notifyOnLibraryAdded: true, notifyOnIssues: true, notifyOnNewMedia: false
		});
	});

	test('a change goes up with all four and clears its flag once the server has it', async () => {
		const heard = jest.fn();
		const unsubscribe = subscribeNotificationPrefs(heard);
		await setNotificationPref(SERVER, 'tok', 'u1', 'notifyOnIssues', false);
		unsubscribe();
		expect(saveMoonfinNotificationPrefs).toHaveBeenCalledWith({
			notifyOnNewRequests: true, notifyOnLibraryAdded: true, notifyOnIssues: false, notifyOnNewMedia: false
		}, SERVER, 'tok');
		expect(stored('u1')).toMatchObject({notifyOnIssues: false, unsynced: false});
		expect(heard).toHaveBeenCalled();
	});

	test('a change the server never got stays flagged and goes up at the next sign in instead of being read over', async () => {
		saveMoonfinNotificationPrefs.mockRejectedValueOnce(new Error('offline'));
		await setNotificationPref(SERVER, 'tok', 'u1', 'notifyOnNewMedia', true);
		expect(stored('u1')).toMatchObject({notifyOnNewMedia: true, unsynced: true});
		await syncNotificationPrefs(SERVER, 'tok', 'u1');
		expect(getMoonfinNotificationPrefs).not.toHaveBeenCalled();
		expect(saveMoonfinNotificationPrefs).toHaveBeenLastCalledWith(expect.objectContaining({notifyOnNewMedia: true}), SERVER, 'tok');
		expect(stored('u1').unsynced).toBe(false);
	});

	test('sign in takes the server\'s copy for that user only', async () => {
		getMoonfinNotificationPrefs.mockResolvedValue({notifyOnNewRequests: false, notifyOnLibraryAdded: true, notifyOnIssues: false, notifyOnNewMedia: true});
		await syncNotificationPrefs(SERVER, 'tok', 'u1');
		await expect(loadNotificationPrefs(SERVER, 'u1')).resolves.toEqual({
			notifyOnNewRequests: false, notifyOnLibraryAdded: true, notifyOnIssues: false, notifyOnNewMedia: true
		});
		await expect(loadNotificationPrefs(SERVER, 'u2')).resolves.toMatchObject({notifyOnNewRequests: true, notifyOnNewMedia: false});
		expect(saveMoonfinNotificationPrefs).not.toHaveBeenCalled();
	});

	test('one user\'s unsent change doesn\'t hold back another user\'s read', async () => {
		saveMoonfinNotificationPrefs.mockRejectedValueOnce(new Error('offline'));
		await setNotificationPref(SERVER, 'tok1', 'u1', 'notifyOnIssues', false);
		getMoonfinNotificationPrefs.mockResolvedValue({notifyOnIssues: false});
		await syncNotificationPrefs(SERVER, 'tok2', 'u2');
		expect(getMoonfinNotificationPrefs).toHaveBeenCalledWith(SERVER, 'tok2');
		expect(stored('u1').unsynced).toBe(true);
	});

	test('a server without Moonbase or a failed read leaves the choices alone', async () => {
		getMoonfinNotificationPrefs.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('500'));
		await syncNotificationPrefs(SERVER, 'tok', 'u1');
		await syncNotificationPrefs(SERVER, 'tok', 'u1');
		expect(mockStore.values.seerrNotificationPrefs).toBeUndefined();
	});

	test('a change made while an earlier one was on its way keeps the flag for its own push', async () => {
		let land;
		saveMoonfinNotificationPrefs.mockImplementationOnce(() => new Promise((resolve) => { land = resolve; }));
		const first = setNotificationPref(SERVER, 'tok', 'u1', 'notifyOnIssues', false);
		await new Promise((resolve) => setTimeout(resolve, 0));
		mockStore.values.seerrNotificationPrefs['https://jf.example/u1'].notifyOnNewMedia = true;
		land(true);
		await first;
		expect(stored('u1').unsynced).toBe(true);
		await pushNotificationPrefs(SERVER, 'tok', 'u1');
		expect(stored('u1').unsynced).toBe(false);
	});
});
