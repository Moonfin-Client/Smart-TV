import $L from '@enact/i18n/$L';

export const coreLabel = (core) => ({arcade: 'FBNeo', mame: 'MAME'}[core] || core);

const isArcadeFamilyCore = (core) => core === 'arcade' || core === 'mame';

// The cores a game can switch between, the server's recommendation first. The server only takes
// a core choice when its game detail carries availableCores, even an empty list. Arcade games
// always offer both FBNeo and MAME, since the server only lists the ones it checked the zip
// against. A core the server has data for but didn't validate the zip against says so.
export const coreChoices = (game) => {
	if (!game || !Object.prototype.hasOwnProperty.call(game, 'availableCores')) return [];
	const available = Array.isArray(game.availableCores) ? game.availableCores : [];
	const recommended = game.recommendedCore || game.core;
	const cores = [];
	const add = (core) => {
		if (core && !cores.includes(core)) cores.push(core);
	};
	add(recommended);
	add(game.core);
	available.forEach(add);
	if (isArcadeFamilyCore(game.core) || isArcadeFamilyCore(recommended)) {
		add('arcade');
		add('mame');
	}
	return cores.map((core) => {
		const isRecommended = core === recommended;
		let detail = null;
		if (isRecommended) {
			detail = game.coreCompatibilityReason || null;
		} else if (available.length && !available.includes(core)) {
			detail = $L('This archive is not validated for {core} and may not launch correctly.').replace('{core}', coreLabel(core));
		}
		return {
			core,
			label: isRecommended ? $L('{core} (Recommended)').replace('{core}', coreLabel(core)) : coreLabel(core),
			detail
		};
	});
};
