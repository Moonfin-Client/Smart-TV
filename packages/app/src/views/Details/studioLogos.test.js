import {normalizeStudioName, studioLogoIndex, studioLogoUrlFor, studioCardsFor} from './studioLogos';

const SERVER = 'https://tv.example';
const TOKEN = 'tok';
const logo = (id) => `${SERVER}/Moonfin/Tmdb/StudioImage/${id}?api_key=${TOKEN}`;
const index = (companies) => studioLogoIndex(companies, SERVER, TOKEN);

describe('normalizeStudioName', () => {
	it('drops the punctuation and spacing the two lists disagree on', () => {
		expect(normalizeStudioName('Warner Bros. Pictures')).toBe('warnerbrospictures');
		expect(normalizeStudioName('20th Century-Fox')).toBe('20thcenturyfox');
		expect(normalizeStudioName(null)).toBe('');
	});
});

describe('studioLogoIndex', () => {
	it('leaves out the companies with no logo', () => {
		expect(studioLogoUrlFor('Nothing', index([{id: 1, name: 'Nothing', hasLogo: false}]))).toBeNull();
	});

	it('keeps the first of two companies that normalize the same', () => {
		const built = index([{id: 1, name: 'Apple TV', hasLogo: true}, {id: 2, name: 'Apple TV+', hasLogo: true}]);
		expect(studioLogoUrlFor('Apple TV+', built)).toBe(logo(2));
		expect(studioLogoUrlFor('Apple tv', built)).toBe(logo(1));
	});
});

describe('studioLogoUrlFor', () => {
	it('matches an exact name first', () => {
		expect(studioLogoUrlFor('Netflix', index([{id: 7, name: 'Netflix', hasLogo: true}]))).toBe(logo(7));
	});

	it('matches past a difference in punctuation', () => {
		expect(studioLogoUrlFor('Warner Bros Pictures', index([{id: 8, name: 'Warner Bros. Pictures', hasLogo: true}]))).toBe(logo(8));
	});

	it('will not match a name that only shares its middle', () => {
		expect(studioLogoUrlFor('Netflix', index([{id: 9, name: 'X', hasLogo: true}]))).toBeNull();
	});

	it('takes the longest of the names that share a start', () => {
		const built = index([{id: 1, name: 'BBC', hasLogo: true}, {id: 2, name: 'BBC Studios', hasLogo: true}]);
		expect(studioLogoUrlFor('BBC Studios Production', built)).toBe(logo(2));
	});

	it('has nothing to offer without an index', () => {
		expect(studioLogoUrlFor('Netflix', null)).toBeNull();
	});
});

describe('studioCardsFor', () => {
	it('lists every library studio, logo or not', () => {
		const built = index([{id: 3, name: 'Netflix', hasLogo: true}]);
		expect(studioCardsFor([{Id: 's1', Name: 'Netflix'}, {Name: 'Unknown Co'}], built)).toEqual([
			{key: 's1', name: 'Netflix', logo: logo(3)},
			{key: 'Unknown Co', name: 'Unknown Co', logo: null}
		]);
	});
});
