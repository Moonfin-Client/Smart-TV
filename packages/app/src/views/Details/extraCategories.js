import $L from '@enact/i18n/$L';

// The order the extras sections appear in. A movie's other parts lead, then anything the
// server didn't label falls into the general bucket.
export const EXTRA_CATEGORIES = [
	'additionalParts',
	'extras',
	'behindTheScenes',
	'deletedScenes',
	'featurettes',
	'interviews',
	'scenes',
	'shorts',
	'trailers'
];

const BY_EXTRA_TYPE = {
	BehindTheScenes: 'behindTheScenes',
	DeletedScene: 'deletedScenes',
	Featurette: 'featurettes',
	Interview: 'interviews',
	Scene: 'scenes',
	Short: 'shorts',
	Trailer: 'trailers'
};

// The other files of a movie split across several, like cd1 and cd2, ride along with the extras.
export const isAdditionalPart = (item) => item?._additionalPart === true;

// For the styles that give the parts a row of their own ahead of one Extras row.
export const splitAdditionalParts = (extras) => ({
	parts: extras.filter(isAdditionalPart),
	others: extras.filter((extra) => !isAdditionalPart(extra))
});

// Which section an extra belongs in. A server that sends no type, or one this does not know,
// leaves the item in the general bucket rather than dropping it.
export const getExtraCategory = (item) => (isAdditionalPart(item) ? 'additionalParts' : BY_EXTRA_TYPE[item?.ExtraType] || 'extras');

export const getExtraCategoryLabel = (key) => {
	switch (key) {
		case 'additionalParts': return $L('Additional Parts');
		case 'behindTheScenes': return $L('Behind the Scenes');
		case 'deletedScenes': return $L('Deleted Scenes');
		case 'featurettes': return $L('Featurettes');
		case 'interviews': return $L('Interviews');
		case 'scenes': return $L('Scenes');
		case 'shorts': return $L('Shorts');
		case 'trailers': return $L('Trailers');
		default: return $L('Extras');
	}
};

// Special features by their number, then by name ignoring case. A season number on one plays no
// part, and one without a number sorts as zero.
export const compareFeatures = (a, b) => {
	const byIndex = (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
	if (byIndex) return byIndex;
	const nameA = (a.Name || '').toLowerCase();
	const nameB = (b.Name || '').toLowerCase();
	return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
};

// Extras bucketed by section, in EXTRA_CATEGORIES order, with the empty sections left out.
export const groupExtrasByCategory = (extras = []) => {
	const byCategory = new Map();
	extras.forEach((extra) => {
		const key = getExtraCategory(extra);
		const bucket = byCategory.get(key);
		if (bucket) bucket.push(extra);
		else byCategory.set(key, [extra]);
	});
	return EXTRA_CATEGORIES
		.filter((key) => byCategory.has(key))
		.map((key) => ({key, items: byCategory.get(key)}));
};
