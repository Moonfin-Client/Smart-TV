import {createElement} from 'react';
import {act, render} from '@testing-library/react';

let mockListener = null;
let mockCurrent = {room: null, chat: []};
jest.mock('../services/siloWatchParty', () => ({
	watchParty: {
		state: () => mockCurrent,
		subscribe: (fn) => {
			mockListener = fn;
			return () => {
				mockListener = null;
			};
		}
	}
}));

import useWatchParty from './useWatchParty';

const emit = (next) => act(() => {
	mockCurrent = next;
	mockListener(next);
});

// App, and the player under it, re-rendered on every chat line, reaction and toast.
test('a selector leaves the children alone unless the part it picked changes', () => {
	const room = {roomId: 'r1'};
	let childPaints = 0;
	let picked = null;
	const Child = () => {
		childPaints++;
		return null;
	};
	const Parent = () => {
		picked = useWatchParty((state) => state.room);
		return createElement(Child);
	};
	render(createElement(Parent));
	emit({room, chat: []});
	const settledCount = childPaints;
	emit({room, chat: [{text: 'hi'}]});
	emit({room, chat: [{text: 'hi'}, {text: 'yo'}], toast: {kind: 'joined'}});
	expect(childPaints).toBe(settledCount);
	expect(picked).toBe(room);
	emit({room: {roomId: 'r2'}, chat: []});
	expect(picked).toEqual({roomId: 'r2'});
	expect(childPaints).toBe(settledCount + 1);
});
