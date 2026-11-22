#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Which of a branch's changed lines the Jest suite runs.
 *
 * Reports the lines under packages/app/src that the diff between BASE and
 * HEAD adds or changes, and which of them some test runs, so a reviewer can
 * see how much of the change the suite exercises at all. It also reports how
 * many of them the branch's own new or changed tests run.
 *
 * Two stages, so a pull request whose own tests cover it stays fast:
 * 1. The test files the branch adds or changes. If they already run every
 *    changed line, no other test can add anything.
 * 2. Otherwise the whole suite.
 *
 * A line counts when Istanbul has a statement starting on it, the same lines
 * Jest's own line coverage counts. Enact's Jest config collects coverage from
 * every source file, so a file no test imports shows with no lines run.
 *
 * It is advisory: it exits 0 whatever it finds, and non-zero only when no
 * test run left coverage to read, so a crash doesn't pass for a result. The
 * result file is written after stage 1 too, marked partial, so a run that
 * times out during stage 2 still leaves what it had.
 *
 * Run it from a checkout of HEAD after npm ci (CI does).
 *
 * Example: node scripts/ci/changed-lines-coverage.js upstream/main HEAD --out cov.json
 */

const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = 'packages/app';
const SOURCE = /^packages\/app\/src\/.+\.jsx?$/;
const TEST = /(\.test|\.spec|-specs)\.jsx?$|\/__tests__\//;
const MAX_OWN_TEST_FILES = 25;
const MAX_FILES = 15;
const MAX_RANGES = 10;
const MAX_ANNOTATIONS = 10;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
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
		console.error('usage: changed-lines-coverage.js BASE [HEAD] [--out FILE] [--pr-number N] [--annotate REF]');
		process.exit(2);
	}
	return {...args, base: args.positional[0], head: args.positional[1] || 'HEAD'};
};

// {path: [[first, last], ...]} of the source lines HEAD added or changed since
// its merge base with BASE, leaving out lines whose only change is whitespace.
const changedRanges = (base, head) => {
	const out = git('diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=d', '-w', `${base}...${head}`, '--', 'packages/app/src');
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

const changedTests = (base, head) => git('diff', '--name-only', '--no-renames', '--diff-filter=AM', `${base}...${head}`, '--', 'packages/app/src')
	.split('\n')
	.filter(file => SOURCE.test(file) && TEST.test(file));

// Runs Jest with coverage, on the given test files or on the whole suite.
// Returns {hits: {path: {line: count}}, passed, failed}, with hits null when
// the run left no coverage.
const runJest = (tests, tmp, name) => {
	const dir = path.join(tmp, name);
	const report = path.join(tmp, `${name}.json`);
	const args = ['enact', 'test', '--coverage', '--coverageReporters=json', `--coverageDirectory=${dir}`,
		'--json', `--outputFile=${report}`];
	if (tests) args.push('--runTestsByPath', ...tests.map(t => path.relative(APP, t)));
	spawnSync('npx', args, {cwd: path.join(root, APP), stdio: 'inherit'});

	let coverage = null;
	let results = null;
	try {
		coverage = JSON.parse(fs.readFileSync(path.join(dir, 'coverage-final.json'), 'utf8'));
	} catch (_) { /* no coverage */ }
	try {
		results = JSON.parse(fs.readFileSync(report, 'utf8'));
	} catch (_) { /* no report */ }
	if (!coverage) return {hits: null, passed: 0, failed: 0};

	const hits = {};
	for (const [file, data] of Object.entries(coverage)) {
		const lines = hits[path.relative(root, file)] = {};
		for (const [id, loc] of Object.entries(data.statementMap)) {
			const line = loc.start.line;
			lines[line] = Math.max(lines[line] || 0, data.s[id]);
		}
	}
	return {hits, passed: results?.numPassedTests || 0, failed: results?.numFailedTests || 0};
};

// The changed lines no test ran, as [first, last] ranges. A range breaks at a
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

// Fills in the line counts and the per-file rows. Returns the ranges no test
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
// no test ran, so they show on those lines in Files changed. GitHub keeps 10
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
			? `Line ${a} changed in this pull request, and no test runs it.`
			: `Lines ${a}-${b} changed in this pull request, and no test runs them.`;
		console.log(`::notice file=${file},line=${a},endLine=${b},title=Not run by any test::${what}`);
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
		console.log(`${tests.length} changed test files, no changed source files`);
		return;
	}

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-lines-coverage-'));
	let hits = {};
	let ownHits = null;
	if (own.length) {
		const stage = runJest(own, tmp, 'own');
		ownHits = stage.hits;
		Object.assign(result, {tests_passed: stage.passed, tests_failed: stage.failed});
		if (ownHits) {
			hits = ownHits;
			summarize(result, ranges, hits, ownHits);
		} else {
			// The own tests left no coverage, so there's no own count to show.
			result.own_tests = 'lost';
		}
	}

	// Any test can only add to what the branch's own tests ran, so when they
	// ran every changed line there's nothing to add.
	if (!ownHits || result.lines_run < result.lines) {
		if (ownHits) {
			result.partial = 'stopped';
			write(result);
		}
		const suite = runJest(null, tmp, 'suite');
		if (suite.hits) {
			hits = suite.hits;
			Object.assign(result, {tests_passed: suite.passed, tests_failed: suite.failed, suite_ran: true, partial: null});
		} else if (ownHits) {
			result.partial = 'lost';
		} else {
			result.status = 'error';
			write(result);
			console.error('error: the test run wrote no coverage');
			process.exit(1);
		}
	}

	const gapsByFile = summarize(result, ranges, hits, ownHits);
	if (args.annotate) result.annotated = annotate(gapsByFile, args.annotate);
	write(result);

	const ownNote = result.own_run === null ? '' : `, ${result.own_run} by the branch's own tests`;
	console.log(`Tests run ${result.lines_run} of ${result.lines} measurable changed lines${ownNote}` +
		(result.suite_ran ? '' : ' (own tests ran them all, suite not needed)'));
	for (const f of result.files) {
		const gaps = f.not_run.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
		console.log(`  ${f.file} ${f.run} of ${f.lines}${gaps ? `, not run: ${gaps}` : ''}`);
	}
};

main();
