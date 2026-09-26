import {createRemoteSearch} from './remoteSearch';

test('keeps the newest phrase while opening, then replaces and clears', () => {
	const search = createRemoteSearch('phone');
	const changed = jest.fn();
	search.receive({String: 'al'});
	search.receive({String: 'alien'});
	search.attach(changed);
	search.receive({String: 'ali'});
	search.receive({String: ''});
	search.receive({});
	expect(changed.mock.calls).toEqual([['alien'], ['ali'], ['']]);
});

test('ignores another editor and malformed, duplicate or stale revisions', () => {
	const search = createRemoteSearch('phone');
	const changed = jest.fn();
	search.attach(changed);
	const edit = (id, revision, text) => search.receive({String: text, MoonfinInputId: id, MoonfinRevision: revision});
	edit('phone', '2', 'élève 日本語');
	edit('phone', '1', 'old');
	edit('other', '3', 'wrong phone');
	edit('phone', 'oops', 'invalid');
	edit('phone', '2', 'duplicate');
	expect(changed.mock.calls).toEqual([[''], ['élève 日本語']]);
	search.close();
	edit('phone', '4', 'closed');
	search.attach(changed);
	expect(changed.mock.calls).toEqual([[''], ['élève 日本語']]);
});
