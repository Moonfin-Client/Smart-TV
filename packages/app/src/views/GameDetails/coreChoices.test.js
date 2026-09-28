jest.mock('@enact/i18n/$L', () => (text) => text);

import {coreChoices, coreLabel} from './coreChoices';

const arcadeGame = {
	id: 'g1',
	core: 'arcade',
	recommendedCore: 'arcade',
	availableCores: ['arcade'],
	coreCompatibilityReason: 'Validated against the FBNeo DAT.'
};

test('names the arcade cores the way players know them', () => {
	expect(coreLabel('arcade')).toBe('FBNeo');
	expect(coreLabel('mame')).toBe('MAME');
	expect(coreLabel('nes')).toBe('nes');
});

test('offers both arcade cores, the recommended one first with the server reason', () => {
	expect(coreChoices(arcadeGame)).toEqual([
		{core: 'arcade', label: 'FBNeo (Recommended)', detail: 'Validated against the FBNeo DAT.'},
		{core: 'mame', label: 'MAME', detail: 'This archive is not validated for MAME and may not launch correctly.'}
	]);
});

test('skips the warning when the server has no compatibility data', () => {
	const rows = coreChoices({...arcadeGame, availableCores: [], coreCompatibilityReason: null});

	expect(rows.map((r) => r.detail)).toEqual([null, null]);
});

test('lists a user override after the recommendation', () => {
	const rows = coreChoices({...arcadeGame, core: 'mame', availableCores: ['arcade', 'mame']});

	expect(rows.map((r) => r.core)).toEqual(['arcade', 'mame']);
	expect(rows[1].detail).toBeNull();
});

test('offers nothing when the server takes no core choice', () => {
	const {availableCores, ...older} = arcadeGame;

	expect(availableCores).toBeDefined();
	expect(coreChoices(older)).toEqual([]);
});

test('offers a single row for a console game', () => {
	expect(coreChoices({id: 'g2', core: 'nes', availableCores: []})).toHaveLength(1);
});
