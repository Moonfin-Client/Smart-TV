import Spotlight from '@enact/spotlight';
import {SIDEBAR_CONTENT_FOCUS_TARGETS, focusContentFromSidebar, rememberSidebarReturn} from './navFocusTargets';

jest.mock('@enact/spotlight', () => ({focus: jest.fn(), move: jest.fn(), setPointerMode: jest.fn()}));

// jsdom lays nothing out, so offsetParent is always null there. A card counts as
// on screen here when it's given one, and like in a browser it has none once it's removed.
const card = ({shown = true} = {}) => {
	const node = document.createElement('div');
	document.body.appendChild(node);
	Object.defineProperty(node, 'offsetParent', {get: () => (shown && document.body.contains(node) ? document.body : null)});
	return node;
};

beforeEach(() => {
	jest.clearAllMocks();
	rememberSidebarReturn(null);
	document.body.innerHTML = '';
});

describe('focusContentFromSidebar', () => {
	it('goes back to the card that had focus before the sidebar', () => {
		const node = card();
		Spotlight.focus.mockImplementation(target => target === node);
		rememberSidebarReturn(node);
		focusContentFromSidebar();
		expect(Spotlight.focus).toHaveBeenCalledTimes(1);
		expect(Spotlight.focus).toHaveBeenCalledWith(node);
	});

	it('falls back to the first content target once the card is gone', () => {
		const node = card();
		rememberSidebarReturn(node);
		node.remove();
		Spotlight.focus.mockImplementation(target => target === SIDEBAR_CONTENT_FOCUS_TARGETS[1]);
		focusContentFromSidebar();
		expect(Spotlight.focus).not.toHaveBeenCalledWith(node);
		expect(Spotlight.focus).toHaveBeenLastCalledWith(SIDEBAR_CONTENT_FOCUS_TARGETS[1]);
	});

	it('falls back when the card sits in a hidden view', () => {
		const node = card({shown: false});
		rememberSidebarReturn(node);
		Spotlight.focus.mockReturnValue(false);
		focusContentFromSidebar();
		expect(Spotlight.focus).not.toHaveBeenCalledWith(node);
		expect(Spotlight.move).toHaveBeenCalledWith('right');
	});

	it('goes back to the card on browsers without isConnected', () => {
		const node = card();
		Object.defineProperty(node, 'isConnected', {value: undefined});
		Spotlight.focus.mockImplementation(target => target === node);
		rememberSidebarReturn(node);
		focusContentFromSidebar();
		expect(Spotlight.focus).toHaveBeenCalledWith(node);
	});

	it('uses the remembered card only once', () => {
		const node = card();
		Spotlight.focus.mockImplementation(target => target === node);
		rememberSidebarReturn(node);
		focusContentFromSidebar();
		focusContentFromSidebar();
		expect(Spotlight.focus.mock.calls.filter(([t]) => t === node)).toHaveLength(1);
	});
});
