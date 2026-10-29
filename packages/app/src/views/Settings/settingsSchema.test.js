// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {defaultSettings} from '../../context/defaultSettings';

import {KIND, SETTINGS_SCHEMA, resolve, spotlightIdOf} from './settingsSchema';
import {buildSettingsIndex, matchSettings, resultSpotlightId} from './settingsSearch';

// Guards the hand-written schema against the mistakes that would otherwise be invisible:
// a key that does not exist writes junk into settings, and a repeated spotlight id makes
// a deep linked search result focus the wrong row.

const CUSTOM_RENDERERS = ['moonbasePlugin', 'seerrPanel', 'rommPanel', 'aboutHeader', 'aboutDataActions', 'subtitlePreview', 'imageCacheActions', 'checkForUpdates', 'playbackTimePreview', 'screensaverPreview', 'loadingAnimationPreview', 'trickplayPreview'];
const KEYED = [KIND.TOGGLE, KIND.OPTION, KIND.SLIDER];

// Enough of a context that every label, value and condition can be called.
const ctx = {
	settings: defaultSettings,
	capabilities: {tizenVersionDisplay: '7.0', firmwareVersion: '1.0'},
	seerr: {isEnabled: true, pluginInfo: {version: '1', settingsSyncEnabled: true, seerrEnabled: true}},
	achievements: {available: true, leaderboardEnabled: true, questsEnabled: true, socialAvailable: true},
	romm: {available: true},
	seerrLabel: 'Seerr',
	isSeerr: true,
	hasMultipleServers: false,
	isWebOS: true,
	isTizen: false,
	isVega: false,
	serverUrl: 'http://localhost',
	serverVersion: '10.9',
	availableThemes: [{id: 'default', displayName: 'Default'}],
	activeThemeId: 'default',
	signInPin: {enabled: false, hash: '', failed: 0, lockedUntil: 0, server: false},
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

	describe('Moonbase plugin screen', () => {
		const pluginScreen = () => allScreens().find(({category, sub}) => category.id === 'account' && sub.id === 'settingsSync').sub;

		test('Settings Sync is the Moonbase block and nothing else', () => {
			const rows = pluginScreen().rows;

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({kind: KIND.CUSTOM, render: 'moonbasePlugin'});
		});

		test('has no other row for the plugin switch, its status or the profile picker', () => {
			const rows = pluginScreen().rows;

			expect(rows.filter((row) => row.key === 'useMoonfinPlugin')).toHaveLength(1);
			for (const gone of ['moonfinStatus', 'pluginVersion', 'settingsSync', 'customizationProfile', 'profileSync']) {
				expect(rows.some((row) => row.id === gone || row.render === gone)).toBe(false);
			}
		});

		test('a search for the plugin lands on the status card', () => {
			const index = buildSettingsIndex(SETTINGS_SCHEMA, ctx, {resolve, spotlightIdOf});
			const [first] = matchSettings(index, 'Moonbase');

			expect(first).toMatchObject({type: 'setting', categoryId: 'account', subcategoryId: 'settingsSync'});
			expect(first.spotlightId).toBe('setting-useMoonfinPlugin');
		});

		test('a search for a profile finds the screen', () => {
			const index = buildSettingsIndex(SETTINGS_SCHEMA, ctx, {resolve, spotlightIdOf});

			expect(matchSettings(index, 'profile').map((entry) => entry.spotlightId)).toContain('setting-useMoonfinPlugin');
		});
	});

	describe('Experimental TrueHD', () => {
		const truehdRow = () => allRows().find(({row}) => row.key === 'experimentalTruehd').row;
		const shownWith = (overrides, settings = {}) => truehdRow().when({...ctx, ...overrides, settings: {...ctx.settings, ...settings}});

		test('only Samsung sets offer it', () => {
			expect(shownWith({isTizen: true, isWebOS: false})).toBe(true);
			expect(shownWith({isTizen: false, isWebOS: true})).toBe(false);
			expect(shownWith({isTizen: false, isWebOS: false, isVega: true})).toBe(false);
		});

		test('it shows in auto and manual mode, and goes away when nothing may bitstream', () => {
			const tizen = {isTizen: true, isWebOS: false};
			expect(shownWith(tizen, {audioPassthroughMode: 'auto'})).toBe(true);
			expect(shownWith(tizen, {audioPassthroughMode: 'manual'})).toBe(true);
			expect(shownWith(tizen, {audioPassthroughMode: 'disabled'})).toBe(false);
			expect(shownWith(tizen, {audioPassthroughMode: 'auto', downmixToStereo: true})).toBe(false);
		});

		test('turning it on goes through the action that drops the cached capabilities', () => {
			const toggleExperimentalTruehd = jest.fn();
			truehdRow().onToggle({...ctx, actions: {toggleExperimentalTruehd}});
			expect(toggleExperimentalTruehd).toHaveBeenCalledTimes(1);
		});
	});

	test('only Xbox explains that its sound is decoded on the console, until passthrough is on', () => {
		const note = allRows().find(({row}) => row.id === 'xboxAudioOutput').row;
		const xbox = {...ctx, isWebOS: false, isXbox: true};
		expect(note.when(xbox)).toBe(true);
		expect(note.when(ctx)).toBeFalsy();
		expect(note.when({...xbox, settings: {...defaultSettings, xboxPassthrough: true}})).toBe(false);
		expect(note.when({...xbox, settings: {...defaultSettings, xboxPassthrough: true, xboxNativePlayer: false}})).toBe(true);
	});

	test('Xbox passthrough is offered only with the console player', () => {
		const toggle = allRows().find(({row}) => row.key === 'xboxPassthrough').row;
		const xbox = {...ctx, isWebOS: false, isXbox: true};
		expect(defaultSettings.xboxPassthrough).toBe(false);
		expect(toggle.when(xbox)).toBe(true);
		expect(toggle.when({...xbox, settings: {...defaultSettings, xboxNativePlayer: false}})).toBe(false);
		expect(toggle.when(ctx)).toBeFalsy();
	});

	test('Show Libraries Individually is offered only while libraries show in the navigation bar', () => {
		const toggle = allRows().find(({row}) => row.key === 'showLibrariesIndividually').row;
		expect(defaultSettings.showLibrariesIndividually).toBe(false);
		expect(toggle.when(ctx)).toBe(true);
		expect(toggle.when({...ctx, settings: {...defaultSettings, navbarPosition: 'left'}})).toBe(true);
		expect(toggle.when({...ctx, settings: {...defaultSettings, showLibrariesInToolbar: false}})).toBe(false);
	});

	// The fallback stands in for the value on the row's chip, so it's one of the chip texts
	test('every option row falls back to what one of its own options shows on the chip', () => {
		const mismatched = [];
		allRows()
			.filter(({row}) => row.kind === KIND.OPTION)
			.forEach(({sub, row}) => {
				const labels = row.options(ctx).map((option) => option.chip || option.label);
				const fallback = resolve(row.fallback, ctx);
				if (labels.length > 0 && !labels.includes(fallback)) {
					mismatched.push(`${sub.id}.${row.key} -> ${fallback}`);
				}
			});
		expect(mismatched).toEqual([]);
	});

	test('every search result has its own id that spotlight can focus by name', () => {
		const ids = buildSettingsIndex(SETTINGS_SCHEMA, ctx, {resolve, spotlightIdOf}).map(resultSpotlightId);
		expect(ids.filter((id) => !/^[\w\d-]+$/.test(id))).toEqual([]);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('the home screen backdrop', () => {
	const backdropRow = () => SETTINGS_SCHEMA
		.find((category) => category.id === 'appearance').subcategories
		.find((sub) => sub.id === 'homeScreen').rows
		.find((row) => row.key === 'homeBackdropStyle');
	const withSettings = (settings) => ({...ctx, settings: {...defaultSettings, ...settings}});

	test('is a three way choice in place of the switch', () => {
		const row = backdropRow();
		expect(row.kind).toBe(KIND.OPTION);
		expect(row.label()).toBe('Home Screen Backdrop');
		expect(row.options(ctx).map((option) => [option.value, option.label])).toEqual([
			['off', 'Off'],
			['fullScreen', 'Full Screen'],
			['corner', 'Corner']
		]);
		expect(allRows().some(({row: other}) => other.key === 'showHomeBackdrop')).toBe(false);
	});

	test('shows the style the two synced keys add up to', () => {
		const row = backdropRow();
		expect(row.value(withSettings({showHomeBackdrop: false, homeBackdropStyle: 'corner'}))).toBe('off');
		expect(row.value(withSettings({showHomeBackdrop: true}))).toBe('fullScreen');
		expect(row.value(withSettings({showHomeBackdrop: true, homeBackdropStyle: 'corner'}))).toBe('corner');
	});

	test('a choice writes both keys in one update', () => {
		const setSettings = jest.fn();
		const withActions = {...ctx, actions: {setSettings}};
		['off', 'fullScreen', 'corner'].forEach((style) => backdropRow().onSelect(withActions, style));
		expect(setSettings.mock.calls).toEqual([
			[{showHomeBackdrop: false, homeBackdropStyle: 'off'}],
			[{showHomeBackdrop: true, homeBackdropStyle: 'fullScreen'}],
			[{showHomeBackdrop: true, homeBackdropStyle: 'corner'}]
		]);
	});
});

describe('the media preview switches', () => {
	const homeScreen = () => SETTINGS_SCHEMA
		.find((category) => category.id === 'appearance').subcategories
		.find((sub) => sub.id === 'homeScreen');

	const previewRow = () => homeScreen().rows.find((row) => row.key === 'mediaPreviewMode');
	const withSettings = (settings) => ({...ctx, settings: {...defaultSettings, ...settings}});

	test('sit in the Home Screen looks as a three way choice with the audio switch after it', () => {
		const rows = homeScreen().rows;
		const preview = previewRow();
		const audio = rows.find((row) => row.key === 'previewAudioEnabled');
		expect(preview.kind).toBe(KIND.OPTION);
		expect(preview.label()).toBe('Media Preview');
		expect(preview.options(ctx).map((option) => [option.value, option.label])).toEqual([
			['off', 'Off'],
			['media', 'Media Preview'],
			['trailer', 'Trailer Preview']
		]);
		expect(audio.kind).toBe(KIND.TOGGLE);
		expect(rows.indexOf(audio)).toBe(rows.indexOf(preview) + 1);
		expect(rows.some((row) => row.key === 'episodePreviewEnabled')).toBe(false);
	});

	test('shows the mode the two synced keys add up to', () => {
		const preview = previewRow();
		expect(preview.value(withSettings({episodePreviewEnabled: false, mediaPreviewMode: 'trailer'}))).toBe('off');
		expect(preview.value(withSettings({episodePreviewEnabled: true}))).toBe('media');
		expect(preview.value(withSettings({episodePreviewEnabled: true, mediaPreviewMode: 'trailer'}))).toBe('trailer');
	});

	test('a choice writes both keys in one update', () => {
		const setSettings = jest.fn();
		const preview = previewRow();
		const withActions = {...ctx, actions: {setSettings}};
		preview.onSelect(withActions, 'off');
		preview.onSelect(withActions, 'media');
		preview.onSelect(withActions, 'trailer');
		expect(setSettings.mock.calls).toEqual([
			[{episodePreviewEnabled: false, mediaPreviewMode: 'off'}],
			[{episodePreviewEnabled: true, mediaPreviewMode: 'media'}],
			[{episodePreviewEnabled: true, mediaPreviewMode: 'trailer'}]
		]);
	});

	test('the audio switch and volume only show while previews are on', () => {
		const rows = homeScreen().rows;
		['previewAudioEnabled', 'previewVolume'].forEach((key) => {
			const row = rows.find((candidate) => candidate.key === key);
			expect(row.when(withSettings({episodePreviewEnabled: false}))).toBe(false);
			expect(row.when(withSettings({episodePreviewEnabled: true, mediaPreviewMode: 'media'}))).toBe(true);
			expect(row.when(withSettings({episodePreviewEnabled: true, mediaPreviewMode: 'trailer'}))).toBe(true);
		});
	});
});
