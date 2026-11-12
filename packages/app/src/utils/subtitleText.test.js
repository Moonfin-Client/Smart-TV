import {avplaySubtitleText, parseSubtitleText} from './subtitleText';

test('keeps only the words of the cues AVPlay hands over', () => {
	expect(avplaySubtitleText('One line\r\u0000')).toBe('One line');
	expect(avplaySubtitleText('Line one<br>Line two\r\u0000')).toBe('Line one\nLine two');
	expect(avplaySubtitleText('First cue\r\u0000<br>Second cue\r\u0000')).toBe('First cue\nSecond cue');
	expect(avplaySubtitleText('First cue\r\n\r\n\nSecond cue')).toBe('First cue\nSecond cue');
	expect(avplaySubtitleText('\r\u0000')).toBe('');
	expect(avplaySubtitleText(null)).toBe('');
});

test('reads SRT blocks with their numbers, tags and line breaks', () => {
	const srt = '\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Hello</i>\r\nthere\r\n\r\n2\r\n01:02:03,040 --> 01:02:04,000\r\nBye\r\n';
	expect(parseSubtitleText(srt)).toEqual([
		{StartPositionTicks: 15000000, EndPositionTicks: 30000000, Text: 'Hello\nthere'},
		{StartPositionTicks: 37230400000, EndPositionTicks: 37240000000, Text: 'Bye'}
	]);
});

test('reads WebVTT cues without hours and skips the header', () => {
	const vtt = 'WEBVTT\n\nNOTE made by hand\n\ncue-1\n00:05.250 --> 00:06.000 align:start\nLine\n';
	expect(parseSubtitleText(vtt)).toEqual([{StartPositionTicks: 52500000, EndPositionTicks: 60000000, Text: 'Line'}]);
});

test('reads ASS dialogue with commas in the text and drops the styling', () => {
	const ass = '[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.50,0:00:02.00,Default,,0,0,0,,{\\i1}Well, hi\\Nthere\n';
	expect(parseSubtitleText(ass)).toEqual([{StartPositionTicks: 15000000, EndPositionTicks: 20000000, Text: 'Well, hi\nthere'}]);
});

test('leaves out what a \\p tag draws and reads a hard space as a space', () => {
	const ass = '[Script Info]\n\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Sign,,0,0,0,,{\\p1}m 0 0 l 10 0 10 10{\\p0}Open\\hlate{\\p2}m 5 5 b 1 1 2 2 3 3\nDialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,{\\p1}m 0 0 l 10 0\n';
	expect(parseSubtitleText(ass)).toEqual([{StartPositionTicks: 10000000, EndPositionTicks: 20000000, Text: 'Open late'}]);
});
