import {streamTokenReplaced} from './playback';

jest.mock('./jellyfinApi', () => ({}));
jest.mock('./deviceProfile', () => ({}));
jest.mock('./video', () => ({}));
jest.mock('./storage', () => ({}));
jest.mock('./serverLogger', () => ({}));
jest.mock('./systemVolume', () => ({}));
jest.mock('../platform', () => ({isTizen: () => false, isVega: () => false, isXbox: () => false}));

describe('a Silo stream\'s token', () => {
	const url = 'http://silo:8090/api/v2/stream/7/original?file=1&token=old%2Btoken';

	test('is replaced once the session holds another token', () => {
		expect(streamTokenReplaced(url, 'http://silo:8090/', 'new-token')).toBe(true);
	});

	test('is current while the session holds the same one', () => {
		expect(streamTokenReplaced(url, 'http://silo:8090', 'old+token')).toBe(false);
	});

	test('isn\'t judged for a stream from another server, or one with no token', () => {
		expect(streamTokenReplaced(url, 'http://other:8090', 'new-token')).toBe(false);
		expect(streamTokenReplaced('http://silo:8090/api/v2/stream/7/original', 'http://silo:8090', 'new-token')).toBe(false);
		expect(streamTokenReplaced(undefined, 'http://silo:8090', 'new-token')).toBe(false);
	});
});
