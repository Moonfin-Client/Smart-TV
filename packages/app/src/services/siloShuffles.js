// Silo's shuffles, ported from Moonfin-Core's SiloShuffles.
//
// POST /shuffles starts one over a scope (library, series, season, library_collection, user_collection) and answers the
// item to play now (current) and the one after it (next). POST /shuffles/{id}/advance with the finished item's id
// moves it on: next becomes current and another is picked. Silo plays every movie and episode of the scope once before
// any repeats. The scope kinds this server takes come from GET /shuffles/capabilities.
//
// Starting isn't retry-safe (a repeat starts a second shuffle, which Silo cleans up later). Advancing is.

import {parseSiloCollectionId, siloTypeOfId} from './siloMapper';

const CAPABILITIES_MS = 10 * 60 * 1000;
const IMAGE_SIZE = 'medium';

/** Silo's scope for an item in Jellyfin's shape, or null for one Silo can't shuffle. */
export const siloShuffleScope = (item) => {
	const id = item?.Id == null ? '' : String(item.Id);
	if (!id) return null;
	const collection = parseSiloCollectionId(id);
	if (collection) return {kind: collection.libraryId == null ? 'user_collection' : 'library_collection', id: collection.id};
	const type = siloTypeOfId(id);
	if (type === 'series' || type === 'season') return {kind: type, id};
	// A library's view. Person ids are numbers too.
	if (/^\d+$/.test(id) && ['CollectionFolder', 'UserView', 'Folder'].includes(item.Type)) return {kind: 'library', id};
	return null;
};

/** `map(card)` turns a Silo card into the app's item. */
export const createSiloShuffles = ({call, map}) => {
	let kinds = null;
	const scopeKinds = () => {
		if (!kinds || Date.now() - kinds.at > CAPABILITIES_MS) {
			const promise = call('/api/v2/shuffles/capabilities')
				.then((caps) => (caps?.state === 'available' && caps.allowed !== false ? (caps.scope_kinds || []).filter((k) => typeof k === 'string') : []))
				// A failed read counts as none and is asked again next time.
				.catch(() => {
					kinds = null;
					return [];
				});
			kinds = {at: Date.now(), promise};
		}
		return kinds.promise;
	};

	const shuffleOf = (answer) => {
		const current = answer?.current ? map(answer.current) : null;
		if (answer?.id == null || !current) throw new Error('Expected a shuffle from Silo');
		const next = answer.next ? map(answer.next) : null;
		// Next equals current only when the scope has one item.
		return {id: String(answer.id), current, next: next && next.Id !== current.Id ? next : null};
	};

	return {
		canShuffle: async (item) => {
			const scope = siloShuffleScope(item);
			return Boolean(scope) && (await scopeKinds()).includes(scope.kind);
		},
		startShuffle: async (item) => {
			const scope = siloShuffleScope(item);
			if (!scope) throw new Error(`Silo can't shuffle ${item?.Id}`);
			return shuffleOf(await call('/api/v2/shuffles', {method: 'POST', query: {image_size: IMAGE_SIZE}, body: {scope}}));
		},
		// Null when the shuffle is gone.
		advanceShuffle: async (shuffleId, fromItemId) => {
			try {
				return shuffleOf(await call(`/api/v2/shuffles/${encodeURIComponent(shuffleId)}/advance`,
					{method: 'POST', query: {image_size: IMAGE_SIZE}, body: {from_content_id: fromItemId}}));
			} catch (err) {
				if (err?.status === 404) return null;
				throw err;
			}
		}
	};
};
