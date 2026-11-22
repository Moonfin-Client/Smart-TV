import {render} from '@testing-library/react';

import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle, seerrTitleStatus} from './SeerrStatusBanner';
import {MEDIA_STATUS} from '../../utils/seerrStatus';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => '', getApiKey: () => '', getTokenParam: () => ''}));

const seerrTitle = (overrides = {}) => ({
	Id: 'seerr-movie-603',
	Type: 'Movie',
	mediaInfo: {},
	_seerr: true,
	_seerrType: 'item',
	_seerrMediaType: 'movie',
	...overrides
});

describe('seerrBadgeStyle', () => {
	it('reads badge for settings from before the style existed', () => {
		expect(seerrBadgeStyle({})).toBe('badge');
		expect(seerrBadgeStyle({showSeerrAvailabilityBadges: true, seerrBadgeStyle: 'something'})).toBe('badge');
	});

	it('reads banner when picked', () => {
		expect(seerrBadgeStyle({seerrBadgeStyle: 'banner'})).toBe('banner');
	});

	it('is off when the switch is off, whatever the style', () => {
		expect(seerrBadgeStyle({showSeerrAvailabilityBadges: false, seerrBadgeStyle: 'banner'})).toBeNull();
	});
});

describe('seerrTitleStatus', () => {
	it('gives nothing for a title nobody has requested', () => {
		expect(seerrTitleStatus(seerrTitle())).toBeNull();
		expect(seerrTitleStatus(seerrTitle({mediaInfo: undefined}))).toBeNull();
		expect(seerrTitleStatus(seerrTitle({mediaInfo: {status: MEDIA_STATUS.UNKNOWN}}))).toBeNull();
	});

	it('passes a known status through', () => {
		expect(seerrTitleStatus(seerrTitle({mediaInfo: {status: MEDIA_STATUS.PENDING}}))).toBe(MEDIA_STATUS.PENDING);
	});

	it('gives nothing for library items, outside list titles and Seerr tiles', () => {
		expect(seerrTitleStatus({Id: 'lib', Type: 'Movie'})).toBeNull();
		expect(seerrTitleStatus(seerrTitle({_external: true}))).toBeNull();
		expect(seerrTitleStatus(seerrTitle({_seerrType: 'genre'}))).toBeNull();
	});
});

it('only counts the statuses a dot is drawn for', () => {
	expect([1, 2, 3, 4, 5, 6, 7, null].filter(hasSeerrDot)).toEqual([2, 3, 4, 5]);
});

describe('SeerrStatusBanner', () => {
	const banner = () => document.querySelector('[class~="banner"]');

	it('takes the status color', () => {
		const {rerender} = render(<SeerrStatusBanner status={MEDIA_STATUS.PARTIALLY_AVAILABLE} />);
		expect(banner().textContent).toBe('PARTIALLY AVAILABLE');
		expect(banner().className).toContain('available');

		rerender(<SeerrStatusBanner status={MEDIA_STATUS.PENDING} />);
		expect(banner().textContent).toBe('PENDING');
		expect(banner().className).toContain('pending');

		rerender(<SeerrStatusBanner status={MEDIA_STATUS.PROCESSING} />);
		expect(banner().textContent).toBe('REQUESTED');
		expect(banner().className).toContain('processing');
	});

	it('shrinks a label too wide for the poster', () => {
		const offset = jest.spyOn(window.HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
		const client = jest.spyOn(window.HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);
		try {
			render(<SeerrStatusBanner status={MEDIA_STATUS.PARTIALLY_AVAILABLE} />);
			expect(document.querySelector('[class~="label"]').style.transform).toBe('translateX(-50%) scale(0.75)');
		} finally {
			offset.mockRestore();
			client.mockRestore();
		}
	});
});
