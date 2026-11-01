import {KIND, SETTINGS_SCHEMA, resolve, spotlightIdOf} from '../settingsSchema';
import {ratingKey} from '../../../utils/ratingSources';
import {SUBTITLE_STYLE_KEYS, hdrKeyFor} from '../../../utils/subtitleConstants';

// The ratings rows a surface keeps for itself, the links to its source list and reset among
// them. Episode ratings are left out since the previews draw a film.
const ratingRows = (surface) => ['mdblistEnabled', 'ratingSources', 'showRatingLabels', 'showRatingBadges', 'resetRatings']
	.map((name) => ratingKey(surface, name));

// Settings whose home preview is the media bar rather than the navbar and rows.
export const MEDIA_BAR_KEYS = ['featuredBarStyle', 'mediaBarOverlayColor', 'mediaBarOverlayOpacity', ...ratingRows('mediaBar')];

// Settings whose home preview holds the first card in focus, since that's where the
// modern rows draw their ratings.
export const FOCUSED_CARD_KEYS = ratingRows('homeRows');

export const NAV_BUTTON_KEYS = [
	'showShuffleButton', 'showGenresButton', 'showFavoritesButton', 'showLiveTvButton', 'showLibrariesInToolbar',
	'showLibrariesIndividually', 'syncplayEnabled', 'showSyncPlayButton', 'showSeerrButton', 'showServerMessagesButton',
	'showFriendsButton'
];

// The settings that change how the loading animation, the scrub thumbnails and the
// screensaver look, each drawn on the stage rather than in a preview of its own.
export const LOADING_KEYS = ['loadingAnimationImage', 'loadingAnimationSize', 'loadingAnimationPosition', 'loadingAnimationSpeed', 'showLoadingAnimationText'];
export const TRICKPLAY_KEYS = ['trickPlayMode', 'trickPlayPreviewScale', 'trickPlayVerticalPosition', 'trickPlayFollowScrub'];
// The subtitle appearance settings, drawn on the player's subtitle line. The HDR ones draw it in
// the HDR style.
export const SUBTITLE_HDR_KEYS = ['subtitleHdrSeparate', ...SUBTITLE_STYLE_KEYS.map(hdrKeyFor)];
export const SUBTITLE_LOOK_KEYS = [...SUBTITLE_STYLE_KEYS, ...SUBTITLE_HDR_KEYS];
export const SCREENSAVER_KEYS = [
	'screensaverEnabled', 'screensaverDimmingLevel', 'screensaverBackdrop', 'screensaverComponent', 'screensaverMovement',
	'screensaverSize', 'screensaverPosition'
];

// The screens and sections whose every tile keeps the stage on one look, with the scene it's
// drawn on. A tile there that doesn't change the look still keeps it up and says it isn't shown.
const STAGES = {
	loading: {scene: 'player', screens: ['appearance.loadingAnimation'], links: ['loadingAnimation']},
	screensaver: {scene: 'home', screens: ['appearance.screensaver'], links: ['screensaver']},
	trickplay: {scene: 'player', screens: ['playback.player.trickPlay'], links: []},
	subtitles: {scene: 'player', screens: ['playback.subtitleCustomization'], links: ['subtitleCustomization']}
};

const stageFor = (place) => Object.keys(STAGES).find((stage) => (
	STAGES[stage].screens.indexOf(place) >= 0 || STAGES[stage].links.indexOf(place) >= 0
)) || null;

const sceneFor = (keys, scene) => Object.fromEntries(keys.map((key) => [key, scene]));

// The mock screen each setting changes, and the links whose screens edit what a preview
// draws. Settings missing here leave the preview on whatever it was showing.
export const SCENE_BY_KEY = {
	showClock: 'home',
	clockDisplay: 'home',
	navbarPosition: 'home',
	navbarAlwaysExpanded: 'home',
	...sceneFor(NAV_BUTTON_KEYS, 'home'),
	navbarColor: 'home',
	navbarOpacity: 'home',
	homeRowsStyle: 'home',
	homeRowsPosterSize: 'home',
	fullScreenRows: 'home',
	...sceneFor(MEDIA_BAR_KEYS, 'home'),
	...sceneFor(FOCUSED_CARD_KEYS, 'home'),
	detailScreenStyle: 'details',
	personalRatingStyle: 'details',
	detailsBackdropEnabled: 'details',
	backdropBlurDetail: 'details',
	detailButtons: 'details',
	detailButtonsMaxVisible: 'details',
	detailMetadata: 'details',
	detailExpandedTabs: 'details',
	detailShowTechnicalDetails: 'details',
	hideDetailsMediaDescription: 'details',
	...sceneFor(ratingRows(''), 'details'),
	playerZoomMode: 'player',
	showDescriptionOnPause: 'player',
	showChapterMarkers: 'player',
	osdButtons: 'player',
	...sceneFor([
		'progressBarTime', 'playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight',
		'playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight'
	], 'player'),
	subtitleMode: 'player',
	subtitleLanguage: 'player',
	introAction: 'player',
	nextUpBehavior: 'player',
	...sceneFor([...LOADING_KEYS, 'loadingAnimation', ...TRICKPLAY_KEYS], 'player'),
	...sceneFor([...SUBTITLE_LOOK_KEYS, 'subtitleCustomization'], 'player'),
	...sceneFor([...SCREENSAVER_KEYS, 'screensaver'], 'home'),
	keyboardStyle: 'search'
};

let rowsBySpotlightId = null;

// Each row keeps the labels on its way: the category, every screen opened to reach it the
// way the search breadcrumb names them, and the section it sits under.
const indexRows = () => {
	const index = {};
	SETTINGS_SCHEMA.forEach((category) => {
		index[`cat-${category.id}`] = {kind: 'category', label: category.label, desc: category.description};
		const subsById = {};
		category.subcategories.forEach((sub) => {
			subsById[sub.id] = sub;
		});
		category.subcategories.forEach((sub) => {
			const screens = [category.label];
			for (let parent = subsById[sub.parent]; parent; parent = subsById[parent.parent]) {
				screens.splice(1, 0, parent.label);
			}
			index[`subcat-${sub.id}`] = {kind: 'subcategory', label: sub.label, path: screens.slice()};
			screens.push(sub.label);
			const screen = `${category.id}.${sub.id}`;
			let section = null;
			(sub.rows || []).forEach((row) => {
				if (row && row.kind === KIND.SECTION) {
					section = row;
				} else if (row && (row.key || row.id) && row.kind !== KIND.DIVIDER) {
					index[spotlightIdOf(row)] = {
						...row,
						path: section ? [...screens, section] : screens,
						stage: stageFor(row.id) || stageFor(screen) || (section && stageFor(`${screen}.${section.id}`))
					};
				}
			});
		});
	});
	return index;
};

const safeResolve = (value, ctx, fallback) => {
	try {
		const resolved = resolve(value, ctx);
		return resolved == null ? fallback : resolved;
	} catch (e) {
		return fallback;
	}
};

// A section only counts while it's drawn, and the path never repeats a label or ends on the
// setting's own name.
const pathText = (parts, title, ctx) => {
	const labels = [];
	parts.forEach((part) => {
		const section = part && part.kind === KIND.SECTION;
		if (section && part.when && !safeResolve(part.when, ctx, true)) return;
		const label = safeResolve(section ? part.label : part, ctx, '');
		if (label && label !== labels[labels.length - 1]) labels.push(label);
	});
	if (labels[labels.length - 1] === title) labels.pop();
	return labels.join(' › ');
};

// What the inspector shows for the row with [spotlightId]: its name, the path to it, its scene,
// and for a picker every choice with the saved one marked. A category keeps its description,
// and stage names the look its screen keeps on the preview. [schema] is the context Settings
// resolves its rows with, so labels like the Seerr name and the platform read the same here.
// The index only keeps the schema's own rows, so every label is resolved fresh on each call.
export const describeRow = (spotlightId, settings, schema = null) => {
	if (!spotlightId) return null;
	if (!rowsBySpotlightId) rowsBySpotlightId = indexRows();
	const row = rowsBySpotlightId[spotlightId];
	if (!row) return null;
	const ctx = {...schema, settings};
	const resolved = row.kind === KIND.OPTION ? safeResolve(row.options, ctx, []) : [];
	const options = Array.isArray(resolved) ? resolved : [];
	// A link the preview draws stands in for the settings its screen edits.
	const key = row.key || (SCENE_BY_KEY[row.id] ? row.id : null);
	const title = safeResolve(row.label, ctx, '');
	return {
		key,
		title,
		description: row.kind === 'category' ? safeResolve(row.desc, ctx, '') : '',
		path: row.path ? pathText(row.path, title, ctx) : '',
		scene: key ? SCENE_BY_KEY[key] || null : null,
		stage: row.stage || null,
		options,
		saved: options.findIndex((option) => option.value === settings[row.key])
	};
};

// The scene the stage switches to for a described row: its stage's, else its own.
export const sceneOfRow = (row) => (row && row.stage ? STAGES[row.stage].scene : (row && row.scene) || null);
