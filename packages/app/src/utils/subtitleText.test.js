import {parseSubtitleText} from './subtitleText';

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
