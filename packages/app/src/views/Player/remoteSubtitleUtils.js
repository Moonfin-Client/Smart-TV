import $L from '@enact/i18n/$L';

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
				isBurnIn: isBurnInSubtitleCodec(codec) || stream.DeliveryMethod === 'Encode',
				isAss: isAssSubtitleCodec(codec),
				deliveryUrl,
				deliveryMethod: stream.DeliveryMethod
			};

			if (includeEmbeddedNative) {
				// Same rule as extractSubtitleStreams in the playback service.
				const isServerDelivered = stream.DeliveryMethod === 'External';
				mapped.isEmbeddedNative = !mapped.isBurnIn && !stream.IsExternal && !isServerDelivered &&
					(mapped.isImageBased || (mapped.isTextBased && mediaSource.SupportsTranscoding === false));
			}

			return mapped;
		});
};

// The flags the provider sets on an upload, which are what decide whether a
// result is worth taking at all. They are kept out of the detail line and drawn
// as their own badges, since run in with the rest a long release name pushes
// them off the end of the row.
export const remoteSubtitleFlags = (result) => [
	result.AiTranslated ? $L('AI Translated') : null,
	result.MachineTranslated ? $L('Machine Translated') : null,
	result.HearingImpaired ? $L('SDH') : null,
	result.Forced ? $L('Forced') : null,
	result.IsHashMatch ? $L('Perfect match') : null
].filter(Boolean);

// 23.976 stays as it is, 25.000 reads better as 25.
const frameRateLabel = (value) => value.toFixed(3).replace(/\.?0+$/, '');

// The provider's own bookkeeping, as one line under the release name.
export const remoteSubtitleDetails = (result) => {
	const parts = [];
	const language = (result.ThreeLetterISOLanguageName || result.Language || '').trim();
	if (language) parts.push(language.toUpperCase());
	const provider = (result.ProviderName || '').trim();
	if (provider) parts.push(provider);
	const format = (result.Format || '').trim();
	if (format) parts.push(format.toUpperCase());
	if (typeof result.CommunityRating === 'number') parts.push(`${result.CommunityRating.toFixed(1)}★`);
	if (typeof result.DownloadCount === 'number') {
		parts.push(result.DownloadCount === 1
			? $L('1 download')
			: $L('{count} downloads').replace('{count}', result.DownloadCount));
	}
	if (typeof result.FrameRate === 'number' && result.FrameRate > 0) {
		parts.push($L('{fps} fps').replace('{fps}', frameRateLabel(result.FrameRate)));
	}
	return parts.join(' · ');
};

export const mapRemoteSubtitleOptions = (results) =>
	(Array.isArray(results) ? results : []).map((result) => ({
		id: result.Id,
		name: result.Name || result.Author || 'Subtitle',
		info: remoteSubtitleDetails(result),
		flags: remoteSubtitleFlags(result)
	}));

// The server writes the file and then queues a metadata refresh, so the new
// stream only appears some time after the download call has already come back.
// These steps start tight so a quick server still feels immediate, then stretch
// out to cover about twenty seconds without asking the whole way through.
export const SUBTITLE_APPEARANCE_DELAYS = [300, 300, 500, 700, 1000, 1000, 1500, 2000, 2000, 3000, 3000, 4000];

// Runs probe against that schedule until it turns something up.
export const pollForSubtitleAppearance = async (probe) => {
	for (let attempt = 0; ; attempt++) {
		let found = null;
		try {
			found = await probe();
		} catch {
			// A server that hiccups part way through gets another go on the next tick.
		}
		if (found) return found;
		if (attempt >= SUBTITLE_APPEARANCE_DELAYS.length) return null;
		await new Promise((resolve) => setTimeout(resolve, SUBTITLE_APPEARANCE_DELAYS[attempt]));
	}
};

const pickErrorMessage = (error, denied, missing, failed) => {
	if (error?.status === 403) return denied;
	if (error?.status === 404) return missing;
	return failed;
};

export const remoteSubtitleSearchError = (error) => pickErrorMessage(
	error,
	$L('You do not have permission to search for subtitles'),
	$L('No subtitle provider is set up on the server'),
	$L('Subtitle search failed')
);

export const remoteSubtitleDownloadError = (error) => pickErrorMessage(
	error,
	$L('You do not have permission to download subtitles'),
	$L('That subtitle is no longer available'),
	$L('Subtitle download failed')
);

export const remoteSubtitleNotAppearedMessage = () => $L('The subtitle was downloaded but has not appeared yet');
