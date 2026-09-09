import {resolveInitialSubtitle, bestSubtitle} from './initialSubtitle';
import {getItemSubtitlePref, getSeriesSubtitlePref} from '../../services/subtitlePrefs';

jest.mock('../../services/subtitlePrefs', () => ({
	getItemSubtitlePref: jest.fn(),
	getSeriesSubtitlePref: jest.fn()
}));

const eng = {index: 1, language: 'eng', isForced: false, isDefault: true};
const engForced = {index: 2, language: 'eng', isForced: true, isBurnIn: true};
const spa = {index: 3, language: 'spa', isForced: false};

const result = (extra) => ({subtitleStreams: [eng, engForced, spa], ...extra});
const item = {Id: 'item-1'};

beforeEach(() => {
	getItemSubtitlePref.mockResolvedValue(undefined);
	getSeriesSubtitlePref.mockResolvedValue(undefined);
});

describe('resolveInitialSubtitle', () => {
	test('forced mode picks the forced track', async () => {
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'forced'});
		expect(picked).toBe(engForced);
	});

	test('forced mode turns subtitles off when nothing is forced', async () => {
		// Leaving the selection alone here lets a full track the file defaults to
		// play instead, which is the opposite of what forced was asked for.
		const picked = await resolveInitialSubtitle({subtitleStreams: [eng, spa]}, item, undefined, {subtitleMode: 'forced'});
		expect(picked).toBeNull();
	});

	test('default mode turns subtitles off when the server names none and nothing is flagged', async () => {
		const streams = [{index: 0, language: 'spa'}, {index: 1, language: 'fre'}];
		const picked = await resolveInitialSubtitle({subtitleStreams: streams}, item, undefined, {subtitleMode: 'default', subtitleLanguage: 'deu'});
		expect(picked).toBeNull();
	});

	test('always mode prefers the default track', async () => {
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'always'});
		expect(picked).toBe(eng);
	});

	test('always mode prefers English when no language is set', async () => {
		const picked = await resolveInitialSubtitle({subtitleStreams: [spa, engForced]}, item, undefined, {subtitleMode: 'always'});
		expect(picked).toBe(engForced);
	});

	test('always mode takes the first track when none is English', async () => {
		const ita = {index: 4, language: 'ita'};
		const picked = await resolveInitialSubtitle({subtitleStreams: [spa, ita]}, item, undefined, {subtitleMode: 'always'});
		expect(picked).toBe(spa);
	});

	test('forced mode prefers the chosen language over the first forced track', async () => {
		const spaForced = {index: 5, language: 'spa', isForced: true};
		const streams = [spaForced, engForced];
		const picked = await resolveInitialSubtitle({subtitleStreams: streams}, item, undefined, {subtitleMode: 'forced', subtitleLanguage: 'eng'});
		expect(picked).toBe(engForced);
	});

	test('default mode follows the server resolved index', async () => {
		const picked = await resolveInitialSubtitle(result({defaultSubtitleStreamIndex: 3}), item, undefined, {subtitleMode: 'default'});
		expect(picked).toBe(spa);
	});

	test('an explicit index wins over the mode', async () => {
		const picked = await resolveInitialSubtitle(result(), item, 3, {subtitleMode: 'forced'});
		expect(picked).toBe(spa);
	});

	test('a negative explicit index means off', async () => {
		const picked = await resolveInitialSubtitle(result(), item, -1, {subtitleMode: 'always'});
		expect(picked).toBeNull();
	});

	test('a remembered item index wins over the mode', async () => {
		getItemSubtitlePref.mockResolvedValue(3);
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'forced'});
		expect(picked).toBe(spa);
	});

	test('a track picked for this playback beats a remembered one', async () => {
		getItemSubtitlePref.mockResolvedValue(3);
		const picked = await resolveInitialSubtitle(result(), item, 1, {subtitleMode: 'forced'});
		expect(picked).toBe(eng);
	});

	test('a track picked for this playback beats a remembered series language', async () => {
		getSeriesSubtitlePref.mockResolvedValue({language: 'spa', title: '', relativeIndex: 0});
		const picked = await resolveInitialSubtitle(result(), {...item, SeriesId: 's1'}, 1, {subtitleMode: 'forced'});
		expect(picked).toBe(eng);
	});

	test('a series remembered as off still yields to a track picked for this playback', async () => {
		getSeriesSubtitlePref.mockResolvedValue({language: 'none', title: '', relativeIndex: 0});
		const picked = await resolveInitialSubtitle(result(), {...item, SeriesId: 's1'}, 1, {subtitleMode: 'forced'});
		expect(picked).toBe(eng);
	});

	test('a remembered off choice means off', async () => {
		getItemSubtitlePref.mockResolvedValue(-1);
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'always'});
		expect(picked).toBeNull();
	});

	test('a remembered index that is gone falls through to the mode', async () => {
		getItemSubtitlePref.mockResolvedValue(99);
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'forced'});
		expect(picked).toBe(engForced);
	});

	test('a remembered series language matches by language', async () => {
		getSeriesSubtitlePref.mockResolvedValue({language: 'spa', title: '', relativeIndex: 0});
		const picked = await resolveInitialSubtitle(result(), {...item, SeriesId: 's1'}, undefined, {subtitleMode: 'forced'});
		expect(picked).toBe(spa);
	});

	test('a remembered series language matches a differently spelled tag', async () => {
		getSeriesSubtitlePref.mockResolvedValue({language: 'es', title: '', relativeIndex: 0});
		const picked = await resolveInitialSubtitle(result(), {...item, SeriesId: 's1'}, undefined, {subtitleMode: 'forced'});
		expect(picked).toBe(spa);
	});

	test('the series preference is only read for episodes of a series', async () => {
		getSeriesSubtitlePref.mockResolvedValue({language: 'spa', title: '', relativeIndex: 0});
		await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'forced'});
		expect(getSeriesSubtitlePref).not.toHaveBeenCalled();
	});

	test('no streams at all turns subtitles off', async () => {
		const picked = await resolveInitialSubtitle({}, item, undefined, {subtitleMode: 'forced'});
		expect(picked).toBeNull();
	});

	test('a mode this client does not know leaves the selection alone', async () => {
		const picked = await resolveInitialSubtitle(result(), item, undefined, {subtitleMode: 'something-new'});
		expect(picked).toBeUndefined();
	});

	test('turning pgs rendering off stops a bitmap track winning the tie', async () => {
		const streams = [
			{index: 1, language: 'eng', codec: 'subrip'},
			{index: 2, language: 'eng', codec: 'PGSSUB'}
		];
		const settings = {subtitleMode: 'always', subtitleLanguage: 'eng'};

		expect(await resolveInitialSubtitle({subtitleStreams: streams}, item, undefined, settings)).toBe(streams[1]);
		expect(await resolveInitialSubtitle({subtitleStreams: streams}, item, undefined, {...settings, enablePgsRendering: false})).toBe(streams[0]);
	});
});

describe('bestSubtitle', () => {
	const forced = (index, language, extra) => ({index, language, isForced: true, ...extra});

	test('takes the chosen language over the first one listed', () => {
		const list = [forced(1, 'spa'), forced(2, 'eng'), forced(3, 'fre')];
		expect(bestSubtitle(list, 'fre')).toBe(list[2]);
	});

	test('falls back to English when the chosen language is absent', () => {
		const list = [forced(1, 'spa'), forced(2, 'eng')];
		expect(bestSubtitle(list, 'jpn')).toBe(list[1]);
	});

	test('matches a two letter code against a three letter track', () => {
		const list = [forced(1, 'spa'), forced(2, 'deu')];
		expect(bestSubtitle(list, 'de')).toBe(list[1]);
	});

	test('keeps list order when nothing matches', () => {
		const list = [forced(1, 'spa'), forced(2, 'ita')];
		expect(bestSubtitle(list, 'jpn')).toBe(list[0]);
	});

	test('pushes a commentary track below ordinary dialogue', () => {
		const list = [forced(1, 'eng', {displayTitle: 'English Commentary'}), forced(2, 'eng', {displayTitle: 'English'})];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});

	test('the file default breaks a tie', () => {
		const list = [forced(1, 'eng'), forced(2, 'eng', {isDefault: true})];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});

	test('language still beats the file default', () => {
		const list = [forced(1, 'spa', {isDefault: true}), forced(2, 'fre')];
		expect(bestSubtitle(list, 'fre')).toBe(list[1]);
	});

	test('keeps the file\'s own track above an external download', () => {
		const list = [forced(1, 'eng', {isExternal: true}), forced(2, 'eng')];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});

	test('pushes a hearing impaired track below the plain one', () => {
		const list = [forced(1, 'eng', {displayTitle: 'English SDH'}), forced(2, 'eng', {displayTitle: 'English'})];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});

	test('prefers full subtitles over forced ones when both are offered', () => {
		const list = [{index: 1, language: 'eng', isForced: true}, {index: 2, language: 'eng'}];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});

	test('language still beats every later level', () => {
		const list = [forced(1, 'eng', {isExternal: true, displayTitle: 'English SDH'}), forced(2, 'spa')];
		expect(bestSubtitle(list, 'eng')).toBe(list[0]);
	});

	test('an empty list has no answer', () => {
		expect(bestSubtitle([], 'eng')).toBeUndefined();
	});

	test('a format the player renders itself wins a tie', () => {
		const list = [{index: 1, language: 'eng', codec: 'subrip'}, {index: 2, language: 'eng', codec: 'ass'}];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
		expect(bestSubtitle(list, 'eng', {assDirectPlay: false})).toBe(list[0]);
	});

	test('hearing impaired rises to the top when it is asked for', () => {
		const list = [{index: 1, language: 'eng'}, {index: 2, language: 'eng', isHearingImpaired: true}];
		expect(bestSubtitle(list, 'eng', {preferSdh: true})).toBe(list[1]);
		expect(bestSubtitle(list, 'eng')).toBe(list[0]);
	});

	test('a track delivered externally counts as external', () => {
		const list = [{index: 1, language: 'eng', deliveryMethod: 'External'}, {index: 2, language: 'eng'}];
		expect(bestSubtitle(list, 'eng')).toBe(list[1]);
	});
});

describe('flagged candidates', () => {
	const flagged = (streams, preferred, extra) => bestSubtitle(streams, preferred, {subtitleMode: 'flagged', ...extra});

	test('only flagged tracks are on the table', () => {
		const list = [{index: 1, language: 'spa'}, {index: 2, language: 'spa', isDefault: true}];
		expect(flagged(list, 'spa')).toBe(list[1]);
	});

	test('nothing flagged and nothing to fall back on leaves it alone', () => {
		expect(flagged([{index: 1, language: 'spa'}], 'spa')).toBeUndefined();
	});

	test('English joins in when neither chosen language is in the file', () => {
		const list = [{index: 1, language: 'spa'}, {index: 2, language: 'eng'}];
		expect(flagged(list, 'jpn', {fallbackLanguage: 'kor'})).toBe(list[1]);
	});

	test('English stays out when the chosen language is there to be flagged', () => {
		const list = [{index: 1, language: 'eng'}, {index: 2, language: 'jpn'}];
		expect(flagged(list, 'jpn')).toBeUndefined();
	});
});
