// Kids Mode strips the app back to what a child needs and locks the way out behind a PIN. The flag
// stays on this TV rather than synced, since a parent handing over the TV shouldn't put their phone
// in Kids Mode too.

export const isKidsMode = (settings) => settings?.kidsModeEnabled === true;

// Nothing should leave the mode on without a PIN, but if anything ever did there'd be no code to
// check and no way to recover on a TV, so the door opens rather than locking for good.
export const kidsModeNeedsPin = (settings) => Boolean(settings?.kidsPinHash);

// Applied on read rather than by rewriting the saved values, so turning the mode off gives the user
// their own details screen back. It also keeps the mode out of the sync payload, which is read from
// the stored settings and would otherwise carry a forced value to the parent's other devices.
const KIDS_MODE_DETAILS = {
	// The stripped back screen, which the mode always shows.
	detailScreenStyle: 'v5',
	detailExpandedTabs: false,
	detailShowTechnicalDetails: false,
	// Named for hiding, so the mode turns it on to leave the description out.
	hideDetailsMediaDescription: true,
	detailUseSeriesThumbnails: false,
	// The online source is an outside catalog no parental rating reaches, so recommendations stay
	// inside the server's own library.
	recommendationSystemSource: 'local'
};

export const kidsModeSettings = (settings) =>
	(isKidsMode(settings) ? {...settings, ...KIDS_MODE_DETAILS} : settings);

// An allow list, so a row added later stays hidden until someone decides a child should see it.
// My Media rather than its small variant, since kids pick a library by its artwork. Continue
// Watching and Next Up read the account's own history, so anything an adult started shows up
// too, and blocked ratings are what hold that back.
const KIDS_MODE_ROWS = ['library-tiles', 'latest-media', 'resume', 'nextup'];

const LIBRARY_ROW = 'library-tiles';

// Ahead of every saved row, which start at zero.
const LEADING_ORDER = -1;

// Applied on read rather than by rewriting the saved rows, so turning the mode off gives the user
// their own layout back untouched.
export const kidsModeRows = (rows, kidsMode) => {
	if (!kidsMode) return rows;

	const kept = (rows || []).filter((row) => KIDS_MODE_ROWS.indexOf(row.id) >= 0);

	// The navbar loses its libraries entry in this mode, so My Media is the only way in and it
	// leads. Switched on in place rather than added again, so it never shows up twice.
	const existing = kept.find((row) => row.id === LIBRARY_ROW);
	if (existing) {
		return kept.map((row) => (
			row === existing ? {...row, enabled: true, order: LEADING_ORDER} : row
		));
	}
	return [{id: LIBRARY_ROW, name: 'My Media', enabled: true, order: LEADING_ORDER}, ...kept];
};

// Kids get one row to carry on from whatever the account chose. Applied on read, like the rows.
export const mergesContinueWatchingNextUp = (settings) =>
	isKidsMode(settings) || Boolean(settings?.mergeContinueWatchingNextUp);

// The only buttons Kids Mode offers besides play and restart. An allow list, so a button added later
// stays out until someone decides a child should have it. Anything that doesn't fit folds into a
// menu, which would hand back everything the mode meant to put away.
const KIDS_MODE_BUTTONS = ['shuffle', 'favorite'];

// The order here is the order on screen. The saved arrangement belongs to the parent, so it isn't
// consulted.
export const kidsModeButtons = (buttons, kidsMode) => {
	if (!kidsMode) return buttons;
	return KIDS_MODE_BUTTONS
		.map((id) => (buttons || []).find((button) => button.id === id))
		.filter(Boolean);
};
