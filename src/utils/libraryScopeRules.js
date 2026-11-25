// Which libraries a query may touch. Access is what the admin granted the account through
// EnableAllFolders and EnabledFolders, which the server enforces on every user scoped endpoint, so
// reading it here is only a second opinion. Visibility is what the user hid from My Media through
// MyMediaExcludes, which neither server applies to a recursive query, so a row that sweeps the
// whole server narrows the search itself. Visibility fails open, since showing a row beats showing
// an empty one and nothing here guards anything the server wouldn't already refuse.

// Collection types that can hold each item type, so a search only visits the libraries worth
// visiting. A library that declares no type holds anything, so it's always worth a look.
const LIBRARY_TYPES_BY_ITEM_TYPE = {
	Movie: 'movies',
	Series: 'tvshows',
	Episode: 'tvshows',
	BoxSet: 'boxsets'
};

// Types that don't live under a library at all, so narrowing to libraries would find none of
// them. Asking every library for a person returns nothing from all of them.
const LIBRARY_LESS_TYPES = ['Person'];

const parseItemTypes = (includeItemTypes) => {
	if (Array.isArray(includeItemTypes)) return includeItemTypes.filter(Boolean);
	if (typeof includeItemTypes === 'string' && includeItemTypes) return includeItemTypes.split(',');
	return [];
};

const isLibraryLess = (includeItemTypes) => {
	const types = parseItemTypes(includeItemTypes);
	return types.length > 0 && types.every((type) => LIBRARY_LESS_TYPES.indexOf(type) >= 0);
};

const wantedCollectionTypes = (includeItemTypes) => {
	const wanted = [];
	parseItemTypes(includeItemTypes).forEach((type) => {
		const collection = LIBRARY_TYPES_BY_ITEM_TYPE[type];
		if (collection && wanted.indexOf(collection) < 0) wanted.push(collection);
	});
	return wanted;
};

const viewHoldsTypes = (collectionType, wanted) => {
	const type = String(collectionType || '').toLowerCase();
	// No type means it holds anything, and nothing wanted means everything is worth a look.
	if (!type || wanted.length === 0) return true;
	return wanted.indexOf(type) >= 0;
};

// Library ids the account is allowed to see, or null when the policy places no restriction. Null
// is everything, never nothing.
export const permittedFromPolicy = (policy) => {
	if (!policy || policy.EnableAllFolders) return null;

	const blocked = policy.BlockedMediaFolders || [];
	const allowed = (policy.EnabledFolders || [])
		.filter((id) => id && blocked.indexOf(id) < 0);

	// An empty allow list with EnableAllFolders off would mean no library at all, which is almost
	// always a parse problem rather than intent. Defer to the server instead of blanking the app.
	return allowed.length === 0 ? null : allowed;
};

// Synced picks come back with dashes while the policy lists ids without them, so both are
// compared bare.
export const bareId = (id) => String(id).replace(/-/g, '').toLowerCase();

export const keepPermitted = (ids, permitted) => {
	if (!permitted) return [...(ids || [])];
	const allowed = permitted.map(bareId);
	return (ids || []).filter((id) => allowed.indexOf(bareId(id)) >= 0);
};

// The libraries to search, or null when one sweep of the server is still right.
export const scopeLibraries = ({views, excludes, permitted, includeItemTypes}) => {
	if (!excludes || excludes.length === 0) return null;
	if (isLibraryLess(includeItemTypes)) return null;

	const wanted = wantedCollectionTypes(includeItemTypes);
	const ids = (views || [])
		.filter((view) => view.Id && excludes.indexOf(view.Id) < 0)
		.filter((view) => !permitted || permitted.indexOf(view.Id) >= 0)
		.filter((view) => viewHoldsTypes(view.CollectionType, wanted))
		.map((view) => view.Id);

	// Nothing left to search would empty the row, so let the sweep stand and show something.
	return ids.length === 0 ? null : ids;
};

const readString = (item, key) => {
	const value = item && item[key];
	return value === undefined || value === null ? '' : String(value);
};

const readNumber = (item, key) => {
	const value = item && item[key];
	if (typeof value === 'number') return value;
	const parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

// Each library ordered only its own share, so a merged list needs the sort redone before it can be
// cut back to one row's worth. A sort this can't reproduce comes back as nothing, which leaves
// the merged list in the order the libraries answered.
const mergeComparator = (sortBy, sortOrder) => {
	const field = String(sortBy || '').split(',')[0];
	let ascending;

	switch (field) {
		case 'SortName':
			ascending = (a, b) =>
				(readString(a, 'SortName') || readString(a, 'Name')).toLowerCase()
					.localeCompare((readString(b, 'SortName') || readString(b, 'Name')).toLowerCase());
			break;
		case 'DateCreated':
		case 'PremiereDate':
			ascending = (a, b) => readString(a, field).localeCompare(readString(b, field));
			break;
		case 'CommunityRating':
		case 'CriticRating':
		case 'ProductionYear':
		case 'Runtime': {
			const key = field === 'Runtime' ? 'RunTimeTicks' : field;
			ascending = (a, b) => readNumber(a, key) - readNumber(b, key);
			break;
		}
		default:
			return null;
	}

	return String(sortOrder || '').toLowerCase() === 'descending'
		? (a, b) => ascending(b, a)
		: ascending;
};

// Newest watched first, for the rows sorted on a date the generic comparator has no rule for.
export const byLastPlayedDesc = (a, b) => {
	const at = (item) => String(item?.UserData?.LastPlayedDate || '');
	return at(b).localeCompare(at(a));
};

// Folds the per library answers back into the single response the caller expected.
export const mergeResponses = (responses, {sortBy, sortOrder, limit, merge} = {}) => {
	const items = [];
	let total = 0;
	(responses || []).forEach((response) => {
		(response?.Items || []).forEach((item) => items.push(item));
		total += Number(response?.TotalRecordCount) || 0;
	});

	if (responses && responses.length > 1) {
		const comparator = merge || mergeComparator(sortBy, sortOrder);
		if (comparator) items.sort(comparator);
	}

	const cut = typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items;
	return {Items: cut, TotalRecordCount: total === 0 ? cut.length : total};
};
