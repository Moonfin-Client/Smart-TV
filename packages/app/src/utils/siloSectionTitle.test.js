// $L reaches for ilib, which a plain unit test can't load; a marked copy shows the string went through it.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => `[${str}]`}));

import {siloSectionTitle} from './siloSectionTitle';

describe('siloSectionTitle', () => {
	test('a keyed row takes the app\'s string', () => {
		expect(siloSectionTitle({title: 'Hidden Gems', titleKey: 'home.section.hiddenGems'})).toBe('[Hidden Gems]');
		expect(siloSectionTitle({title: 'Seasonal Picks', titleKey: 'home.section.seasonal.christmas.classics'})).toBe('[Christmas Classics]');
	});

	test('the row\'s value fills the placeholder after translation', () => {
		expect(siloSectionTitle({title: 'Top Drama', titleKey: 'home.section.topGenre', titleArgs: {genre: 'Drama'}})).toBe('[Top Drama]');
		expect(siloSectionTitle({title: 'x', titleKey: 'home.section.recentlyAddedIn', titleArgs: {library: 'Films'}})).toBe('[Recently Added in Films]');
	});

	test('Silo\'s title stays when there is nothing to translate by', () => {
		expect(siloSectionTitle({title: 'Sunday Picks', titleKey: ''})).toBe('Sunday Picks');
		expect(siloSectionTitle({title: 'Brand New Row', titleKey: 'home.section.brandNewRow'})).toBe('Brand New Row');
		expect(siloSectionTitle({title: 'Recently Added in Films', titleKey: 'home.section.recentlyAddedIn', titleArgs: {}})).toBe('Recently Added in Films');
		expect(siloSectionTitle({title: 'Odd', titleKey: 'constructor'})).toBe('Odd');
	});
});
