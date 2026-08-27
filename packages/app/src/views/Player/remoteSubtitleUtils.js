import {TEXT_SUBTITLE_CODECS, isAssSubtitleCodec, isPgsSubtitleCodec, isBurnInSubtitleCodec} from '../../utils/subtitleCodecs';

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
				displayTitle: stream.DisplayTitle || stream.Title || stream.Language,
				isExternal: stream.IsExternal,
				isForced: stream.IsForced,
				isHearingImpaired: stream.IsHearingImpaired,
				isDefault: stream.IsDefault,
				isTextBased: TEXT_SUBTITLE_CODECS.includes(codec),
				isImageBased: isPgsSubtitleCodec(codec),
				isBurnIn: isBurnInSubtitleCodec(codec),
				isAss: isAssSubtitleCodec(codec),
				deliveryUrl,
				deliveryMethod: stream.DeliveryMethod
			};

			if (includeEmbeddedNative) {
				// Same rule as extractSubtitleStreams in the playback service.
				const isServerDelivered = stream.DeliveryMethod === 'External';
				mapped.isEmbeddedNative = !stream.IsExternal && !isServerDelivered &&
					(mapped.isImageBased || (mapped.isTextBased && mediaSource.SupportsTranscoding === false));
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
