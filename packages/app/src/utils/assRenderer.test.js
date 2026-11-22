// Stands in for SubtitlesOctopus, keeping what it was started with and what it was handed after.
jest.mock('libass-wasm', () => function FakeOctopus(options) {
	this.options = options;
	this.setTrack = jest.fn();
});

import {assTimelineEvents, initAssCanvasRenderer as startOnCanvas, scaleAssFontSizes, setAssFontScale} from './assRenderer';

const SCRIPT = [
	'[Script Info]',
	'PlayResY: 360',
	'',
	'[V4+ Styles]',
	'Format: Name, Fontname, Fontsize, PrimaryColour, Outline, Shadow',
	'Style: Default,Arial,20,&H00FFFFFF,2,1',
	'Style: Sign,Arial,32.5,&H00FFFFFF,0,0',
	'',
	'[Events]',
	'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
	'Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\fs40\\fscx120\\fsp2}Big{\\fs18} small\\Nnext',
	'Dialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,{\\pos(10,20)\\p1}m 0 0 l 100 0 100 100{\\p0}Shop',
	''
].join('\r\n');

describe('scaleAssFontSizes', () => {
	test('hands the script back byte for byte at the default size', () => {
		expect(scaleAssFontSizes(SCRIPT, 1)).toBe(SCRIPT);
	});

	test('scales every style size and \\fs tag, and nothing else', () => {
		const scaled = scaleAssFontSizes(SCRIPT, 1.5).split('\r\n');
		expect(scaled[5]).toBe('Style: Default,Arial,30,&H00FFFFFF,2,1');
		expect(scaled[6]).toBe('Style: Sign,Arial,48.75,&H00FFFFFF,0,0');
		expect(scaled[10]).toBe('Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\fs60\\fscx120\\fsp2}Big{\\fs27} small\\Nnext');
		expect(scaled[11]).toBe('Dialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,{\\pos(10,20)\\p1}m 0 0 l 100 0 100 100{\\p0}Shop');
		expect(scaled.length).toBe(SCRIPT.split('\r\n').length);
	});

	test('finds the size wherever the Format line puts it', () => {
		const script = '[V4 Styles]\nFormat: Name, Fontsize, Fontname\nStyle: Default,24,Arial\n';
		expect(scaleAssFontSizes(script, 0.5)).toBe('[V4 Styles]\nFormat: Name, Fontsize, Fontname\nStyle: Default,12,Arial\n');
	});
});

describe('the ASS canvas renderer', () => {
	const start = () => startOnCanvas(document.createElement('canvas'), 'https://server/Stream.ass', [], null);

	beforeEach(() => {
		setAssFontScale(null, 1);
		window.fetch = jest.fn(() => Promise.resolve({ok: true, text: () => Promise.resolve(SCRIPT)}));
	});

	test('starts from the script it read, at the size the setting asks for', async () => {
		setAssFontScale(null, 2);
		const octopus = await start();

		expect(window.fetch).toHaveBeenCalledWith('https://server/Stream.ass');
		expect(octopus.options.subUrl).toBeUndefined();
		expect(octopus.options.subContent).toBe(scaleAssFontSizes(SCRIPT, 2));
	});

	test('hands the default size the script exactly as the server sent it', async () => {
		const octopus = await start();
		expect(octopus.options.subContent).toBe(SCRIPT);
	});

	test('draws the track on screen again when the size changes, and only then', async () => {
		const octopus = await start();

		setAssFontScale(octopus, 1);
		expect(octopus.setTrack).not.toHaveBeenCalled();
		setAssFontScale(octopus, 0.75);
		expect(octopus.setTrack).toHaveBeenCalledWith(scaleAssFontSizes(SCRIPT, 0.75));
		setAssFontScale(octopus, 0.75);
		expect(octopus.setTrack).toHaveBeenCalledTimes(1);
	});

	test("lets the worker read the URL itself when the script can't be read here", async () => {
		window.fetch = jest.fn(() => Promise.reject(new Error('offline')));
		const octopus = await start();

		expect(octopus.options.subUrl).toBe('https://server/Stream.ass');
		expect(octopus.options.subContent).toBeUndefined();
		expect(assTimelineEvents(octopus)).toBeNull();
	});

	test('lists the dialogue for the offset timeline without tags or drawings', async () => {
		const octopus = await start();

		expect(assTimelineEvents(octopus)).toEqual([
			{StartPositionTicks: 10000000, EndPositionTicks: 25000000, Text: 'Big small\nnext'},
			{StartPositionTicks: 30000000, EndPositionTicks: 40000000, Text: 'Shop'}
		]);
		expect(assTimelineEvents(octopus)).toBe(assTimelineEvents(octopus));
		expect(assTimelineEvents(null)).toBeNull();
	});
});
