// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {defaultSettings} from '../../context/defaultSettings';

import {KIND, SETTINGS_SCHEMA, resolve, spotlightIdOf} from './settingsSchema';

// Guards the hand-written schema against the mistakes that would otherwise be invisible:
// a key that does not exist writes junk into settings, and a repeated spotlight id makes
// a deep linked search result focus the wrong row.

const CUSTOM_RENDERERS = ['moonfinStatus', 'seerrPanel', 'aboutDataActions', 'imageCacheActions', 'checkForUpdates', 'profileSync', 'playbackTimePreview', 'screensaverPreview'];
const KEYED = [KIND.TOGGLE, KIND.OPTION, KIND.SLIDER];

// Enough of a context that every label, value and condition can be called.
const ctx = {
	settings: defaultSettings,
	capabilities: {tizenVersionDisplay: '7.0', firmwareVersion: '1.0'},
	seerr: {isEnabled: true, pluginInfo: {version: '1', settingsSyncEnabled: true, seerrEnabled: true}},
	seerrLabel: 'Seerr',
	isSeerr: true,
	hasMultipleServers: false,
	isWebOS: true,
	serverUrl: 'http://localhost',
	serverVersion: '10.9',
	availableThemes: [{id: 'default', displayName: 'Default'}],
	activeThemeId: 'default',
	actions: {}
};

const allScreens = () => SETTINGS_SCHEMA.flatMap((category) =>
	category.subcategories.map((sub) => ({category, sub})));

const allRows = () => allScreens().flatMap(({category, sub}) =>
	sub.rows.map((row) => ({category, sub, row})));

describe('settings schema', () => {
	test('every stored key exists in the default settings', () => {
		const unknown = allRows()
			.filter(({row}) => KEYED.includes(row.kind))
			.map(({row}) => row.key)
			.filter((key) => !(key in defaultSettings));
		expect(unknown).toEqual([]);
	});

	test('no screen repeats a spotlight id', () => {
		allScreens().forEach(({category, sub}) => {
			const ids = sub.rows
				.filter((row) => KEYED.includes(row.kind) || row.kind === KIND.NAV || row.kind === KIND.INFO)
				.map(spotlightIdOf);
			expect({screen: `${category.id}.${sub.id}`, duplicates: ids.length - new Set(ids).size})
				.toEqual({screen: `${category.id}.${sub.id}`, duplicates: 0});
		});
	});

	test('category and subcategory ids are unique', () => {
		const catIds = SETTINGS_SCHEMA.map((category) => category.id);
		expect(new Set(catIds).size).toBe(catIds.length);
		SETTINGS_SCHEMA.forEach((category) => {
			const subIds = category.subcategories.map((sub) => sub.id);
			expect(new Set(subIds).size).toBe(subIds.length);
		});
	});

	test('every row declares a known kind', () => {
		const kinds = Object.values(KIND);
		allRows().forEach(({row}) => expect(kinds).toContain(row.kind));
	});

	test('navigation rows can act and option rows can list their options', () => {
		const broken = allRows()
			.filter(({row}) => (row.kind === KIND.NAV && typeof row.action !== 'function') ||
				(row.kind === KIND.OPTION && typeof row.options !== 'function'))
			.map(({sub, row}) => `${sub.id}.${row.key || row.id}`);
		expect(broken).toEqual([]);
	});

	test('every custom row points at a renderer that exists', () => {
		allRows()
			.filter(({row}) => row.kind === KIND.CUSTOM)
			.forEach(({row}) => expect(CUSTOM_RENDERERS).toContain(row.render));
	});

	test('every label and condition can be evaluated', () => {
		const NO_LABEL = [KIND.DIVIDER, KIND.CUSTOM];
		const problems = [];
		SETTINGS_SCHEMA.forEach((category) => {
			if (typeof resolve(category.label, ctx) !== 'string') problems.push(category.id);
			category.subcategories.forEach((sub) => {
				const where = `${category.id}.${sub.id}`;
				if (typeof resolve(sub.label, ctx) !== 'string') problems.push(where);
				if (sub.when && typeof sub.when(ctx) !== 'boolean') problems.push(`${where} when`);
				sub.rows.forEach((row) => {
					const what = `${where}.${row.key || row.id || row.render}`;
					if (row.when) row.when(ctx);
					if (NO_LABEL.includes(row.kind)) return;
					const text = row.kind === KIND.TEXT ? resolve(row.text, ctx) : resolve(row.label, ctx);
					if (typeof text !== 'string') problems.push(what);
				});
			});
		});
		expect(problems).toEqual([]);
	});

	// An unanswered ping says nothing about what the admin chose, so these rows have to
	// report that rather than the no they used to show.
	describe('plugin panel status rows', () => {
		const statusOf = (id, pluginInfo) => {
			const {row} = allRows().find((entry) => entry.row.id === id);
			return resolve(row.value, {...ctx, seerr: {...ctx.seerr, pluginInfo}});
		};

		test.each([
			['seerrStatus', 'seerrEnabled', 'Enabled by Admin', 'Disabled by Admin'],
			['settingsSync', 'settingsSyncEnabled', 'Available', 'Not Available']
		])('%s reads its flag and falls back to unknown', (id, flag, yes, no) => {
			expect(statusOf(id, {[flag]: true})).toBe(yes);
			expect(statusOf(id, {[flag]: false})).toBe(no);
			expect(statusOf(id, null)).toBe('Unknown');
			expect(statusOf(id, {})).toBe('Unknown');
		});
	});

	test('every option row falls back to one of its own option labels', () => {
		const mismatched = [];
		allRows()
			.filter(({row}) => row.kind === KIND.OPTION)
			.forEach(({sub, row}) => {
				const labels = row.options(ctx).map((option) => option.label);
				const fallback = resolve(row.fallback, ctx);
				if (labels.length > 0 && !labels.includes(fallback)) {
					mismatched.push(`${sub.id}.${row.key} -> ${fallback}`);
				}
			});
		expect(mismatched).toEqual([]);
	});
});
