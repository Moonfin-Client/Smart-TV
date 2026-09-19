// searchGroups reaches the games API for its fetch helper, which drags the
// whole server client and the platform storage shims in behind it. The
// matchers under test here touch none of that.
jest.mock('../services/gamesApi', () => ({}));

import {foldAccents, foldForSearch} from './accentFolding';
import {filterByName, filterGames} from './searchGroups';

describe('foldAccents', () => {
	test('drops the mark and keeps the letter under it', () => {
		expect(foldForSearch('Cançó')).toBe('canco');
		expect(foldForSearch('Ángel')).toBe('angel');
		expect(foldForSearch('Amélie')).toBe('amelie');
	});

	test('reaches marks no hand written table would remember', () => {
		// Decomposing covers the whole Latin range rather than the handful of
		// letters someone thought to list.
		expect(foldForSearch('Ǎ')).toBe('a');
		expect(foldForSearch('Ḡ')).toBe('g');
		expect(foldForSearch('Ữ')).toBe('u');
	});

	test('names the letters that carry no mark to strip', () => {
		expect(foldForSearch('Øster')).toBe('oster');
		expect(foldForSearch('Łódź')).toBe('lodz');
	});

	test('leaves anything outside the Latin alphabet alone', () => {
		expect(foldForSearch('Волшебник')).toBe('волшебник');
		expect(foldForSearch('東京')).toBe('東京');
		expect(foldForSearch('Straße')).toBe('straße');
	});

	test('keeps the case it was given', () => {
		expect(foldAccents('Cançó')).toBe('Canco');
		expect(foldAccents('cançó')).toBe('canco');
	});

	test('takes null and undefined without throwing', () => {
		expect(foldForSearch(null)).toBe('');
		expect(foldForSearch(undefined)).toBe('');
	});
});

describe('search matching folds both sides', () => {
	// What the server answers for the same term, so a title reads the same way
	// whichever box the viewer typed it into.
	const channels = [{Name: 'Cançó TV'}, {Name: 'Titanic TV'}];

	test('an unaccented query finds an accented name', () => {
		expect(filterByName(channels, 'canco')).toEqual([{Name: 'Cançó TV'}]);
	});

	test('a differently accented query finds it too', () => {
		expect(filterByName(channels, 'canço')).toEqual([{Name: 'Cançó TV'}]);
	});

	test('an accented query finds a plain name', () => {
		expect(filterByName([{Name: 'Cancion'}], 'canción')).toEqual([{Name: 'Cancion'}]);
	});

	test('games match on a folded title or filename', () => {
		const games = [{title: 'Cançó', fileName: 'canco.rom'}, {title: 'Zulu', fileName: 'zulu.rom'}];
		expect(filterGames(games, 'canco')).toEqual([games[0]]);
		expect(filterGames(games, 'cançó')).toEqual([games[0]]);
	});
});
