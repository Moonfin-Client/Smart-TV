import {createReadyGate, isPositionStable, READY_DEBOUNCE_MS, STABILITY_WINDOW_MS, MAX_STABILITY_CHECKS, BUFFERING_POLL_MS, MAX_BUFFERING_POLLS} from './syncReady';

const ticks = (ms) => ms * 10000;

describe('isPositionStable', () => {
	test('playing counts as stable when the position advanced across the window', () => {
		expect(isPositionStable(ticks(1000), ticks(1400), true)).toBe(true);
	});

	test('a decoder that has not moved is not ready', () => {
		expect(isPositionStable(ticks(1000), ticks(1010), true)).toBe(false);
	});

	test('a jump too large to be playback is not trusted', () => {
		expect(isPositionStable(ticks(1000), ticks(9000), true)).toBe(false);
	});

	test('paused counts as stable when the position held still', () => {
		expect(isPositionStable(ticks(1000), ticks(1030), false)).toBe(true);
	});

	test('paused but still moving means the seek has not landed', () => {
		expect(isPositionStable(ticks(1000), ticks(1400), false)).toBe(false);
	});

	test('a missing reading is never stable', () => {
		expect(isPositionStable(null, ticks(1400), true)).toBe(false);
		expect(isPositionStable(ticks(1000), undefined, true)).toBe(false);
	});
});

describe('createReadyGate', () => {
	const setup = (positions, {buffering = false, playing = true} = {}) => {
		const report = jest.fn();
		let index = 0;
		const state = {buffering};
		const gate = createReadyGate({
			sample: () => ({
				isPlaying: playing,
				positionTicks: ticks(positions[Math.min(index++, positions.length - 1)])
			}),
			isBuffering: () => state.buffering,
			report
		});
		return {gate, report, state};
	};

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test('nothing is reported until the window has passed', () => {
		const {gate, report} = setup([1000, 1400]);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS);
		expect(report).not.toHaveBeenCalled();
		jest.advanceTimersByTime(STABILITY_WINDOW_MS);
		expect(report).toHaveBeenCalledTimes(1);
	});

	test('a stalled decoder keeps measuring instead of reporting', () => {
		const {gate, report} = setup([1000]);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + STABILITY_WINDOW_MS);
		expect(report).not.toHaveBeenCalled();
	});

	test('a position that never looks like it moves is reported anyway', () => {
		const {gate, report} = setup([1000]);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + (STABILITY_WINDOW_MS * MAX_STABILITY_CHECKS));
		expect(report).toHaveBeenCalledTimes(1);
	});

	test('buffering holds the report until it clears', () => {
		const {gate, report, state} = setup([1000, 1400]);
		gate.request();
		state.buffering = true;
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + (BUFFERING_POLL_MS * 3));
		expect(report).not.toHaveBeenCalled();
		// No canplay or playing event follows on a television; the gate has
		// to notice on its own.
		state.buffering = false;
		jest.advanceTimersByTime(BUFFERING_POLL_MS + STABILITY_WINDOW_MS);
		expect(report).toHaveBeenCalledTimes(1);
	});

	test('buffering that never clears is reported anyway once the watchdog runs out', () => {
		const {gate, report, state} = setup([1000]);
		gate.request();
		state.buffering = true;
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + (BUFFERING_POLL_MS * (MAX_BUFFERING_POLLS - 2)));
		expect(report).not.toHaveBeenCalled();
		jest.advanceTimersByTime(BUFFERING_POLL_MS);
		expect(report).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(BUFFERING_POLL_MS * MAX_BUFFERING_POLLS);
		expect(report).toHaveBeenCalledTimes(1);
	});

	test('buffering that starts mid-window holds the report as well', () => {
		const {gate, report, state} = setup([1000, 1400, 1800]);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS);
		state.buffering = true;
		jest.advanceTimersByTime(STABILITY_WINDOW_MS);
		expect(report).not.toHaveBeenCalled();
		state.buffering = false;
		jest.advanceTimersByTime(BUFFERING_POLL_MS + STABILITY_WINDOW_MS);
		expect(report).toHaveBeenCalledTimes(1);
	});

	test('cancelling stops a report that is already waiting', () => {
		const {gate, report} = setup([1000, 1400]);
		gate.request();
		gate.cancel();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + STABILITY_WINDOW_MS);
		expect(report).not.toHaveBeenCalled();
	});

	test('asking again restarts the wait rather than stacking reports', () => {
		const {gate, report} = setup([1000, 1400, 1800, 2200]);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS);
		gate.request();
		jest.advanceTimersByTime(READY_DEBOUNCE_MS + STABILITY_WINDOW_MS);
		expect(report).toHaveBeenCalledTimes(1);
	});
});
