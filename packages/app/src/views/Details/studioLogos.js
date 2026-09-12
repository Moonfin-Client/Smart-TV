// Library and TMDB studio names rarely agree on punctuation or spacing, so they are compared
// without either.
export const normalizeStudioName = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Logos always come from TMDB, through the plugin's server side cache, which holds its own key
// so the client only needs the plugin to be switched on.
const logoUrlFor = (company, serverUrl, token) => (
	company?.hasLogo ? `${serverUrl}/Moonfin/Tmdb/StudioImage/${company.id}?api_key=${token}` : null
);

// Indexes the TMDB companies under both their exact and their normalized names. Two of them
// can share a normalized key, Apple TV and Apple TV+ for one, so the first of those wins and
// the exact name is what tells them apart.
export const studioLogoIndex = (companies, serverUrl, token) => {
	const byName = new Map();
	const byNormalizedName = new Map();
	(companies || []).forEach((company) => {
		const logo = logoUrlFor(company, serverUrl, token);
		if (!logo) return;
		const name = String(company.name || '');
		const exact = name.trim().toLowerCase();
		if (exact && !byName.has(exact)) byName.set(exact, logo);
		const normalized = normalizeStudioName(name);
		if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, logo);
	});
	return {byName, byNormalizedName};
};

// The logo for a studio name, if one in the index is close enough.
//
// Exact names win, then normalized ones. Anything left has to share a start, because matching
// anywhere in the name once handed Netflix the logo of a company called X. The longest key
// wins so the closest name does, rather than whichever the server happened to list first.
export const studioLogoUrlFor = (studioName, index) => {
	if (!index) return null;
	const normalized = normalizeStudioName(studioName);
	const exact = index.byName.get(String(studioName || '').trim().toLowerCase()) ||
		index.byNormalizedName.get(normalized);
	if (exact || !normalized) return exact || null;

	let best = null;
	let bestKeyLength = 0;
	index.byNormalizedName.forEach((logo, key) => {
		const shareStart = key.startsWith(normalized) || normalized.startsWith(key);
		if (shareStart && key.length > bestKeyLength) {
			bestKeyLength = key.length;
			best = logo;
		}
	});
	return best;
};

// The studios of an item, each with whatever logo matched. Only the library studios are listed,
// so selecting one matches the filter the library screen would apply.
export const studioCardsFor = (studios, index) => (studios || []).map((studio) => ({
	key: studio.Id || studio.Name,
	name: studio.Name,
	logo: studioLogoUrlFor(studio.Name, index)
}));
