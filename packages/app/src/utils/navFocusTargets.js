import Spotlight from '@enact/spotlight';

// Leaving the navigation means handing focus to whatever view is mounted, and
// only that view knows which container it uses. Rather than ask, both
// navigations walk this list in order and take the first one that exists.
export const CONTENT_FOCUS_TARGETS = [
	'featured-banner',
	'row-0',
	'categories-view',
	'category-view',
	'subcategory-view',
	'options-view',
	'homerows-view',
	'libraries-view',
	'favorites-active-tab',
	'favorites-grid',
	'genres-grid',
	'genre-browse-grid',
	'library-letter-hash',
	'library-grid',
	'person-grid',
	'discover-row-0',
	'seerr-browse-grid',
	'hub-tabs',
	'action-buttons',
	'details-primary-btn',
	'details-favorite-btn',
	'person-overview',
	'person-action-favorite',
	'search-input',
	'livetv-guide',
	'calendar-view',
	'calendar-month-view'
];

// The sidebar enters the details screen from the side, where the whole button
// row is the natural landing spot. The top bar comes down onto it and wants an
// individual button instead, so it skips this extra entry.
const detailsRowIndex = CONTENT_FOCUS_TARGETS.indexOf('action-buttons') + 1;
export const SIDEBAR_CONTENT_FOCUS_TARGETS = [
	...CONTENT_FOCUS_TARGETS.slice(0, detailsRowIndex),
	'details-action-buttons',
	...CONTENT_FOCUS_TARGETS.slice(detailsRowIndex)
];

// Falls back to a plain directional move when no known container is mounted.
export const focusFirstContentTarget = (targets, fallbackDirection) => {
	for (const target of targets) {
		if (Spotlight.focus(target)) return;
	}
	Spotlight.setPointerMode(false);
	Spotlight.move(fallbackDirection);
};

// What held focus in the content when focus moved into the sidebar. Pressing
// right out of the rail goes back there, so leaving a row to peek at the nav
// doesn't throw the user back to the first card of the first row.
let sidebarReturnTarget = null;

export const rememberSidebarReturn = (node) => {
	sidebarReturnTarget = node || null;
};

// The remembered node only counts while it's still on screen. One from a view that was swapped out
// or hidden behind another panel has no offsetParent.
export const focusContentFromSidebar = () => {
	const node = sidebarReturnTarget;
	sidebarReturnTarget = null;
	if (node && node.offsetParent !== null && Spotlight.focus(node)) return;
	focusFirstContentTarget(SIDEBAR_CONTENT_FOCUS_TARGETS, 'right');
};
