// Free public domain books for Discover: Open Library subjects for a books library and LibriVox
// genres for an audiobooks library.

import {cleanOverview} from '../../utils/overviewText';

const PAGE_SIZE = 24;
const TIMEOUT = 12000;

export const BOOK_SUBJECTS_KEY = 'book_discover_subjects';
export const AUDIOBOOK_GENRES_KEY = 'book_discover_audiobook_genres';
export const DEFAULT_BOOK_SUBJECTS = ['fantasy', 'romance', 'science_fiction'];
export const DEFAULT_AUDIOBOOK_GENRES = ['Science Fiction', 'Fantasy Fiction', 'Mystery & Detective Stories'];

export const BOOK_SUBJECT_POOL = [
	'architecture', 'art__art_instruction', 'history_of_art__art__design_styles', 'dance', 'design', 'fashion', 'film',
	'graphic_design', 'music', 'music_theory', 'painting__paintings', 'photography', 'bears', 'cats', 'kittens', 'dogs',
	'puppies', 'fiction', 'romance', 'fantasy', 'mystery_and_detective_stories', 'magic', 'literature', 'plays',
	'short_stories', 'young_adult_fiction', 'sciencemathematics', 'biology', 'chemistry', 'mathematics', 'physics',
	'programming', 'business', 'management', 'entrepreneurship', 'business__economics', 'success_in_business', 'finance',
	'mystery', 'science_fiction', 'juvenile_fiction', 'juvenile_literature', 'stories_in_rhyme', 'infancy', 'bedtime',
	'picture_books', 'history', 'ancient_civilization', 'archaeology', 'anthropology', 'cooking', 'cookbooks',
	'mental_health', 'exercise', 'nutrition', 'self-help', 'biography', 'autobiography', 'religion', 'political_science',
	'psychology', 'place%3Abrazil', 'place%3Aindia', 'place%3Aindonesia', 'place%3Aunited_states', 'textbooks',
	'historical_fiction', 'thriller', 'horror', 'poetry'
];

const SUBJECT_LABELS = {
	'art__art_instruction': 'Art Instruction',
	'history_of_art__art__design_styles': 'Art History',
	'painting__paintings': 'Painting',
	'mystery_and_detective_stories': 'Mystery and Detective Stories',
	'young_adult_fiction': 'Young Adult',
	'sciencemathematics': 'Science & Mathematics',
	'business__economics': 'Business Economics',
	'success_in_business': 'Business Success',
	'juvenile_fiction': "Children's",
	'juvenile_literature': 'Kids Books',
	'stories_in_rhyme': 'Stories in Rhyme',
	'place%3Abrazil': 'Brazil',
	'place%3Aindia': 'India',
	'place%3Aindonesia': 'Indonesia',
	'place%3Aunited_states': 'United States'
};

export const AUDIOBOOK_GENRE_POOL = [
	'Action & Adventure', 'Adventure Fiction', 'Biography & Autobiography', "Children's Fiction", 'Classical',
	'Detective Fiction', 'Drama', 'Fantasy Fiction', 'General Fiction', 'General Non-fiction', 'Historical Fiction',
	'Horror & Supernatural Fiction', 'Humor', 'Humorous Fiction', 'Mystery & Detective Stories', 'Mythology', 'Nature',
	'Naval Fiction', 'Philosophy', 'Plays', 'Poetry', 'Religion', 'Romance', 'Satire', 'Science Fiction',
	'Short Stories', 'Travel & Geography', 'Tragedy', 'War & Military Fiction', 'Westerns'
];

// An Open Library slug as words, `science_fiction` as Science Fiction. LibriVox genres are names already.
export const subjectLabel = (subject) => {
	if (SUBJECT_LABELS[subject]) return SUBJECT_LABELS[subject];
	if (!/_|%3A/i.test(subject) && /[A-Z ]/.test(subject)) return subject;
	return decodeURIComponent(subject).replace(/_+/g, ' ').replace(/:/g, ' ').split(/\s+/).filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Kept to the pool and in label order, or the defaults when nothing's kept.
export const pickedSubjects = (stored, pool, defaults) => {
	const kept = Array.isArray(stored) ? pool.filter((subject) => stored.includes(subject)) : [];
	return (kept.length ? kept : defaults).slice().sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b)));
};

const getJson = (url) => Promise.race([
	fetch(url).then((res) => {
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}),
	new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))
]);

const query = (params) => Object.keys(params).map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&');

export const openLibraryBook = (doc) => {
	const title = String(doc.title || '').trim();
	const author = (doc.author_name || []).map((name) => String(name).trim()).find(Boolean) ||
		(doc.authors || []).map((a) => String(a.name || '').trim()).find(Boolean) || '';
	const cover = doc.cover_i ?? doc.cover_id;
	return {
		id: doc.key || `${title}::${author}`,
		source: 'openLibrary',
		title,
		author,
		year: doc.first_publish_year || null,
		coverUrl: cover != null ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : null,
		workKey: String(doc.key || '').indexOf('/works/') === 0 ? doc.key : null,
		tags: (doc.subject || []).slice(0, 8)
	};
};

const personName = (person) => {
	const display = String(person.display_name || '').trim();
	return display || [person.first_name, person.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
};

export const librivoxBook = (book) => {
	const archive = String(book.url_iarchive || '').trim().replace(/\/+$/, '');
	const identifier = archive ? archive.split('/').pop() : '';
	return {
		id: `librivox:${book.id}`,
		source: 'librivox',
		title: String(book.title || '').trim(),
		author: (book.authors || []).map(personName).find(Boolean) || '',
		year: parseInt(book.copyright_year, 10) || null,
		coverUrl: identifier ? `https://archive.org/services/img/${identifier}` : null,
		overview: cleanOverview(book.description) || null,
		tags: (book.genres || []).map((genre) => String(genre.name || '').trim()).filter(Boolean),
		readers: (book.readers || []).map(personName).filter(Boolean),
		sections: parseInt(book.num_sections, 10) || null,
		seconds: parseInt(book.totaltimesecs, 10) || 0
	};
};

const openLibrarySearch = (params) => getJson(`https://openlibrary.org/search.json?${query({
	...params, limit: PAGE_SIZE, fields: 'key,title,author_name,cover_i,first_publish_year,subject'
})}`).then((data) => (data.docs || []).map(openLibraryBook).filter((book) => book.title));

const librivoxFeed = (params) => getJson(`https://librivox.org/api/feed/audiobooks/?${query({format: 'json', extended: 1, limit: PAGE_SIZE, ...params})}`)
	.then((data) => (data.books || []).map(librivoxBook).filter((book) => book.title));

// A subject's trending books, or a genre's most popular audiobooks.
export const loadSubject = (subject, audio) => (audio
	? librivoxFeed({genre: subject, sort_field: 'popularity', sort_order: 'desc'})
	: openLibrarySearch({q: `subject_key:"${decodeURIComponent(subject)}"`, sort: 'trending'}));

// What a typed search finds: Open Library for books, LibriVox titles starting with it for audiobooks.
export const searchDiscover = (text, audio) => (audio ? librivoxFeed({title: `^${text}`}) : openLibrarySearch({q: text}));

// The overview and subjects Open Library keeps on the work, which a search leaves out. LibriVox
// sends its description with the book.
export const loadDiscoverDetails = (book) => {
	if (book.source !== 'openLibrary' || !book.workKey) return Promise.resolve(book);
	return getJson(`https://openlibrary.org${book.workKey}.json`).then((work) => {
		const description = typeof work.description === 'string' ? work.description : work.description?.value;
		return {
			...book,
			overview: description ? cleanOverview(String(description).split(/\r?\n-{3,}/)[0]) : null,
			tags: (work.subjects || book.tags || []).slice(0, 10)
		};
	}, () => book);
};
