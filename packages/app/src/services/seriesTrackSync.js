// The api that keeps a series' audio and subtitle choice on the server (Silo), for an item from the signed-in server
// or another one. Null when the item's server keeps none.

import * as jellyfinApi from './jellyfinApi';

export const trackChoiceApiFor = (item) => {
	let api = jellyfinApi.api;
	if (item?._serverUrl && item?._serverAccessToken && item?._serverUserId) {
		if (item._serverType !== 'silo') return null;
		api = jellyfinApi.createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId, 'silo');
	}
	return typeof api?.getSeriesTrackChoices === 'function' ? api : null;
};
