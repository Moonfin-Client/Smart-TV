import {act, renderHook} from '@testing-library/react';

// The real one reaches for ilib, which the test runner can't resolve.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));

import useSeerrRequests from './useSeerrRequests';
import {PERMISSIONS} from '../../services/seerrApi';

// A series nobody owns or has asked for.
const setup = (over = {}) => renderHook(() => useSeerrRequests({
	mediaId: 1,
	mediaType: 'tv',
	details: {seasons: [{seasonNumber: 1}], numberOfSeasons: 1, mediaInfo: null},
	setDetails: () => {},
	setError: () => {},
	isAuthenticated: true,
	userPermissions: PERMISSIONS.REQUEST,
	currentUserId: 7,
	is4kEnabled: false,
	hdStatus: 1,
	status4k: 1,
	...over
}));

describe('seerr request gate', () => {
	test('offers a request on the permission alone', () => {
		expect(setup().result.current.canRequestHd).toBe(true);
	});

	test('says no without the permission', () => {
		expect(setup({userPermissions: PERMISSIONS.NONE}).result.current.canRequestHd).toBe(false);
		expect(setup({userPermissions: null}).result.current.canRequestHd).toBe(false);
	});

	test('says no when the viewer is not signed in to seerr', () => {
		expect(setup({isAuthenticated: false}).result.current.canRequestHd).toBe(false);
	});

	test('takes the per media type permission too', () => {
		expect(setup({userPermissions: PERMISSIONS.REQUEST_TV}).result.current.canRequestHd).toBe(true);
		expect(setup({userPermissions: PERMISSIONS.REQUEST_MOVIE}).result.current.canRequestHd).toBe(false);
	});
});

describe('seerr request sheet', () => {
	const bothTracks = {userPermissions: PERMISSIONS.REQUEST | PERMISSIONS.REQUEST_4K, is4kEnabled: true};

	test('one control over both tracks starts on HD with a quality switch', () => {
		const {result} = setup(bothTracks);
		act(() => result.current.handleRequestChoose());
		expect(result.current.requestDialog).toEqual({is4k: false, qualityToggle: true});
	});

	test('a track of its own asks for that track alone', () => {
		const {result} = setup(bothTracks);
		act(() => result.current.handleRequestTrack(true));
		expect(result.current.requestDialog).toEqual({is4k: true, qualityToggle: false});
	});

	test('BACK is left to the sheet, which closes itself', () => {
		const {result} = setup();
		act(() => result.current.handleRequestChoose());
		let handled;
		act(() => { handled = result.current.closeTopPopup(); });
		expect(handled).toBe(true);
		expect(result.current.requestDialog).not.toBeNull();
	});
});
