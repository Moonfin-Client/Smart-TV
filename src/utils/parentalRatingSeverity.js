// Ranks an official rating so grouped libraries can list categories from
// mildest to strongest instead of alphabetically. Servers hand back whatever
// the metadata provider used, so the table covers the common boards and the
// numeric fallback handles the systems that just name a minimum age.

const ALL_AGES = 10;
const YOUNG_CHILDREN = 20;
const GUIDANCE = 30;
const TEEN = 40;
const MATURE = 50;
const ADULTS_ONLY = 60;

// A rating the table doesn't know sorts after everything recognized but before
// the explicitly unrated bucket, so an unfamiliar board still lands somewhere
// stable.
const UNRECOGNIZED = 500;
const RATING_UNRATED = 999;

const EXACT_SEVERITIES = {
	'UNRATED': RATING_UNRATED,
	'NOT RATED': RATING_UNRATED,
	'NR': RATING_UNRATED,
	'UR': RATING_UNRATED,
	'UNKNOWN': RATING_UNRATED,
	'OTHER': RATING_UNRATED,

	'G': ALL_AGES,
	'TV-G': ALL_AGES,
	'TV-Y': ALL_AGES,
	'Y': ALL_AGES,
	'E': ALL_AGES,
	'EC': ALL_AGES,
	'U': ALL_AGES,
	'AL': ALL_AGES,
	'APPROVED': ALL_AGES,
	'PASSED': ALL_AGES,

	'PG': YOUNG_CHILDREN,
	'TV-Y7': YOUNG_CHILDREN,
	'TV-Y7-FV': YOUNG_CHILDREN,
	'E10+': YOUNG_CHILDREN,
	'6': YOUNG_CHILDREN,
	'7': YOUNG_CHILDREN,

	'TV-PG': GUIDANCE,
	'PG-12': GUIDANCE,
	'10': GUIDANCE,
	'12': GUIDANCE,
	'12A': GUIDANCE,

	'PG-13': TEEN,
	'TV-14': TEEN,
	'T': TEEN,
	'13': TEEN,
	'14': TEEN,
	'14A': TEEN,
	'15': TEEN,
	'15A': TEEN,
	'16': TEEN,

	'R': MATURE,
	'TV-MA': MATURE,
	'M': MATURE,
	'MA': MATURE,
	'MA15+': MATURE,
	'18': MATURE,
	'18+': MATURE,
	'R18': MATURE,

	'NC-17': ADULTS_ONLY,
	'R-18': ADULTS_ONLY,
	'AO': ADULTS_ONLY,
	'X': ADULTS_ONLY,
	'XXX': ADULTS_ONLY
};

// Lower is milder. Ratings the table misses fall back to the minimum age named
// in the string, and then to the unrecognized slot.
export const parentalRatingSeverity = (rating) => {
	const normalized = (rating || '').toUpperCase().trim();
	if (!normalized) return RATING_UNRATED;

	const exact = EXACT_SEVERITIES[normalized];
	if (exact !== undefined) return exact;

	// Board variants the table can't enumerate. Y7 is checked first so it
	// doesn't read as TV-Y.
	if (normalized.indexOf('Y7') !== -1) return YOUNG_CHILDREN;
	if (normalized.indexOf('TV-Y') !== -1) return ALL_AGES;
	if (normalized.indexOf('TV-MA') !== -1 || normalized.indexOf('RESTRICTED') !== -1) return MATURE;

	// Numeric boards name the minimum age outright, so slot them between the
	// named tiers rather than lumping them together.
	const digits = normalized.match(/\d+/);
	const age = digits ? parseInt(digits[0], 10) : null;
	if (age !== null) {
		if (age <= 6) return ALL_AGES + 5;
		if (age <= 10) return YOUNG_CHILDREN + 5;
		if (age <= 12) return GUIDANCE + 2;
		if (age <= 15) return TEEN + 2;
		if (age <= 17) return MATURE + 2;
		return ADULTS_ONLY + 2;
	}

	return UNRECOGNIZED;
};

// The unrecognized and unrated slots only exist so those labels sort somewhere stable. They say
// nothing about how strong a rating is, so anything deciding by severity leaves them out.
export const isRankedRatingSeverity = (severity) =>
	severity !== UNRECOGNIZED && severity !== RATING_UNRATED;
