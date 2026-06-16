const DEFAULT_GLOW = '74, 90, 120';

const GENRE_TONES = {
	'horror': '138, 15, 26',
	'thriller': '46, 111, 176',
	'mystery': '59, 78, 140',
	'crime': '90, 43, 43',
	'sci-fi': '224, 178, 58',
	'science fiction': '224, 178, 58',
	'fantasy': '106, 63, 176',
	'romance': '200, 92, 142',
	'comedy': '224, 138, 46',
	'animation': '47, 168, 160',
	'family': '63, 168, 92',
	'documentary': '110, 122, 82',
	'drama': '122, 82, 48',
	'action': '192, 69, 30',
	'adventure': '176, 122, 46',
	'war': '92, 90, 62',
	'western': '154, 90, 34',
	'music': '176, 63, 138',
	'history': '138, 106, 58',
	'kids': '63, 160, 200',
	'reality': '176, 144, 58'
};

export const genreGlowRgb = (genres) => {
	if (!Array.isArray(genres)) return DEFAULT_GLOW;

	for (const genre of genres) {
		const normalized = (genre || '').trim().toLowerCase();
		if (!normalized) continue;

		if (GENRE_TONES[normalized]) return GENRE_TONES[normalized];

		for (const key in GENRE_TONES) {
			if (normalized.includes(key)) return GENRE_TONES[key];
		}
	}
	return DEFAULT_GLOW;
};
