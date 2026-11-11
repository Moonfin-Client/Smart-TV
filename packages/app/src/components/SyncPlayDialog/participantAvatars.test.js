import {loadParticipantUsers, participantAvatar, resetParticipantUsers, USERS_RETRY_MS} from './participantAvatars';
import {initialsColor} from '../../utils/profileCarousel';
import {api} from '../../services/jellyfinApi';

jest.mock('../../services/jellyfinApi', () => ({
	api: {getUsers: jest.fn()},
	getUserImageUrl: (server, id, tag) => `${server}/UserImage?userId=${id}&tag=${tag}`
}));

const USERS = [{Id: 'u1', Name: 'Mittens', PrimaryImageTag: 'tag1'}, {Id: 'u2', Name: 'Beep'}];

describe('participant avatars', () => {
	beforeEach(() => {
		resetParticipantUsers();
		api.getUsers.mockReset();
	});

	test('reads the user list once and finds a picture by name', async () => {
		api.getUsers.mockResolvedValue(USERS);
		const [users, again] = await Promise.all([loadParticipantUsers('http://jf'), loadParticipantUsers('http://jf')]);
		expect(await loadParticipantUsers('http://jf')).toBe(users);
		expect(again).toBe(users);
		expect(api.getUsers).toHaveBeenCalledTimes(1);
		expect(participantAvatar(users, 'http://jf', ' mittens')).toEqual({url: 'http://jf/UserImage?userId=u1&tag=tag1', color: initialsColor('u1')});
	});

	test('someone with no picture or no account gets none', async () => {
		api.getUsers.mockResolvedValue(USERS);
		const users = await loadParticipantUsers('http://jf');
		expect(participantAvatar(users, 'http://jf', 'Beep')).toEqual({url: null, color: initialsColor('u2')});
		expect(participantAvatar(users, 'http://jf', 'Someone Else').url).toBeNull();
		// Before the list is read the initial's color goes by name.
		expect(participantAvatar(null, 'http://jf', 'Mittens')).toEqual({url: null, color: initialsColor('mittens')});
	});

	test('a failed read waits a minute before the next try', async () => {
		api.getUsers.mockRejectedValueOnce(new Error('forbidden'));
		expect(await loadParticipantUsers('http://jf', 1000)).toBeNull();
		expect(await loadParticipantUsers('http://jf', 2000)).toBeNull();
		expect(api.getUsers).toHaveBeenCalledTimes(1);

		api.getUsers.mockResolvedValue(USERS);
		expect(await loadParticipantUsers('http://jf', 1000 + USERS_RETRY_MS)).toHaveProperty('mittens');
		expect(api.getUsers).toHaveBeenCalledTimes(2);
	});

	test('another server reads its own list, and one landing after the switch is dropped', async () => {
		let answer;
		api.getUsers.mockReturnValueOnce(new Promise((resolve) => {
			answer = resolve;
		}));
		const first = loadParticipantUsers('http://jf');
		api.getUsers.mockResolvedValueOnce([]);
		const other = await loadParticipantUsers('http://other');
		answer(USERS);
		await first;
		expect(await loadParticipantUsers('http://other')).toBe(other);
		expect(other).toEqual({});
	});
});
