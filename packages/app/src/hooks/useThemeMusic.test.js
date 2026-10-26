import {renderHook, act} from '@testing-library/react';

import * as jellyfinApi from '../services/jellyfinApi';
import {useThemeMusic} from './useThemeMusic';

const mockSettings = {themeMusicEnabled: true, themeMusicVolume: 30, themeMusicLoop: true};
jest.mock('../context/SettingsContext', () => ({
	useSettings: () => ({settings: mockSettings})
}));

jest.mock('../services/jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	getApiKey: () => 'token',
	getTokenParam: () => 'api_key',
	getServerType: () => 'jellyfin',
	api: {getThemeSongs: jest.fn()}
}));

// jsdom has no audio pipeline, so the element is stood in for by something that
// records what the hook asks of it and lets the test fire canplaythrough itself.
class FakeAudio {
	constructor () {
		this.paused = true;
		this.volume = 0;
		this.listeners = {};
		FakeAudio.last = this;
	}
	addEventListener (type, handler) {
		this.listeners[type] = handler;
	}
	play () {
		this.paused = false;
		return Promise.resolve();
	}
	pause () {
		this.paused = true;
	}
}

const setHidden = (value) => {
	Object.defineProperty(document, 'hidden', {configurable: true, get: () => value});
};

const setWebkitHidden = (value) => {
	Object.defineProperty(document, 'webkitHidden', {configurable: true, get: () => value});
};

const startPlaying = async (result) => {
	await act(async () => {
		await result.current.playThemeMusic('item1');
	});
	act(() => FakeAudio.last.listeners.canplaythrough());
};

describe('useThemeMusic while the app is off screen', () => {
	beforeEach(() => {
		// The suite resets mocks before every test, so the answer is set here rather
		// than in the module factory.
		jellyfinApi.api.getThemeSongs.mockResolvedValue({Items: [{Id: 'song1'}]});
		window.Audio = FakeAudio;
		setHidden(false);
	});

	afterEach(() => {
		setHidden(false);
		setWebkitHidden(false);
	});

	test('the track stops when the app is hidden', async () => {
		const {result} = renderHook(() => useThemeMusic());
		await startPlaying(result);
		expect(result.current.isPlaying()).toBe(true);

		setHidden(true);
		act(() => document.dispatchEvent(new Event('visibilitychange')));

		expect(FakeAudio.last.paused).toBe(true);
		expect(result.current.isPlaying()).toBe(false);
	});

	test('a set that only reports the prefixed event still stops the track', async () => {
		const {result} = renderHook(() => useThemeMusic());
		await startPlaying(result);

		// The unprefixed flag stays absent, which is what an old set looks like.
		setHidden(undefined);
		setWebkitHidden(true);
		act(() => document.dispatchEvent(new Event('webkitvisibilitychange')));

		expect(FakeAudio.last.paused).toBe(true);
	});

	test('coming back to the screen leaves the track alone', async () => {
		const {result} = renderHook(() => useThemeMusic());
		await startPlaying(result);

		act(() => document.dispatchEvent(new Event('visibilitychange')));

		expect(FakeAudio.last.paused).toBe(false);
		expect(result.current.isPlaying()).toBe(true);
	});

	test('the listeners come off with the hook', async () => {
		const remove = jest.spyOn(document, 'removeEventListener');
		const {unmount} = renderHook(() => useThemeMusic());

		unmount();

		const removed = remove.mock.calls.map((call) => call[0]);
		expect(removed).toContain('visibilitychange');
		expect(removed).toContain('webkitvisibilitychange');
		remove.mockRestore();
	});
});

// The fade and the home row delay both run on timers, so these drive the clock.
describe('useThemeMusic held by a card preview', () => {
	const HOME_ROW_DELAY = 1500;
	const FADE = 1500;

	beforeEach(() => {
		jest.useFakeTimers();
		jellyfinApi.api.getThemeSongs.mockResolvedValue({Items: [{Id: 'song1'}]});
		window.Audio = FakeAudio;
		mockSettings.themeMusicOnHomeRows = true;
		setHidden(false);
	});

	afterEach(() => {
		delete mockSettings.themeMusicOnHomeRows;
		jest.useRealTimers();
	});

	const flush = async () => {
		await act(async () => {
			for (let i = 0; i < 10; i++) await Promise.resolve();
		});
	};

	test('holding fades the track out and releasing brings it back after the home row delay', async () => {
		const {result} = renderHook(() => useThemeMusic());
		await startPlaying(result);
		const first = FakeAudio.last;
		expect(result.current.isPlaying()).toBe(true);

		act(() => result.current.holdThemeMusic(true));
		act(() => jest.advanceTimersByTime(FADE));

		expect(first.paused).toBe(true);
		expect(result.current.isPlaying()).toBe(false);
		jellyfinApi.api.getThemeSongs.mockClear();

		act(() => result.current.holdThemeMusic(false));
		expect(jellyfinApi.api.getThemeSongs).not.toHaveBeenCalled();
		act(() => jest.advanceTimersByTime(HOME_ROW_DELAY));
		await flush();

		expect(jellyfinApi.api.getThemeSongs).toHaveBeenCalledWith('item1', true);
		expect(FakeAudio.last).not.toBe(first);
		act(() => FakeAudio.last.listeners.canplaythrough());
		expect(result.current.isPlaying()).toBe(true);
	});

	test('while held a focus only records the item, which plays once the hold lifts', async () => {
		const {result} = renderHook(() => useThemeMusic());

		act(() => result.current.holdThemeMusic(true));
		act(() => result.current.playThemeMusicDelayed('item2'));
		act(() => jest.advanceTimersByTime(HOME_ROW_DELAY * 2));
		await flush();

		expect(jellyfinApi.api.getThemeSongs).not.toHaveBeenCalled();

		act(() => result.current.holdThemeMusic(false));
		act(() => jest.advanceTimersByTime(HOME_ROW_DELAY));
		await flush();

		expect(jellyfinApi.api.getThemeSongs).toHaveBeenCalledWith('item2', true);
	});

	test('a hold during the delay keeps the item the delay was waiting on', async () => {
		const {result} = renderHook(() => useThemeMusic());

		act(() => result.current.playThemeMusicDelayed('item3'));
		act(() => jest.advanceTimersByTime(500));
		act(() => result.current.holdThemeMusic(true));
		act(() => jest.advanceTimersByTime(HOME_ROW_DELAY));
		await flush();

		expect(jellyfinApi.api.getThemeSongs).not.toHaveBeenCalled();

		act(() => result.current.holdThemeMusic(false));
		act(() => jest.advanceTimersByTime(HOME_ROW_DELAY));
		await flush();

		expect(jellyfinApi.api.getThemeSongs).toHaveBeenCalledWith('item3', true);
	});

	test('a track still being fetched when the hold lands never starts', async () => {
		let answer;
		jellyfinApi.api.getThemeSongs.mockImplementation(() => new Promise((resolve) => {
			answer = resolve;
		}));
		const {result} = renderHook(() => useThemeMusic());
		FakeAudio.last = null;

		act(() => {
			result.current.playThemeMusic('item4');
		});
		act(() => result.current.holdThemeMusic(true));
		await act(async () => {
			answer({Items: [{Id: 'song1'}]});
		});
		await flush();

		expect(FakeAudio.last).toBeNull();
		expect(result.current.isPlaying()).toBe(false);
	});
});
