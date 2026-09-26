import {renderHook} from '@testing-library/react';

// The real one reaches for ilib, which the test runner cant resolve.
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

// Partly in the library, and requested in 4K as far as Seerr is concerned.
const with4k = (over = {}) => setup({
	hdStatus: 4,
	status4k: 3,
	details: {
		seasons: [{seasonNumber: 1}],
		numberOfSeasons: 1,
		mediaInfo: {seasons: [{seasonNumber: 1, status: 1, status4k: 3}]}
	},
	...over
}).result.current;

describe('4K status', () => {
	test('stays hidden from a viewer who can only request HD', () => {
		const current = with4k();
		expect(current.statusPills.map((p) => p.text)).toEqual(['Partially Available']);
		expect(current.seasonMarkers.has(1)).toBe(false);
	});

	test('shows for a viewer who can request 4K', () => {
		const current = with4k({userPermissions: PERMISSIONS.REQUEST_4K_TV});
		expect(current.statusPills.map((p) => p.text)).toEqual(['HD · Partially Available', '4K · Requested']);
		expect(current.seasonMarkers.get(1)).toBe(3);
	});

	test('shows for a request manager', () => {
		expect(with4k({userPermissions: PERMISSIONS.MANAGE_REQUESTS}).shows4k).toBe(true);
	});

	test('takes the per media type permission too', () => {
		expect(with4k({mediaType: 'movie', userPermissions: PERMISSIONS.REQUEST_4K_TV}).shows4k).toBe(false);
		expect(with4k({mediaType: 'movie', userPermissions: PERMISSIONS.REQUEST_4K_MOVIE}).shows4k).toBe(true);
	});
});
