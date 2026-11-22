// Two letter codes and the older bibliographic three letter codes both appear in
// real files, so everything funnels down to the terminological three letter code
// the settings store.
const LANGUAGE_ALIASES = {
	af: 'afr', ar: 'ara', be: 'bel', bg: 'bul', bn: 'ben', ca: 'cat', cs: 'ces',
	cy: 'cym', da: 'dan', de: 'deu', el: 'ell', en: 'eng', eo: 'epo', es: 'spa',
	et: 'est', fa: 'fas', fi: 'fin', fr: 'fra', gl: 'glg', he: 'heb', hi: 'hin',
	hr: 'hrv', hu: 'hun', id: 'ind', it: 'ita', ja: 'jpn', kk: 'kaz', kn: 'kan',
	ko: 'kor', lt: 'lit', lv: 'lav', mk: 'mkd', ml: 'mal', mn: 'mon', nb: 'nob',
	nl: 'nld', no: 'nor', pa: 'pan', pl: 'pol', pt: 'por', ro: 'ron', ru: 'rus',
	si: 'sin', sk: 'slk', sl: 'slv', sq: 'sqi', sr: 'srp', sv: 'swe', sw: 'swa',
	ta: 'tam', te: 'tel', th: 'tha', tl: 'tgl', tr: 'tur', ug: 'uig', uk: 'ukr',
	vi: 'vie', zh: 'zho',
	alb: 'sqi', arm: 'hye', baq: 'eus', bur: 'mya', chi: 'zho', cze: 'ces',
	dut: 'nld', fre: 'fra', geo: 'kat', ger: 'deu', gre: 'ell', ice: 'isl',
	mac: 'mkd', may: 'msa', mao: 'mri', per: 'fas', rum: 'ron', slo: 'slk',
	tib: 'bod', wel: 'cym'
};

// Every ISO 639 code is two or three letters, so anything else is a placeholder
// like the interface language's "system" rather than a language to match on.
const ISO_CODE = /^[a-z]{2,3}$/;

export const normalizeLanguageCode = (value) => {
	if (!value || typeof value !== 'string') return '';
	const normalized = value.trim().toLowerCase();
	if (!normalized || normalized === 'unknown' || normalized === 'und') return '';
	const primary = normalized.split(/[-_]/)[0];
	if (!ISO_CODE.test(primary)) return '';
	return LANGUAGE_ALIASES[primary] || primary;
};

const TWO_LETTER = Object.keys(LANGUAGE_ALIASES).reduce((map, code) => {
	if (code.length === 2) map[LANGUAGE_ALIASES[code]] = code;
	return map;
}, {});

// The tag for an element's lang attribute. It's what makes the browser draw kanji in their
// Japanese forms rather than the Chinese ones the TV falls back to otherwise (#652).
export const languageTag = (value) => {
	const code = normalizeLanguageCode(value);
	return code ? TWO_LETTER[code] || code : undefined;
};

/**
 * Whether a track is in the language someone asked for. Both sides come down to
 * the same three letter code first, so a track tagged de, deu or ger all answer
 * a preference of German.
 *
 * @param {string} [streamLanguage] - the language tag on the track
 * @param {string} [preferred] - the language that was asked for
 * @returns {boolean}
 */
export const languageMatches = (streamLanguage, preferred) => {
	const wanted = normalizeLanguageCode(preferred);
	if (!wanted) return false;
	return normalizeLanguageCode(streamLanguage) === wanted;
};
