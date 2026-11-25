// The server counts a season with nothing unplayed as played, and a season that isn't in the
// library has nothing unplayed by definition, so the ones it lists as Virtual come back played
// as well. Only something really in the library gets the mark.
export const showsWatchedCheck = (item) =>
	Boolean(item?.UserData?.Played) && item?.LocationType !== 'Virtual';
