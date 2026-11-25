// Reads a YouTube trailer manifest for the page. The page needs the manifest to
// pick the stream the WebView's player can open, but the WebView holds it to CORS
// and YouTube's manifest host only answers YouTube's own pages. The player fetches
// the stream itself, so only the manifest comes through here.
import type {ManifestAnswer, ManifestRequest} from './bridge';

const MANIFEST_URL = /^https:\/\/manifest\.googlevideo\.com\//;

export const readManifest = async ({id, url}: ManifestRequest): Promise<ManifestAnswer> => {
	if (!MANIFEST_URL.test(url)) return {id, status: 0, body: ''};
	try {
		const response = await fetch(url);
		return {id, status: response.status, body: await response.text()};
	} catch (e) {
		return {id, status: 0, body: ''};
	}
};
