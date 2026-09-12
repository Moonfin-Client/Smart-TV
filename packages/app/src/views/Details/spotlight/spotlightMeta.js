import $L from '@enact/i18n/$L';

import {spotlightRuntimeLabel} from './spotlightCards';

// The facts line under the title. Each piece carries its kind so the status can draw as a
// coloured pill and the runtime can lead with a clock, rather than being joined into a string.
export const spotlightMetaPieces = ({item, year, officialRating, seasonCount, episodeCount, genres = []}) => {
	const pieces = [];
	const addText = (text) => {
		if (text) pieces.push({kind: 'text', text});
	};

	addText(year ? String(year) : null);
	addText(officialRating);

	if (item.Type === 'Series' && seasonCount) {
		addText($L('{count} Seasons').replace('{count}', seasonCount));
	}
	if (item.Type === 'Season' && episodeCount) {
		addText($L('{count} Episodes').replace('{count}', episodeCount));
	}
	if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) {
		addText(`S${item.ParentIndexNumber}:E${item.IndexNumber}`);
	}
	if (item.Type === 'Series' && item.Status) {
		const ended = item.Status === 'Ended';
		if (ended || item.Status === 'Continuing') {
			pieces.push({kind: 'status', text: ended ? $L('Ended') : $L('Continuing'), ended});
		}
	}
	// A series runs for as long as it runs, so the runtime of one episode says nothing.
	if (item.RunTimeTicks && item.Type !== 'Series') {
		pieces.push({kind: 'runtime', text: spotlightRuntimeLabel(item.RunTimeTicks)});
	}
	if (genres.length) {
		addText(genres.slice(0, 3).join(' · '));
	}
	return pieces;
};
