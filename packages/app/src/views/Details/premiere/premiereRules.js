import {ACTIONS, NAVBAR} from '../stage/stageRules';

// Where a press leaves a stop for. The sections run down the page in order. Down from the buttons
// enters the first, Up from the first goes back to the buttons, and the last keeps a Down. Up from
// the buttons goes to the toolbar when it runs along the top, and stays put beside a sidebar, which
// Left already reaches.
export const premiereNeighbour = (stops, from, direction, navbarTop) => {
	if (from === ACTIONS) {
		if (direction === 'down') return stops[0] || null;
		return direction === 'up' && navbarTop ? NAVBAR : null;
	}
	const index = stops.indexOf(from);
	if (index < 0) return null;
	if (direction === 'up') return index > 0 ? stops[index - 1] : ACTIONS;
	return stops[index + 1] || null;
};

// A cell's share of the people and studios panel, by how many letters its names come to, so a long
// list of studios gets the room to sit side by side.
export const factsWeight = (names) => Math.min(60, Math.max(20, names.reduce((sum, name) => sum + name.length, 0)));

// How much the backdrop darkens toward its edges and its foot. The opacity slider deepens it rather
// than blurring the picture, which is the point of this style.
export const premiereDim = (blurAmount) => 0.6 + (Math.min(25, Math.max(0, Number(blurAmount ?? 20))) / 25) * 0.4;

// scrimStyle caches by the layers it's handed, so the same background and dim always hand back the
// same layers rather than baking a new copy for every page opened.
const scrims = new Map();

// Core's two washes over the backdrop, top first: the fade into the page at its foot, and a vignette
// around a point a little above the middle, out to 1.1 times the backdrop's height. `rgb` is the
// page's background.
export const premiereScrim = (rgb, dim) => {
	const key = `${rgb}/${dim}`;
	if (!scrims.has(key)) {
		scrims.set(key, [
			{to: 'top', rgb, stops: [[0.06, 1], [0.42, 0.8 * dim + 0.2], [0.7, 0]]},
			{at: [0.5, 0.35], radius: 1.1, rgb, stops: [[0, 0], [0.65, 0.45 * dim], [1, 0.85 * dim]]}
		]);
	}
	return scrims.get(key);
};
