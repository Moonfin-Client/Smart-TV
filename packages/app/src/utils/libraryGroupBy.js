// Grouping for the movie and TV libraries. An item lands in every genre or
// studio it carries, so those counts add up to more than the library holds,
// and whatever carries none falls into a trailing catch all bucket.

import $L from '@enact/i18n/$L';

import {parentalRatingSeverity} from './parentalRatingSeverity';

export const LIBRARY_GROUP_OPTIONS = ['none', 'decade', 'genre', 'parentalRating', 'studio'];

const LABELS = {
	none: () => $L('None'),
	decade: () => $L('Decade (Year)'),
	genre: () => $L('Genres'),
	parentalRating: () => $L('Parental Rating'),
	studio: () => $L('Studio')
};

export const groupByLabel = (groupBy) => (LABELS[groupBy] || LABELS.none)();

const CATCH_ALL = {'Other': true, 'Unknown': true, 'Unrated': true};

export const groupLibraryItems = (items, groupBy) => {
	const map = {};
	const keys = [];
	const add = (key, item) => {
		if (!map[key]) {
			map[key] = [];
			keys.push(key);
		}
		map[key].push(item);
	};

	for (let i = 0; i < (items || []).length; i++) {
		const item = items[i];
		if (groupBy === 'genre') {
			const genres = item.Genres || [];
			if (!genres.length) {
				add('Other', item);
			} else {
				for (let g = 0; g < genres.length; g++) add(genres[g], item);
			}
		} else if (groupBy === 'parentalRating') {
			const rating = (item.OfficialRating || '').trim();
			add(rating || 'Unrated', item);
		} else if (groupBy === 'decade') {
			const year = item.ProductionYear;
			add(year ? `${Math.floor(year / 10) * 10}s` : 'Unknown', item);
		} else if (groupBy === 'studio') {
			const studios = item.Studios || [];
			const named = studios.filter((s) => s && s.Name);
			if (!named.length) {
				add('Unknown', item);
			} else {
				for (let s = 0; s < named.length; s++) add(named[s].Name, item);
			}
		}
	}

	keys.sort((a, b) => {
		const aCatchAll = !!CATCH_ALL[a];
		const bCatchAll = !!CATCH_ALL[b];
		if (aCatchAll !== bCatchAll) return aCatchAll ? 1 : -1;
		if (groupBy === 'decade') {
			// Newest decade first
			return b < a ? -1 : b > a ? 1 : 0;
		}
		if (groupBy === 'parentalRating') {
			const diff = parentalRatingSeverity(a) - parentalRatingSeverity(b);
			if (diff !== 0) return diff;
		}
		return a < b ? -1 : a > b ? 1 : 0;
	});

	return keys.map((name) => ({name, items: map[name]}));
};
