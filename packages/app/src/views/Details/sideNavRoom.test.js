import {sideNavRoom, sideOffsetClass} from './sideNavRoom';

describe('sideNavRoom', () => {
	test('keeps the rail for the classic sidebar and any style this app does not know', () => {
		expect(sideNavRoom({navbarPosition: 'left', sidebarStyle: 'classic'})).toBe('rail');
		expect(sideNavRoom({navbarPosition: 'left', sidebarStyle: 'future'})).toBe('rail');
		expect(sideNavRoom({navbarPosition: 'left'})).toBe('rail');
	});

	test('keeps only the control\'s room for Reel and Mosaic, and nothing for a bar along the top', () => {
		expect(sideNavRoom({navbarPosition: 'left', sidebarStyle: 'reel'})).toBe('control');
		expect(sideNavRoom({navbarPosition: 'left', sidebarStyle: 'mosaic'})).toBe('control');
		expect(sideNavRoom({navbarPosition: 'top', sidebarStyle: 'reel'})).toBe(null);
	});

	test('picks the page\'s class for the room, and none where the page has no class for it', () => {
		const css = {sidebarOffset: 'rail', controlOffset: 'control'};
		expect(sideOffsetClass('rail', css)).toBe('rail');
		expect(sideOffsetClass('control', css)).toBe('control');
		expect(sideOffsetClass(null, css)).toBe('');
		expect(sideOffsetClass('control', {sidebarOffset: 'rail'})).toBe('');
	});
});
