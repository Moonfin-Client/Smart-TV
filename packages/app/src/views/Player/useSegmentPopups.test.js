import {renderHook, act} from '@testing-library/react';

import Spotlight from '@enact/spotlight';

import useSegmentPopups from './useSegmentPopups';

// The framework's focus needs its own copy of React, so a stand in answers for it.
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn(() => false)}}));

const RUNTIME = 100 * 10000000;
const NEAR_END = 99 * 10000000;

const setup = () => {
	const onPlayNext = jest.fn();
	const onSeekToSegmentEnd = jest.fn();
	const {result} = renderHook(() => useSegmentPopups({
		mediaSegments: {list: [{type: 'intro', start: 0, end: 30 * 10000000}]},
		nextEpisode: {Id: 'next'},
		settings: {autoPlay: true, nextUpTimeout: 0, stillWatchingBehavior: 'short_', nextUpBehavior: 'extended', introAction: 'ask'},
		runTimeRef: {current: RUNTIME},
		activeModal: null,
		controlsVisible: false,
		hideControls: () => {},
		showControls: () => {},
		onSeekToSegmentEnd,
		onPlayNext,
		onPausePlayback: () => {}
	}));
	// Runs an episode to its end, where the next one starts by itself.
	const playOut = () => {
		act(() => result.current.resetPopups());
		act(() => result.current.checkSegments(NEAR_END));
	};
	return {result, playOut, onPlayNext};
};

test('episodes that play themselves out raise the prompt', () => {
	const {result, playOut, onPlayNext} = setup();
	playOut();
	playOut();
	expect(onPlayNext).toHaveBeenCalledTimes(2);
	playOut();
	expect(result.current.askStillWatching).toBe(true);
});

test('the viewer reaching for the remote starts the count over', () => {
	const {result, playOut} = setup();
	playOut();
	playOut();
	act(() => result.current.noteViewerActivity());
	playOut();
	expect(result.current.askStillWatching).toBe(false);
});

test('pressing skip counts as the viewer being there, an automatic skip doesnt', () => {
	const {result, playOut} = setup();
	playOut();
	playOut();
	act(() => result.current.handleSkipSegment({type: 'intro', start: 0, end: 30 * 10000000}));
	playOut();
	expect(result.current.askStillWatching).toBe(true);

	const second = setup();
	second.playOut();
	second.playOut();
	act(() => second.result.current.checkSegments(10 * 10000000));
	act(() => second.result.current.handleSkipSegment({type: 'click'}));
	second.playOut();
	expect(second.result.current.askStillWatching).toBe(false);
});

describe('the skip prompt', () => {
	const SECOND = 10000000;
	const BACK = 27;
	const ENTER = 13;
	const LEFT = 37;
	const UP = 38;
	const RIGHT = 39;
	const DOWN = 40;

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = '';
		Spotlight.focus.mockClear();
	});

	const setupPrompt = (props = {}, settings = {}) => {
		const calls = {onSeekToSegmentEnd: jest.fn(), showControls: jest.fn(), hideControls: jest.fn(), onFocusSeekbar: jest.fn()};
		const {result, rerender} = renderHook((current) => useSegmentPopups({
			mediaSegments: {list: [{type: 'intro', start: 60 * SECOND, end: 120 * SECOND}]},
			nextEpisode: null,
			settings: {autoPlay: false, introAction: 'ask', ...settings},
			runTimeRef: {current: 1500 * SECOND},
			activeModal: null,
			controlsVisible: false,
			...calls,
			onPlayNext: () => {},
			onPausePlayback: () => {},
			...current
		}), {initialProps: props});
		return {result, rerender, ...calls};
	};
	const at = (result, seconds) => act(() => result.current.checkSegments(seconds * SECOND));
	const press = (result, keyCode) => {
		let consumed;
		act(() => {
			consumed = result.current.handlePopupKeyDown({keyCode, preventDefault: jest.fn(), stopPropagation: jest.fn()});
		});
		return consumed;
	};
	// Stands in for the prompt's button, so the key handler can tell it has focus.
	const focusPrompt = () => {
		const button = document.createElement('div');
		button.setAttribute('data-spotlight-id', 'skip-segment-btn');
		button.tabIndex = 0;
		document.body.appendChild(button);
		button.focus();
	};

	test('comes up on the way into a segment and clears the controls away', () => {
		const {result, hideControls} = setupPrompt({controlsVisible: true});
		at(result, 61);
		expect(result.current.skipSegment).toMatchObject({type: 'intro', remainingSeconds: 59});
		expect(result.current.skipPromptShown).toBe(true);
		expect(hideControls).toHaveBeenCalled();
	});

	test('once gone it stays gone until playback leaves the segment and comes back into it', () => {
		const {result} = setupPrompt();
		at(result, 61);
		press(result, BACK);
		at(result, 62);
		expect(result.current.skipSegment).toBeNull();
		at(result, 59);
		at(result, 60);
		expect(result.current.skipSegment).not.toBeNull();
	});

	test('a seek the viewer makes takes it down, and the segment the seek lands in is not offered', () => {
		const {result} = setupPrompt();
		at(result, 61);
		act(() => result.current.suppressSeekPrompts());
		expect(result.current.skipSegment).toBeNull();

		at(result, 30);
		act(() => result.current.suppressSeekPrompts());
		at(result, 90);
		act(() => jest.advanceTimersByTime(1500));
		at(result, 91);
		expect(result.current.skipSegment).toBeNull();
	});

	test('a seek that reports its landing holds prompts until it lands, and a little after', async () => {
		const {result} = setupPrompt();
		let land;
		at(result, 30);
		act(() => result.current.suppressSeekPrompts(new Promise((resolve) => {
			land = resolve;
		})));
		act(() => jest.advanceTimersByTime(3000));
		at(result, 90);
		expect(result.current.skipSegment).toBeNull();
		await act(async () => land());
		at(result, 91);
		expect(result.current.skipSegment).toBeNull();

		at(result, 30);
		act(() => jest.advanceTimersByTime(1500));
		at(result, 60);
		expect(result.current.skipSegment).not.toBeNull();
	});

	test('an older seek landing while a newer one is on its way leaves prompts held', async () => {
		const {result} = setupPrompt();
		let landOlder;
		at(result, 30);
		act(() => result.current.suppressSeekPrompts(new Promise((resolve) => {
			landOlder = resolve;
		})));
		act(() => result.current.suppressSeekPrompts(new Promise(() => {})));
		await act(async () => landOlder());
		act(() => jest.advanceTimersByTime(3000));
		at(result, 90);
		expect(result.current.skipSegment).toBeNull();
	});

	test('after its few seconds it only shows with the controls, until its segment ends', () => {
		const {result, rerender} = setupPrompt({}, {mediaSegmentAutoHide: 's5'});
		at(result, 61);
		act(() => jest.advanceTimersByTime(5000));
		expect(result.current.skipPromptShown).toBe(false);
		expect(press(result, UP)).toBe(true);
		act(() => jest.runOnlyPendingTimers());
		expect(Spotlight.focus).toHaveBeenCalledWith('skip-segment-btn');
		rerender({controlsVisible: true});
		expect(result.current.skipPromptShown).toBe(true);
		at(result, 121);
		expect(result.current.skipPromptShown).toBe(false);
	});

	test('a skip taken by hand seeks past it and brings the controls up on the bar', () => {
		const {result, onSeekToSegmentEnd, showControls, onFocusSeekbar} = setupPrompt();
		at(result, 61);
		act(() => result.current.handleSkipSegment({type: 'click'}));
		expect(onSeekToSegmentEnd).toHaveBeenCalledWith(120 * SECOND);
		expect(showControls).toHaveBeenCalled();
		expect(onFocusSeekbar).toHaveBeenCalled();
		// The seek lands a frame short of the end, which is still inside it.
		at(result, 119.9);
		expect(result.current.skipSegment).toBeNull();
	});

	test('a segment that skips itself does it once, until playback is back at its start', () => {
		const {result, onSeekToSegmentEnd} = setupPrompt({}, {introAction: 'auto'});
		at(result, 61);
		at(result, 119.9);
		at(result, 121);
		at(result, 90);
		expect(onSeekToSegmentEnd).toHaveBeenCalledTimes(1);
		at(result, 59);
		at(result, 60);
		expect(onSeekToSegmentEnd).toHaveBeenCalledTimes(2);
	});

	test('a segment too short to read is not offered, but one over a second still skips itself', () => {
		const short = {list: [{type: 'intro', start: 60 * SECOND, end: 62 * SECOND}]};
		const asked = setupPrompt({mediaSegments: short});
		at(asked.result, 60);
		expect(asked.result.current.skipSegment).toBeNull();

		const auto = setupPrompt({mediaSegments: short}, {introAction: 'auto'});
		at(auto.result, 60);
		expect(auto.onSeekToSegmentEnd).toHaveBeenCalledWith(62 * SECOND);
	});

	test('Back takes it down with the controls up or not, and a second Back right after goes nowhere', () => {
		const {result, rerender} = setupPrompt();
		at(result, 61);
		rerender({controlsVisible: true});
		expect(press(result, BACK)).toBe(true);
		expect(result.current.skipSegment).toBeNull();
		expect(press(result, BACK)).toBe(true);
		act(() => jest.advanceTimersByTime(600));
		expect(press(result, BACK)).toBe(false);
	});

	test('with the controls away, Up and Down bring them up on it, Right on it does too and Left on it does nothing', () => {
		focusPrompt();
		const {result, showControls, onFocusSeekbar} = setupPrompt();
		at(result, 61);
		expect(press(result, DOWN)).toBe(true);
		act(() => jest.runOnlyPendingTimers());
		expect(Spotlight.focus).toHaveBeenCalledWith('skip-segment-btn');
		expect(press(result, RIGHT)).toBe(true);
		expect(showControls).toHaveBeenCalledTimes(2);
		expect(press(result, LEFT)).toBe(true);
		expect(showControls).toHaveBeenCalledTimes(2);
		expect(onFocusSeekbar).not.toHaveBeenCalled();
		// OK is left to the button.
		expect(press(result, ENTER)).toBe(false);
	});

	test('with the controls up, Left and Down from it go to the bar and Right from the last button reaches it', () => {
		focusPrompt();
		const {result, onFocusSeekbar} = setupPrompt({controlsVisible: true});
		at(result, 61);
		expect(press(result, LEFT)).toBe(true);
		expect(press(result, DOWN)).toBe(true);
		expect(press(result, UP)).toBe(true);
		expect(onFocusSeekbar).toHaveBeenCalledTimes(2);

		const row = document.createElement('div');
		row.setAttribute('data-player-controls-row', '');
		row.innerHTML = '<button class="spottable">a</button><button class="spottable">b</button>';
		document.body.appendChild(row);
		row.firstChild.focus();
		expect(press(result, RIGHT)).toBe(false);
		row.lastChild.focus();
		expect(press(result, RIGHT)).toBe(true);
		expect(Spotlight.focus).toHaveBeenCalledWith('skip-segment-btn');
	});
});

describe('next up when the episode ends', () => {
	const SECOND = 10000000;

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const setupNextUp = (settings = {}) => {
		const onPlayNext = jest.fn();
		const {result} = renderHook(() => useSegmentPopups({
			mediaSegments: null,
			nextEpisode: {Id: 'next'},
			settings: {autoPlay: true, nextUpBehavior: 'extended', nextUpTimeout: 10, nextUpAdvance: 'end', stillWatchingBehavior: 'short_', ...settings},
			runTimeRef: {current: 100 * SECOND},
			activeModal: null,
			controlsVisible: false,
			hideControls: () => {},
			showControls: () => {},
			onPlayNext,
			onPausePlayback: () => {}
		}));
		const at = (seconds) => act(() => result.current.checkSegments(seconds * SECOND));
		return {result, at, onPlayNext};
	};

	test('the card comes up for the last seconds of the timeout and counts down what is left', () => {
		const {result, at} = setupNextUp();
		at(85);
		expect(result.current.showNextEpisode).toBe(false);
		at(91.5);
		expect(result.current.showNextEpisode).toBe(true);
		expect(result.current.nextEpisodeCountdown).toBe(9);
		at(96);
		expect(result.current.nextEpisodeCountdown).toBe(4);
	});

	test('an Instant timeout shows no card and leaves the move to the end of the file', () => {
		const {result, at, onPlayNext} = setupNextUp({nextUpTimeout: 0});
		at(99.9);
		expect(result.current.showNextEpisode).toBe(false);
		expect(onPlayNext).not.toHaveBeenCalled();
	});

	test('a seek back out of the window takes the card down until playback reaches it again', () => {
		const {result, at} = setupNextUp();
		at(95);
		at(50);
		expect(result.current.showNextEpisode).toBe(false);
		expect(result.current.nextEpisodeCountdown).toBeNull();
		at(95);
		expect(result.current.showNextEpisode).toBe(true);
	});

	test('nothing moves on before the file ends', () => {
		const {at, onPlayNext} = setupNextUp();
		at(95);
		act(() => jest.advanceTimersByTime(60000));
		expect(onPlayNext).not.toHaveBeenCalled();
	});

	test('Back takes the card down for the rest of the episode', () => {
		const {result, at} = setupNextUp();
		at(95);
		let consumed;
		act(() => {
			consumed = result.current.handlePopupKeyDown({keyCode: 27, preventDefault: jest.fn(), stopPropagation: jest.fn()});
		});
		expect(consumed).toBe(true);
		at(97);
		expect(result.current.showNextEpisode).toBe(false);
	});

	test('the end of the file asks whether anyone is still watching after the set number of episodes', () => {
		const {result} = setupNextUp();
		const held = [];
		for (let i = 0; i < 3; i++) {
			act(() => result.current.resetPopups());
			act(() => {
				held.push(result.current.shouldHoldForStillWatching());
			});
		}
		expect(held).toEqual([false, false, true]);
		expect(result.current.askStillWatching).toBe(true);
	});

	test('the countdown mode still moves on when its countdown runs out', () => {
		const {result, at, onPlayNext} = setupNextUp({nextUpAdvance: 'countdown'});
		at(75);
		expect(result.current.showNextEpisode).toBe(true);
		act(() => jest.advanceTimersByTime(10000));
		expect(onPlayNext).toHaveBeenCalledWith({Id: 'next'});
	});

	test('with autoplay off the card comes up as before, with no countdown', () => {
		const {result, at} = setupNextUp({autoPlay: false});
		at(75);
		expect(result.current.showNextEpisode).toBe(true);
		expect(result.current.nextEpisodeCountdown).toBeNull();
	});
});
