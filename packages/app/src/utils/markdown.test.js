import {parseMarkdown, parseInlines} from './markdown';

const t = (text) => ({type: 'text', text});

describe('parseInlines', () => {
	test('bold, italic and code keep their words', () => {
		expect(parseInlines('**bold** and *italic* and `code`')).toEqual([
			{type: 'strong', children: [t('bold')]},
			t(' and '),
			{type: 'em', children: [t('italic')]},
			t(' and '),
			{type: 'code', text: 'code'}
		]);
	});

	test('underscores work the same way outside a word', () => {
		expect(parseInlines('__strong__ and _thin_')).toEqual([
			{type: 'strong', children: [t('strong')]},
			t(' and '),
			{type: 'em', children: [t('thin')]}
		]);
	});

	test('an underscore inside a word is part of the word', () => {
		expect(parseInlines('use snake_case_names here')).toEqual([t('use snake_case_names here')]);
	});

	test('a lone star with nothing to close it is just a star', () => {
		expect(parseInlines('5 * 3 = 15')).toEqual([t('5 * 3 = 15')]);
		expect(parseInlines('*unclosed')).toEqual([t('*unclosed')]);
	});

	test('a link carries its address and its words', () => {
		expect(parseInlines('see [the notes](https://example.com/a "title") now')).toEqual([
			t('see '),
			{type: 'link', href: 'https://example.com/a', children: [t('the notes')]},
			t(' now')
		]);
	});

	test('an image is dropped rather than fetched', () => {
		expect(parseInlines('before ![alt](https://evil.test/x.png) after')).toEqual([t('before  after')]);
	});

	test('a backslash escapes the mark after it', () => {
		expect(parseInlines('\\*not bold\\*')).toEqual([t('*not bold*')]);
	});

	test('html stays text', () => {
		expect(parseInlines('<b>hi</b>')).toEqual([t('<b>hi</b>')]);
	});

	test('marks nest', () => {
		expect(parseInlines('**bold *and italic***')).toEqual([
			{type: 'strong', children: [t('bold '), {type: 'em', children: [t('and italic')]}]}
		]);
	});
});

describe('parseMarkdown', () => {
	test('headings, paragraphs and blank lines', () => {
		expect(parseMarkdown('## Maintenance\n\nTonight at 2am.\nBack by 3.')).toEqual([
			{type: 'heading', level: 2, children: [t('Maintenance')]},
			{type: 'paragraph', children: [t('Tonight at 2am. Back by 3.')]}
		]);
	});

	test('a hash inside a sentence is not a heading', () => {
		expect(parseMarkdown('issue #1234 is fixed')).toEqual([{type: 'paragraph', children: [t('issue #1234 is fixed')]}]);
	});

	test('bullet and numbered lists, with a wrapped item', () => {
		expect(parseMarkdown('- first\n- second\n  continued\n\n1. one\n2) two')).toEqual([
			{type: 'list', ordered: false, items: [[t('first')], [t('second continued')]]},
			{type: 'list', ordered: true, items: [[t('one')], [t('two')]]}
		]);
	});

	test('a quote runs over its lines', () => {
		expect(parseMarkdown('> heads up\n> everyone')).toEqual([{type: 'quote', children: [t('heads up everyone')]}]);
	});

	test('a fenced block keeps its text as written', () => {
		expect(parseMarkdown('```\ncurl -X POST\n  **not bold**\n```\nafter')).toEqual([
			{type: 'code', text: 'curl -X POST\n  **not bold**'},
			{type: 'paragraph', children: [t('after')]}
		]);
	});

	test('windows line endings read the same', () => {
		expect(parseMarkdown('a\r\n\r\nb')).toEqual([
			{type: 'paragraph', children: [t('a')]},
			{type: 'paragraph', children: [t('b')]}
		]);
	});

	test('nothing in gives nothing out', () => {
		expect(parseMarkdown('')).toEqual([]);
		expect(parseMarkdown(null)).toEqual([]);
	});
});
