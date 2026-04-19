const LANGUAGE_MAP = {
	english: 'eng',
	en: 'eng',
	eng: 'eng',
	spanish: 'spa',
	es: 'spa',
	spa: 'spa',
	french: 'fra',
	fr: 'fra',
	fra: 'fra',
	de: 'deu',
	deu: 'deu',
	german: 'deu',
	it: 'ita',
	ita: 'ita',
	japanese: 'jpn',
	ja: 'jpn',
	jpn: 'jpn',
	korean: 'kor',
	ko: 'kor',
	kor: 'kor',
	chinese: 'zho',
	zh: 'zho',
	zho: 'zho'
};

const TEXT_SUBTITLE_CODECS = ['srt', 'subrip', 'vtt', 'webvtt', 'ass', 'ssa', 'sub', 'smi', 'sami'];
const IMAGE_SUBTITLE_CODECS = ['pgssub', 'hdmv_pgs', 'pgs', 'dvdsub', 'dvbsub', 'dvb_subtitle'];

export const toSubtitleLanguage = (...languages) => {
	for (const value of languages) {
		if (!value || typeof value !== 'string') continue;
		const normalized = value.trim().toLowerCase();
		if (!normalized || normalized === 'unknown') continue;
		if (LANGUAGE_MAP[normalized]) return LANGUAGE_MAP[normalized];
		if (normalized.length === 3) return normalized;
		if (normalized.length === 2) return normalized;
	}
	return 'eng';
};

export const mapSubtitleStreamsFromMediaSource = (mediaSource, serverUrl, options = {}) => {
	const {includeEmbeddedNative = false} = options;
	if (!mediaSource?.MediaStreams) return [];

	return mediaSource.MediaStreams
		.filter((stream) => stream.Type === 'Subtitle')
		.map((stream) => {
			const codec = stream.Codec?.toLowerCase();
			let deliveryUrl = null;
			if (stream.DeliveryUrl) {
				deliveryUrl = stream.IsExternalUrl ? stream.DeliveryUrl : `${serverUrl}${stream.DeliveryUrl}`;
			}

			const mapped = {
				index: stream.Index,
				codec: stream.Codec,
				language: stream.Language || 'Unknown',
				displayTitle: stream.DisplayTitle || stream.Language || 'Unknown',
				isExternal: stream.IsExternal,
				isForced: stream.IsForced,
				isDefault: stream.IsDefault,
				isTextBased: TEXT_SUBTITLE_CODECS.includes(codec),
				isImageBased: IMAGE_SUBTITLE_CODECS.includes(codec),
				isAss: ['ass', 'ssa'].includes(codec),
				deliveryUrl,
				deliveryMethod: stream.DeliveryMethod
			};

			if (includeEmbeddedNative) {
				// Image-based tracks with DeliveryMethod 'External' are server-extracted .sup files served via libpgs, not AVPlay native.
				const isEmbeddedImage = IMAGE_SUBTITLE_CODECS.includes(codec) && !stream.IsExternal && stream.DeliveryMethod !== 'External';
				mapped.isEmbeddedNative = !stream.IsExternal && (TEXT_SUBTITLE_CODECS.includes(codec) || isEmbeddedImage);
			}

			return mapped;
		});
};

export const mapRemoteSubtitleOptions = (results) =>
	(Array.isArray(results) ? results : []).map((result) => {
		const name = result.Name || result.Author || 'Subtitle';
		const infoParts = [result.LanguageName || result.ThreeLetterISOLanguageName, result.Author, result.Format].filter(Boolean);
		return {
			id: result.Id,
			name,
			info: infoParts.join(' · ')
		};
	});
