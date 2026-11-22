// A small CommonMark reader for text an admin wrote: headings, paragraphs,
// lists, quotes, code and the inline marks. It hands back a tree rather than
// HTML so nothing the admin typed is ever handed to innerHTML, and images are
// dropped rather than fetched from whatever host they name.

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const LIST_ITEM = /^ {0,3}(?:([-*+])|(\d{1,9})[.)])[ \t]+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CONTINUATION = /^ {2,}(\S.*)$/;
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const WORD = /[A-Za-z0-9]/;

const text = (value) => ({type: 'text', text: value});

// Where a closing run of the given delimiter sits, or -1. A closer has to follow
// something that is not whitespace, and an underscore closer cant run straight
// into a word or it is part of the word. A longer run closes with its last
// marks, so the ones before them stay inside for the nested mark to use.
const findCloser = (source, delim, from) => {
	for (let i = from; i <= source.length - delim.length; i++) {
		if (source.substr(i, delim.length) !== delim) continue;
		if (i === from || /\s/.test(source.charAt(i - 1))) continue;
		if (delim.charAt(0) === '_' && WORD.test(source.charAt(i + delim.length))) continue;
		while (source.charAt(i + delim.length) === delim.charAt(0)) i++;
		return i;
	}
	return -1;
};

// A link or image target starting at the bracket, or null when it does not
// close the way a link has to.
const readLink = (source, at) => {
	const close = source.indexOf(']', at + 1);
	if (close < 0 || source.charAt(close + 1) !== '(') return null;
	const end = source.indexOf(')', close + 2);
	if (end < 0) return null;
	const target = source.slice(close + 2, end).trim();
	// A title in quotes after the address is allowed and thrown away.
	const href = target.split(/\s+/)[0] || '';
	return {label: source.slice(at + 1, close), href, end: end + 1};
};

export const parseInlines = (source) => {
	const nodes = [];
	let buffer = '';
	const flush = () => {
		if (buffer) nodes.push(text(buffer));
		buffer = '';
	};

	let i = 0;
	while (i < source.length) {
		const ch = source.charAt(i);
		const next = source.charAt(i + 1);

		if (ch === '\\' && ESCAPABLE.test(next)) {
			buffer += next;
			i += 2;
			continue;
		}

		if (ch === '`') {
			let run = 1;
			while (source.charAt(i + run) === '`') run++;
			const ticks = source.substr(i, run);
			const close = source.indexOf(ticks, i + run);
			if (close > 0) {
				flush();
				nodes.push({type: 'code', text: source.slice(i + run, close).trim()});
				i = close + run;
				continue;
			}
			buffer += ticks;
			i += run;
			continue;
		}

		if (ch === '!' && next === '[') {
			const image = readLink(source, i + 1);
			if (image) {
				i = image.end;
				continue;
			}
		}

		if (ch === '[') {
			const link = readLink(source, i);
			if (link) {
				flush();
				nodes.push({type: 'link', href: link.href, children: parseInlines(link.label)});
				i = link.end;
				continue;
			}
		}

		if (ch === '*' || ch === '_') {
			const delim = next === ch ? ch + ch : ch;
			const after = source.charAt(i + delim.length);
			const intraword = ch === '_' && i > 0 && WORD.test(source.charAt(i - 1));
			if (after && !/\s/.test(after) && !intraword) {
				const close = findCloser(source, delim, i + delim.length);
				if (close > 0) {
					flush();
					nodes.push({
						type: delim.length === 2 ? 'strong' : 'em',
						children: parseInlines(source.slice(i + delim.length, close))
					});
					i = close + delim.length;
					continue;
				}
			}
			buffer += delim;
			i += delim.length;
			continue;
		}

		buffer += ch;
		i++;
	}

	flush();
	return nodes;
};

const paragraphOf = (lines) => ({type: 'paragraph', children: parseInlines(lines.join(' '))});

export const parseMarkdown = (source) => {
	const lines = (source || '').replace(/\r\n?/g, '\n').split('\n');
	const blocks = [];
	let paragraph = [];
	const flush = () => {
		if (paragraph.length) blocks.push(paragraphOf(paragraph));
		paragraph = [];
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) {
			flush();
			i++;
			continue;
		}

		const fence = line.match(FENCE);
		if (fence) {
			flush();
			const code = [];
			i++;
			while (i < lines.length && !lines[i].match(FENCE)) {
				code.push(lines[i]);
				i++;
			}
			blocks.push({type: 'code', text: code.join('\n')});
			i++;
			continue;
		}

		const heading = line.match(HEADING);
		if (heading) {
			flush();
			blocks.push({type: 'heading', level: heading[1].length, children: parseInlines(heading[2])});
			i++;
			continue;
		}

		if (QUOTE.test(line)) {
			flush();
			const quoted = [];
			while (i < lines.length && QUOTE.test(lines[i])) {
				quoted.push(lines[i].match(QUOTE)[1]);
				i++;
			}
			blocks.push({type: 'quote', children: parseInlines(quoted.join(' '))});
			continue;
		}

		const item = line.match(LIST_ITEM);
		if (item) {
			flush();
			const ordered = !!item[2];
			const items = [];
			while (i < lines.length) {
				const entry = lines[i].match(LIST_ITEM);
				if (!entry || !!entry[2] !== ordered) break;
				const parts = [entry[3]];
				i++;
				// A line indented under the item carries on its text.
				while (i < lines.length && CONTINUATION.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
					parts.push(lines[i].match(CONTINUATION)[1]);
					i++;
				}
				items.push(parseInlines(parts.join(' ')));
			}
			blocks.push({type: 'list', ordered, items});
			continue;
		}

		paragraph.push(line.trim());
		i++;
	}

	flush();
	return blocks;
};
