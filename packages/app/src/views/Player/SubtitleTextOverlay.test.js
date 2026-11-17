// Nothing is drawn here, so the JSX runtime from the CLI's second copy of React is never needed
jest.mock('react/jsx-dev-runtime', () => ({}));

import {languageStyle} from './SubtitleTextOverlay';

describe('a subtitle line', () => {
	it('puts the Japanese face ahead of a picked font only on a Japanese line', () => {
		const picked = {fontSize: '36px', fontFamily: "'Moonfin Subtitles Lato', 'Roboto', 'Sandstone', sans-serif"};
		expect(languageStyle(picked, 'ja')).toEqual({...picked, fontFamily: `'NotoSansJP', ${picked.fontFamily}`});
		expect(languageStyle(picked, 'en')).toBe(picked);
	});

	it('leaves a Japanese line with no picked font to the stylesheet', () => {
		const style = {fontFamily: undefined};
		expect(languageStyle(style, 'ja')).toBe(style);
	});
});
