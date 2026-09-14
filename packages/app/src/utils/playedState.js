// Whether a card should carry the watched checkmark.
//
// The server reports Played for a season or series with nothing unplayed in it, and a
// season that isn't in the library at all (a "missing" season the server lists as
// Virtual when it's set to show missing items) has nothing unplayed by definition, so
// it comes back Played too. Drawing the checkmark on those makes seasons you don't own
// look watched, which is Moonfin-Client/Smart-TV#412. Only something actually on disk
// gets the mark.
export const showsWatchedCheck = (item) =>
	Boolean(item?.UserData?.Played) && item?.LocationType !== 'Virtual';
