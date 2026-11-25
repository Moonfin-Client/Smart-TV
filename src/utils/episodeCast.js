import $L from '../services/i18n.js';

const formatGuestStarRole = (role) => {
	const clean = (role || '').trim();
	const label = $L('Guest Star');
	if (!clean) return label;
	if (clean.toLowerCase().includes(label.toLowerCase())) return clean;
	return $L('{role} (Guest Star)').replace('{role}', clean);
};

const formatEpisodeDirectorRole = (role) => {
	const clean = (role || '').trim();
	const director = $L('Director');
	const episodeDirector = $L('Episode Director');
	if (
		!clean ||
		clean.toLowerCase() === 'director' ||
		clean.toLowerCase() === director.toLowerCase() ||
		clean.toLowerCase() === episodeDirector.toLowerCase()
	) {
		return episodeDirector;
	}
	return $L('{role} (Episode Director)').replace('{role}', clean);
};

const formatEpisodeWriterRole = (role) => {
	const clean = (role || '').trim();
	const writer = $L('Writer');
	const episodeWriter = $L('Episode Writer');
	if (
		!clean ||
		clean.toLowerCase() === 'writer' ||
		clean.toLowerCase() === writer.toLowerCase() ||
		clean.toLowerCase() === episodeWriter.toLowerCase()
	) {
		return episodeWriter;
	}
	return $L('{role} (Episode Writer)').replace('{role}', clean);
};

const actorsOf = async (apiClient, id) => {
	if (!apiClient || !id) return [];
	try {
		const item = await apiClient.getItem(id);
		const people = Array.isArray(item?.People) ? item.People : [];
		return people.filter((p) => p.Type === 'Actor' || p.Type === 'GuestStar');
	} catch (err) {
		return [];
	}
};

export const resolveParentCast = async ({ apiClient, seasonId, seriesId }) => {
	if (!apiClient) return [];

	if (seasonId) {
		const seasonActors = await actorsOf(apiClient, seasonId);
		if (seasonActors.length > 0) return seasonActors;
	}

	if (seriesId) {
		const seriesActors = await actorsOf(apiClient, seriesId);
		if (seriesActors.length > 0) return seriesActors;
	}

	return [];
};

export const mergeEpisodeCast = ({ episodeActors = [], parentActors = [] } = {}) => {
	const formattedEpisodeActors = episodeActors.map((p) => {
		if (p.Type !== 'GuestStar') return p;
		return {
			...p,
			Role: formatGuestStarRole(p.Role)
		};
	});

	const existingIds = new Set();
	const existingNames = new Set();
	for (const p of formattedEpisodeActors) {
		if (p?.Id) {
			existingIds.add(String(p.Id));
		} else if (p?.Name) {
			existingNames.add(p.Name.trim().toLowerCase());
		}
	}

	const merged = [...formattedEpisodeActors];
	for (const p of parentActors) {
		if (!p) continue;
		if (p.Id) {
			if (existingIds.has(String(p.Id))) continue;
		} else if (p.Name) {
			if (existingNames.has(p.Name.trim().toLowerCase())) continue;
		}
		merged.push(p);
	}

	return merged;
};

export const mergeEpisodePeople = ({ episodePeople = [], parentActors = [] } = {}) => {
	const episodeActors = [];
	const episodeCrew = [];

	for (const p of episodePeople) {
		if (!p) continue;
		const type = p.Type;
		if (type === 'Actor' || type === 'GuestStar') {
			episodeActors.push(p);
		} else if (type === 'Director') {
			episodeCrew.push({
				...p,
				Role: formatEpisodeDirectorRole(p.Role)
			});
		} else if (type === 'Writer') {
			episodeCrew.push({
				...p,
				Role: formatEpisodeWriterRole(p.Role)
			});
		} else {
			episodeCrew.push(p);
		}
	}

	return [...mergeEpisodeCast({ episodeActors, parentActors }), ...episodeCrew];
};
