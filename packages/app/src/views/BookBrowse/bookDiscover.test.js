import {librivoxBook, openLibraryBook, pickedSubjects, subjectLabel} from './bookDiscover';

describe('Discover', () => {
	test('labels a subject slug as words, and leaves a LibriVox genre as it is', () => {
		expect(subjectLabel('science_fiction')).toBe('Science Fiction');
		expect(subjectLabel('juvenile_fiction')).toBe("Children's");
		expect(subjectLabel('place%3Aindia')).toBe('India');
		expect(subjectLabel('Mystery & Detective Stories')).toBe('Mystery & Detective Stories');
	});

	test('keeps the picked subjects that are in the list, in label order, or the defaults', () => {
		const pool = ['fantasy', 'romance', 'horror'];
		expect(pickedSubjects(['romance', 'gone', 'fantasy'], pool, ['horror'])).toEqual(['fantasy', 'romance']);
		expect(pickedSubjects(null, pool, ['romance', 'horror'])).toEqual(['horror', 'romance']);
	});

	test('reads an Open Library search result', () => {
		expect(openLibraryBook({key: '/works/OL1W', title: ' Dracula ', author_name: ['Bram Stoker'], cover_i: 42, first_publish_year: 1897}))
			.toMatchObject({id: '/works/OL1W', source: 'openLibrary', title: 'Dracula', author: 'Bram Stoker', year: 1897, coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg', workKey: '/works/OL1W'});
	});

	test('reads a LibriVox book, with its cover from the Internet Archive', () => {
		const book = librivoxBook({
			id: '449', title: 'Treasure Island', description: '<p>Pirates.</p>', copyright_year: '1883', num_sections: '34', totaltimesecs: 25200,
			authors: [{first_name: 'Robert Louis', last_name: 'Stevenson'}], readers: [{display_name: 'Adrian Praetzellis'}],
			genres: [{name: 'Action & Adventure'}], url_iarchive: 'http://www.archive.org/details/treasure_island_librivox/'
		});
		expect(book).toMatchObject({
			id: 'librivox:449', source: 'librivox', author: 'Robert Louis Stevenson', year: 1883, overview: 'Pirates.', sections: 34, seconds: 25200,
			readers: ['Adrian Praetzellis'], tags: ['Action & Adventure'], coverUrl: 'https://archive.org/services/img/treasure_island_librivox'
		});
	});
});
