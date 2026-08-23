// Facts about an item that the detail screen reads off its media source, plus the small
// lists that decide which actions an item type is allowed to offer.

import $L from '@enact/i18n/$L';

import {getImageUrl} from '../../utils/helpers';

// Caps that match the mobile clients, so a title forced down on one device looks the
// same on the others. The server transcodes to fit whichever is chosen.
export const TRANSCODE_QUALITIES = [
	{bitrate: 4000000, label: () => $L('High Quality (1080p)')},
	{bitrate: 2000000, label: () => $L('Medium Quality (720p)')},
	{bitrate: 1000000, label: () => $L('Low Quality (480p)')}
];

// Item types a Jellyfin/Emby collection will accept as a member.
export const COLLECTION_ITEM_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo', 'BoxSet'];

export const IDENTIFIABLE_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'BoxSet', 'Person', 'MusicAlbum', 'MusicArtist', 'Book', 'Trailer', 'MusicVideo'];

// Whether the summary is being kept back for someone avoiding spoilers. Only a
// film or an episode gives the plot away, so a series or a season keeps its
// description either way.
export const hidesMediaDescription = (item, settings) =>
	settings?.hideDetailsMediaDescription === true &&
	item?.Type !== 'Series' &&
	item?.Type !== 'Season' &&
	item?.Type !== 'BoxSet' &&
	item?.Type !== 'Person';

// The parent series artwork, for standing in where an episode still or a chapter
// frame would give something away. Null when the series offers no artwork, which
// leaves the caller to fall back to the picture it would have used.
export const seriesThumbUrl = (serverUrl, source, options) => {
	const seriesId = source?.ParentThumbItemId || source?.SeriesId;
	if (!seriesId) return null;
	if (source.ParentThumbImageTag) {
		return getImageUrl(serverUrl, seriesId, 'Thumb', {...options, tag: source.ParentThumbImageTag});
	}
	if (source.SeriesPrimaryImageTag) {
		return getImageUrl(serverUrl, seriesId, 'Primary', {...options, tag: source.SeriesPrimaryImageTag});
	}
	return getImageUrl(serverUrl, seriesId, 'Thumb', options);
};

// A role written in block capitals reads as shouting next to the rest, and one
// person can arrive with several jobs run together in a single field.
const normalizeRoles = (role) => role
	.split(/[;,]/)
	.map((part) => part.trim())
	.filter(Boolean)
	.map((part) => (part.length > 1 && part === part.toUpperCase()
		? part[0] + part.slice(1).toLowerCase()
		: part));

// The people on an item, split the way the detail screens present them: actors
// in Cast, directors and writers merged into Crew. Somebody who both directed
// and acted belongs with the crew, so their name is kept out of the cast.
export const splitCastAndCrew = (people = [], limit = 20) => {
	const directors = people.filter((p) => p.Type === 'Director');
	const writers = people.filter((p) => p.Type === 'Writer');
	const crewNames = new Set([...directors, ...writers].map((p) => p.Name));

	const cast = people
		.filter((p) => (p.Type === 'Actor' || p.Type === 'GuestStar') && !crewNames.has(p.Name))
		.slice(0, limit);

	const merged = new Map();
	const addCrew = (person, fallbackRole) => {
		const key = person.Id || person.Name;
		if (!key) return;
		const roles = normalizeRoles(person.Role?.trim() || fallbackRole);
		const existing = merged.get(key);
		if (existing) {
			roles.forEach((r) => existing.roles.add(r));
		} else {
			merged.set(key, {person, roles: new Set(roles)});
		}
	};
	directors.forEach((d) => addCrew(d, $L('Director')));
	writers.forEach((w) => addCrew(w, $L('Writer')));

	const crew = Array.from(merged.values())
		.map(({person, roles}) => ({...person, Role: Array.from(roles).join('\n')}))
		.slice(0, limit);

	return {cast, crew};
};

export const shuffleArray = (arr) => {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

export const getMediaBadges = (item, versionIndex = 0) => {
	const badges = [];
	const mediaSource = item.MediaSources?.[versionIndex] || item.MediaSources?.[0];
	const streams = mediaSource?.MediaStreams || [];
	const video = streams.find(s => s.Type === 'Video');
	const audio = streams.find(s => s.Type === 'Audio');

	if (video) {
		if (video.Width >= 3800) badges.push({type: 'badge4k', label: $L('4K')});
		else if (video.Width >= 1900) badges.push({type: 'badgeHd', label: $L('1080p')});
		else if (video.Width >= 1260) badges.push({type: 'badgeHd', label: $L('720p')});

		const rangeType = video.VideoRangeType;
		if (rangeType === 'DOVIWithHDR10' || rangeType === 'DOVI' || rangeType === 'DOVIWithHDR10Plus') {
			badges.push({type: 'badgeDv', label: $L('DV')});
		}
		if (rangeType && rangeType !== 'SDR') {
			if (rangeType.includes('HDR10Plus')) badges.push({type: 'badgeHdr', label: $L('HDR10+')});
			else if (rangeType.includes('HDR10') || rangeType === 'DOVIWithHDR10') badges.push({type: 'badgeHdr', label: $L('HDR10')});
			else if (rangeType !== 'DOVI') badges.push({type: 'badgeHdr', label: $L('HDR')});
		} else if (video.VideoRange === 'HDR') {
			badges.push({type: 'badgeHdr', label: $L('HDR')});
		}

		const videoCodec = video.Codec?.toUpperCase();
		if (videoCodec) {
			const codecLabel = videoCodec === 'HEVC' ? 'HEVC' : videoCodec === 'AV1' ? 'AV1' : videoCodec === 'H264' ? 'H.264' : videoCodec === 'VP9' ? 'VP9' : videoCodec;
			badges.push({type: 'badgeCodec', label: codecLabel});
		}
	}

	const container = mediaSource?.Container?.toUpperCase();
	if (container) {
		badges.push({type: 'badgeContainer', label: container});
	}

	if (audio) {
		if (audio.Profile?.includes('Atmos') || audio.Title?.includes('Atmos')) {
			badges.push({type: 'badgeAtmos', label: $L('ATMOS')});
		} else if (audio.Profile?.includes('DTS:X') || audio.Title?.includes('DTS:X')) {
			badges.push({type: 'badgeDtsx', label: $L('DTS:X')});
		} else if (audio.Channels > 6) {
			badges.push({type: 'badgeSurround', label: `${audio.Channels - 1}.1`});
		} else if (audio.Channels === 6) {
			badges.push({type: 'badgeSurround', label: '5.1'});
		} else if (audio.Channels === 2) {
			badges.push({type: 'badgeSurround', label: $L('Stereo')});
		}

		const audioCodec = audio.Codec?.toUpperCase();
		if (audioCodec) {
			const audioLabel = audioCodec === 'AAC' ? 'AAC' : audioCodec === 'AC3' ? 'AC3' : audioCodec === 'EAC3' ? 'EAC3' : audioCodec === 'FLAC' ? 'FLAC' : audioCodec === 'DTS' ? 'DTS' : audioCodec === 'TRUEHD' ? 'TrueHD' : audioCodec;
			badges.push({type: 'badgeAudioCodec', label: audioLabel});
		}
	}

	return badges;
};

// A cast photo, wherever it lives. A Seerr title's people come from TMDB with the url already
// resolved, while the library's own people are fetched from the server by id.
export const castPhotoUrl = (person, serverUrl, maxHeight) => {
	if (person._externalImageUrl) return person._externalImageUrl;
	if (!person.PrimaryImageTag) return null;
	return getImageUrl(serverUrl, person.Id, 'Primary', {maxHeight, quality: 80});
};
