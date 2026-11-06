// Subtitles found with the providers a Silo's admin set up, for one file (POST /api/v2/subtitles/search), and one saved
// to the server (POST /api/v2/subtitles/download). With no provider set up a search finds nothing. Ported from
// Moonfin-Core's SiloRemoteSubtitles.
//
// The app hands a download only the result's id, while Silo wants the whole result back, so the id carries it.

import {siloLanguageCode} from './siloMediaSources';

// base64url of UTF-8 JSON, which the old TV engines' btoa/atob can do with an escape round trip.
const encodeId = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value))))
	.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
const decodeId = (id) => {
	const b64 = String(id).replace(/-/g, '+').replace(/_/g, '/');
	return JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
};

/** Silo's search results for file `fileId`, as Jellyfin's RemoteSubtitleInfo. */
export const siloSubtitleResults = (answer, fileId) => (answer?.results || [])
	.filter((r) => r && typeof r.id === 'string')
	.map((r) => ({
		Id: encodeId({
			media_file_id: fileId,
			subtitle_id: r.id,
			provider: r.provider,
			language: r.language,
			release_name: r.release_name,
			score: r.score,
			hearing_impaired: r.hearing_impaired === true
		}),
		...(r.release_name != null ? {Name: r.release_name} : null),
		...(r.provider != null ? {ProviderName: r.provider} : null),
		...(r.format != null ? {Format: r.format} : null),
		...(r.language != null ? {Language: r.language} : null),
		HearingImpaired: r.hearing_impaired === true,
		...(r.downloads != null ? {DownloadCount: r.downloads} : null)
	}));

/** `fileOf(itemId)` is the file playing for the title, else its default file. */
export const createSiloRemoteSubtitles = ({call, fileOf, forget}) => ({
	// Silo has nothing like isPerfectMatch.
	searchRemoteSubtitles: async (itemId, language = 'eng') => {
		const fileId = await fileOf(itemId);
		if (!fileId) throw new Error(`Silo item ${itemId} has no file to find subtitles for`);
		const answer = await call('/api/v2/subtitles/search', {method: 'POST', body: {media_file_id: fileId, languages: [siloLanguageCode(language)]}});
		return siloSubtitleResults(answer, fileId);
	},
	// Silo marks this non-retryable, so it is sent once.
	downloadRemoteSubtitle: async (itemId, subtitleId) => {
		let result;
		try {
			result = decodeId(subtitleId);
		} catch {
			throw new Error('Not a Silo subtitle result');
		}
		await call('/api/v2/subtitles/download', {method: 'POST', body: result});
		forget();
	}
});
