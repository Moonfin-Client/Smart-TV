import $L from '../services/i18n.js';

// Numbers the episode as E1 so a long title keeps its room. An episode with no title of its own
// still gets the spelled out label, since a bare number says nothing.
export const episodeCardTitle = (name, number) => {
	if (!name) return number == null ? '' : `${$L('Episode')} ${number}`;
	return number == null ? name : `E${number}: ${name}`;
};
