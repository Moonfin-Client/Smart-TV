/* eslint-disable no-console */
/**
 * Fails the build when a .less source uses a CSS feature above the browser
 * floor in packages/app/.browserslistrc (chrome >= 38 / safari >= 7, i.e.
 * webOS 3.0 and Tizen 2.4).
 *
 * Nothing in the pipeline polyfills these, and an engine that can't parse a
 * declaration just drops it, so a gap silently becomes zero spacing and an
 * aspect-ratio box collapses to zero height.
 *
 * BASELINE holds the allowed hit count per file, so a file can only ever get
 * cleaner. Going over the count, or any hit in a file that isn't listed, fails.
 * Lower the number or drop the entry when you clean a file up.
 *
 *   node scripts/check-legacy-css.js            check
 *   node scripts/check-legacy-css.js --report   print current counts
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'packages', 'app', 'src');

const RULES = [
	{
		name: 'gap',
		needs: 'Chrome 84 / Safari 14.1',
		re: /(?:^|[;{\s])(?:row-|column-|grid-)?gap\s*:/,
		hint: 'use styles/mixins.less .flex-row-gap()/.flex-col-gap()/.flex-wrap-gap()'
	},
	{
		name: 'aspect-ratio',
		needs: 'Chrome 88 / Safari 15',
		re: /(?:^|[;{\s])aspect-ratio\s*:/,
		hint: 'use an explicit height, or height:0 + padding-bottom:56.25% when the width is fluid'
	},
	{
		name: 'inset',
		needs: 'Chrome 87 / Safari 14.1',
		re: /(?:^|[;{\s])inset(?:-inline|-block)?\s*:/,
		hint: 'use top/right/bottom/left longhands'
	},
	{
		name: 'clamp()',
		needs: 'Chrome 79 / Safari 13.1',
		re: /(?:^|[^-\w])clamp\(/,
		hint: 'on a width use width + min-width + max-width, otherwise put a static declaration in front of it'
	},
	{
		name: 'min()/max()',
		needs: 'Chrome 79 / Safari 11.1',
		re: /(?:^|[^-\w])(?:min|max)\(/,
		hint: 'put a static declaration in front of it, though not on margin or padding, where cssnano keeps only the last one'
	},
	{
		name: ':is()/:where()',
		needs: 'Chrome 88 / Safari 14',
		re: /:(?:is|where)\(/,
		hint: 'expand the selector list'
	}
];

// Keyed by path under packages/app/src. Each remaining hit already has a plain
// static declaration in front of it that older engines keep, which the checker
// can't see, so the counts are pinned here.
const BASELINE = {
	// width: min(640px, 92vw)
	'App/App.module.less': 1,
	// .gridContent is a grid, not a flex container, and gets grid-gap from
	// postcss-preset-env
	'components/ChangeArtworkModal/ChangeArtworkModal.module.less': 1,
	// four min() widths and heights
	'components/ShuffleOverlay/ShuffleOverlay.module.less': 4
};

const walk = (dir, out = []) => {
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name.endsWith('.less')) out.push(full);
	}
	return out;
};

const scan = (file) => {
	const hits = [];
	let inBlockComment = false;

	fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
		const text = line.trim();

		if (inBlockComment) {
			if (text.includes('*/')) inBlockComment = false;
			return;
		}
		if (text.startsWith('/*')) {
			if (!text.includes('*/')) inBlockComment = true;
			return;
		}
		if (text.startsWith('//') || text.startsWith('*')) return;

		// Drop a trailing line comment so prose about a property never trips a rule.
		const code = text.replace(/\/\/.*$/, '');

		for (const rule of RULES) {
			if (rule.re.test(code)) hits.push({line: i + 1, rule, text});
		}
	});

	return hits;
};

const report = process.argv.includes('--report');
const counts = {};
let failed = false;

for (const file of walk(SRC).sort()) {
	const rel = path.relative(SRC, file).split(path.sep).join('/');
	const hits = scan(file);
	if (hits.length) counts[rel] = hits.length;

	const allowed = BASELINE[rel] || 0;
	if (hits.length > allowed) {
		failed = true;
		console.error(`\n${rel}: ${hits.length} declaration(s) above the browser floor, baseline ${allowed}`);
		for (const hit of hits) {
			console.error(`  ${rel}:${hit.line}  ${hit.rule.name} (needs ${hit.rule.needs})`);
			console.error(`      ${hit.text}`);
			console.error(`      fix: ${hit.rule.hint}`);
		}
	}
}

for (const [rel, allowed] of Object.entries(BASELINE)) {
	if (!(rel in counts)) {
		console.log(`baseline stale, file is clean now, drop the entry: ${rel} (was ${allowed})`);
	} else if (counts[rel] < allowed) {
		console.log(`baseline stale, lower it: ${rel} is ${counts[rel]}, baseline ${allowed}`);
	}
}

if (report) console.log('\n' + JSON.stringify(counts, null, '\t'));

if (failed) {
	console.error('\nTargets are chrome >= 38 / safari >= 7 (packages/app/.browserslistrc).');
	process.exit(1);
}

console.log('check-legacy-css: OK');
