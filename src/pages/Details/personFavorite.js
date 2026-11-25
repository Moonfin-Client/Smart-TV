import {isPlexServer} from '../../utils/plexUrls';

// Plex keeps no favorites for people, so a person there gets no Favorite button.
export const offersFavorite = (isPerson, serverUrl) => !isPerson || !isPlexServer(serverUrl);
