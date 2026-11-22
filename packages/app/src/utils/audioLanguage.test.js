import {languageTag} from './audioLanguage';

describe('languageTag', () => {
	test('turns the three letter codes tracks carry into the two letter tag the browser reads', () => {
		expect(languageTag('jpn')).toBe('ja');
		expect(languageTag('chi')).toBe('zh');
		expect(languageTag('zho')).toBe('zh');
		expect(languageTag('KOR')).toBe('ko');
		expect(languageTag('ja-JP')).toBe('ja');
	});

	test('keeps a code that has no two letter form', () => {
		expect(languageTag('fil')).toBe('fil');
	});

	test('gives nothing for a missing or unknown language', () => {
		expect(languageTag(undefined)).toBeUndefined();
		expect(languageTag('')).toBeUndefined();
		expect(languageTag('und')).toBeUndefined();
		expect(languageTag('unknown')).toBeUndefined();
	});
});
