jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {SETTINGS_SCHEMA} from '../Settings/settingsSchema';
import {SETUP_QUESTION_STEPS} from '../../utils/setupWizardGate';
import {STEP_INFO, LANGUAGE_PATH} from './setupSteps';

// The menu path to the first row [match] accepts, read the way the Settings
// panel lays its screens out: the category, any screens on the way, then the
// screen itself when it isnt the category's own page.
const settingsPathTo = (match) => {
	for (const category of SETTINGS_SCHEMA) {
		const subsById = {};
		category.subcategories.forEach((sub) => {
			subsById[sub.id] = sub;
		});
		for (const sub of category.subcategories) {
			const row = sub.rows.find(match);
			if (!row) continue;
			const path = [category.label()];
			for (let parent = subsById[sub.parent]; parent; parent = subsById[parent.parent]) {
				path.splice(1, 0, parent.label());
			}
			if (sub.label() !== category.label()) path.push(sub.label());
			return {path, row};
		}
	}
	return null;
};

describe('setup steps', () => {
	test.each(SETUP_QUESTION_STEPS)('$step points at the real setting', ({step, settingKey}) => {
		const info = STEP_INFO[step];
		expect(info.settingKey).toBe(settingKey);
		const found = settingsPathTo((row) => row.key === settingKey);
		expect(['Settings', ...found.path]).toEqual(info.crumbs());
		expect(found.row.label()).toBe(info.settingName());
	});

	test.each(SETUP_QUESTION_STEPS)('$step offers every choice the setting has', ({step, settingKey}) => {
		const {row} = settingsPathTo((entry) => entry.key === settingKey);
		const fromSettings = row.options({}).map((option) => option.value).sort();
		const fromWizard = STEP_INFO[step].options().map((option) => option.value).sort();
		expect(fromWizard).toEqual(fromSettings);
	});

	test('the tour points at the theme picker', () => {
		const found = settingsPathTo((row) => row.id === 'themeSelection');
		expect(['Settings', ...found.path]).toEqual(STEP_INFO.tour.crumbs());
		expect(found.row.label()).toBe(STEP_INFO.tour.settingName());
	});

	test('the languages path names the audio and subtitle screens', () => {
		const audio = settingsPathTo((row) => row.key === 'audioLanguage').path;
		const subtitles = settingsPathTo((row) => row.key === 'subtitleLanguage').path;
		expect(['Settings', ...audio.slice(0, -1)]).toEqual(LANGUAGE_PATH.crumbs());
		expect(subtitles.slice(0, -1)).toEqual(audio.slice(0, -1));
		expect(LANGUAGE_PATH.settingName()).toBe(`${audio[audio.length - 1]}, ${subtitles[subtitles.length - 1]}`);
	});
});
