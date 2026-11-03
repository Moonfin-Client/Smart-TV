import $L from '@enact/i18n/$L';

import {parseServerDate} from '../../../utils/serverDate';
import {uiLocale} from '../../../utils/uiLocale';
import {premiereNeighbour} from '../premiere/premiereRules';

// The drawer's spotlight container, which App brings focus back into.
export const QUICK_LOOK_ID = 'quick-look';

// Play, four circles and the ellipsis are what fit across the drawer, and the viewer's own button
// count can lower that but never lift it.
export const QUICK_LOOK_BUTTON_CAP = 6;

// Where a press leaves a row of the drawer for. Down from the buttons runs the tracks, the seasons
// and Open full page in that order, Up walks back to the buttons, and Up from the buttons stays.
export const quickLookNeighbour = (stops, from, direction) => premiereNeighbour(stops, from, direction, false);

// Core's drawer surface, the page's background with 3% of its text color over it. Both are rgb
// triplets, and so is what comes back.
export const quickLookSurface = (background, onBackground) => {
	const bg = background.split(',').map(Number);
	const fg = onBackground.split(',').map(Number);
	return bg.map((channel, i) => Math.round(channel + (fg[i] - channel) * 0.03)).join(', ');
};

// scrimStyle caches by the layers it's handed, so each surface keeps one copy of its fade rather
// than a new one every time the drawer draws.
const fades = new Map();

// The backdrop's fade into the drawer, clear for its top 40% and the drawer's own color at its foot.
export const quickLookFade = (rgb) => {
	if (!fades.has(rgb)) fades.set(rgb, [{to: 'bottom', rgb, stops: [[0.4, 0], [1, 1]]}]);
	return fades.get(rgb);
};

// Who made it and when it came out, a column each, up to four.
export const quickLookFacts = (item, showsSection) => {
	const people = showsSection('crew') ? item.People || [] : [];
	const first = (type) => people.find((person) => person.Type === type)?.Name;
	const released = parseServerDate(item.PremiereDate);
	return [
		{label: $L('Director'), value: first('Director')},
		{label: $L('Writer'), value: first('Writer')},
		{label: $L('Studio'), value: showsSection('studios') ? item.Studios?.[0]?.Name : null},
		// A premiere date is midnight UTC, so it's read in UTC to stay on its day west of it.
		{label: $L('Release Date'), value: released && released.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'})}
	].filter((fact) => fact.value);
};

// The gap between season cards, in this app's 1920 wide pixels.
export const SEASON_GAP = 13.4;

// How a season card is sized against the row: up to three share its width, and past that the
// fourth peeks in from the edge to say there are more. `parts` is how many cards a row's width is
// split into once `gaps` gaps are taken off it.
export const seasonCardShare = (count) => (count <= 3
	? {parts: count, gaps: count - 1}
	: {parts: 3.3, gaps: 2});
