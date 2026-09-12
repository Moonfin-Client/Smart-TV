import {ordered, hiddenSet, arrange, withUnknownIds} from './buttonLayout';

export const DETAIL_METADATA_ORDER_KEY = 'detailMetadataOrderTv';
export const DETAIL_METADATA_HIDDEN_KEY = 'hiddenDetailMetadataTv';

// The default list of metadata elements shown on the details screen.
// Each item has an id matching Moonfin-Core and Moonbase, a display label,
// and an optional subtitle providing user context in the settings list.
export const DETAIL_METADATA = [
	{id: 'year', label: 'Release Year'},
	{id: 'parentalRating', label: 'Parental Rating'},
	{id: 'runtimeAndSeasons', label: 'Runtime & Seasons'},
	{id: 'status', label: 'Series Status', subtitle: 'Shows whether the series is continuing, ended, or returning'},
	{id: 'upcomingEpisodeDate', label: 'Upcoming Episodes', subtitle: 'Uses Sonarr and TMDB to show upcoming release dates'},
	{id: 'genres', label: 'Genres'},
	{id: 'seerrAvailability', label: 'Seerr Availability', subtitle: 'Shows request and media availability status from Seerr'}
];

export {ordered, hiddenSet, arrange, withUnknownIds};
