import {hiddenSet} from './buttonLayout';

// The parts of the Details screen a viewer can switch off, kept per kind of device like the
// metadata row and shared with Moonfin Core through the plugin. Only the TV list is read and
// written here. Ids are what gets stored, so renaming one brings back whatever the viewer had
// hidden with it. There is no order: each style lays its sections out itself.
export const DETAIL_SECTIONS_HIDDEN_KEY = 'hiddenDetailSectionsTv';

const CLASSIC = 'v1';
const MODERN = 'v2';
const SPOTLIGHT = 'v3';
const NOUVEAU = 'v4';
const MINIMALIST = 'v5';

// Where a section sits on the settings screen. The Seerr group takes the Seerr display name.
export const DETAIL_SECTION_GROUPS = [
	{id: 'header', label: 'Header'},
	{id: 'sections', label: 'Sections'},
	{id: 'seerr'},
	{id: 'person', label: 'Person pages'},
	{id: 'collection', label: 'Collection pages'}
];

// Each style draws only some of these, in its own way: the cast is a row on Classic, a tab on
// Modern, a card on Spotlight and a rail on Nouveau, and one switch covers every one of them.
// `styles` lists the styles that draw the section themselves. Person pages open on their own
// screen under every style but Nouveau, which draws them itself, so those count for all four.
//
// Labels are plain English and get translated where they are shown, with $L(section.label).
export const DETAIL_SECTIONS = [
	{id: 'logo', label: 'Logo', subtitle: 'Shows the title as text when off', group: 'header', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU, MINIMALIST]},
	{id: 'tagline', label: 'Tagline', group: 'header', styles: [CLASSIC, MODERN, SPOTLIGHT]},
	{id: 'poster', label: 'Poster', group: 'header', styles: [CLASSIC]},
	{id: 'upNext', label: 'Next Up', group: 'header', styles: [CLASSIC, MODERN]},
	{id: 'cast', label: 'Cast', subtitle: 'Also on collection pages', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'crew', label: 'Directors & writers', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'studios', label: 'Studios', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'chapters', label: 'Chapters', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'extras', label: 'Extras', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'collections', label: 'Collections', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT]},
	{id: 'moreLikeThis', label: 'More Like This', subtitle: 'Also similar albums and artists', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'reviews', label: 'Reviews', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'moreEpisodes', label: 'More episodes', subtitle: 'On episode pages', group: 'sections', styles: [CLASSIC, MODERN, SPOTLIGHT]},
	{id: 'mediaInfo', label: 'Media info', subtitle: 'File, streams and Direct Play check', group: 'sections', styles: [MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrGenresTags', label: 'Genres & tags', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrStats', label: 'Stats', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrStreaming', label: 'Streaming services', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrRecommendations', label: 'Recommendations', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrSimilar', label: 'Similar titles', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrCollection', label: 'Collection banner', group: 'seerr', styles: [CLASSIC, MODERN]},
	{id: 'seerrPersonAppearances', label: 'Appearances', subtitle: 'On person pages', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'seerrPersonCrew', label: 'Crew credits', subtitle: 'On person pages', group: 'seerr', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'biography', label: 'Biography', group: 'person', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'birthplace', label: 'Birthplace', group: 'person', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'guestAppearances', label: 'Guest appearances', group: 'person', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'musicVideos', label: 'Music videos', group: 'person', styles: [CLASSIC, MODERN, SPOTLIGHT, NOUVEAU]},
	{id: 'playlistOrder', label: 'Playlist order', group: 'collection', styles: [MODERN, SPOTLIGHT, NOUVEAU]}
];

// Whether picking `style` can put a section on screen. Minimalist only draws video pages and
// hands every other page to Spotlight, so it also shows whatever Spotlight does.
export const isAvailableIn = (section, style) =>
	section.styles.includes(style) || (style === MINIMALIST && section.styles.includes(SPOTLIGHT));

// The sections the settings screen lists for a style. The Seerr ones only make sense once the
// server offers Seerr at all.
export const offeredSections = (style, seerrAvailable) =>
	DETAIL_SECTIONS.filter((section) => isAvailableIn(section, style) && (section.group !== 'seerr' || seerrAvailable));

// Reads the stored list once and answers for every section, so one render agrees with itself
// on what is hidden. Other clients store ids this app has no switch for, and those pass
// through untouched since a toggle only ever adds or removes its own id.
export const sectionVisibility = (stored) => {
	const off = hiddenSet(stored);
	return (id) => !off.has(id);
};

export const SHOWS_EVERYTHING = () => true;

export const toggleHiddenSection = (stored, id) => {
	const off = hiddenSet(stored);
	if (off.has(id)) off.delete(id);
	else off.add(id);
	return [...off];
};
