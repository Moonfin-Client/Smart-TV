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

// Override blocks come off, and so does whatever a \p tag draws, which is a shape's coordinates
// rather than words. The split puts each block at an odd index.
const assLineText = (text) => {
	let drawing = false;
	return text.split(/(\{[^}]*\})/).map((part, i) => {
		if (i % 2 === 0) return drawing ? '' : part;
		const modes = part.match(/\\p\d+/g);
		if (modes) drawing = parseInt(modes[modes.length - 1].slice(2), 10) > 0;
		return '';
	}).join('').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ').trim();
};

// ASS keeps its lines as Dialogue entries, with the text last so it can hold commas of its own.
const parseAss = (text) => text.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:')).map((line) => {
	const fields = line.substring('Dialogue:'.length).split(',');
	const body = assLineText(fields.slice(9).join(','));
	return {StartPositionTicks: assTicks(fields[1] || ''), EndPositionTicks: assTicks(fields[2] || ''), Text: body};
}).filter((event) => event.Text && event.StartPositionTicks != null && event.EndPositionTicks != null);

// AVPlay ends every cue with a carriage return and a NUL and breaks lines with <br>. The stray
// returns turn into blank lines between cues the TV runs together, so only the words are kept (#669).
export const avplaySubtitleText = (text) => String(text || '')
	.replace(/\u0000/g, '')
	.split(/\r\n|\r|\n|<br\s*\/?>/i)
	.map((line) => line.trim())
	.filter(Boolean)
	.join('\n');

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
