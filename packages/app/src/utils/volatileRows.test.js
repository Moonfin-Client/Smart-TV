import {mergeRowPreservingRefs, sameVolatileItem} from './volatileRows';

const item = (id, pct, played, last) => ({
	Id: id,
	Name: `Item ${id}`,
	UserData: {PlayedPercentage: pct, Played: played, LastPlayedDate: last}
});

const row = (id, items) => ({id, title: id, items, type: 'landscape'});

describe('sameVolatileItem', () => {
	test('equal volatile fields match', () => {
		expect(sameVolatileItem(item('a', 50, false, 'd1'), item('a', 50, false, 'd1'))).toBe(true);
	});

	test('progress change does not match', () => {
		expect(sameVolatileItem(item('a', 50, false, 'd1'), item('a', 51, false, 'd1'))).toBe(false);
	});

	test('LastPlayedDate change does not match', () => {
		expect(sameVolatileItem(item('a', 50, false, 'd1'), item('a', 50, false, 'd2'))).toBe(false);
	});
});

describe('mergeRowPreservingRefs', () => {
	test('identical refresh returns previous row reference', () => {
		const prev = row('resume', [item('a', 10, false, 'd1'), item('b', 20, false, 'd2')]);
		const next = row('resume', [item('a', 10, false, 'd1'), item('b', 20, false, 'd2')]);
		expect(mergeRowPreservingRefs(prev, next)).toBe(prev);
	});

	test('one progress change reuses unchanged item references', () => {
		const prevA = item('a', 10, false, 'd1');
		const prevB = item('b', 20, false, 'd2');
		const prev = row('resume', [prevA, prevB]);
		const next = row('resume', [item('a', 15, false, 'd1'), item('b', 20, false, 'd2')]);
		const merged = mergeRowPreservingRefs(prev, next);
		expect(merged).not.toBe(prev);
		expect(merged.items[0]).not.toBe(prevA);
		expect(merged.items[0].UserData.PlayedPercentage).toBe(15);
		expect(merged.items[1]).toBe(prevB);
	});

	test('item added produces new row, reuses existing item refs', () => {
		const prevA = item('a', 10, false, 'd1');
		const prev = row('resume', [prevA]);
		const next = row('resume', [item('c', 5, false, 'd3'), item('a', 10, false, 'd1')]);
		const merged = mergeRowPreservingRefs(prev, next);
		expect(merged).not.toBe(prev);
		expect(merged.items.length).toBe(2);
		expect(merged.items[1]).toBe(prevA);
	});

	test('item removed produces new row', () => {
		const prevA = item('a', 10, false, 'd1');
		const prevB = item('b', 20, false, 'd2');
		const prev = row('resume', [prevA, prevB]);
		const next = row('resume', [item('b', 20, false, 'd2')]);
		const merged = mergeRowPreservingRefs(prev, next);
		expect(merged).not.toBe(prev);
		expect(merged.items.length).toBe(1);
		expect(merged.items[0]).toBe(prevB);
	});

	test('no previous row passes next through', () => {
		const next = row('nextup', [item('a', 0, false, null)]);
		expect(mergeRowPreservingRefs(undefined, next)).toBe(next);
	});
});
