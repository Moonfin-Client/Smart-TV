import $L from '@enact/i18n/$L';

// The order the extras sections appear in, with anything the server did not label falling
// into the general bucket at the front.
export const EXTRA_CATEGORIES = [
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

// Which section an extra belongs in. A server that sends no type, or one this does not know,
// leaves the item in the general bucket rather than dropping it.
export const getExtraCategory = (item) => BY_EXTRA_TYPE[item?.ExtraType] || 'extras';

export const getExtraCategoryLabel = (key) => {
	switch (key) {
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
