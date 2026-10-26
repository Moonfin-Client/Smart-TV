// A sidecar SRT, WebVTT or ASS file as the timed lines the subtitle overlay draws, for servers that hand out the file as it is.

const TIMING = /(\d+:)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+:)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

const ticks = (hours, minutes, secs, fraction) =>
	((parseInt(hours || '0', 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(secs, 10)) * 1000 +
		parseInt(fraction.padEnd(3, '0'), 10)) * 10000;

const ASS_TIME = /^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/;

const assTicks = (value) => {
	const m = ASS_TIME.exec(value.trim());
	return m ? ticks(m[1], m[2], m[3], m[4]) : null;
};

// ASS keeps its lines as Dialogue entries, with the text last so it can hold commas of its own.
const parseAss = (text) => text.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:')).map((line) => {
	const fields = line.substring('Dialogue:'.length).split(',');
	const body = fields.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').trim();
	return {StartPositionTicks: assTicks(fields[1] || ''), EndPositionTicks: assTicks(fields[2] || ''), Text: body};
}).filter((event) => event.Text && event.StartPositionTicks != null && event.EndPositionTicks != null);

export const parseSubtitleText = (text) => {
	if (/^\s*\[Script Info\]/m.test(String(text || ''))) return parseAss(String(text));
	const events = [];
	String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach((block) => {
		const lines = block.split('\n');
		const at = lines.findIndex((line) => TIMING.test(line));
		if (at < 0) return;
		const m = TIMING.exec(lines[at]);
		const body = lines.slice(at + 1).join('\n')
			.replace(/<[^>]+>/g, '')
			.replace(/\{\\[^}]*\}/g, '')
			.trim();
		if (!body) return;
		events.push({
			StartPositionTicks: ticks(m[1] && m[1].slice(0, -1), m[2], m[3], m[4]),
			EndPositionTicks: ticks(m[5] && m[5].slice(0, -1), m[6], m[7], m[8]),
			Text: body
		});
	});
	return events;
};
