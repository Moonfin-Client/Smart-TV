import $L from '@enact/i18n/$L';

import {spotlightRuntimeLabel} from './spotlightCards';
import {DETAIL_METADATA, arrange} from '../../../utils/detailMetadataLayout';

// The facts line under the title. Each piece carries its kind so the status can draw as a
// coloured pill and the runtime can lead with a clock, arranged according to the user's preferences.
export const spotlightMetaPieces = ({
	item = {}, year, officialRating, seasonCount, episodeCount, genres = [],
	upcomingEpisodeText, hasSeerrPills, settings = {}
}) => {
	const orderedItems = arrange(DETAIL_METADATA, {
		order: settings.detailMetadataOrderTv,
		hidden: settings.hiddenDetailMetadataTv
	});

	const pieceFor = (id) => {
		switch (id) {
			case 'year':
				return year ? [{kind: 'text', text: String(year)}] : [];
			case 'parentalRating':
				return officialRating ? [{kind: 'text', text: officialRating}] : [];
			case 'runtimeAndSeasons': {
				if (item.Type === 'Series' && seasonCount) {
					return [{kind: 'text', text: $L('{count} Seasons').replace('{count}', seasonCount)}];
				}
				if (item.Type === 'Season' && episodeCount) {
					return [{kind: 'text', text: $L('{count} Episodes').replace('{count}', episodeCount)}];
				}
				if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) {
					return [{kind: 'text', text: `S${item.ParentIndexNumber}:E${item.IndexNumber}`}];
				}
				if (item.RunTimeTicks && item.Type !== 'Series') {
					return [{kind: 'runtime', text: spotlightRuntimeLabel(item.RunTimeTicks)}];
				}
				return [];
			}
			case 'status': {
				if (item.Type === 'Series' && item.Status) {
					const ended = item.Status === 'Ended';
					if (ended || item.Status === 'Continuing') {
						return [{kind: 'status', text: ended ? $L('Ended') : $L('Continuing'), ended}];
					}
				}
				return [];
			}
			case 'upcomingEpisodeDate':
				return upcomingEpisodeText ? [{kind: 'upcoming', text: upcomingEpisodeText}] : [];
			case 'genres':
				return genres.length ? [{kind: 'text', text: genres.slice(0, 3).join(' · ')}] : [];
			case 'seerrAvailability':
				return hasSeerrPills ? [{kind: 'seerr'}] : [];
			default:
				return [];
		}
	};

	return orderedItems.flatMap((itemDef) => pieceFor(itemDef.id));
};
