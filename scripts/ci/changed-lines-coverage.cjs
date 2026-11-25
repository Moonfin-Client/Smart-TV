#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Which of a branch's changed lines the *.check.mjs suite runs.
 *
 * Reports the lines in src's plain modules that the diff between BASE and
 * HEAD adds or changes, and which of them some check runs, so a reviewer can
 * see how much of the change the checks exercise at all. It also reports how
 * many of them the branch's own new or changed checks run. JSX files are left
 * out, since Node can't load them and no check ever runs one.
 *
 * Two stages, so a pull request whose own checks cover it stays fast:
 * 1. The check files the branch adds or changes. If they already run every
 *    changed line, no other check can add anything.
 * 2. Otherwise the whole suite, through scripts/checks.mjs.
 *
 * The checks run with V8's coverage on (NODE_V8_COVERAGE). A line counts when
 * it holds code, so not a blank line, a comment or only closing brackets, and
 * it ran when the innermost V8 range around its first character ran. A file no
 * check loads shows with no lines run.
 *
 * It is advisory: it exits 0 whatever it finds, and non-zero only when no
 * check run left coverage to read, so a crash doesn't pass for a result. The
 * result file is written after stage 1 too, marked partial, so a run that
 * times out during stage 2 still leaves what it had.
 *
 * Run it from a checkout of HEAD after npm ci (CI does).
 *
 * Example: node scripts/ci/changed-lines-coverage.cjs upstream/main HEAD --out cov.json
 */

const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const SOURCE = /^src\/.+\.js$/;
const TEST = /\.check\.mjs$/;
const MAX_OWN_TEST_FILES = 25;
const MAX_FILES = 15;
const MAX_RANGES = 10;
const MAX_ANNOTATIONS = 10;

// The real path, since V8 reports each module by its real path.
const root = fs.realpathSync(path.resolve(__dirname, '..', '..'));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});

const parseArgs = () => {
	const args = {positional: []};
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--out') args.out = argv[++i];
		else if (argv[i] === '--pr-number') args.prNumber = Number(argv[++i]);
		else if (argv[i] === '--annotate') args.annotate = argv[++i];
		else args.positional.push(argv[i]);
	}
	if (!args.positional[0]) {
		console.error('usage: changed-lines-coverage.cjs BASE [HEAD] [--out FILE] [--pr-number N] [--annotate REF]');
		process.exit(2);
	}
	return {...args, base: args.positional[0], head: args.positional[1] || 'HEAD'};
};

// {path: [[first, last], ...]} of the source lines HEAD added or changed since
// its merge base with BASE, leaving out lines whose only change is whitespace.
const changedRanges = (base, head) => {
	const out = git('diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=d', '-w', `${base}...${head}`, '--', 'src');
	const ranges = {};
	let file = null;
	for (const line of out.split('\n')) {
		if (line.startsWith('+++ ')) {
			file = line.startsWith('+++ b/') ? line.slice(6) : null;
		} else if (file && line.startsWith('@@')) {
			const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
			const start = Number(m[1]);
			const count = m[2] === undefined ? 1 : Number(m[2]);
			if (count > 0) (ranges[file] = ranges[file] || []).push([start, start + count - 1]);
		}
	}
	for (const file of Object.keys(ranges)) {
		if (!SOURCE.test(file) || TEST.test(file)) delete ranges[file];
	}
	return ranges;
};

const changedTests = (base, head) => git('diff', '--name-only', '--no-renames', '--diff-filter=AM', `${base}...${head}`, '--', 'src', 'scripts')
	.split('\n')
	.filter(file => TEST.test(file));

// {line: count} for each line of the source that holds code, the count being
// how often the innermost V8 range around its first character ran, summed over
// the processes that loaded the file. scripts is one list of ranges per
// process, empty for a file nothing loaded, which leaves every line at 0.
const lineHits = (source, scripts) => {
	const hits = {};
	let offset = 0;
	let inComment = false;
	source.split('\n').forEach((text, i) => {
		const start = offset + text.length - text.trimStart().length;
		offset += text.length + 1;
		const code = text.trim();
		const comment = inComment || code.startsWith('//') || code.startsWith('/*');
		if (inComment || code.startsWith('/*')) inComment = !code.includes('*/');
		if (comment || !code || /^[)\]};,]+$/.test(code)) return;
		let count = 0;
		for (const ranges of scripts) {
			let inner = null;
			for (const r of ranges) {
				if (r.startOffset <= start && start < r.endOffset &&
					(!inner || r.endOffset - r.startOffset < inner.endOffset - inner.startOffset)) inner = r;
			}
			if (inner) count += inner.count;
		}
		hits[i + 1] = count;
	});
	return hits;
};

// Runs the given check files, or the whole suite, with V8 coverage on.
// Returns {hits: {path: {line: count}} for the files asked about, passed,
// failed}, with hits null when the run left no coverage.
const runChecks = (tests, tmp, name, files) => {
	const dir = path.join(tmp, name);
	const env = {...process.env, NODE_V8_COVERAGE: dir};
	let passed = 0;
	let failed = 0;
	if (tests) {
		for (const test of tests) {
			const run = spawnSync(process.execPath, ['--conditions=browser', test], {cwd: root, env, stdio: 'inherit'});
			if (run.status === 0) passed++;
			else failed++;
		}
	} else {
		// scripts/checks.mjs starts each check with the same environment.
		const run = spawnSync(process.execPath, ['scripts/checks.mjs'], {cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
		process.stdout.write(run.stdout || '');
		const counts = /^(\d+) passed, (\d+) failed$/m.exec(run.stdout || '');
		if (counts) [passed, failed] = [Number(counts[1]), Number(counts[2])];
	}

	const loaded = {};
	let reports = 0;
	try {
		for (const entry of fs.readdirSync(dir)) {
			const report = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
			reports++;
			for (const script of report.result || []) {
				if (!script.url.startsWith('file:')) continue;
				const file = path.relative(root, url.fileURLToPath(script.url));
				(loaded[file] = loaded[file] || []).push(script.functions.flatMap(f => f.ranges));
			}
		}
	} catch (_) { /* no coverage */ }
	if (!reports) return {hits: null, passed, failed};

	const hits = {};
	for (const file of files) hits[file] = lineHits(fs.readFileSync(path.join(root, file), 'utf8'), loaded[file] || []);
	return {hits, passed, failed};
};

// The changed lines no check ran, as [first, last] ranges. A range breaks at a
// changed line that did run and between two hunks of the diff, so comments
// and blank lines inside a hunk don't split it, and unchanged code between
// two hunks doesn't join them.
const notRunRanges = (executable, hits, hunks) => {
	const hunkOf = n => hunks.findIndex(([first, last]) => n >= first && n <= last);
	const ranges = [];
	let start = null;
	let last = null;
	for (const n of executable) {
		if (start !== null && (hits[n] > 0 || hunkOf(n) !== hunkOf(last))) {
			ranges.push([start, last]);
			start = null;
		}
		if (!(hits[n] > 0)) {
			if (start === null) start = n;
			last = n;
		}
	}
	if (start !== null) ranges.push([start, last]);
	return ranges;
};

// Fills in the line counts and the per-file rows. Returns the ranges no check
// ran, by file, for annotate().
const summarize = (result, ranges, hits, ownHits) => {
	const files = [];
	const gapsByFile = {};
	result.lines = result.lines_run = 0;
	result.own_run = ownHits ? 0 : null;
	for (const [file, rs] of Object.entries(ranges)) {
		const changed = [...new Set(rs.flatMap(([first, last]) => Array.from({length: last - first + 1}, (_, i) => first + i)))]
			.sort((a, b) => a - b);
		const executable = changed.filter(n => n in (hits[file] || {}));
		if (!executable.length) continue;
		const run = executable.filter(n => hits[file][n] > 0).length;
		const own = executable.filter(n => ownHits?.[file]?.[n] > 0).length;
		const gaps = gapsByFile[file] = notRunRanges(executable, hits[file], rs);
		files.push({file, run, own_run: own, lines: executable.length, not_run: gaps.slice(0, MAX_RANGES)});
		result.lines_run += run;
		result.lines += executable.length;
		if (ownHits) result.own_run += own;
	}
	// Biggest part of the change first.
	files.sort((a, b) => (b.lines - a.lines) || a.file.localeCompare(b.file));
	result.files = files.slice(0, MAX_FILES);
	result.more_files = Math.max(0, files.length - MAX_FILES);
	return gapsByFile;
};

// Maps a line of the checked-out file to the same line in REF's copy, or null
// for a line the two copies don't share. CI checks out the merge of the pull
// request into its base, and Files changed shows the pull request's head, so a
// line moves when the base changed the file above it.
const lineMap = (file, ref) => {
	const out = git('diff', '-U0', '--no-color', '--no-ext-diff', 'HEAD', ref, '--', file);
	const hunks = [...out.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/gm)]
		.map(m => [Number(m[1]), m[2] === undefined ? 1 : Number(m[2]), m[3] === undefined ? 1 : Number(m[3])]);
	return n => {
		let shift = 0;
		for (const [start, oldCount, newCount] of hunks) {
			if (oldCount === 0) {
				// Lines inserted after line start: only later lines move.
				if (n > start) shift += newCount;
			} else if (n >= start + oldCount) {
				shift += newCount - oldCount;
			} else if (n >= start) {
				return null;
			}
		}
		return n + shift;
	};
};

// Prints a notice annotation for each of the biggest ranges of changed lines
// no check ran, so they show on those lines in Files changed. GitHub keeps 10
// notices per step. Returns how many it printed.
const annotate = (gapsByFile, ref) => {
	const ranges = Object.entries(gapsByFile)
		.flatMap(([file, gaps]) => gaps.map(([first, last]) => ({file, first, last})))
		.sort((a, b) => (b.last - b.first) - (a.last - a.first) || a.file.localeCompare(b.file) || a.first - b.first);
	const maps = {};
	let printed = 0;
	for (const {file, first, last} of ranges) {
		if (printed === MAX_ANNOTATIONS) break;
		const toRef = maps[file] = maps[file] || lineMap(file, ref);
		const a = toRef(first);
		const b = toRef(last);
		if (a === null || b === null || b - a !== last - first) continue;
		const what = a === b
			? `Line ${a} changed in this pull request, and no check runs it.`
			: `Lines ${a}-${b} changed in this pull request, and no check runs them.`;
		console.log(`::notice file=${file},line=${a},endLine=${b},title=Not run by any check::${what}`);
		printed++;
	}
	return printed;
};

const main = () => {
	const args = parseArgs();
	const write = (result) => args.out && fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
	const ranges = changedRanges(args.base, args.head);
	const tests = changedTests(args.base, args.head);
	const own = tests.length && tests.length <= MAX_OWN_TEST_FILES ? tests : [];

	const result = {status: 'ok', pr_number: args.prNumber || null, partial: null,
		own_tests: own.length ? 'ran' : tests.length ? 'too_many' : 'none',
		tests_passed: 0, tests_failed: 0, suite_ran: false,
		lines_run: 0, own_run: null, lines: 0, files: [], more_files: 0};

	if (!Object.keys(ranges).length) {
		result.status = 'no_code';
		write(result);
		console.log(`${tests.length} changed check files, no changed source files`);
		return;
	}

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-lines-coverage-'));
	let hits = {};
	let ownHits = null;
	if (own.length) {
		const stage = runChecks(own, tmp, 'own', Object.keys(ranges));
		ownHits = stage.hits;
		Object.assign(result, {tests_passed: stage.passed, tests_failed: stage.failed});
		if (ownHits) {
			hits = ownHits;
			summarize(result, ranges, hits, ownHits);
		} else {
			// The own checks left no coverage, so there's no own count to show.
			result.own_tests = 'lost';
		}
	}

	// Any check can only add to what the branch's own checks ran, so when they
	// ran every changed line there's nothing to add.
	if (!ownHits || result.lines_run < result.lines) {
		if (ownHits) {
			result.partial = 'stopped';
			write(result);
		}
		const suite = runChecks(null, tmp, 'suite', Object.keys(ranges));
		if (suite.hits) {
			hits = suite.hits;
			Object.assign(result, {tests_passed: suite.passed, tests_failed: suite.failed, suite_ran: true, partial: null});
		} else if (ownHits) {
			result.partial = 'lost';
		} else {
			result.status = 'error';
			write(result);
			console.error('error: the check run wrote no coverage');
			process.exit(1);
		}
	}

	const gapsByFile = summarize(result, ranges, hits, ownHits);
	if (args.annotate) result.annotated = annotate(gapsByFile, args.annotate);
	write(result);

	const ownNote = result.own_run === null ? '' : `, ${result.own_run} by the branch's own checks`;
	console.log(`Checks run ${result.lines_run} of ${result.lines} measurable changed lines${ownNote}` +
		(result.suite_ran ? '' : ' (own checks ran them all, suite not needed)'));
	for (const f of result.files) {
		const gaps = f.not_run.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
		console.log(`  ${f.file} ${f.run} of ${f.lines}${gaps ? `, not run: ${gaps}` : ''}`);
	}
};

if (require.main === module) main();

module.exports = {lineHits};
