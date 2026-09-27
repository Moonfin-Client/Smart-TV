import {renderReleaseNotes} from './releaseNotes';

describe('renderReleaseNotes', () => {
	test('nothing to render is an empty string', () => {
		expect(renderReleaseNotes('')).toBe('');
		expect(renderReleaseNotes(null)).toBe('');
		expect(renderReleaseNotes(undefined)).toBe('');
	});

	test('headings carry their level', () => {
		expect(renderReleaseNotes('# One\n## Two\n### Three'))
			.toBe('<h1>One</h1><h2>Two</h2><h3>Three</h3>');
	});

	test('bullets are gathered into one list', () => {
		expect(renderReleaseNotes('- one\n- two\n* three'))
			.toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
	});

	test('a numbered list is its own kind of list', () => {
		expect(renderReleaseNotes('1. one\n2. two'))
			.toBe('<ol><li>one</li><li>two</li></ol>');
		expect(renderReleaseNotes('- one\n1. two'))
			.toBe('<ul><li>one</li></ul><ol><li>two</li></ol>');
	});

	test('a list ends where the prose starts again', () => {
		expect(renderReleaseNotes('- one\n\nafter'))
			.toBe('<ul><li>one</li></ul><p>after</p>');
	});

	test('lines run together as a paragraph and a blank line ends it', () => {
		expect(renderReleaseNotes('one\ntwo\n\nthree'))
			.toBe('<p>one<br/>two</p><p>three</p>');
	});

	// The notes are put on the page through innerHTML, so nothing in them can be
	// allowed to become markup of its own.
	test('html in the notes is shown as the text it was written as', () => {
		expect(renderReleaseNotes('Fixed the <video> tag & more'))
			.toBe('<p>Fixed the &lt;video&gt; tag &amp; more</p>');
		expect(renderReleaseNotes('Thanks <img src=x onerror=alert(1)>'))
			.toBe('<p>Thanks &lt;img src=x onerror=alert(1)&gt;</p>');
		expect(renderReleaseNotes('<details><summary>More</summary>'))
			.toBe('<p>&lt;details&gt;&lt;summary&gt;More&lt;/summary&gt;</p>');
	});

	test('bold and italic, in both spellings', () => {
		expect(renderReleaseNotes('**bold** and *italic*'))
			.toBe('<p><strong>bold</strong> and <em>italic</em></p>');
		expect(renderReleaseNotes('__bold__ and _italic_'))
			.toBe('<p><strong>bold</strong> and <em>italic</em></p>');
	});

	test('an underscore inside a word is part of the word', () => {
		expect(renderReleaseNotes('the file_name_here is fine'))
			.toBe('<p>the file_name_here is fine</p>');
	});

	test('code is left exactly as written', () => {
		expect(renderReleaseNotes('Use `--flag` now'))
			.toBe('<p>Use <code>--flag</code> now</p>');
		expect(renderReleaseNotes('Try `a*b*c` here'))
			.toBe('<p>Try <code>a*b*c</code> here</p>');
		expect(renderReleaseNotes('Wait `<b>` there'))
			.toBe('<p>Wait <code>&lt;b&gt;</code> there</p>');
	});

	test('a number in the prose is not mistaken for a code span', () => {
		expect(renderReleaseNotes('ready in 5 minutes'))
			.toBe('<p>ready in 5 minutes</p>');
		expect(renderReleaseNotes('`one` then 0 then `two`'))
			.toBe('<p><code>one</code> then 0 then <code>two</code></p>');
	});

	test('a fenced block keeps its lines and its characters', () => {
		expect(renderReleaseNotes('```js\nconst a = 1 < 2;\n```'))
			.toBe('<pre>const a = 1 &lt; 2;</pre>');
		expect(renderReleaseNotes('```\nfirst\nsecond\n```'))
			.toBe('<pre>first\nsecond</pre>');
	});

	test('a fence the notes never closed still renders', () => {
		expect(renderReleaseNotes('```\nleft open'))
			.toBe('<pre>left open</pre>');
	});

	test('a fence with nothing in it draws nothing', () => {
		expect(renderReleaseNotes('```\n```')).toBe('');
	});

	test('a link is reduced to the words it was written around', () => {
		expect(renderReleaseNotes('See [the notes](https://example.com/x) for more'))
			.toBe('<p>See the notes for more</p>');
	});

	// The badge at the top of every release is an image inside a link, which is
	// what used to leave half the markup sitting in the heading.
	test('a badge image wrapped in a link leaves nothing behind', () => {
		const notes = '# Moonfin v2.9.0 [![github](https://img.shields.io/x.svg)](https://github.com/y)';

		expect(renderReleaseNotes(notes)).toBe('<h1>Moonfin v2.9.0</h1>');
	});

	test('a heading and the list under it are separate blocks', () => {
		expect(renderReleaseNotes('## What is new\n\n- **one** thing\n- another'))
			.toBe('<h2>What is new</h2><ul><li><strong>one</strong> thing</li><li>another</li></ul>');
	});
});
