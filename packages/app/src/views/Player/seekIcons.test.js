import {
	seekBackIcon, seekForwardIcon, IconRewind, IconForward,
	IconReplay5, IconReplay10, IconReplay30, IconForward5, IconForward10, IconForward30
} from './PlayerConstants';

// Only which icon gets picked is checked here, so nothing renders and the framework stays out of it.
jest.mock('react/jsx-dev-runtime', () => ({Fragment: 'Fragment', jsxDEV: () => null}));
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);

describe('the seek button icons', () => {
	it('show the skip length for 5, 10 and 30 seconds', () => {
		expect(seekBackIcon(5)).toBe(IconReplay5);
		expect(seekBackIcon(10)).toBe(IconReplay10);
		expect(seekBackIcon(30)).toBe(IconReplay30);
		expect(seekForwardIcon(5)).toBe(IconForward5);
		expect(seekForwardIcon(10)).toBe(IconForward10);
		expect(seekForwardIcon(30)).toBe(IconForward30);
	});

	it('keep the plain arrows for any other length', () => {
		expect(seekBackIcon(15)).toBe(IconRewind);
		expect(seekBackIcon(7.5)).toBe(IconRewind);
		expect(seekForwardIcon(60)).toBe(IconForward);
		expect(seekForwardIcon(undefined)).toBe(IconForward);
	});
});
