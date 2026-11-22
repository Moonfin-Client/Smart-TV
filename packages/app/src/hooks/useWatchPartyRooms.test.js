import {renderHook} from '@testing-library/react';

jest.mock('@enact/spotlight', () => ({__esModule: true, default: {getCurrent: jest.fn(), focus: jest.fn()}}));
jest.mock('../services/siloWatchParty', () => ({watchParty: {}, mergePartyRooms: jest.fn(), syncPlayGroupFrom: jest.fn()}));
jest.mock('../services/syncPlay', () => ({listGroups: jest.fn()}));

import Spotlight from '@enact/spotlight';
import {isWatchTogetherOpen, useWatchTogetherReturn} from './useWatchPartyRooms';

describe('useWatchTogetherReturn', () => {
	let row;

	beforeEach(() => {
		row = document.createElement('div');
		row.setAttribute('data-spotlight-id', 'setting-openWatchParties');
		document.body.appendChild(row);
		Spotlight.getCurrent.mockReturnValue(row);
		Spotlight.focus.mockClear();
	});

	afterEach(() => row.remove());

	const render = (open, toPlayer = false) => renderHook((props) => useWatchTogetherReturn(props.open, props.toPlayer),
		{initialProps: {open, toPlayer}});

	test('closing goes back to what opened it, and Settings leaves Back alone only while it is open', () => {
		const {rerender} = render(false);
		expect(isWatchTogetherOpen()).toBe(false);
		rerender({open: true, toPlayer: false});
		expect(isWatchTogetherOpen()).toBe(true);
		expect(Spotlight.focus).not.toHaveBeenCalled();
		rerender({open: false, toPlayer: false});
		expect(Spotlight.focus).toHaveBeenCalledWith(row);
		expect(isWatchTogetherOpen()).toBe(false);
	});

	test('a close for the party\'s player leaves focus to the player', () => {
		const {rerender} = render(true);
		rerender({open: false, toPlayer: true});
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('an opener that has gone from the page is left alone', () => {
		const {rerender} = render(true);
		row.remove();
		rerender({open: false, toPlayer: false});
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});
});
