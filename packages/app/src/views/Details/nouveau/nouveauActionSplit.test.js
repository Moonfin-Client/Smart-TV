import {splitNouveauActions} from './nouveauActionSplit';

describe('splitNouveauActions', () => {
	const actions = [
		{id: 'a'},
		{id: 'b'},
		{id: 'c'},
		{id: 'd'},
		{id: 'e'}
	];

	describe('default behavior (maxVisibleButtons = 0)', () => {
		it('keeps up to 3 secondary actions inline without overflow', () => {
			const res = splitNouveauActions(actions.slice(0, 3), 0);
			expect(res.needsOverflow).toBe(false);
			expect(res.inline).toEqual(actions.slice(0, 3));
			expect(res.overflow).toEqual([]);
			expect(res.lastAction).toBeNull();
		});

		it('splits 4 actions into 2 inline and 2 overflow', () => {
			const res = splitNouveauActions(actions.slice(0, 4), 0);
			expect(res.needsOverflow).toBe(true);
			expect(res.inline).toEqual(actions.slice(0, 2));
			expect(res.overflow).toEqual(actions.slice(2, 4));
			expect(res.lastAction).toEqual({id: 'd'});
		});
	});

	describe('unlimited inline (maxVisibleButtons = -1)', () => {
		it('keeps all secondary actions inline', () => {
			const res = splitNouveauActions(actions, -1);
			expect(res.needsOverflow).toBe(false);
			expect(res.inline).toEqual(actions);
			expect(res.overflow).toEqual([]);
			expect(res.lastAction).toBeNull();
		});
	});

	describe('Play only (maxVisibleButtons = 1)', () => {
		it('does not overflow when there are no secondary actions', () => {
			const res = splitNouveauActions([], 1);
			expect(res.needsOverflow).toBe(false);
			expect(res.inline).toEqual([]);
			expect(res.overflow).toEqual([]);
		});

		it('folds all secondary actions into overflow when secondary actions exist', () => {
			const res = splitNouveauActions(actions.slice(0, 3), 1);
			expect(res.needsOverflow).toBe(true);
			expect(res.inline).toEqual([]);
			expect(res.overflow).toEqual(actions.slice(0, 3));
			expect(res.lastAction).toEqual({id: 'c'});
		});
	});

	describe('discrete limit overrides (maxVisibleButtons > 1)', () => {
		it('allows maxVisibleButtons - 1 secondary actions inline without overflow', () => {
			// maxVisibleButtons = 5 allows 4 secondary actions inline
			const res = splitNouveauActions(actions.slice(0, 4), 5);
			expect(res.needsOverflow).toBe(false);
			expect(res.inline).toEqual(actions.slice(0, 4));
			expect(res.overflow).toEqual([]);
		});

		it('folds excess actions into overflow reserving a slot for More Actions', () => {
			// maxVisibleButtons = 5 with 5 actions: 3 inline, 2 in overflow (total 5 visible on screen with primary and More)
			const res = splitNouveauActions(actions, 5);
			expect(res.needsOverflow).toBe(true);
			expect(res.inline).toEqual(actions.slice(0, 3));
			expect(res.overflow).toEqual(actions.slice(3));
			expect(res.lastAction).toEqual({id: 'e'});
		});

		it('handles maxVisibleButtons = 2 correctly', () => {
			// 1 secondary action fits inline (1 primary + 1 secondary = 2)
			const res1 = splitNouveauActions(actions.slice(0, 1), 2);
			expect(res1.needsOverflow).toBe(false);
			expect(res1.inline).toEqual(actions.slice(0, 1));

			// 2 secondary actions require overflow: 0 inline, 2 in overflow (1 primary + 1 More = 2)
			const res2 = splitNouveauActions(actions.slice(0, 2), 2);
			expect(res2.needsOverflow).toBe(true);
			expect(res2.inline).toEqual([]);
			expect(res2.overflow).toEqual(actions.slice(0, 2));
			expect(res2.lastAction).toEqual({id: 'b'});
		});
	});

	// Lose this and the right edge of the row dead ends on most items, because the hand off it was
	// carrying went behind the More button with it.
	it('hands the More button the last action, which is always a hidden one', () => {
		const actionList = (count) => Array.from({length: count}, (_, i) => ({id: `action-${i}`}));
		[4, 7, 12].forEach((count) => {
			const split = splitNouveauActions(actionList(count));
			expect(split.lastAction.id).toBe(`action-${count - 1}`);
			expect(split.overflow).toContain(split.lastAction);
		});
	});

	it('copes with being handed nothing at all', () => {
		expect(splitNouveauActions().inline).toEqual([]);
		expect(splitNouveauActions(null).needsOverflow).toBe(false);
	});
});
