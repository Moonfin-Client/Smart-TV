// $L reaches for ilib, which a plain unit test has no way to load.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {KIND, SETTINGS_SCHEMA, SCHEMA_BY_KEY} from './settingsSchema';

// These lock the settings layout, which a stray edit would otherwise change quietly.

const SCREENS = {
	account: ['account', 'pinCode*', 'settingsSync*'],
	general: ['general'],
	appearance: ['appearance', 'navigationBar*', 'homeScreen*', 'rowOptions*', 'mediaBar*', 'libraries*', 'detailsPage*', 'seasonalEffects*', 'loadingAnimation*', 'screensaver*'],
	playback: ['player', 'playbackTime*', 'qualityDecoding', 'audio', 'subtitles', 'subtitleCustomization*', 'skippingAutoplay', 'syncPlay'],
	storage: ['storage'],
	integrations: ['seerr', 'achievements', 'romm'],
	about: ['about', 'diagnostics*'],
	kidsMode: ['kidsModeExit']
};

const SECTIONS = {
	'account.account': ['signIn', 'family', 'servers', 'sync'],
	'account.pinCode': ['pinGeneral', 'pinManage'],
	'general.general': ['language', 'clock', 'input', 'behavior', 'performance'],
	'appearance.appearance': ['navigation', 'layout', 'theme', 'display', 'extras'],
	'appearance.navigationBar': ['navAppearance', 'navButtons'],
	'appearance.homeScreen': ['contents', 'looks', 'externalSources'],
	'appearance.rowOptions': ['continueWatchingAndNextUp', 'recentlyAdded', 'audio', 'collections', 'favorites', 'genres', 'playlists', 'rewatch', 'sinceYouWatched', 'studios'],
	'appearance.mediaBar': ['mediaBarGeneral', 'mediaSources', 'mediaBarBehavior', 'trailers'],
	'appearance.libraries': ['librariesGeneral', 'libraryView'],
	'appearance.detailsPage': ['detailsDisplay', 'mediaDetailsAndSpoilers', 'recommendations', 'ratings', 'themeMusic'],
	'playback.player': ['mediaPlayerBehavior', 'trickPlay'],
	'playback.qualityDecoding': ['streaming', 'decodingRendering'],
	'playback.audio': ['audioStream', 'audioOutput', 'passthroughSettings', 'audioAdvanced'],
	'playback.subtitles': ['subtitlesGeneral', 'subtitleStream', 'subtitleCustomization', 'subtitleRendering'],
	'playback.subtitleCustomization': ['hdr'],
	'playback.skippingAutoplay': ['playbackEnhancements', 'automaticQueuing'],
	'playback.syncPlay': ['syncPlayOptions'],
	'storage.storage': ['storage', 'dangerZone'],
	'about.about': ['appInfo', 'legal', 'server', 'device', 'capabilities'],
	'about.diagnostics': ['logging', 'reports']
};

// The rows that open another screen, read from the source of their action
const openedScreens = () => {
	const targets = [];
	SETTINGS_SCHEMA.forEach((category) => category.subcategories.forEach((sub) => sub.rows.forEach((row) => {
		if (row.kind !== KIND.NAV || !row.action) return;
		const match = /openScreen\('(\w+)', '(\w+)'/.exec(String(row.action));
		if (match) targets.push({from: `${category.id}.${sub.id}`, row: row.id, target: `${match[1]}.${match[2]}`});
	})));
	return targets;
};

describe('settings layout', () => {
	test('the roots come in the same order as the other clients', () => {
		expect(SETTINGS_SCHEMA.map((category) => category.id)).toEqual(Object.keys(SCREENS));
	});

	test('each root holds its screens in order, nested ones marked with a star', () => {
		const actual = {};
		SETTINGS_SCHEMA.forEach((category) => {
			actual[category.id] = category.subcategories.map((sub) => `${sub.id}${sub.menu === false ? '*' : ''}`);
		});
		expect(actual).toEqual(SCREENS);
	});

	test('each screen keeps its section headers in order', () => {
		Object.keys(SECTIONS).forEach((screen) => {
			const sections = SCHEMA_BY_KEY[screen].rows.filter((row) => row.kind === KIND.SECTION).map((row) => row.id);
			expect({screen, sections}).toEqual({screen, sections: SECTIONS[screen]});
		});
	});

	test('every row that opens a screen points at one that exists', () => {
		const missing = openedScreens().filter(({target}) => !SCHEMA_BY_KEY[target]);
		expect(missing).toEqual([]);
	});

	test('every nested screen has a row leading to it', () => {
		const reached = new Set(openedScreens().map(({target}) => target));
		const unreachable = [];
		SETTINGS_SCHEMA.forEach((category) => category.subcategories.forEach((sub) => {
			if (sub.menu === false && !reached.has(`${category.id}.${sub.id}`)) unreachable.push(`${category.id}.${sub.id}`);
		}));
		expect(unreachable).toEqual([]);
	});

	test('a nested screen names a parent that sits in the same root', () => {
		const strays = [];
		SETTINGS_SCHEMA.forEach((category) => category.subcategories.forEach((sub) => {
			if (sub.parent && !SCHEMA_BY_KEY[`${category.id}.${sub.parent}`]) strays.push(`${category.id}.${sub.id}`);
		}));
		expect(strays).toEqual([]);
	});
});
