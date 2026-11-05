import {
	canKeepAsComplete, completeShowingOptions, isExtendedSupported, offersCompleteShowing,
	requestCompleteShowing, scheduleSuggestedShowing
} from '../services/incompleteRecordings';
import {
	RECORD_CHOICE, RECORD_OUTCOME, descriptionsDiffer, laterShowingWhen, recordAiring, recordAiringMessage,
	recordPromptChannel
} from './recordAiring';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../services/incompleteRecordings', () => ({
	RECORD_PROMPT_GRACE_MS: 60000,
	canKeepAsComplete: jest.fn(),
	completeShowingOptions: jest.fn(),
	isExtendedSupported: jest.fn(),
	offersCompleteShowing: jest.fn(),
	requestCompleteShowing: jest.fn(),
	scheduleSuggestedShowing: jest.fn()
}));

const MINUTE = 60000;
const startedAgo = (minutes) => new Date(Date.now() - (minutes * MINUTE));
const program = (start) => ({
	Id: 'p1',
	Name: 'Jeopardy!',
	StartDate: start.toISOString(),
	EndDate: new Date(start.getTime() + (30 * MINUTE)).toISOString(),
	Overview: 'Tournament of Champions',
	ParentIndexNumber: 42,
	IndexNumber: 7
});

const run = (start, overrides = {}) => {
	const createTimer = jest.fn().mockResolvedValue();
	const prompt = jest.fn().mockResolvedValue(overrides.choice ?? null);
	const setLoading = jest.fn();
	const result = recordAiring({program: program(start), start, createTimer, prompt, setLoading, ...overrides});
	return {result, createTimer, prompt, setLoading};
};

beforeEach(() => {
	jest.clearAllMocks();
	canKeepAsComplete.mockReturnValue(true);
	isExtendedSupported.mockReturnValue(false);
	offersCompleteShowing.mockReturnValue(false);
	requestCompleteShowing.mockResolvedValue(true);
	scheduleSuggestedShowing.mockResolvedValue(true);
});

describe('the Record prompt helpers', () => {
	test('a channel reads as its number and name, skipping what is missing', () => {
		expect(recordPromptChannel('16.1', 'WPTODT')).toBe('16.1 WPTODT');
		expect(recordPromptChannel(null, ' WPTODT ')).toBe('WPTODT');
		expect(recordPromptChannel('', null)).toBe('');
	});

	test('descriptions only differ when both say something different', () => {
		expect(descriptionsDiffer('Same  Thing', 'same thing')).toBe(false);
		expect(descriptionsDiffer('', 'anything')).toBe(false);
		expect(descriptionsDiffer('One plot', 'Another plot')).toBe(true);
	});

	test('a later showing is named by its time, Tomorrow, its weekday or its date', () => {
		const now = new Date(2026, 9, 28, 10, 0);
		expect(laterShowingWhen(new Date(2026, 9, 28, 20, 0), '12-hour', now)).toBe('8:00 PM');
		expect(laterShowingWhen(new Date(2026, 9, 29, 20, 0), '12-hour', now)).toBe('Tomorrow');
		expect(laterShowingWhen(new Date(2026, 9, 31, 20, 0), '12-hour', now)).toBe('Saturday');
		expect(laterShowingWhen(new Date(2026, 10, 9, 20, 0), '12-hour', now)).toBe('Nov 9');
	});
});

describe('recording an airing', () => {
	test('a program caught on time records without asking', async () => {
		const {result, createTimer, prompt} = run(startedAgo(0));
		expect(await result).toBe(RECORD_OUTCOME.recorded);
		expect(createTimer).toHaveBeenCalled();
		expect(prompt).not.toHaveBeenCalled();
	});

	test('a started episode offers a search when the plugin has no showing to suggest', async () => {
		offersCompleteShowing.mockReturnValue(true);
		const {result, createTimer, prompt} = run(startedAgo(10), {choice: RECORD_CHOICE.both});
		expect(await result).toBe(RECORD_OUTCOME.recordedWithLaterShowing);
		expect(prompt.mock.calls[0][0]).toMatchObject({suggestion: null, searchForCompleteShowing: true, programName: 'Jeopardy!'});
		expect(createTimer).toHaveBeenCalled();
		expect(requestCompleteShowing).toHaveBeenCalledWith('p1');
	});

	test('the plugin answer decides the match, and only the future showing can be booked', async () => {
		isExtendedSupported.mockReturnValue(true);
		offersCompleteShowing.mockReturnValue(true);
		const showing = {start: new Date(Date.now() + 86400000), description: 'Tournament of Champions'};
		completeShowingOptions.mockResolvedValue({canSearch: false, showing, answered: true});
		const {result, createTimer, prompt, setLoading} = run(startedAgo(10), {choice: RECORD_CHOICE.later});
		expect(await result).toBe(RECORD_OUTCOME.laterShowingOnly);
		expect(setLoading.mock.calls).toEqual([[true], [false]]);
		expect(prompt.mock.calls[0][0]).toMatchObject({suggestion: showing, searchForCompleteShowing: false});
		expect(createTimer).not.toHaveBeenCalled();
		expect(scheduleSuggestedShowing).toHaveBeenCalledWith('p1', showing);
	});

	test('a movie the plugin can search for gets the prompt without episode numbers', async () => {
		isExtendedSupported.mockReturnValue(true);
		completeShowingOptions.mockResolvedValue({canSearch: true, showing: null, answered: true});
		const {result, prompt} = run(startedAgo(10), {choice: RECORD_CHOICE.now});
		expect(await result).toBe(RECORD_OUTCOME.recorded);
		expect(prompt.mock.calls[0][0]).toMatchObject({suggestion: null, searchForCompleteShowing: true});
	});

	test('Back on the prompt records nothing', async () => {
		offersCompleteShowing.mockReturnValue(true);
		const {result, createTimer} = run(startedAgo(10));
		expect(await result).toBe(RECORD_OUTCOME.cancelled);
		expect(createTimer).not.toHaveBeenCalled();
	});

	test('a screen that moved on while the plugin was asked records nothing', async () => {
		isExtendedSupported.mockReturnValue(true);
		completeShowingOptions.mockResolvedValue({canSearch: true, showing: null, answered: true});
		const {result, createTimer, prompt} = run(startedAgo(10), {stillValid: () => false});
		expect(await result).toBe(RECORD_OUTCOME.cancelled);
		expect(prompt).not.toHaveBeenCalled();
		expect(createTimer).not.toHaveBeenCalled();
	});

	test('a plugin that never answers falls back on the episode numbers after three seconds', async () => {
		jest.useFakeTimers();
		isExtendedSupported.mockReturnValue(true);
		offersCompleteShowing.mockReturnValue(true);
		completeShowingOptions.mockReturnValue(new Promise(() => {}));
		const {result, prompt} = run(startedAgo(10), {choice: RECORD_CHOICE.now});
		await jest.advanceTimersByTimeAsync(3000);
		expect(await result).toBe(RECORD_OUTCOME.recorded);
		expect(prompt.mock.calls[0][0]).toMatchObject({suggestion: null, searchForCompleteShowing: true});
		jest.useRealTimers();
	});

	test('a failed request for the future showing still leaves the recording running', async () => {
		offersCompleteShowing.mockReturnValue(true);
		requestCompleteShowing.mockResolvedValue(false);
		const {result} = run(startedAgo(10), {choice: RECORD_CHOICE.both});
		expect(await result).toBe(RECORD_OUTCOME.recordedLaterShowingFailed);
	});

	test('each outcome has its toast, and a cancel has none', () => {
		expect(recordAiringMessage(RECORD_OUTCOME.cancelled)).toBe(null);
		expect(recordAiringMessage(RECORD_OUTCOME.laterShowingOnlyFailed)).toBe("Couldn't request the future showing, so nothing will be recorded.");
	});
});
