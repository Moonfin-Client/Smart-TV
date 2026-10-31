import {createSiloPager, isInvalidCursor, siloPage} from './siloPager';

// A Silo list of `count` items that, like Silo, only takes a cursor back with the limit it was issued for.
const fakeList = (count, {exactTotal = true} = {}) => {
	const fetchPage = jest.fn(async ({cursor, seek, limit}) => {
		let from = 0;
		if (cursor) {
			const [kind, at, issuedFor] = cursor.split(':');
			if (Number(issuedFor) !== limit) throw Object.assign(new Error('bad cursor'), {status: 400, code: 'invalid_cursor'});
			from = kind === 'w' ? seek : Number(at);
		}
		const items = Array.from({length: Math.max(0, Math.min(limit, count - from))}, (_, i) => ({id: from + i}));
		const more = from + items.length < count;
		return siloPage({
			items,
			page: {next_cursor: more ? `n:${from + items.length}:${limit}` : null, has_more: more},
			window_cursor: `w:0:${limit}`,
			total: count,
			total_exact: exactTotal
		});
	});
	return {fetchPage, calls: () => fetchPage.mock.calls.map(([args]) => args)};
};

const ids = (result) => result.items.map((item) => item.id);

test('every request asks for the same page size whatever range the app wants', async () => {
	const pager = createSiloPager();
	const {fetchPage, calls} = fakeList(500);
	expect(ids(await pager.page({signature: 'q', startIndex: 0, limit: 75, fetchPage}))).toEqual(Array.from({length: 75}, (_, i) => i));
	const next = await pager.page({signature: 'q', startIndex: 75, limit: 48, fetchPage});
	expect(ids(next)).toEqual(Array.from({length: 48}, (_, i) => 75 + i));
	expect(next.total).toBe(500);
	// The first page covered 0 to 99, and the rest followed its next cursor.
	expect(calls()).toEqual([{limit: 100}, {cursor: 'n:100:100', limit: 100}]);
});

test('a jump far ahead seeks with the window cursor, a few pages at once', async () => {
	const pager = createSiloPager();
	const {fetchPage, calls} = fakeList(1000);
	await pager.page({signature: 'q', startIndex: 0, limit: 10, fetchPage});
	const jumped = await pager.page({signature: 'q', startIndex: 450, limit: 250, fetchPage});
	expect(ids(jumped)).toEqual(Array.from({length: 250}, (_, i) => 450 + i));
	expect(calls().slice(1)).toEqual([
		{cursor: 'w:0:100', seek: 450, limit: 100},
		{cursor: 'w:0:100', seek: 550, limit: 100},
		{cursor: 'w:0:100', seek: 650, limit: 100}
	]);
});

test('a range already fetched is served without asking again', async () => {
	const pager = createSiloPager();
	const {fetchPage} = fakeList(300);
	await pager.page({signature: 'q', startIndex: 0, limit: 100, fetchPage});
	await pager.page({signature: 'q', startIndex: 20, limit: 30, fetchPage});
	expect(fetchPage).toHaveBeenCalledTimes(1);
});

test('the end of the list stops the range short', async () => {
	const pager = createSiloPager();
	const {fetchPage} = fakeList(30);
	const result = await pager.page({signature: 'q', startIndex: 20, limit: 50, fetchPage});
	expect(ids(result)).toEqual(Array.from({length: 10}, (_, i) => 20 + i));
	expect(result.total).toBe(30);
});

test('a refused cursor starts the query over once', async () => {
	const pager = createSiloPager();
	const list = fakeList(400);
	await pager.page({signature: 'q', startIndex: 0, limit: 100, fetchPage: list.fetchPage});
	let refused = false;
	const refusing = (args) => {
		if (args.cursor && !refused) {
			refused = true;
			return Promise.reject(Object.assign(new Error('expired'), {status: 400, code: 'invalid_cursor'}));
		}
		return list.fetchPage(args);
	};
	const result = await pager.page({signature: 'q', startIndex: 150, limit: 20, fetchPage: refusing});
	expect(ids(result)).toEqual(Array.from({length: 20}, (_, i) => 150 + i));
	expect(refused).toBe(true);
});

test('a cursor error is told apart from other failures', () => {
	expect(isInvalidCursor({status: 400, code: 'invalid_cursor'})).toBe(true);
	expect(isInvalidCursor({status: 422, code: 'validation_failed', problem: {errors: [{location: 'query.seek'}]}})).toBe(true);
	expect(isInvalidCursor({status: 500, code: 'invalid_cursor'})).toBe(false);
	expect(isInvalidCursor({status: 422, code: 'validation_failed', problem: {errors: [{location: 'query.type'}]}})).toBe(false);
});

test('an estimated total that\'s been passed still leaves one more to scroll to', async () => {
	const pager = createSiloPager();
	const {fetchPage} = fakeList(500, {exactTotal: false});
	const fetchLow = (args) => fetchPage(args).then((page) => ({...page, total: 50}));
	const result = await pager.page({signature: 'q', startIndex: 0, limit: 75, fetchPage: fetchLow});
	expect(result.total).toBe(76);
});
