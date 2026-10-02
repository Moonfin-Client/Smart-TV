/* eslint-disable no-console */
/**
 * Builds packages/app/src/theme/accentRules.generated.js.
 *
 * The packaged builds resolve every var(--x, fallback) to its fallback, so the accent
 * a stylesheet asks for is baked in and can't follow a setting at runtime. To let each
 * surface take its own accent, this compiles every .less module, finds each declaration
 * that reads --theme-accent, --theme-accent-rgb or --accent-color, and records it as a
 * template. themeOverrides replays a surface's templates with the chosen color, and only
 * for a surface whose color was actually picked, so the shipped look never changes on
 * its own.
 *
 *   node scripts/gen-accent-rules.js           write the file
 *   node scripts/gen-accent-rules.js --check   fail when the file is stale
 *   node scripts/gen-accent-rules.js --report  list stylesheets per surface and any
 *                                              literal cyan still outside the system
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'packages', 'app', 'src');
const OUT = path.join(SRC, 'theme', 'accentRules.generated.js');
const CLI_MODULES = path.join(ROOT, 'tools', 'node_modules', '@enact', 'cli', 'node_modules');

const less = require(path.join(CLI_MODULES, 'less'));
const postcss = require(path.join(CLI_MODULES, 'postcss'));

// First match wins, and anything unmatched belongs to 'other'. Keep in step with
// ACCENT_SURFACES in theme/accentSurfaces.js.
const SURFACE_OF = [
	['navigation', [/^components\/(NavBar|Sidebar)\//]],
	['achievements', [/^views\/Settings\/achievements\//]],
	['settings', [/^views\/Settings\//]],
	['skip', [/^views\/Player\/SkipSegmentOverlay/]],
	['liveTv', [/^views\/(LiveTV|Recordings)\//, /^views\/Player\/ChannelCarousel/]],
	['player', [/^views\/Player\//]],
	['details', [
		/^views\/Details\//, /^components\/(TrackOptionRow|DetailsTabBar|DetailTrackList|AnimeMarkerPills)\//
	]],
	['home', [
		/^views\/(Browse|Library|Genres|GenreBrowse|Favorites|Search|MusicBrowse)\//,
		/^components\/(MediaCard|MediaRow|RatingsRow|PersonDetailShell|LibraryButtonRow)\//,
		/^styles\/mixins\.less$/
	]]
];

// Brand artwork keeps its own cyan on purpose.
const SKIP = [/^components\/(LoadingAnimation|Screensaver)\//];

const surfaceFor = (rel) => {
	for (const [surface, patterns] of SURFACE_OF) {
		if (patterns.some((p) => p.test(rel))) return surface;
	}
	return 'other';
};

const walk = (dir, out = []) => {
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.module\.less$/.test(entry.name)) out.push(full);
	}
	return out;
};

// Ends of a var() call, honouring nested parentheses in the fallback.
const findVarCalls = (value) => {
	const calls = [];
	const start = /var\(\s*(--[\w-]+)\s*(?:,|\))/g;
	let m;
	while ((m = start.exec(value))) {
		let depth = 1;
		let i = m.index + 4;
		while (i < value.length && depth > 0) {
			if (value[i] === '(') depth += 1;
			else if (value[i] === ')') depth -= 1;
			i += 1;
		}
		const inner = value.slice(m.index + 4, i - 1);
		const comma = inner.indexOf(',');
		calls.push({
			from: m.index,
			to: i,
			name: m[1],
			fallback: comma >= 0 ? inner.slice(comma + 1).trim() : ''
		});
		start.lastIndex = i;
	}
	return calls;
};

const ACCENT_VARS = {
	'--theme-accent': '{accent}',
	'--accent-color': '{accent}',
	'--theme-accent-rgb': '{rgb}'
};

// Swaps the accent variables for placeholders, and every other var() for the fallback
// the build would have baked in, so the injected rule reads the same on any engine.
const templateOf = (value) => {
	let out = value;
	let changed = true;
	let usedAccent = false;
	while (changed) {
		changed = false;
		const calls = findVarCalls(out);
		if (!calls.length) break;
		// Innermost first, so a nested fallback never gets cut in half.
		const call = calls.reduce((best, c) => (c.to - c.from < best.to - best.from ? c : best));
		const token = ACCENT_VARS[call.name];
		if (token) {
			usedAccent = true;
			out = out.slice(0, call.from) + token + out.slice(call.to);
		} else {
			out = out.slice(0, call.from) + (call.fallback || 'initial') + out.slice(call.to);
		}
		changed = true;
	}
	return {value: out, usedAccent};
};

const localizeSelector = (selector) => selector
	.replace(/:global\(([^)]*)\)/g, '$1')
	.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (m, name, offset, whole) => {
		// Leave the digits of a decimal alone, and anything inside brackets or quotes.
		const before = whole.slice(0, offset);
		const open = (before.match(/\[/g) || []).length - (before.match(/\]/g) || []).length;
		if (open > 0 || /\d$/.test(before)) return m;
		return `.{${name}}`;
	});

const LITERAL = /#00a4dc\b|\b0,\s*164,\s*220\b/i;

const build = async () => {
	const surfaces = {};
	const files = {};
	const literals = [];
	const warnings = [];

	for (const file of walk(SRC).sort()) {
		const rel = path.relative(SRC, file).split(path.sep).join('/');
		if (SKIP.some((p) => p.test(rel))) continue;
		const source = fs.readFileSync(file, 'utf8');
		let css;
		try {
			css = (await less.render(source, {filename: file, javascriptEnabled: true, modifyVars: {__DEV__: false}})).css;
		} catch (e) {
			warnings.push(`${rel}: ${e.message}`);
			continue;
		}
		const surface = surfaceFor(rel);
		const root = postcss.parse(css);
		root.walkDecls((decl) => {
			const rule = decl.parent;
			if (!rule || rule.type !== 'rule') {
				if (/var\(--(theme-accent|accent-color)/.test(decl.value)) warnings.push(`${rel}: accent inside ${rule && rule.type} ignored (${decl.prop})`);
				return;
			}
			const {value, usedAccent} = templateOf(decl.value);
			if (!usedAccent) {
				if (LITERAL.test(decl.value)) {
					literals.push(`${rel}  ${rule.selector.replace(/\s+/g, ' ')} { ${decl.prop}: ${decl.value} }`);
				}
				return;
			}
			// An at-rule chain, such as a media query, has to wrap the replayed rule.
			const at = [];
			for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
				if (p.type === 'atrule') at.unshift(`@${p.name} ${p.params}`);
			}
			if (at.some((a) => /^@(-webkit-)?keyframes/.test(a))) {
				warnings.push(`${rel}: accent inside keyframes ignored`);
				return;
			}
			files[rel] = true;
			const list = surfaces[surface] || (surfaces[surface] = []);
			list.push({
				file: rel,
				at: at.join(' '),
				selector: localizeSelector(rule.selector.replace(/\s+/g, ' ')),
				prop: decl.prop,
				value: value + (decl.important ? ' !important' : '')
			});
		});
	}

	const moduleFiles = Object.keys(files).sort();
	const varOf = new Map(moduleFiles.map((f, i) => [f, `m${i}`]));
	const rel = (f) => path.posix.relative('theme', f);
	const lines = [
		'// GENERATED by scripts/gen-accent-rules.js. Edit the stylesheets and run the script, not this file.',
		'//',
		'// Every declaration that reads the accent, grouped by the surface it belongs to. {accent} and',
		'// {rgb} stand for the surface color, and `.{name}` for a CSS module class.',
		''
	];
	moduleFiles.forEach((f) => lines.push(`import ${varOf.get(f)} from '${rel(f)}';`));
	lines.push('', 'export const MODULES = {');
	moduleFiles.forEach((f, i) => lines.push(`\t'${f}': ${varOf.get(f)}${i < moduleFiles.length - 1 ? ',' : ''}`));
	lines.push('};', '', 'export const ACCENT_RULES = {');
	const surfaceIds = Object.keys(surfaces).sort();
	surfaceIds.forEach((id, si) => {
		lines.push(`\t${id}: [`);
		surfaces[id].forEach((r, ri) => {
			lines.push(`\t\t${JSON.stringify([r.file, r.at, r.selector, r.prop, r.value])}${ri < surfaces[id].length - 1 ? ',' : ''}`);
		});
		lines.push(`\t]${si < surfaceIds.length - 1 ? ',' : ''}`);
	});
	lines.push('};', '');
	return {text: lines.join('\n'), surfaces, literals, warnings, moduleFiles};
};

(async () => {
	const args = process.argv.slice(2);
	const result = await build();
	result.warnings.forEach((w) => console.warn(`warn: ${w}`));

	if (args.includes('--report')) {
		for (const [id, list] of Object.entries(result.surfaces)) {
			const byFile = {};
			list.forEach((r) => { byFile[r.file] = (byFile[r.file] || 0) + 1; });
			console.log(`\n${id}: ${list.length} declarations`);
			Object.entries(byFile).forEach(([f, n]) => console.log(`  ${String(n).padStart(3)}  ${f}`));
		}
		console.log(`\nliteral cyan outside the system: ${result.literals.length}`);
		result.literals.forEach((l) => console.log(`  ${l}`));
		return;
	}

	if (args.includes('--check')) {
		const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
		if (current !== result.text) {
			console.error('accentRules.generated.js is out of date. Run: node scripts/gen-accent-rules.js');
			process.exit(1);
		}
		console.log('gen-accent-rules: OK');
		return;
	}

	fs.writeFileSync(OUT, result.text);
	const total = Object.values(result.surfaces).reduce((n, l) => n + l.length, 0);
	console.log(`wrote ${path.relative(ROOT, OUT)}: ${total} declarations across ${result.moduleFiles.length} stylesheets`);
})();
