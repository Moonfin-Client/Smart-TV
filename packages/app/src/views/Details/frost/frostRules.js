import $L from '@enact/i18n/$L';

import seerrApi from '../../../services/seerrApi';
import {toCssColor, toRgbTriplet} from '../../../theme/themeSpec';
import {formatFileSize} from '../../../utils/formatFileSize';
import {formatDuration} from '../../../utils/helpers';
import {rem, rootScale} from '../../../utils/rootScale';
import {buildMediaFacts} from '../../../utils/seerrMediaFacts';
import {MEDIA_STATUS} from '../../../utils/seerrStatus';
import {parseServerDate} from '../../../utils/serverDate';
import {uiLocale} from '../../../utils/uiLocale';
import {videoLines} from '../nouveau/nouveauFooterFields';
import {ACTIONS, NAVBAR} from '../stage/stageRules';

const SHOW_TYPES = ['Series', 'Season', 'Episode'];

// Play, four circles and the ellipsis fit across the toolbar, and the viewer's own button count can
// lower that but never lift it.
export const FROST_BUTTON_CAP = 6;

// The tabs along the bar, in order. Each one shows only when it has something in it, and the counts
// are already down to nothing for a section the viewer hid. A show leads with its episodes and a
// film with its cast. Episodes waits on its section only on an episode's page, where it's the rest
// of the show. A title only in Seerr has its seasons in place of episodes, its related titles from
// Seerr and no Seerr tab, since the whole page is Seerr's.
export const frostTabs = (item, {seerrOnly, showsSection, seasons = 0, cast = 0, extras = 0, related = 0, seerr = 0}) => {
	const show = SHOW_TYPES.indexOf(item.Type) >= 0;
	if (seerrOnly) {
		return ['overview', show ? seasons > 0 && 'seasons' : cast > 0 && 'cast', related > 0 && 'related', 'details'].filter(Boolean);
	}
	return [
		'overview',
		show ? (item.Type !== 'Episode' || showsSection('moreEpisodes')) && 'episodes' : cast > 0 && 'cast',
		extras > 0 && 'extras',
		related > 0 && 'related',
		seerr > 0 && 'seerr',
		'details'
	].filter(Boolean);
};

// The segments a tab of Seerr's titles splits into, each only while Seerr has it and its section is
// on. The Seerr tab also gets About, for the numbers, where to watch and the tags.
export const frostSegments = (pieces = {}, {about = false} = {}) => [
	pieces.recommendations && 'recommendations',
	pieces.similar && 'similar',
	about && (pieces.facts || pieces.streaming || pieces.chips) && 'about'
].filter(Boolean);

// The season shown: the one picked, else the one the viewer is in, else the first that isn't
// Specials.
export const frostSeason = (numbers, picked, ownSeason, nextUpSeason) => {
	if (!numbers.length) return null;
	const current = picked ?? ownSeason ?? nextUpSeason;
	if (numbers.indexOf(current) >= 0) return current;
	const first = numbers.find((number) => number > 0);
	return first ?? numbers[0];
};

// How many tiles each tab sets across a row. Overview and Details aren't grids.
export const FROST_COLUMNS = {episodes: 1, seasons: 1, cast: 5, extras: 3, related: 7, seerr: 7};

// Where an arrow press takes focus from a stop, by its key. A key is `tab:<tab>` in the tab bar and
// `<tab>:<index>` in a tab's content, with `overview:text`, `overview:track:<n>`, `<tab>:about`,
// and `<tab>:pill:<n>` for the season or segment pills over a tab. What comes back is another key,
// one of the stand ins, or null to stay put.
//
// In the tab bar Left and Right walk the tabs and Up goes back to the toolbar. In a tab's content
// Down off the last row goes to the toolbar, Up off the first row to the pills when there are any,
// and Down off the pills to where the content starts. Off the content's left edge is the sidebar
// when it's docked there, off its top edge the bar along the top when that's where it is, and the
// other edges hold.
//
// `ctx` holds what the keys can't say: the tabs, whether the bar runs along the top, the overview's
// text and track count, how many pills the tab has and which is shown, where its content starts,
// and how many tiles it has.
export const frostNeighbour = (key, direction, ctx) => {
	const parts = key.split(':');
	const leftEdge = ctx.navbarTop ? null : NAVBAR;
	const topEdge = ctx.navbarTop ? NAVBAR : null;

	if (parts[0] === 'tab') {
		const at = ctx.tabs.indexOf(parts[1]);
		if (direction === 'up') return ACTIONS;
		if (direction === 'left') return at > 0 ? `tab:${ctx.tabs[at - 1]}` : leftEdge;
		if (direction === 'right') return at + 1 < ctx.tabs.length ? `tab:${ctx.tabs[at + 1]}` : null;
		return null;
	}

	const tab = parts[0];
	const pills = ctx.pills > 0 ? `${tab}:pill:${ctx.shownPill}` : null;

	if (tab === 'overview') {
		if (parts[1] === 'text') {
			if (direction === 'left') return leftEdge;
			if (direction === 'right') return ctx.tracks > 0 ? 'overview:track:0' : null;
			return direction === 'down' ? ACTIONS : topEdge;
		}
		const track = Number(parts[2]);
		if (direction === 'left') return ctx.hasText ? 'overview:text' : leftEdge;
		if (direction === 'right') return null;
		if (direction === 'up') return track > 0 ? `overview:track:${track - 1}` : topEdge;
		return track + 1 < ctx.tracks ? `overview:track:${track + 1}` : ACTIONS;
	}

	if (parts[1] === 'pill') {
		const pill = Number(parts[2]);
		if (direction === 'left') return pill > 0 ? `${tab}:pill:${pill - 1}` : leftEdge;
		if (direction === 'right') return pill + 1 < ctx.pills ? `${tab}:pill:${pill + 1}` : null;
		if (direction === 'up') return topEdge;
		return ctx.start;
	}

	if (tab === 'details' || parts[1] === 'about') {
		if (direction === 'left') return leftEdge;
		if (direction === 'up') return pills || topEdge;
		return direction === 'down' ? ACTIONS : null;
	}

	const index = Number(parts[1]);
	const columns = FROST_COLUMNS[tab];
	const count = ctx.count;
	const row = Math.floor(index / columns);
	if (direction === 'left') return index % columns === 0 ? leftEdge : `${tab}:${index - 1}`;
	if (direction === 'right') return index % columns === columns - 1 || index === count - 1 ? null : `${tab}:${index + 1}`;
	if (direction === 'up') return row > 0 ? `${tab}:${index - columns}` : pills || topEdge;
	return row === Math.floor((count - 1) / columns) ? ACTIONS : `${tab}:${Math.min(index + columns, count - 1)}`;
};

const STAGE = {width: 1920, height: 1080};

// Frost lays out on a stage at least 1920 by 1080 that takes the shape of the room the navigation
// leaves it, under the bar along the top or beside the sidebar. A wide room gets a wider stage and a
// narrow one a taller stage rather than bars at the sides or the ends, and the stage is then scaled
// to fill the room. `scale` is screen pixels per design pixel, which the UI scale setting changes.
// Comes back with the stage's size in design pixels, its scale and where its top left corner sits.
export const frostStageFit = ({width, height, scale, top = 0, left = 0}) => {
	const roomWidth = width - left;
	const roomHeight = height - top;
	const stageWidth = Math.max(STAGE.width, (STAGE.height * roomWidth) / roomHeight);
	return {
		width: stageWidth,
		height: (stageWidth * roomHeight) / roomWidth,
		fit: roomWidth / (stageWidth * scale),
		left,
		top
	};
};

// The room the bar along the top takes, and the sidebar's width while it's closed.
const TOOLBAR_ROOM = 135;
const SIDEBAR_ROOM = 78;

// The stage's size and transform on this screen, so the page and its skeleton land in the same
// place.
export const frostStageStyle = (navbarTop) => {
	const scale = rootScale();
	const stage = frostStageFit({
		width: window.innerWidth,
		height: window.innerHeight,
		scale,
		top: navbarTop ? TOOLBAR_ROOM * scale : 0,
		left: navbarTop ? 0 : SIDEBAR_ROOM * scale
	});
	const size = {width: rem(stage.width), height: rem(stage.height)};
	if (Math.abs(stage.fit - 1) < 0.001 && !stage.left && !stage.top) return size;
	const transform = `translate(${stage.left}px, ${stage.top}px) scale(${stage.fit})`;
	return {...size, WebkitTransform: transform, transform};
};

// scrimStyle caches by the layers it's handed, so each background keeps one copy of them.
const scrims = new Map();

// The vignette in the dim over the blurred art and the fade over the window's art, both in the
// theme's background color. `rgb` is that color as a triplet.
export const frostScrims = (rgb) => {
	if (!scrims.has(rgb)) {
		scrims.set(rgb, {
			vignette: [{at: [0.5, 0.45], radius: 0.9, rgb, stops: [[0.35, 0], [1, 0.5]]}],
			artFade: [
				{to: 'top', rgb, stops: [[0, 0.95], [0.5, 0.74], [0.8, 0]]},
				{to: 'right', rgb, stops: [[0, 0.5], [0.62, 0]]}
			]
		});
	}
	return scrims.get(rgb);
};

// The colors a title's place in Seerr takes from the theme. A title nobody asked for has no color of
// its own and takes the page's faded text color.
export const frostStatusColors = (theme) => ({
	available: toCssColor(theme.semantic.statusAvailable),
	requested: toCssColor(theme.semantic.statusRequested),
	pending: toCssColor(theme.semantic.statusPending),
	none: `rgba(${toRgbTriplet(theme.colors.onBackground)}, 0.55)`
});

// Where a title stands in Seerr, as a label and the color its dot and line take.
export const frostSeerrStatus = (status, colors) => {
	switch (status) {
		case MEDIA_STATUS.AVAILABLE: return {label: $L('Available'), color: colors.available};
		case MEDIA_STATUS.PARTIALLY_AVAILABLE: return {label: $L('Partially Available'), color: colors.available};
		case MEDIA_STATUS.PROCESSING: return {label: $L('Requested'), color: colors.requested};
		case MEDIA_STATUS.PENDING: return {label: $L('Pending'), color: colors.pending};
		default: return {label: $L('Not Requested'), color: colors.none};
	}
};

const names = (list) => list.map((entry) => entry?.Name ?? entry?.name).filter(Boolean).join(', ');

// The credit line under the overview: the first three actors, then the directors.
export const frostCredits = (item, {cast, showsSection}) => {
	const directors = showsSection('crew') ? names((item.People || []).filter((person) => person.Type === 'Director')) : '';
	return [
		{label: $L('Cast'), names: names(cast.slice(0, 3))},
		{label: $L('Director'), names: directors}
	].filter((credit) => credit.names);
};

// A group of label and value rows, leaving out a row with nothing to say, and the group too once it
// has none. A row can carry a logo, which says enough on its own.
const group = (title, rows) => {
	const kept = rows.filter((row) => row[1] || row[2]);
	return kept.length ? [{title, rows: kept}] : [];
};

// What Seerr adds about a title: its numbers, where it streams and what it's filed under. `facts`
// heads the numbers, which go without a heading where the tab already says what they are.
// `genres` is off where the page lists the genres already.
export const frostSeerrGroups = (seerr, {facts = null, genres = true} = {}) => {
	const pieces = seerr.pieces || {};
	const details = seerr.details || {};
	return [
		...(pieces.facts ? group(facts, buildMediaFacts(details, seerr.mediaType).map((fact) => [fact.label, fact.value])) : []),
		...(pieces.streaming
			? group($L('Streaming on'), (seerr.streamingProviders || []).map((provider) => [provider.name, '', seerrApi.getImageUrl(provider.logoPath, 'w92')]))
			: []),
		...(pieces.chips
			? group($L('Tags'), [
				[$L('Genres'), genres ? names(details.genres || []) : ''],
				[$L('Tags'), names(details.keywords || [])]
			])
			: [])
	];
};

// The Details tab's groups of label and value rows: the general facts, the languages of the version
// picked, and what the file is. The facts sit straight under the tab's title, so they have no
// heading of their own. A title only in Seerr has no file, and gets Seerr's own groups instead.
export const frostInfo = (item, {showsSection, mediaSource, seerr}) => {
	const people = showsSection('crew') ? item.People || [] : [];
	const crew = (type) => names(people.filter((person) => person.Type === type));
	const released = parseServerDate(item.PremiereDate);
	const information = group(null, [
		[$L('Studios'), showsSection('studios') ? names(item.Studios || []) : ''],
		// A premiere date is midnight UTC, so it's read in UTC to stay on its day west of it.
		[$L('Release Date'), released && released.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'})],
		[$L('Runtime'), item.RunTimeTicks > 0 ? formatDuration(item.RunTimeTicks) : ''],
		[$L('Parental Rating'), item.OfficialRating],
		[$L('Director'), crew('Director')],
		[$L('Writer'), crew('Writer')],
		[$L('Genres'), (item.Genres || []).join(', ')]
	]);
	if (seerr) return [...information, ...frostSeerrGroups(seerr, {facts: $L('About'), genres: false})];

	const streams = mediaSource?.MediaStreams || [];
	const languages = (type) => streams
		.filter((stream) => stream.Type === type)
		.map((stream) => (stream.Language ? String(stream.Language).toUpperCase() : '?'))
		.filter((code, index, all) => all.indexOf(code) === index)
		.join(', ');

	const media = [];
	if (mediaSource && showsSection('mediaInfo')) {
		const video = streams.find((stream) => stream.Type === 'Video');
		media.push(
			[$L('Version'), (item.MediaSources || []).length > 1 ? names(item.MediaSources) : ''],
			[$L('File'), String(mediaSource.Path || '').split(/[\\/]/).pop()],
			[$L('Video'), video ? videoLines(video).join(' · ') : ''],
			[$L('Container'), mediaSource.Container ? String(mediaSource.Container).toUpperCase() : ''],
			[$L('Size'), formatFileSize(mediaSource.Size)]
		);
	}

	return [
		...information,
		...group($L('Language'), [[$L('Audio'), languages('Audio')], [$L('Subtitles'), languages('Subtitle')]]),
		...group($L('Media info'), media)
	];
};
