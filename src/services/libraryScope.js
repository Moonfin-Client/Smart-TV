// Narrows a server wide query to the libraries it's allowed to touch.
//
// The rules live in utils/libraryScopeRules. This half holds what the server said and asks it
// once, since the policy only changes on the next sign in and the hidden list only changes from
// the screen that writes it.
//
// Everything here fails open. A row that shows too much is a smaller problem than one that shows
// nothing, and the server still refuses anything the account has no access to.

import {
	permittedFromPolicy, keepPermitted, scopeLibraries, mergeResponses
} from '../utils/libraryScopeRules';

// Keyed by server and user, so a switch between either reads the new one rather than the old.
const sessions = new Map();

const identityOf = (api) => {
	const info = typeof api?.getServerInfo === 'function' ? api.getServerInfo() : null;
	return info ? `${info.serverUrl}|${info.userId}` : 'default';
};

const sessionFor = (api) => {
	const key = identityOf(api);
	if (!sessions.has(key)) sessions.set(key, {});
	return sessions.get(key);
};

export const resetLibraryScope = () => sessions.clear();

// An api that can't answer is treated as one that placed no restriction.
const canRead = (api) =>
	typeof api?.getUserConfiguration === 'function' && typeof api?.getLibraries === 'function';

// The whole user comes back on this route, so the policy and the hidden list arrive together.
const readUser = (api) => {
	const session = sessionFor(api);
	if (!session.user) {
		session.user = Promise.resolve()
			.then(() => api.getUserConfiguration())
			.catch(() => null);
	}
	return session.user;
};

const readViews = (api) => {
	const session = sessionFor(api);
	if (!session.views) {
		session.views = Promise.resolve()
			.then(() => api.getLibraries())
			.then((result) => result?.Items || [])
			.catch(() => []);
	}
	return session.views;
};

const permittedLibraryIds = async (api) => {
	if (!canRead(api)) return null;
	const user = await readUser(api);
	return permittedFromPolicy(user?.Policy);
};

export const retainPermitted = async (api, ids) =>
	keepPermitted(ids, await permittedLibraryIds(api));

// The libraries to search for these item types, or null when one sweep is still right.
export const visibleLibraryIds = async (api, includeItemTypes) => {
	if (!canRead(api)) return null;

	const user = await readUser(api);
	const excludes = user?.Configuration?.MyMediaExcludes || [];
	// Nothing hidden means nothing to narrow, and no reason to ask for the views at all.
	if (excludes.length === 0) return null;

	return scopeLibraries({
		views: await readViews(api),
		excludes,
		permitted: permittedFromPolicy(user?.Policy),
		includeItemTypes
	});
};

// Runs one search per library, or the single sweep when there's nothing to narrow to. A library
// that fails is dropped rather than taking the row down with it.
export const searchLibraries = async (parentIds, search) => {
	if (!parentIds) return [await search(null)];

	const settled = await Promise.all(parentIds.map((id) => search(id).catch(() => null)));
	return settled.filter(Boolean);
};

// The one call the row builders make. A query that already names a parent, or that's paging, is
// passed straight through: it's either scoped already or counting on the server to count.
export const scopedGetItems = async (api, params = {}, {merge, via} = {}) => {
	const run = via || ((next) => api.getItems(next));
	if (params.ParentId || Number(params.StartIndex) > 0) return run(params);

	const parentIds = await visibleLibraryIds(api, params.IncludeItemTypes);
	if (!parentIds) return run(params);

	const responses = await searchLibraries(parentIds, (id) => run({...params, ParentId: id}));
	return mergeResponses(responses, {
		sortBy: params.SortBy,
		sortOrder: params.SortOrder,
		limit: params.Limit,
		merge
	});
};
