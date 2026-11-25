import $L from '../services/i18n.js';

// Servers label a track with an ISO code, sometimes two letters and sometimes three, and the two
// three letter sets disagree for a handful of languages so both spellings appear in the wild.
//
// Intl.DisplayNames would do this in one line but it landed long after the browsers these sets
// ship with, so the common languages are listed and anything else falls back to the code itself.
const NAMES = {
	ar: 'Arabic', ara: 'Arabic',
	bg: 'Bulgarian', bul: 'Bulgarian',
	bn: 'Bengali', ben: 'Bengali',
	ca: 'Catalan', cat: 'Catalan',
	cs: 'Czech', cze: 'Czech', ces: 'Czech',
	da: 'Danish', dan: 'Danish',
	de: 'German', ger: 'German', deu: 'German',
	el: 'Greek', gre: 'Greek', ell: 'Greek',
	en: 'English', eng: 'English',
	es: 'Spanish', spa: 'Spanish',
	et: 'Estonian', est: 'Estonian',
	fa: 'Persian', per: 'Persian', fas: 'Persian',
	fi: 'Finnish', fin: 'Finnish',
	fr: 'French', fre: 'French', fra: 'French',
	he: 'Hebrew', heb: 'Hebrew',
	hi: 'Hindi', hin: 'Hindi',
	hr: 'Croatian', hrv: 'Croatian',
	hu: 'Hungarian', hun: 'Hungarian',
	id: 'Indonesian', ind: 'Indonesian',
	is: 'Icelandic', ice: 'Icelandic', isl: 'Icelandic',
	it: 'Italian', ita: 'Italian',
	ja: 'Japanese', jpn: 'Japanese',
	ko: 'Korean', kor: 'Korean',
	lt: 'Lithuanian', lit: 'Lithuanian',
	lv: 'Latvian', lav: 'Latvian',
	ms: 'Malay', may: 'Malay', msa: 'Malay',
	nb: 'Norwegian', nob: 'Norwegian', no: 'Norwegian', nor: 'Norwegian',
	nl: 'Dutch', dut: 'Dutch', nld: 'Dutch',
	pl: 'Polish', pol: 'Polish',
	pt: 'Portuguese', por: 'Portuguese',
	ro: 'Romanian', rum: 'Romanian', ron: 'Romanian',
	ru: 'Russian', rus: 'Russian',
	sk: 'Slovak', slo: 'Slovak', slk: 'Slovak',
	sl: 'Slovenian', slv: 'Slovenian',
	sr: 'Serbian', srp: 'Serbian',
	sv: 'Swedish', swe: 'Swedish',
	ta: 'Tamil', tam: 'Tamil',
	te: 'Telugu', tel: 'Telugu',
	th: 'Thai', tha: 'Thai',
	tr: 'Turkish', tur: 'Turkish',
	uk: 'Ukrainian', ukr: 'Ukrainian',
	vi: 'Vietnamese', vie: 'Vietnamese',
	zh: 'Chinese', chi: 'Chinese', zho: 'Chinese'
};

export const languageName = (code) => {
	if (!code) return null;
	// A track can carry a region, and the region says nothing about which language it is.
	const key = String(code).trim().toLowerCase().split(/[-_]/)[0];
	if (!key) return null;
	if (key === 'und') return $L('Undetermined');
	return NAMES[key] || key.toUpperCase();
};
