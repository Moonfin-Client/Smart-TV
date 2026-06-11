export const sameVolatileItem = (a, b) =>
	a === b || (
		Boolean(a && b) &&
		a.Id === b.Id &&
		a.UserData?.PlayedPercentage === b.UserData?.PlayedPercentage &&
		a.UserData?.Played === b.UserData?.Played &&
		a.UserData?.LastPlayedDate === b.UserData?.LastPlayedDate
	);

export const mergeRowPreservingRefs = (prevRow, nextRow) => {
	if (!prevRow) return nextRow;
	const prevItems = prevRow.items || [];
	const nextItems = nextRow.items || [];
	if (prevItems.length === nextItems.length) {
		let identical = true;
		for (let i = 0; i < nextItems.length; i++) {
			if (!sameVolatileItem(prevItems[i], nextItems[i])) {
				identical = false;
				break;
			}
		}
		if (identical) return prevRow;
	}
	const prevById = new Map();
	prevItems.forEach((item) => prevById.set(item.Id, item));
	const mergedItems = nextItems.map((item) => {
		const prev = prevById.get(item.Id);
		return prev && sameVolatileItem(prev, item) ? prev : item;
	});
	return {...nextRow, items: mergedItems};
};
