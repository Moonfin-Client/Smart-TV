import seerrApi from '../../services/seerrApi';
import {MEDIA_STATUS} from '../../utils/seerrStatus';

export const providerId = (item, name) => {
	const ids = item?.ProviderIds;
	if (!ids) return '';
	const target = name.trim().toLowerCase();
	const key = Object.keys(ids).find((entry) => entry.trim().toLowerCase() === target);
	return key ? String(ids[key] ?? '').trim() : '';
};

export const resolveCollectionTmdbId = async (boxSet, members = []) => {
	const ownTmdb = providerId(boxSet, 'tmdb') || providerId(boxSet, 'tmdbcollection');
	const ownId = parseInt(ownTmdb, 10);
	if (Number.isFinite(ownId) && ownId > 0) return ownId;

	// Check if any member has tmdbcollection
	for (const m of members) {
		const mCol = providerId(m, 'tmdbcollection');
		const colId = parseInt(mCol, 10);
		if (Number.isFinite(colId) && colId > 0) return colId;
	}

	// Probe first few movie members on Seerr to find collection id
	const movieCandidates = members
		.filter((m) => m.Type === 'Movie' || !m.Type)
		.map((m) => parseInt(providerId(m, 'tmdb'), 10))
		.filter((id) => Number.isFinite(id) && id > 0)
		.slice(0, 4);

	// Asked for together rather than one after another, so the grid is not left
	// waiting on four round trips.
	const probed = await Promise.all(movieCandidates.map((tmdbId) =>
		seerrApi.getMovie(tmdbId).catch(() => null)));

	for (const details of probed) {
		if (details?.collection?.id) return details.collection.id;
	}

	return null;
};

export const makeMissingCollectionItem = (part) => {
	const releaseDate = part.releaseDate || part.release_date || '';
	const year = parseInt(String(releaseDate).slice(0, 4), 10) || undefined;
	const poster = part.posterPath || part.poster_path;
	const backdrop = part.backdropPath || part.backdrop_path;
	return {
		Id: `seerr-movie-${part.id}`,
		Name: part.title || part.name,
		Type: 'Movie',
		ProductionYear: year,
		PremiereDate: releaseDate || undefined,
		Overview: part.overview || '',
		_externalPosterUrl: poster ? seerrApi.getImageUrl(poster, 'w342') : null,
		_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, 'w1280') : null,
		ProviderIds: {Tmdb: String(part.id)},
		mediaInfo: part.mediaInfo || {status: MEDIA_STATUS.UNKNOWN},
		_seerr: true,
		_seerrMissing: true,
		_seerrType: 'item',
		_seerrMediaType: 'movie',
		_seerrMediaId: part.id,
		_seerrRaw: {mediaId: part.id, mediaType: 'movie'}
	};
};

export const fetchMissingCollectionItems = async ({boxSet, members = [], settings = {}}) => {
	if (settings.seerrShowMissingCollectionItems === false) return [];
	if (!members || members.length === 0) return [];

	try {
		const collectionId = await resolveCollectionTmdbId(boxSet, members);
		if (!collectionId) return [];

		const seerrCollection = await seerrApi.getCollection(collectionId);
		const parts = seerrCollection?.parts;
		if (!Array.isArray(parts) || parts.length === 0) return [];

		const libraryTmdbIds = new Set(
			members.map((m) => providerId(m, 'tmdb')).filter(Boolean)
		);
		const libraryTitles = new Set(
			members.map((m) => m.Name?.trim().toLowerCase()).filter(Boolean)
		);

		const movieCount = members.filter((m) => m.Type === 'Movie' || !m.Type).length;
		const overlap = parts.filter((part) =>
			libraryTmdbIds.has(String(part.id)) ||
			libraryTitles.has((part.title || part.name)?.trim().toLowerCase())
		).length;

		// One match carries a single film set, two otherwise. Nothing matching means
		// this collection describes something else, and a hand made set would take on
		// a whole franchise.
		if (overlap === 0) return [];
		if (movieCount > 1 && overlap < 2) return [];

		const missingParts = parts.filter((part) =>
			!libraryTmdbIds.has(String(part.id)) &&
			!libraryTitles.has((part.title || part.name)?.trim().toLowerCase()) &&
			part.mediaInfo?.status !== MEDIA_STATUS.BLOCKLISTED
		);

		return missingParts.map(makeMissingCollectionItem);
	} catch {
		return [];
	}
};

export const mergeCollectionWithMissing = (members = [], missingItems = []) => {
	if (!missingItems || missingItems.length === 0) return members;
	const combined = [...members, ...missingItems];

	const releaseKey = (it) => it.PremiereDate || (it.ProductionYear ? `${it.ProductionYear}-01-01` : null);

	return combined.sort((a, b) => {
		const aDate = releaseKey(a);
		const bDate = releaseKey(b);
		if (!aDate && !bDate) return (a.Name || '').localeCompare(b.Name || '');
		if (!aDate) return 1;
		if (!bDate) return -1;
		const diff = aDate.localeCompare(bDate);
		if (diff !== 0) return diff;
		return (a.Name || '').localeCompare(b.Name || '');
	});
};

// Slots the missing titles into the library list by release date, leaving the order the server
// gave the library alone. Each one lands in front of the first title released after it, or at
// the end when nothing is.
//
// This is not the same as sorting the two lists together, which is what the collection row
// wants, so both live here. A collection the server deliberately ordered keeps that order.
export const mergeMissingByReleaseOrder = (library = [], missing = []) => {
	if (!missing.length) return library;

	const released = (item) => {
		if (item.PremiereDate) {
			const parsed = Date.parse(item.PremiereDate);
			if (!isNaN(parsed)) return parsed;
		}
		return item.ProductionYear ? Date.UTC(item.ProductionYear, 0, 1) : null;
	};

	const merged = [...library];
	missing.forEach((item) => {
		const key = released(item);
		let at = merged.length;
		if (key !== null) {
			const later = merged.findIndex((existing) => {
				const date = released(existing);
				return date !== null && key < date;
			});
			if (later >= 0) at = later;
		}
		merged.splice(at, 0, item);
	});
	return merged;
};
