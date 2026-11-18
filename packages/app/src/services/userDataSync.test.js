import * as userDataSync from './userDataSync';

const episode = ({id = 'ep1', played = false, position = 0} = {}) => ({
	Id: id,
	Name: 'An episode',
	Type: 'Episode',
	UserData: {Played: played, PlaybackPositionTicks: position}
});

// A socket that hands its listener back so a test can push messages through it.
const fakeSocket = () => {
	const socket = {listener: null, stopped: false};
	socket.listen = (listener) => {
		socket.listener = listener;
		return () => {
			socket.stopped = true;
		};
	};
	socket.send = (Data) => socket.listener({MessageType: 'UserDataChanged', Data});
	return socket;
};

afterEach(() => userDataSync.reset());

describe('patching items', () => {
	test('an item nothing is known about comes back untouched', () => {
		const item = episode();
		expect(userDataSync.apply(item)).toBe(item);
	});

	test('a published change lands on the item', () => {
		userDataSync.publish('ep1', {Played: true});
		const patched = userDataSync.apply(episode());
		expect(patched.UserData.Played).toBe(true);
		expect(patched.Name).toBe('An episode');
	});

	test('a patch merges rather than replacing what the item already had', () => {
		userDataSync.publish('ep1', {Played: true});
		const patched = userDataSync.apply(episode({position: 500}));
		expect(patched.UserData.Played).toBe(true);
		expect(patched.UserData.PlaybackPositionTicks).toBe(500);
	});

	test('an item already in that state keeps its identity', () => {
		userDataSync.publish('ep1', {Played: true});
		const item = episode({played: true});
		expect(userDataSync.apply(item)).toBe(item);
	});

	test('clearing a field the item never carried is not a change', () => {
		userDataSync.publish('ep1', {Played: false, PlayedPercentage: null});
		const item = {Id: 'ep1', Type: 'Episode', UserData: {Played: false}};
		expect(userDataSync.apply(item)).toBe(item);
	});

	test('clearing a field the item does carry drops it', () => {
		userDataSync.publish('ep1', {PlayedPercentage: null});
		const item = {Id: 'ep1', Type: 'Episode', UserData: {Played: false, PlayedPercentage: 40}};
		expect(userDataSync.apply(item).UserData.PlayedPercentage).toBeNull();
	});

	test('a list nothing changed in keeps its identity', () => {
		userDataSync.publish('other', {Played: true});
		const items = [episode(), episode({id: 'ep2'})];
		expect(userDataSync.applyAll(items)).toBe(items);
	});

	test('only the changed entry of a list is rebuilt', () => {
		userDataSync.publish('ep2', {Played: true});
		const items = [episode(), episode({id: 'ep2'})];
		const patched = userDataSync.applyAll(items);
		expect(patched).not.toBe(items);
		expect(patched[0]).toBe(items[0]);
		expect(patched[1].UserData.Played).toBe(true);
	});
});

describe('patching rows', () => {
	test('only a row with a changed item is rebuilt', () => {
		userDataSync.publish('ep2', {Played: true});
		const rows = [{id: 'a', items: [episode()]}, {id: 'b', items: [episode({id: 'ep2'})]}];
		const patched = userDataSync.applyToRows(rows);
		expect(patched[0]).toBe(rows[0]);
		expect(patched[1].id).toBe('b');
		expect(patched[1].items[0].UserData.Played).toBe(true);
	});

	test('rows nothing changed in keep their identity', () => {
		userDataSync.publish('other', {Played: true});
		const rows = [{id: 'a', items: [episode()]}];
		expect(userDataSync.applyToRows(rows)).toBe(rows);
	});
});

describe('notifications', () => {
	test('a real change notifies', () => {
		const listener = jest.fn();
		const unsubscribe = userDataSync.subscribe(listener);
		userDataSync.publish('ep1', {Played: true});
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	test('republishing the same value is not a change', () => {
		userDataSync.publish('ep1', {Played: true});
		const listener = jest.fn();
		const unsubscribe = userDataSync.subscribe(listener);
		userDataSync.publish('ep1', {Played: true});
		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});
});

describe('the socket feed', () => {
	test('applies what the socket reports', () => {
		const socket = fakeSocket();
		userDataSync.bindTo(socket.listen, 'user-1');
		socket.send({UserId: 'user-1', UserDataList: [{ItemId: 'ep1', Played: true, PlaybackPositionTicks: 0}]});
		expect(userDataSync.apply(episode()).UserData.Played).toBe(true);
	});

	test('ignores other messages', () => {
		const socket = fakeSocket();
		userDataSync.bindTo(socket.listen, 'user-1');
		socket.listener({MessageType: 'LibraryChanged', Data: {UserId: 'user-1', UserDataList: [{ItemId: 'ep1', Played: true}]}});
		const item = episode();
		expect(userDataSync.apply(item)).toBe(item);
	});

	test('ignores another account, however the id is punctuated', () => {
		const socket = fakeSocket();
		userDataSync.bindTo(socket.listen, 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
		socket.send({UserId: 'someone-else', UserDataList: [{ItemId: 'ep1', Played: true}]});
		// The same user, written the way Jellyfin sometimes writes it.
		socket.send({UserId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', UserDataList: [{ItemId: 'ep2', Played: true}]});
		expect(userDataSync.apply(episode()).UserData.Played).toBe(false);
		expect(userDataSync.apply(episode({id: 'ep2'})).UserData.Played).toBe(true);
	});

	test('the server is allowed to undo an optimistic patch', () => {
		userDataSync.publish('ep1', {Played: true});
		const socket = fakeSocket();
		userDataSync.bindTo(socket.listen, 'user-1');
		socket.send({UserId: 'user-1', UserDataList: [{ItemId: 'ep1', Played: false}]});
		expect(userDataSync.apply(episode()).UserData.Played).toBe(false);
	});

	test('a whole record without a percentage clears the old progress, a partial one leaves it', () => {
		const started = {...episode(), UserData: {Played: false, PlaybackPositionTicks: 40, PlayedPercentage: 40}};
		const socket = fakeSocket();
		userDataSync.bindTo(socket.listen, 'user-1');
		socket.send({UserId: 'user-1', UserDataList: [{ItemId: 'ep1', Played: false, PlaybackPositionTicks: 0}]});
		expect(userDataSync.apply(started).UserData.PlayedPercentage).toBeNull();

		socket.send({UserId: 'user-1', UserDataList: [{ItemId: 'ep2', IsFavorite: true}]});
		expect(userDataSync.apply({...started, Id: 'ep2'}).UserData.PlayedPercentage).toBe(40);
	});

	test('binding again drops the previous binding', () => {
		const first = fakeSocket();
		userDataSync.bindTo(first.listen, 'user-1');
		userDataSync.bindTo(fakeSocket().listen, 'user-1');
		expect(first.stopped).toBe(true);
	});
});

test('items read from the server replace a stale record of them', () => {
	userDataSync.publish('ep1', {Played: false, PlaybackPositionTicks: 40, PlayedPercentage: 40});
	userDataSync.recordFromServer([episode()]);
	const fresh = episode();
	expect(userDataSync.apply(fresh)).toBe(fresh);
});

test('reset drops everything so the next account starts clean', () => {
	userDataSync.publish('ep1', {Played: true});
	userDataSync.reset();
	const item = episode();
	expect(userDataSync.apply(item)).toBe(item);
});
