import {fetchWithTimeout} from '../utils/fetchTimeout';

const BASE_URL = 'https://raw.githubusercontent.com/Moonfin-Client/Themes/main/';

const headers = {
	'Accept': 'application/json',
	'User-Agent': 'Moonfin-Client'
};

// Fetches the Theme Store catalog (index.json). Returns an array of
// {id, displayName, description, file}.
export const fetchThemeStoreCatalog = async () => {
	const response = await fetchWithTimeout(`${BASE_URL}index.json`, {headers}, 30000);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const data = JSON.parse(await response.text());
	const themes = Array.isArray(data?.themes) ? data.themes : [];
	return themes
		.filter((t) => t && typeof t.id === 'string' && typeof t.file === 'string' && t.id && t.file)
		.map((t) => ({
			id: t.id,
			displayName: typeof t.displayName === 'string' && t.displayName ? t.displayName : t.id,
			description: typeof t.description === 'string' ? t.description : '',
			file: t.file
		}));
};

// Fetches a single theme JSON by its catalog file path. Returns the raw object;
// caller validates via parseThemeSpec.
export const fetchThemeJson = async (file) => {
	const response = await fetchWithTimeout(`${BASE_URL}${file}`, {headers}, 30000);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return JSON.parse(await response.text());
};
