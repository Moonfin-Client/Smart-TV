import {parseUrl} from './urlCompat';

export function normalizeServerUrl (input) {
	let url = input?.trim();
	if (!url) return null;

	url = url.replace(/\/+$/, '');

	if (!/^https?:\/\//i.test(url)) {
		url = 'http://' + url;
	}

	try {
		return parseUrl(url).toString().replace(/\/+$/, '');
	} catch (e) {
		return null;
	}
}

export function generateCandidates (input) {
	let raw = input?.trim();
	if (!raw) return [];

	raw = raw.replace(/\/+$/, '');

	if (/^https?:\/\//i.test(raw)) {
		const normalized = normalizeServerUrl(raw);
		return normalized ? [normalized] : [];
	}

	const hostMatch = raw.match(/^([^/:]+)(?::(\d+))?(\/.*)?$/);
	if (!hostMatch) return [];

	const hostname = hostMatch[1];
	const port = hostMatch[2];
	const pathSuffix = hostMatch[3] || '';

	if (port) {
		return [
			normalizeServerUrl('https://' + raw),
			normalizeServerUrl('http://' + raw)
		].filter(Boolean);
	}

	const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
	const isLocalName = !hostname.includes('.');

	if (isIP || isLocalName) {
		return [
			normalizeServerUrl('https://' + hostname + ':8096' + pathSuffix),
			normalizeServerUrl('http://' + hostname + ':8096' + pathSuffix),
			normalizeServerUrl('http://' + hostname + pathSuffix)
		].filter(Boolean);
	}

	return [
		normalizeServerUrl('https://' + raw),
		normalizeServerUrl('http://' + raw)
	].filter(Boolean);
}
