const mockStore = {values: {}};

jest.mock('../services/storage', () => ({
	getFromStorage: (key) => Promise.resolve(mockStore.values[key]),
	saveToStorage: (key, value) => {
		mockStore.values[key] = value;
		return Promise.resolve();
	}
}));

import {
	SETUP_WIZARD_VERSION,
	noteAnsweredSettings,
	remainingSteps,
	serverKeyFor,
	shouldRun,
	markComplete,
	deferThisLaunch,
	beginRerun,
	beginSignInRead,
	finishSignInRead,
	hasReadSignInSettings,
	resetGateForTests
} from './setupWizardGate';

describe('setupWizardGate', () => {
	beforeEach(() => {
		mockStore.values = {};
		resetGateForTests();
	});

	test('asks everything plus the tour when nothing is answered', () => {
		expect(remainingSteps()).toEqual(['navbar', 'mediaBar', 'homeRows', 'detailStyle', 'tour']);
	});

	test('drops answered questions and keeps the tour', () => {
		noteAnsweredSettings(['navbarPosition', 'homeRowsStyle']);
		expect(remainingSteps()).toEqual(['mediaBar', 'detailStyle', 'tour']);
	});

	test('drops the tour when every question is answered', () => {
		noteAnsweredSettings(['navbarPosition', 'featuredBarStyle', 'homeRowsStyle', 'detailScreenStyle']);
		expect(remainingSteps()).toEqual([]);
	});

	test('ignores keys that arent wizard questions', () => {
		noteAnsweredSettings(['uiLanguage', 'homeRowOverlay']);
		expect(remainingSteps()).toEqual(['navbar', 'mediaBar', 'homeRows', 'detailStyle', 'tour']);
	});

	test('keys by server id and user, falling back to the normalized url', () => {
		expect(serverKeyFor('server_1', 'https://jf.example.com/', 'u1')).toBe('server_1_u1');
		expect(serverKeyFor(null, 'https://JF.example.com/', 'u1')).toBe('jf.example.com_u1');
		expect(serverKeyFor(null, 'https://jf.example.com', null)).toBe(null);
		expect(serverKeyFor(null, '', 'u1')).toBe(null);
	});

	test('runs for a fresh server and stops after markComplete', async () => {
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(true);
		await markComplete('s1', 'https://jf.example.com', 'u1');
		expect(mockStore.values.setupWizard).toEqual({s1_u1: SETUP_WIZARD_VERSION});
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(false);
	});

	test('completion is scoped to the server and user pair', async () => {
		await markComplete('s1', 'https://jf.example.com', 'u1');
		await expect(shouldRun('s1', 'https://jf.example.com', 'u2')).resolves.toBe(true);
		await expect(shouldRun('s2', 'https://other.example.com', 'u1')).resolves.toBe(true);
	});

	test('does not run when every question already has an answer', async () => {
		noteAnsweredSettings(['navbarPosition', 'featuredBarStyle', 'homeRowsStyle', 'detailScreenStyle']);
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(false);
	});

	test('deferring stands down for the launch without marking anything', async () => {
		deferThisLaunch();
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(false);
		expect(mockStore.values.setupWizard).toBeUndefined();
	});

	test('a re run asks everything and clears any deferral', async () => {
		noteAnsweredSettings(['navbarPosition', 'featuredBarStyle', 'homeRowsStyle', 'detailScreenStyle']);
		await markComplete('s1', 'https://jf.example.com', 'u1');
		deferThisLaunch();
		beginRerun();
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(true);
		expect(remainingSteps()).toEqual(['navbar', 'mediaBar', 'homeRows', 'detailStyle', 'tour']);
	});

	test('markComplete ends a re run', async () => {
		beginRerun();
		await markComplete('s1', 'https://jf.example.com', 'u1');
		noteAnsweredSettings(['navbarPosition', 'featuredBarStyle', 'homeRowsStyle', 'detailScreenStyle']);
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(false);
	});

	test('deferring ends a re run so the gate cant loop', async () => {
		beginRerun();
		deferThisLaunch();
		await expect(shouldRun('s1', 'https://jf.example.com', 'u1')).resolves.toBe(false);
	});

	test('the sign in read is kept per server and user', () => {
		beginSignInRead('https://jf.example.com/', 'u1');
		expect(hasReadSignInSettings('https://jf.example.com', 'u1')).toBe(false);
		finishSignInRead('https://jf.example.com/', 'u1');
		expect(hasReadSignInSettings('http://JF.example.com', 'u1')).toBe(true);
		// A second profile on the same server still has its settings on the way.
		beginSignInRead('https://jf.example.com', 'u2');
		expect(hasReadSignInSettings('https://jf.example.com', 'u2')).toBe(false);
		expect(hasReadSignInSettings('https://jf.example.com', 'u1')).toBe(true);
		finishSignInRead('https://jf.example.com', 'u2');
		expect(hasReadSignInSettings('https://jf.example.com', 'u2')).toBe(true);
		// Signing in again waits for the new read.
		beginSignInRead('https://jf.example.com', 'u2');
		expect(hasReadSignInSettings('https://jf.example.com', 'u2')).toBe(false);
	});

	test('a user switch keeps the answers already on the device', () => {
		noteAnsweredSettings(['navbarPosition', 'featuredBarStyle', 'homeRowsStyle', 'detailScreenStyle']);
		beginSignInRead('https://jf.example.com', 'u1');
		expect(remainingSteps()).toEqual([]);
		beginSignInRead('https://jf.example.com', 'u2');
		expect(remainingSteps()).toEqual([]);
	});
});
