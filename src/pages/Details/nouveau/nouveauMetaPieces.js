import $L from '../../../services/i18n.js';

import {personDateLines} from '../../../utils/personCredits';

// The facts line under the hero's title. Genres, the series status and the ratings have rows of
// their own, so they're left out.
export const nouveauMetaPieces = ({item, year, officialRating, runtime, endsAt, seasonCount, episodeCount, showsBirthplace = true}) => {
	const pieces = [];
	const add = (text) => {
		if (text) pieces.push(text);
	};

	// A person has no year, rating or runtime, so their line is when they lived and where they
	// were born.
	if (item.Type === 'Person') {
		personDateLines(item.PremiereDate, item.EndDate).forEach(add);
		if (showsBirthplace) add(item.ProductionLocations?.[0]);
		return pieces;
	}

	add(year ? String(year) : null);
	add(officialRating);

	if (item.Type === 'Series' && seasonCount) {
		add($L('{count} Seasons').replace('{count}', seasonCount));
	}
	if (item.Type === 'Season' && episodeCount) {
		add($L('{count} Episodes').replace('{count}', episodeCount));
	}
	if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) {
		add(`S${item.ParentIndexNumber}:E${item.IndexNumber}`);
	}

	// A series runs for as long as it runs, so the runtime of one episode says nothing. A season
	// is the one place worth saying when it would finish, since watching it through is a sitting.
	if (runtime && item.Type !== 'Series') {
		add(runtime);
		if (item.Type === 'Season') add(endsAt);
	}

	return pieces;
};
