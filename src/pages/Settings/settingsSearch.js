// Turns the settings schema into a flat searchable list and ranks it against a query.
// Everything it needs is passed in, so this module imports nothing and can be tested
// without pulling in i18n or the renderer.

const MAX_RESULTS = 12;
export const MIN_QUERY_LENGTH = 2;

const KINDS_WORTH_INDEXING = {toggle: true, option: true, slider: true, nav: true, info: true};

// Old Tizen and webOS WebKit builds have no String.prototype.normalize.
const canNormalize = typeof String.prototype.normalize === 'function';

const normalize = (value) => {
	let out = String(value == null ? '' : value).toLowerCase();
	if (canNormalize) {
		out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	}
	return out.replace(/\s+/g, ' ').trim();
};

export const resultSpotlightId = (entry) => `settings-result-${String(entry.id).replace(/[^\w-]/g, '_')}`;

const isIndexable = (row) => {
	if (row.search === false) return false;
	if (row.search === true) return true;
	return KINDS_WORTH_INDEXING[row.kind] === true;
};

// Flattens [schema] into search entries, leaving out anything the current [ctx] hides so
// a result can never lead to a screen where the row isn't drawn. [deps] supplies
// `resolve` and `spotlightIdOf` from the schema module.
export const buildSettingsIndex = (schema, ctx, deps) => {
	const {resolve, spotlightIdOf} = deps;
	const entries = [];

	schema.forEach((category) => {
		if (category.when && !category.when(ctx)) return;
		const categoryLabel = resolve(category.label, ctx);
		const subsById = {};
		(category.subcategories || []).forEach((sub) => {
			subsById[sub.id] = sub;
		});

		(category.subcategories || []).forEach((sub) => {
			if (sub.when && !sub.when(ctx)) return;
			const subLabel = resolve(sub.label, ctx);
			// The breadcrumb names the screens on the way to a row. A screen reached from another one
			// names that one too, and a category's own page is the category, so it isn't said twice.
			const path = [categoryLabel];
			const parents = [];
			for (let parent = subsById[sub.parent]; parent; parent = subsById[parent.parent]) {
				parents.unshift(resolve(parent.label, ctx));
			}
			path.push(...parents);
			const screenPath = path.join(' › ');
			if (subLabel !== categoryLabel) path.push(subLabel);
			let section = null;
			let indexed = 0;

			(sub.rows || []).forEach((row) => {
				if (row.kind === 'section') {
					section = (!row.when || row.when(ctx)) ? resolve(row.label, ctx) : null;
					return;
				}
				if (row.when && !row.when(ctx)) return;
				if (!isIndexable(row)) return;

				indexed++;
				const title = resolve(row.label, ctx);
				const desc = resolve(row.desc, ctx) || '';
				const optionLabels = row.kind === 'option' && row.options
					? row.options(ctx).map((option) => option.label).join(' ')
					: '';
				const keywords = row.keywords ? row.keywords(ctx).join(' ') : '';

				entries.push({
					id: `${category.id}.${sub.id}.${row.key || row.id}`,
					type: 'setting',
					categoryId: category.id,
					subcategoryId: sub.id,
					subcategoryLabel: subLabel,
					spotlightId: spotlightIdOf(row),
					icon: resolve(row.icon, ctx),
					title,
					breadcrumb: path.join(' › '),
					haystackTitle: normalize(title),
					haystackBody: normalize([desc, section, subLabel, categoryLabel, optionLabels, keywords].join(' '))
				});
			});

			// A screen with nothing in it isn't worth offering as a destination.
			if (sub.search === false || indexed === 0) return;
			const subDesc = resolve(sub.description, ctx) || '';
			const subKeywords = sub.keywords ? sub.keywords(ctx).join(' ') : '';
			entries.push({
				id: `screen:${category.id}.${sub.id}`,
				type: 'screen',
				categoryId: category.id,
				subcategoryId: sub.id,
				subcategoryLabel: subLabel,
				spotlightId: null,
				icon: resolve(category.icon, ctx),
				title: subLabel,
				breadcrumb: screenPath,
				haystackTitle: normalize(subLabel),
				haystackBody: normalize([subDesc, categoryLabel, subKeywords].join(' '))
			});
		});
	});

	return entries;
};

const scoreToken = (entry, token) => {
	const at = entry.haystackTitle.indexOf(token);
	if (entry.haystackTitle === token) return 100;
	if (at === 0) return 80;
	if (at > 0 && entry.haystackTitle.charAt(at - 1) === ' ') return 60;
	if (at > 0) return 40;
	return entry.haystackBody.indexOf(token) >= 0 ? 15 : 0;
};

// Ranks [index] against [query]. Every word has to appear somewhere in an entry, and a
// title match always beats a match that only came from the description or keywords.
export const matchSettings = (index, query, limit = MAX_RESULTS) => {
	const normalized = normalize(query);
	if (normalized.length < MIN_QUERY_LENGTH) return [];
	const tokens = normalized.split(' ');

	const scored = [];
	for (let i = 0; i < index.length; i++) {
		const entry = index[i];
		let total = 0;
		let titleOnly = true;

		for (let t = 0; t < tokens.length; t++) {
			const score = scoreToken(entry, tokens[t]);
			if (score === 0) {
				total = 0;
				break;
			}
			if (score <= 15) titleOnly = false;
			total += score;
		}

		if (total === 0) continue;
		if (titleOnly) total += 25;
		if (entry.type === 'screen') total -= 30;
		scored.push({entry, order: i, score: total});
	}

	scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
	return scored.slice(0, limit).map((item) => item.entry);
};
