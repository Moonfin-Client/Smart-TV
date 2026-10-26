// Makes a request for the page when the WebView would keep the answer from it. A Plex server only lets app.plex.tv
// read its answers, and the page sits at file://.
import type {HttpAnswer, HttpRequest} from './bridge';

export const httpRequest = async ({id, url, method, headers, body, timeoutMs}: HttpRequest): Promise<HttpAnswer> => {
	if (!/^https?:\/\//i.test(url)) return {id, status: 0, body: ''};
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), timeoutMs);
	try {
		const response = await fetch(url, {method, headers, body: body ?? undefined, signal: abort.signal});
		return {id, status: response.status, body: await response.text()};
	} catch (e) {
		return {id, status: 0, body: ''};
	} finally {
		clearTimeout(timer);
	}
};
