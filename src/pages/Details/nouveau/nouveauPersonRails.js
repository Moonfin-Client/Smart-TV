// A person's page is their filmography, so each group that has anything in it becomes a rail of
// its own. What the library holds leads, and what Seerr only knows about follows.

import $L from '../../../services/i18n.js';

const PERSON_MOVIES = 'personMovies';
const PERSON_SERIES = 'personSeries';
const PERSON_GUEST = 'personGuest';
const PERSON_MUSIC = 'personMusic';
const PERSON_CREW = 'personCrew';
const PERSON_APPEARANCES = 'personAppearances';

export const buildPersonRails = ({filmography, appearances = [], crewCredits = []} = {}) => {
	const {movies = [], series = [], guestAppearances = [], musicVideos = []} = filmography || {};
	return [
		{id: PERSON_MOVIES, title: $L('Movies'), items: movies},
		{id: PERSON_SERIES, title: $L('Series'), items: series},
		{id: PERSON_GUEST, title: $L('Guest Appearances'), items: guestAppearances},
		{id: PERSON_MUSIC, title: $L('Music Videos'), items: musicVideos},
		{id: PERSON_CREW, title: $L('Crew Contributions (Seerr)'), items: crewCredits},
		{id: PERSON_APPEARANCES, title: $L('Appearances (Seerr)'), items: appearances}
	].filter((rail) => rail.items.length > 0);
};
