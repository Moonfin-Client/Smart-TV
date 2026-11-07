// The build inlines every var(--theme-x, fallback) to its fallback for the older
// engines, so the stylesheets ship with Moonfin's colors baked in no matter which
// theme is active. This module rebuilds the themed parts of those stylesheets at
// runtime with literal colors from the resolved theme and injects them after the
// bundled CSS. Class names come from the same CSS module objects the components
// use, which keeps the selectors valid under production hashing, and plain
// injected CSS parses fine on every engine we ship to.
//
// Only the parts a theme owns are emitted. Fixed colors, like the detail
// backdrop scrim or the sidebar avatar gradient, stay in the stylesheets.

import {
	contrastRatio,
	DEFAULT_ERROR_COLOR,
	inkOn,
	MIN_BUTTON_CONTRAST,
	radiusToCss,
	relativeLuminance,
	resolveFocusBorderColor,
	shadowToCss,
	toCssColor,
	toCssColorWithAlpha,
	toRgbTriplet
} from './themeSpec';
import {resolveOverlayColor} from './overlayColors';

import appCss from '../App/App.module.less';
import sidebarCss from '../components/Sidebar/Sidebar.module.less';
import navBarCss from '../components/NavBar/NavBar.module.less';
import settingsCss from '../views/Settings/Settings.module.less';
import panelCss from '../components/SettingsPanel/SettingsPanel.module.less';
import achievementsCss from '../views/Settings/achievements/Achievements.module.less';
import searchCss from '../views/Search/Search.module.less';
import detailsCss from '../views/Details/Details.module.less';
import trackOptionCss from '../components/TrackOptionRow/TrackOptionRow.module.less';
import modernDetailCss from '../views/Details/ModernDetailContent.module.less';
import modernFileInfoCss from '../views/Details/ModernFileInformation.module.less';
import spotlightCss from '../views/Details/spotlight/SpotlightDetailContent.module.less';
import spotlightCardCss from '../views/Details/spotlight/SpotlightSummaryCard.module.less';
import spotlightModalCss from '../views/Details/spotlight/SpotlightSectionModal.module.less';
import spotlightGridCss from '../views/Details/spotlight/SpotlightGrids.module.less';
import nouveauCardsCss from '../views/Details/nouveau/cards/NouveauCards.module.less';
import nouveauFooterCss from '../views/Details/nouveau/footer/NouveauDetailsFooter.module.less';
import nouveauSectionsCss from '../views/Details/nouveau/sections/NouveauSections.module.less';
import stageCss from '../views/Details/stage/StageDetailContent.module.less';
import quickLookCss from '../views/Details/quickLook/QuickLookDetailContent.module.less';
import frostCss from '../views/Details/frost/FrostDetailContent.module.less';
import trackListCss from '../components/DetailTrackList/DetailTrackList.module.less';
import musicCss from '../views/MusicBrowse/MusicLibrary.module.less';
import musicScreensCss from '../views/MusicBrowse/MusicScreens.module.less';
import musicFilterCss from '../views/MusicBrowse/MusicFilterPanel.module.less';
import musicChipsCss from '../views/MusicBrowse/MusicChips.module.less';
import bookScreensCss from '../views/BookBrowse/BookScreens.module.less';
import bookCardCss from '../views/BookBrowse/BookCard.module.less';
import bookRailCss from '../views/BookBrowse/BookstoreRail.module.less';
import classicBooksCss from '../views/BookBrowse/ClassicBooks.module.less';
import readingRoomCss from '../views/BookBrowse/ReadingRoomBooks.module.less';
import overviewCss from '../views/Details/ExpandableOverview.module.less';
import tabBarCss from '../components/DetailsTabBar/DetailsTabBar.module.less';
import backdropCss from '../components/BackdropLayer/BackdropLayer.module.less';
import browseCss from '../views/Browse/Browse.module.less';
import mediaCardCss from '../components/MediaCard/MediaCard.module.less';
import modernCardCss from '../components/MediaCard/ModernMediaCard.module.less';
import seerrBannerCss from '../components/seerr/SeerrStatusBanner.module.less';
import seerrDotCss from '../components/seerr/SeerrStatusDot.module.less';
import mediaRowCss from '../components/MediaRow/MediaRow.module.less';
import modernRowCss from '../components/MediaRow/ModernMediaRow.module.less';
import ratingsCss from '../components/RatingsRow/RatingsRow.module.less';
import watchingNowRowCss from '../components/WatchingNowRow/WatchingNowRow.module.less';
import itemMenuCss from '../components/ItemContextMenu/ItemContextMenu.module.less';
import skeletonCss from '../components/Skeleton/Skeleton.module.less';
import playlistSortFilterCss from '../components/PlaylistSortFilterBar/PlaylistSortFilterBar.module.less';
import playbackInfoCss from '../views/Player/PlaybackInfoModal.module.less';

const STYLE_ELEMENT_ID = 'moonfin-theme-overrides';

// Screens that load on demand hand their stylesheets over when they load, since importing one
// here would move it into the main stylesheet and change which of its rules win ties.
const lazySheets = {};
let lastApplied = null;
let rebuildQueued = false;

const hexAlpha = (hex) => Number.parseInt(hex.slice(1, 3), 16) / 255;

const bumpRadius = (radius, extra) => radiusToCss({
	topLeft: radius.topLeft + extra,
	topRight: radius.topRight + extra,
	bottomRight: radius.bottomRight + extra,
	bottomLeft: radius.bottomLeft + extra
});

export const buildThemeOverrideCss = (theme, options = {}) => {
	const c = theme.colors;
	const b = theme.borders;

	const onSurfaceRgb = toRgbTriplet(c.onSurface);
	const scrimRgb = toRgbTriplet(c.scrim);
	const accentRgb = toRgbTriplet(c.accent);
	const surfaceRgb = toRgbTriplet(c.surface);
	const os = (a) => `rgba(${onSurfaceRgb}, ${a})`;
	const scrim = (a) => `rgba(${scrimRgb}, ${a})`;
	const accentA = (a) => `rgba(${accentRgb}, ${a})`;
	const surfaceA = (a) => `rgba(${surfaceRgb}, ${a})`;
	// Core units in rem, so a 720p set scales them too
	const rem = (dp) => `${(dp * 1.66957 / 24).toFixed(4)}rem`;

	const background = toCssColor(c.background);
	const onBackground = toCssColor(c.onBackground);
	const surface = toCssColor(c.surface);
	const surfaceVariant = toCssColor(c.surfaceVariant);
	const onSurface = toCssColor(c.onSurface);
	const accent = toCssColor(c.accent);
	const onAccent = toCssColor(c.onAccent);
	const buttonNormal = toCssColor(c.buttonNormal);
	const buttonFocused = toCssColor(c.buttonFocused);
	const onButtonNormal = toCssColor(c.onButtonNormal);
	const onButtonFocused = toCssColor(c.onButtonFocused);
	const inputBackground = toCssColor(c.inputBackground);
	const inputFocused = toCssColor(c.inputFocused);
	const inputBorder = toCssColor(c.inputBorder);
	const rangeTrack = toCssColor(c.rangeTrack);
	const rangeProgress = toCssColor(c.rangeProgress);
	const badgeUnplayed = toCssColor(c.badgeUnplayed);
	const badgeWatched = toCssColor(c.badgeWatched);
	const onBadge = toCssColor(c.onBadge);
	const recordingActive = toCssColor(c.recordingActive);
	const error = toCssColor(c.error || DEFAULT_ERROR_COLOR);
	const statusAvailable = toCssColor(theme.semantic.statusAvailable);
	const statusRequested = toCssColor(theme.semantic.statusRequested);
	const statusPending = toCssColor(theme.semantic.statusPending);

	const focusColor = resolveFocusBorderColor(theme, options.focusBorderColor);
	const focusGlow = b.focusGlow.length ? b.focusGlow.map(shadowToCss).join(', ') : null;
	const glowOr = (fallback) => focusGlow || fallback;
	const textGlow = theme.textGlow.length ? theme.textGlow.map(shadowToCss).join(', ') : 'none';

	const cardRadius = radiusToCss(b.cardRadius);
	const chipRadius = radiusToCss(b.chipRadius);
	const chipBackground = toCssColor(b.chipBackground);
	const chipBorder = `${b.chipBorder.width}px solid ${toCssColor(b.chipBorder.color)}`;
	// A theme with an invisible card border still gets a faint tile outline.
	const tileBorderColor = hexAlpha(b.cardBorder.color) === 0
		? os(0.16)
		: toCssColorWithAlpha(b.cardBorder.color, 0.55);

	// The glow a tile falls back to when the theme carries none of its own, a 14 blur at 0.5
	// spread in the settings units
	const tileGlow = glowOr(`0 0 28.7px 0.83px ${accentA(0.22)}`);
	const focusInk = inkOn(c.buttonFocused);
	// A focused settings row fills with the theme's focused button colour, and its text turns to
	// that colour's ink, strong for the title and softer for the lines under it
	const tileFocus = `background: ${buttonFocused}; border-color: ${accentA(0.72)}; box-shadow: ${tileGlow};`;
	const invertedStrong = `rgba(${focusInk}, 0.87)`;
	const invertedSoft = `rgba(${focusInk}, 0.54)`;
	// The sidebar and nav fill with onSurface, which is a colour of its own.
	const onSurfaceInk = `rgba(${inkOn(c.onSurface)}, 0.92)`;
	// A theme names the colour it wants on a focused button, but some name one that
	// cant be read against their own fill, white on a bright cyan being the worst
	// of them. The named colour is kept where it holds up and dropped where it does
	// not, which also leaves an imported theme legible whatever it asks for.
	const buttonInk = contrastRatio(c.buttonFocused, c.onButtonFocused) >= MIN_BUTTON_CONTRAST
		? onButtonFocused
		: `rgba(${focusInk}, 0.92)`;

	const rules = [];
	// Doubling the attribute keeps these rules winning ties against stylesheets
	// injected after this one, whatever order the head ends up in.
	const prefix = `html[data-theme-id='${theme.id}'][data-theme-id]`;
	const rule = (selector, body) => {
		rules.push(`${selector.split(',').map((part) => `${prefix} ${part.trim()}`).join(', ')} { ${body} }`);
	};
	rules.push(`${prefix} { background: ${background}; color: ${onBackground}; }`);

	// App shell
	rule(`body, #root, .${appCss.app}, .${appCss.panelLoader}`, `background: ${background}; color: ${onBackground};`);
	rule(`.${appCss.loading}`, `background: linear-gradient(135deg, ${background} 0%, ${surface} 50%, ${surfaceVariant} 100%);`);
	if (theme.fontFamily) {
		// Neon Pulse keeps its display face for titles and sets body copy in the
		// condensed companion.
		const isNeon = theme.id === 'neon_pulse';
		const bodyFont = isNeon ? 'NeonPulseBody' : theme.fontFamily;
		const spacing = isNeon ? ' letter-spacing: 0.6px;' : '';
		// The Enact theme wrapper names a font on itself, so the family has to land
		// there as well or nothing inside the app inherits it. Buttons and fields
		// need naming too, since form controls take the browser's face instead of
		// the one they sit in.
		rule(
			'body, #root, .sandstone-theme, button, input, select, textarea',
			`font-family: '${bodyFont}', sans-serif;${spacing}`
		);
	}

	// Nav items rest at 60 percent of the surface text color, and the focused one
	// fills solid with dark content on top.
	rule(`.${sidebarCss.sidebarItem}, .${sidebarCss.libraryItem}, .${navBarCss.navBtn}`, `color: ${os(0.6)};`);
	if (theme.navColorCycle.length) {
		const cycle = theme.navColorCycle;
		for (let slot = 1; slot <= 16; slot += 1) {
			rule(`[data-nav-slot='${slot}']`, `color: ${toCssColor(cycle[(slot - 1) % cycle.length])};`);
		}
	}
	rule(`.${sidebarCss.sidebarItem}:hover, .${sidebarCss.libraryItem}:hover, .${navBarCss.navBtn}:hover`, `color: ${onSurface}; background: ${os(0.14)};`);
	rule(`.${sidebarCss.sidebarItem}:focus, .${sidebarCss.libraryItem}:focus, .${navBarCss.navBtn}:focus`, `color: ${onSurfaceInk}; background: ${onSurface}; border-color: transparent; box-shadow: ${glowOr('none')};`);
	rule(`.${sidebarCss.active}`, `color: ${onSurface}; background: ${accentA(0.24)};`);
	rule(`.${navBarCss.active}`, `color: ${onSurface}; background: ${accentA(0.28)};`);
	rule(`.${navBarCss.navPill}`, `border: ${b.navBorder ? `${b.navBorder.width}px solid ${toCssColor(b.navBorder.color)}` : 'none'};`);

	// Under a theme with a face of its own the settings rows stay in Roboto, and only the title,
	// section headers, value chips and search take the theme's face. A clean screen swaps that face
	// for its own, and Neon Pulse's title keeps its colour and glow either way.
	if (theme.fontFamily) {
		const isNeon = theme.id === 'neon_pulse';
		const bodyFace = isNeon ? 'NeonPulseBody' : theme.fontFamily;
		const notClean = `.${settingsCss.viewContainer}:not(.${settingsCss.cleanType})`;
		rule(
			`.${settingsCss.viewContainer}, .${settingsCss.viewContainer} button, .${settingsCss.viewContainer} input, .${settingsCss.dialogBarrier}`,
			`font-family: 'Roboto', sans-serif; letter-spacing: normal;`
		);
		rule(`${notClean} .${settingsCss.appBarTitle}`, `font-family: '${theme.fontFamily}', sans-serif;`);
		rule(
			`${notClean} .${settingsCss.sectionTitle}, ${notClean} .${settingsCss.valueBubble}, .${settingsCss.searchInput}, .${settingsCss.searchInput} input`,
			`font-family: '${bodyFace}', sans-serif;${isNeon ? ' letter-spacing: 0.6px;' : ''}`
		);
		if (isNeon) {
			rule(`.${settingsCss.appBarTitle}`, `font-weight: 700; letter-spacing: 0.4px; color: ${accent}; text-shadow: ${textGlow};`);
		}
	}

	// The pixel face runs far larger than a normal one, so settings text shrinks to 60 percent
	// under a pixel theme.
	if (theme.isPixel) {
		const dpRem = (dp) => rem(dp * 0.6);
		const sizes = {
			appBarTitle: 22, sectionTitle: 12, listItemHeading: 14, listItemCaption: 12, listItemDescriptionSmall: 11,
			valueBubble: 11, searchInput: 14, dialogTitle: 18, aboutVersion: 14, input: 14, editorHint: 12,
			editorLead: 14, settingsButton: 14, syncSubtle: 12, syncStatusTitle: 16,
			syncSwitchLabel: 11, syncChip: 11, syncCaption: 12, syncTransferTitle: 14, syncResetButton: 14, syncMessage: 12
		};
		Object.keys(sizes).forEach((name) => {
			rule(`.${settingsCss[name]}`, `font-size: ${dpRem(sizes[name])};`);
		});
		rule(`.${settingsCss.searchInput} input`, `font-size: ${dpRem(14)};`);
		// Smaller text keeps the line positions full size text has, so a two-line row moves its
		// lines down
		rule(`.${settingsCss.bodyTwoLine}`, `padding-top: ${rem(25)};`);
		rule(`.${settingsCss.bodyTwoLine} .${settingsCss.listItemCaption}`, `margin-top: ${rem(10.85)};`);
	}

	// Settings
	rule(`.${panelCss.panel}`, `background: ${background}; border-left: ${b.navBorder ? `${b.navBorder.width}px solid ${toCssColor(b.navBorder.color)}` : '0'};`);
	rule(`.${panelCss.scrim}`, `background: ${scrim(0.54)};`);
	rule(`.${settingsCss.page}, .${settingsCss.viewContainer}, .${settingsCss.appBar}`, `background-color: ${background};`);
	rule(`.${settingsCss.appBarScrolled}`, `background-image: linear-gradient(${accentA(0.08)}, ${accentA(0.08)});`);
	rule(`.${settingsCss.appBarTitle}`, `color: ${onSurface};`);
	rule(`.${settingsCss.sectionTitle}`, `color: ${accent};`);
	// Pickers and checklists follow Core's dialog theme: the surface made opaque, the theme's
	// corners, accent controls, and rows that fill with the focused button color under black ink.
	const dialogShape = theme.isGlass
		? `border-radius: ${rem(20)}; border: ${rem(1)} solid rgba(255, 255, 255, 0.2);`
		: (theme.isPixel ? `border-radius: 0; border: ${rem(2)} solid ${surfaceVariant};` : '');
	rule(`.${settingsCss.dialog}`, `background: rgb(${surfaceRgb}); ${dialogShape}`);
	if (theme.isPixel) {
		rule(`.${settingsCss.dialogOption}, .${settingsCss.checkRow}, .${settingsCss.dialogFilledButton}`, 'border-radius: 0;');
	}
	rule(`.${settingsCss.dialogOption}, .${settingsCss.checkRow}`, `color: ${onSurface};`);
	rule(`.${settingsCss.dialogOption}:focus, .${settingsCss.checkRow}:focus`, `background: ${buttonFocused}; color: rgba(0, 0, 0, 0.87);`);
	rule(`.${settingsCss.dialogRadio}`, `color: ${os(0.45)};`);
	rule(`.${settingsCss.dialogRadioOn}`, `color: ${accent};`);
	rule(`.${settingsCss.dialogOption}:focus .${settingsCss.dialogRadio}`, 'color: rgba(0, 0, 0, 0.5);');
	rule(`.${settingsCss.dialogOption}:focus .${settingsCss.dialogRadioOn}`, 'color: rgba(0, 0, 0, 0.87);');
	rule(`.${settingsCss.dialogHint}`, `color: ${os(0.65)};`);
	rule(`.${settingsCss.dialogOption}:focus .${settingsCss.dialogHint}`, 'color: rgba(0, 0, 0, 0.6);');
	rule(`.${settingsCss.checkBox}`, `border-color: ${accent};`);
	rule(`.${settingsCss.checkBoxOn}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${settingsCss.checkRow}:focus .${settingsCss.checkBox}`, 'border-color: rgba(0, 0, 0, 0.8);');
	rule(`.${settingsCss.checkRow}:focus .${settingsCss.checkBoxOn}`, 'border-color: rgba(0, 0, 0, 0.87); background: rgba(0, 0, 0, 0.87); color: #fff;');
	rule(`.${settingsCss.dialogButton}`, `color: ${accent};`);
	rule(`.${settingsCss.dialogButton}:focus`, `background: ${accentA(0.1)};`);
	rule(`.${settingsCss.dialogFilledButton}`, `background: ${buttonNormal}; color: ${onButtonNormal};`);
	rule(`.${settingsCss.dialogFilledButton}:focus`, `background: ${buttonNormal}; background-image: linear-gradient(${toCssColorWithAlpha(c.onButtonNormal, 0.1)}, ${toCssColorWithAlpha(c.onButtonNormal, 0.1)});`);
	// Neon Pulse's dialog titles glow in its accent, and the pixel theme sets the picker's title in its own font
	if (theme.textGlow.length) {
		rule(`.${settingsCss.dialogTitle}, .${settingsCss.checklistTitle}`, `color: ${accent}; text-shadow: ${textGlow}; letter-spacing: 0.4px;`);
	}
	if (theme.fontFamily) {
		rule(`.${settingsCss.dialogTitle}`, `font-family: '${theme.fontFamily}', sans-serif;`);
	}
	rule(`.${settingsCss.listItem}, .${settingsCss.themeCard}`, `background: ${surfaceA(0.82)}; border-color: ${tileBorderColor};`);
	rule(`.${settingsCss.listItem}:focus, .${settingsCss.themeCard}:focus`, tileFocus);
	rule(`.${settingsCss.listItemSelected}, .${settingsCss.themeCardSelected}`, `border-color: ${accent};`);
	rule(`.${settingsCss.listItemCaption}, .${settingsCss.chevronIcon}, .${settingsCss.checkIcon}, .${settingsCss.listItemIconPlain}, .${settingsCss.reorderHint}`, `color: ${os(0.7)};`);
	// A switch or a picker writes its description at full strength, so this follows the caption rule
	rule(`.${settingsCss.listItemHeading}, .${settingsCss.listItemDescription}`, `color: ${onSurface};`);
	rule(`.${settingsCss.themeCardName}, .${settingsCss.playbackTimeRow}`, `color: ${onSurface};`);
	// The focused tile fills with the light button color, so its content flips dark.
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemHeading}`, `color: ${invertedStrong};`);
	rule([settingsCss.listItemCaption, settingsCss.chevronIcon, settingsCss.checkIcon, settingsCss.listItemIconPlain, settingsCss.reorderHint]
		.map((name) => `.${settingsCss.listItem}:focus .${name}`).join(', '), `color: ${invertedSoft};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemDescription}`, `color: ${invertedStrong};`);
	// The theme cards fill the same way the rows do, so their text flips with them
	rule(`.${settingsCss.themeCard}:focus .${settingsCss.themeCardName}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.themeCard}:focus .${settingsCss.themeCardDescription}`, `color: ${invertedSoft};`);
	rule(`.${settingsCss.listItemIcon}`, `background: ${accentA(0.14)}; border-color: ${accentA(0.42)}; color: ${os(0.78)};`);
	rule(`.${settingsCss.listItemIconStrong}`, `color: ${onSurface};`);
	rule(`.${settingsCss.reorderHintOff}, .${settingsCss.listItem}:focus .${settingsCss.reorderHintOff}`, `color: ${os(0.38)};`);
	rule(`.${settingsCss.reorderLock}`, `color: ${os(0.6)};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.reorderLock}`, `color: rgba(${focusInk}, 0.32);`);
	// A plain tile has no card, and only tints with the accent when it has the focus
	rule(`.${settingsCss.listItemPlain}`, `background: transparent; border-color: transparent;`);
	rule(`.${settingsCss.listItemPlain}:focus`, `background: ${accentA(0.18)}; border-color: transparent; box-shadow: none;`);
	rule(`.${settingsCss.listItemPlain} .${settingsCss.listItemIconPlain}, .${settingsCss.listItemPlain}:focus .${settingsCss.listItemIconPlain}, .${settingsCss.listItemPlain} .${settingsCss.reorderHint}, .${settingsCss.listItemPlain}:focus .${settingsCss.reorderHint}, .${settingsCss.plainCheckbox}`, `color: ${onSurface};`);
	rule(`.${settingsCss.plainCheckboxOn}`, `color: ${accent};`);
	// Plain tiles keep the stock dark type's text colours whatever the theme
	rule(`.${settingsCss.listItemPlain} .${settingsCss.listItemHeading}, .${settingsCss.listItemPlain}:focus .${settingsCss.listItemHeading}`, `color: #e6e0e9;`);
	rule(`.${settingsCss.listItemPlain} .${settingsCss.listItemCaption}, .${settingsCss.listItemPlain}:focus .${settingsCss.listItemCaption}`, `color: #cac4d0;`);
	// Core strokes a swatch with the chip border in its own units, which a 1px border draws too faint
	const swatchRing = `${Math.max(1, Math.round(b.chipBorder.width * 1.66957))}px solid ${toCssColor(b.chipBorder.color)}`;
	rule(`.${settingsCss.colorCircle}, .${settingsCss.colorSwatch}`, `border: ${swatchRing};`);
	rule(`.${settingsCss.swatchEdge}`, `border-color: ${os(0.24)};`);
	rule(`.${settingsCss.swatchEdgeLight}`, 'border-color: rgba(0, 0, 0, 0.38);');
	rule(`.${settingsCss.subtitlePreview}`, `background: linear-gradient(to bottom right, ${surfaceVariant}, ${scrim(0.8)});`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemIcon}`, `background: ${accentA(0.22)}; border-color: ${accentA(0.64)}; color: ${invertedSoft};`);
	rule(`.${settingsCss.valueBubble}`, `background: ${accentA(0.1)}; border-color: ${accentA(0.35)}; color: ${accent};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.valueBubble}`, `background: rgba(${focusInk}, 0.12); border-color: rgba(${focusInk}, 0.35); color: ${invertedStrong};`);
	// The switch keeps its colours on a focused row
	rule(`.${settingsCss.toggleTrack}`, `background: ${surfaceVariant}; border-color: ${onSurface};`);
	rule(`.${settingsCss.toggleOn}`, `background: ${accent}; border-color: ${accent};`);
	rule(`.${settingsCss.toggleThumb}`, `background: ${onSurface};`);
	rule(`.${settingsCss.toggleOn} .${settingsCss.toggleThumb}`, `background: ${onAccent};`);
	rule(`.${settingsCss.sliderInactive}`, `background: ${rangeTrack};`);
	rule(`.${settingsCss.sliderActive}`, `background: ${rangeProgress};`);
	rule(`.${settingsCss.sliderThumb}`, `background: ${toCssColor(c.rangeThumb)};`);
	rule(`.${settingsCss.sliderTick}`, `background: ${os(0.38)};`);
	rule(`.${settingsCss.divider}`, `background: ${os(0.12)};`);
	rule(`.${settingsCss.aboutVersion}`, `color: ${onSurface};`);
	rule(`.${settingsCss.aboutDivider}`, `background: ${onSurface};`);
	rule(`.${settingsCss.input}, .${settingsCss.searchInput}`, `background: ${surfaceVariant}; color: ${onSurface};`);
	rule(`.${settingsCss.input}:focus, .${settingsCss.input}[data-focused], .${settingsCss.searchInput}:focus, .${settingsCss.searchInput}[data-focused]`, `background: ${buttonFocused}; color: ${onButtonFocused};`);
	rule(`.${settingsCss.input}:focus input, .${settingsCss.input}[data-focused] input, .${settingsCss.searchInput}:focus input, .${settingsCss.searchInput}[data-focused] input`, `color: ${onButtonFocused};`);
	rule(`.${settingsCss.searchIcon}`, `color: ${os(0.7)};`);
	rule(`.${settingsCss.searchInput}:focus ~ .${settingsCss.searchIcon}, .${settingsCss.searchInput}[data-focused] ~ .${settingsCss.searchIcon}`, `color: ${onButtonFocused};`);
	rule(`.${settingsCss.input} input::-webkit-input-placeholder, .${settingsCss.searchInput} input::-webkit-input-placeholder`, `color: ${os(0.55)};`);
	rule(`.${settingsCss.input} input::placeholder, .${settingsCss.searchInput} input::placeholder`, `color: ${os(0.55)};`);
	// An achievement row carries its own figures on the end, so they follow the tile rather than
	// keeping a resting colour nobody can read once it lights up.
	rule(`.${achievementsCss.points}, .${achievementsCss.progressText}`, `color: ${os(0.7)};`);
	rule(`.${achievementsCss.boardValue}, .${achievementsCss.rankGutter}`, `color: ${onSurface};`);
	rule(`.${achievementsCss.reward}`, `color: ${accent};`);
	rule(`.${settingsCss.listItem}:focus .${achievementsCss.points}, .${settingsCss.listItem}:focus .${achievementsCss.progressText}`, `color: ${invertedSoft};`);
	rule(`.${settingsCss.listItem}:focus .${achievementsCss.boardValue}, .${settingsCss.listItem}:focus .${achievementsCss.rankGutter}, .${settingsCss.listItem}:focus .${achievementsCss.reward}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.actionButton}`, `background: ${buttonNormal}; color: ${onButtonNormal}; border-color: ${tileBorderColor};`);
	rule(`.${settingsCss.actionButton}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${settingsCss.logFilter}:focus`, `border-color: ${focusColor};`);
	rule(`.${settingsCss.dangerButton}:focus`, `background: ${recordingActive} !important; border-color: ${recordingActive} !important; color: #fff;`);
	// The editors' buttons, Save filled and the rest as text, focus the way the rows do
	rule(`.${settingsCss.settingsButton}`, `color: ${accent};`);
	rule(`.${settingsCss.settingsButtonPrimary}`, `background: ${buttonNormal}; color: ${onButtonNormal};`);
	rule(`.${settingsCss.settingsButton}:focus`, `${tileFocus} color: ${invertedStrong};`);
	// Low tier sets skip the glow, which this sheet would otherwise put back over the stylesheet
	rules.push(`${[settingsCss.listItem, settingsCss.syncCard, settingsCss.settingsButton]
		.map((name) => `${prefix}.perf-low .${name}:focus`).join(', ')} { box-shadow: none; }`);
	// The Settings Sync cards fill and focus the way the settings rows do
	rule(`.${settingsCss.syncCard}, .${settingsCss.syncTransferCard}`, `background: ${surface}; border-color: ${tileBorderColor};`);
	rule(`.${settingsCss.syncTransferCard}`, `border-color: transparent;`);
	rule(`.${settingsCss.syncTransferButton}`, `background: ${buttonNormal}; border-color: transparent;`);
	rule(`.${settingsCss.syncResetButton}`, `background: transparent; border-color: transparent; color: ${error};`);
	rule(`.${settingsCss.syncCardSelected}`, `background: ${accentA(0.14)}; border-color: ${accent};`);
	rule(`.${settingsCss.syncCard}:focus`, tileFocus);
	rule(`.${settingsCss.syncStatusTitle}, .${settingsCss.syncProfileTitle}, .${settingsCss.syncTransferTitle}`, `color: ${onSurface};`);
	rule(`.${settingsCss.syncSubtle}, .${settingsCss.syncSwitchLabel}, .${settingsCss.syncCaption}, .${settingsCss.syncMessage}, .${settingsCss.syncProfileIcon}`, `color: ${os(0.7)};`);
	rule(`.${settingsCss.syncProfileIconActive}, .${settingsCss.syncTransferIcon}`, `color: ${accent};`);
	rule(`.${settingsCss.syncChip}`, `background: ${chipBackground}; border: ${chipBorder}; color: ${onSurface};`);
	rule(`.${settingsCss.syncCard}:focus .${settingsCss.syncStatusTitle}, .${settingsCss.syncCard}:focus .${settingsCss.syncProfileTitle}, .${settingsCss.syncCard}:focus .${settingsCss.syncTransferTitle}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.syncCard}:focus .${settingsCss.syncSubtle}, .${settingsCss.syncCard}:focus .${settingsCss.syncSwitchLabel}`, `color: rgba(${focusInk}, 0.7);`);
	rule(`.${settingsCss.syncCard}:focus .${settingsCss.syncProfileIcon}, .${settingsCss.syncCard}:focus .${settingsCss.syncTransferIcon}`, `color: ${invertedSoft};`);
	rule(`.${settingsCss.syncCard}:focus .${settingsCss.syncChip}`, `background: rgba(${focusInk}, 0.06); border-color: rgba(${focusInk}, 0.2); color: ${invertedStrong};`);
	rule(`.${settingsCss.syncCard}:focus .${settingsCss.listItemIcon}`, `background: ${accentA(0.22)}; border-color: ${accentA(0.64)}; color: ${invertedSoft};`);
	rule(`.${settingsCss.editorHint}, .${settingsCss.editorLead}`, `color: ${onSurface};`);
	rule(`.${settingsCss.statusMessage}, .${settingsCss.authHint}, .${settingsCss.viewDescription}, .${settingsCss.viewCaption}, .${settingsCss.themeCardDescription}, .${settingsCss.themeStoreMessage}`, `color: ${os(0.7)};`);
	rule(`.${settingsCss.statusError}`, `color: ${error};`);
	rule(`.${settingsCss.loadingMessage}, .${settingsCss.integrationSpec}`, `color: ${os(0.45)};`);
	rule(`.${settingsCss.themeCardCheck}, .${settingsCss.themeStoreCardAction}`, `color: ${accent};`);
	rule(`.${settingsCss.playbackTimePreview}`, `background: ${surface};`);
	rule(`.${settingsCss.playbackTimeBar}`, `background: ${rangeTrack};`);
	rule(`.${settingsCss.playbackTimeBarFill}`, `background: ${rangeProgress};`);

	// Search input
	rule(`.${searchCss.searchInputWrapper}`, `background: ${inputBackground}; border-color: ${inputBorder};`);
	rule(`.${searchCss.searchInputFocused}`, `background: ${inputFocused}; border-color: ${focusColor}; box-shadow: ${glowOr('none')};`);

	// Detail screens, classic layout
	rule(`.${detailsCss.posterBadgeWatched}, .${detailsCss.watchedIndicator}`, `background: ${badgeWatched}; border-color: ${onBadge};`);
	rule(`.${detailsCss.posterBadgeWatched} svg, .${detailsCss.watchedIndicator} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
	rule(`.${detailsCss.posterBadgeFavorite} svg, .${detailsCss.favoriteBadge} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
	rule(`.${detailsCss.posterBadgeFavorite}, .${detailsCss.favoriteBadge}`, `background: ${recordingActive}; border-color: ${onBadge};`);
	rule(`.${detailsCss.seriesName}, .${detailsCss.tagline}`, `color: ${os(0.7)};`);
	rule(`.${detailsCss.episodeNumber}`, `color: ${os(0.9)}; background: ${os(0.15)};`);
	rule(`.${detailsCss.title}, .${detailsCss.sectionTitle}, .${detailsCss.seasonDetailTitle}, .${detailsCss.trackModalTitle}`, `color: ${onBackground};`);
	rule(`.${detailsCss.infoItem}`, `color: ${os(0.9)};`);
	rule(`.${detailsCss.infoTextItems} > .${detailsCss.infoItem} + .${detailsCss.infoItem}::before`, `color: ${os(0.5)};`);
	rule(`.${detailsCss.badgeRating}`, `background: ${os(0.15)}; color: ${os(0.9)};`);
	rule(`.${detailsCss.overview}`, `color: ${os(0.8)};`);
	rule(`.${detailsCss.btnAction}`, `background: ${buttonNormal};`);
	rule(`.${detailsCss.btnIcon}`, `color: ${onButtonNormal};`);
	rule(`.${detailsCss.btnWrapper}:focus .${detailsCss.btnAction}`, `background: ${buttonFocused}; border-color: ${focusColor};`);
	rule(`.${detailsCss.btnWrapper}:focus .${detailsCss.btnAction} .${detailsCss.btnIcon}`, `color: ${buttonInk}; fill: ${buttonInk};`);
	rule(`.${detailsCss.favorited}, .${detailsCss.btnWrapper}:focus .${detailsCss.btnAction} .${detailsCss.favorited}`, `color: ${recordingActive}; fill: ${recordingActive};`);
	rule(`.${detailsCss.watched}, .${detailsCss.btnWrapper}:focus .${detailsCss.btnAction} .${detailsCss.watched}`, `color: ${accent}; fill: ${accent};`);
	rule(`.${detailsCss.btnDetail}`, `color: ${os(0.5)};`);
	rule(`.${detailsCss.btnWrapper}:focus .${detailsCss.btnDetail}`, `color: ${onBackground};`);
	rule(`.${detailsCss.btnLabel}, .${detailsCss.seasonName}, .${detailsCss.seasonEpTitle}, .${detailsCss.castName}, .${detailsCss.trackName}, .${detailsCss.trackTitle}`, `color: ${onSurface};`);
	rule(`.${detailsCss.seasonCard}:focus .${detailsCss.seasonPosterWrapper}`, `border-color: ${focusColor};`);
	rule(`.${detailsCss.unplayedCount}`, `background: ${badgeUnplayed}; color: ${onBadge}; border-color: ${onBadge};`);
	rule(`.${detailsCss.nextUpCard}`, `background: ${os(0.06)};`);
	rule(`.${detailsCss.nextUpCard}:focus, .${detailsCss.episodeCard}:focus, .${detailsCss.castCard}:focus .${detailsCss.castImageWrapper}`, `border-color: ${focusColor};`);
	rule(`.${detailsCss.chapterCard}:focus, .${detailsCss.extraCard}:focus`, `border-color: ${accentA(0.5)};`);
	rule(`.${detailsCss.episodeCurrent}`, `border-color: ${accentA(0.4)}; background: ${accentA(0.08)};`);
	rule(`.${detailsCss.nextUpThumb}, .${detailsCss.nextUpThumbPlaceholder}, .${detailsCss.episodeThumb}, .${detailsCss.episodeThumbPlaceholder}, .${detailsCss.chapterThumb}, .${detailsCss.extraThumb}, .${detailsCss.chapterThumbPlaceholder}, .${detailsCss.extraThumbPlaceholder}, .${detailsCss.seasonEpThumb}, .${detailsCss.seasonEpThumbPlaceholder}`, `background: ${surface};`);
	rule(`.${detailsCss.episodeProgressBar}`, `background: ${accent};`);
	rule(`.${detailsCss.tmdbIcon}`, `color: ${statusPending};`);
	rule(`.${detailsCss.seasonDetailCount}`, `color: ${os(0.5)};`);
	rule(`.${detailsCss.seasonEp}`, `background: ${os(0.04)};`);
	rule(`.${detailsCss.seasonEp}:focus`, `background: ${os(0.08)}; border-color: ${focusColor};`);
	rule(`.${detailsCss.seasonEpCheck}`, `color: ${accent};`);
	rule(`.${detailsCss.trackItem}`, `background: ${os(0.08)}; border-color: ${os(0.15)};`);
	rule(`.${detailsCss.trackItem}:focus`, `background: ${accentA(0.3)}; border-color: ${focusColor}; box-shadow: ${glowOr(`0 4px 15px ${accentA(0.4)}`)};`);
	rule(`.${trackOptionCss.trackOption}:focus`, `background: ${accentA(0.3)};`);
	rule(`.${trackOptionCss.trackOption}.${trackOptionCss.selected} .${trackOptionCss.trackIndicator}`, `color: ${accent};`);
	rule(`.${trackOptionCss.trackName}`, `color: ${onSurface};`);
	rule(`.${trackOptionCss.trackDivider}`, `background: ${os(0.08)};`);
	rule(`.${detailsCss.trackPlayed} svg`, `fill: ${accent};`);
	rule(`.${detailsCss.actionBtn}`, `background: ${os(0.1)}; border-color: ${os(0.2)}; color: ${onBackground};`);
	rule(`.${detailsCss.actionBtn}:hover, .${detailsCss.actionBtn}:focus`, `background: ${accentA(0.3)}; border-color: ${focusColor};`);
	rule(`.${detailsCss.personActionBtn}:focus`, `border-color: ${focusColor};`);
	rule(`.${detailsCss.toast}`, `background: ${surfaceA(0.9)}; color: ${onBackground}; border-color: ${os(0.12)};`);
	rule(`.${detailsCss.trailerCloseBtn}`, `background: ${os(0.15)}; color: ${onBackground};`);

	// Playlist sort & filter controls
	rule(`.${playlistSortFilterCss.pill}:focus, .${playlistSortFilterCss.pill}.spottable-focus`, `background: ${focusColor}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${playlistSortFilterCss.pillActive}`, `background: ${accentA(0.22)}; border-color: ${accent}; color: ${onBackground};`);
	rule(`.${playlistSortFilterCss.badge}`, `background: ${accent}; color: ${onBadge};`);
	rule(`.${playlistSortFilterCss.pill}:focus .${playlistSortFilterCss.badge}, .${playlistSortFilterCss.pill}.spottable-focus .${playlistSortFilterCss.badge}`, `background: #ffffff; color: ${accent};`);
	rule(`.${playlistSortFilterCss.clearFiltersBtn}:focus, .${playlistSortFilterCss.clearFiltersBtn}.spottable-focus`, `background: ${focusColor}; border-color: ${focusColor};`);

	// Detail screens, modern layout
	rule(`.${modernDetailCss.metaRow}, .${modernDetailCss.techSize}`, `color: ${os(0.75)};`);
	rule(`.${modernDetailCss.actionBtn}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${modernDetailCss.overflowList} .${modernDetailCss.actionBtn}:focus`, `background: ${os(0.1)}; border-color: ${focusColor}; color: ${onBackground};`);
	rule(`.${modernDetailCss.upNextCard}`, `background-color: ${surfaceA(0.82)};`);
	rule(`.${modernDetailCss.upNextCard}:focus`, `border-color: ${focusColor};`);
	rule(`.${modernDetailCss.upNextLabel}`, `color: ${accent};`);
	rule(`.${modernDetailCss.upNextProgress} > div`, `background: ${accent};`);
	rule(`.${modernDetailCss.sectionHeading}`, `color: ${onBackground};`);
	rule(`.${modernDetailCss.episodeWatched}`, `background: ${badgeWatched}; border-color: ${onBadge};`);
	rule(`.${modernDetailCss.episodeWatched} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
	rule(`.${tabBarCss.tabBar}`, `background: ${os(0.08)};`);
	rule(`.${modernFileInfoCss.trackActive}`, `border-color: ${accent};`);
	rule(`.${modernFileInfoCss.showAll}, .${modernFileInfoCss.retry}, .${modernFileInfoCss.reasonHint}`, `color: ${accent};`);
	rule(`.${modernFileInfoCss.showAll}:focus, .${modernFileInfoCss.retry}:focus`, `border-color: ${focusColor};`);

	// Detail screens, spotlight layout
	rule(`.${spotlightCss.metaRow}, .${spotlightCss.techSize}`, `color: ${os(0.75)};`);
	rule(`.${spotlightCss.tagline}`, `color: ${accent};`);
	rule(`.${spotlightCss.personAvatar}`, `border-color: ${focusColor};`);
	rule(`.${spotlightCardCss.card}:focus`, `border-color: ${focusColor};`);
	rule(`.${spotlightModalCss.panel}`, `background: ${surfaceA(0.96)}; border-color: ${os(0.12)};`);
	rule(`.${spotlightModalCss.headerTitle}, .${spotlightModalCss.sectionTitle}`, `color: ${onBackground};`);
	rule(`.${spotlightModalCss.sectionCount}`, `background: ${os(0.08)}; color: ${os(0.7)};`);
	rule(`.${spotlightGridCss.personCard}:focus, .${spotlightGridCss.studioCard}:focus, .${spotlightGridCss.chapterCard}:focus`, `border-color: ${focusColor};`);
	rule(`.${spotlightGridCss.personName}, .${spotlightGridCss.studioName}, .${spotlightGridCss.chapterName}`, `color: ${onBackground};`);
	rule(`.${trackListCss.trackRow}:focus`, `background: ${buttonFocused}; border-color: ${focusColor};`);
	rule(`.${trackListCss.trackTitle}, .${trackListCss.discHeading}`, `color: ${onBackground};`);

	// Music library, Quick Access and Immersive. A focused song row fills and inverts its ink, and
	// a focused hero button fills.
	rule(`.${musicCss.eyebrow}, .${musicCss.favoriteOn}`, `color: ${accent};`);
	rule(`.${musicCss.primaryBtn}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${musicCss.heroBtn}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${musicCss.sectionTitle}, .${musicCss.trackTitle}`, `color: ${onSurface};`);
	rule(`.${musicCss.seeAll}`, `color: ${os(0.7)};`);
	rule(`.${musicCss.railItem}`, `color: ${os(0.86)};`);
	rule(`.${musicCss.railSelected}`, `background: ${accentA(0.16)}; color: ${accent};`);
	rule(`.${musicCss.headerBtn}:focus, .${musicCss.seeAll}:focus, .${musicCss.genreTile}:focus, .${musicCss.railItem}:focus, .${musicCss.quickTile}:focus, .${musicCss.filterPill}:focus`, `box-shadow: 0 0 0 3px ${focusColor};`);
	rule(`.${musicCss.trackNumber}, .${musicCss.trackSubtitle}, .${musicCss.trackLength}`, `color: ${os(0.65)};`);
	rule(`.${musicCss.trackActive}`, `background: ${accentA(0.16)};`);
	rule(`.${musicCss.trackActive} .${musicCss.trackNumber}`, `color: ${accent};`);
	rule(`.${musicCss.track}:focus`, `background: ${buttonFocused}; border-color: ${accentA(0.72)};`);
	rule(`.${musicCss.track}:focus .${musicCss.trackTitle}`, `color: ${invertedStrong};`);
	rule(`.${musicCss.track}:focus .${musicCss.trackNumber}, .${musicCss.track}:focus .${musicCss.trackSubtitle}, .${musicCss.track}:focus .${musicCss.trackLength}`, `color: ${invertedSoft};`);
	rule(`.${musicCss.trackRank}`, `color: ${accent};`);

	// The music category screens. The genre stations and the mix cards other than Everything keep
	// their own palette with white text.
	const ms = musicScreensCss;
	rule(`.${ms.page}`, `background: ${background}; color: ${onSurface};`);
	rule(`.${ms.stripName}, .${ms.title}, .${ms.panelTitle}, .${ms.detailTitle}, .${ms.playlistRow}`, `color: ${onSurface};`);
	rule(`.${ms.count}, .${ms.subMeta}`, `color: ${os(0.65)};`);
	rule(`.${ms.meta}`, `color: ${os(0.75)};`);
	rule(`.${ms.empty}, .${ms.loading}, .${ms.artPlaceholder}`, `color: ${os(0.5)};`);
	rule(`.${ms.eyebrow}, .${ms.letter}`, `color: ${accent};`);
	rule(`.${ms.pill}`, `background: ${os(0.08)}; color: ${onSurface};`);
	rule(`.${ms.pillPrimary}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${ms.pill}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${ms.pill} .${ms.accentIcon}`, `fill: ${accent};`);
	rule(`.${ms.rail}`, `background: ${os(0.05)};`);
	rule(`.${ms.railLetter}`, `color: ${os(0.7)};`);
	rule(`.${ms.railLetter}.${ms.railCurrent}`, `color: ${accent};`);
	rule(`.${ms.railLetter}:focus, .${ms.mix}:focus, .${ms.station}:focus`, `box-shadow: 0 0 0 3px ${focusColor};`);
	rule(`.${ms.albumPanel}, .${ms.shelfPlaceholder}, .${ms.playlistArt}, .${ms.detailArt}`, `background: ${os(0.06)};`);
	rule(`.${ms.caret}`, `border-bottom-color: ${os(0.06)};`);
	rule(`.${ms.mixAccent}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${ms.playlistShown}`, `background: ${accentA(0.16)};`);
	rule(`.${ms.playlistRow}:focus`, `background: ${os(0.12)}; box-shadow: inset 0 0 0 3px ${focusColor};`);
	// Classic's chips over a category screen. The Classic overview's own chips are left as they are.
	const chip = musicChipsCss.chip;
	rule(`.${ms.screenChips} .${chip}`, `background: ${os(0.09)}; color: ${os(0.8)};`);
	rule(`.${ms.screenChips} .${ms.chipCurrent}:not(:focus)`, `background: ${accentA(0.16)}; color: ${accent};`);
	rule(`.${ms.screenChips} .${chip}:focus`, `background: ${accent}; border-color: ${accent}; color: ${onAccent}; box-shadow: 0 0 14px 1px ${accentA(0.45)};`);

	// The music Sort & Filter panel and the Albums genre list, which share its rows.
	const mf = musicFilterCss;
	rule(`.${mf.overlay}`, `background: ${scrim(0.45)};`);
	rule(`.${mf.panel}`, `background: ${surfaceA(0.92)}; border-color: ${os(0.08)};`);
	rule(`.${mf.title}, .${mf.optionActive}`, `color: ${onSurface};`);
	rule(`.${mf.option}`, `color: ${os(0.8)};`);
	rule(`.${mf.option}:focus`, `background: ${os(0.1)}; border-color: ${focusColor}; color: ${onSurface};`);
	rule(`.${mf.radio}, .${mf.check}`, `border-color: ${os(0.35)};`);
	rule(`.${mf.optionActive} .${mf.radio}`, `border-color: ${accent};`);
	rule(`.${mf.optionActive} .${mf.check}`, `border-color: ${accent}; background: ${accent};`);
	rule(`.${mf.radioFill}`, `background: ${accent};`);

	// The book library screens. They share the music screens' header, pills, panels and lists above,
	// and only the genre stations keep their own palette with white text.
	const bs = bookScreensCss;
	const bc = bookCardCss;
	const br = bookRailCss;
	rule(`.${classicBooksCss.page}, .${readingRoomCss.page}, .${br.page}`, `background: ${background};`);
	rule(`.${bs.sectionTitle}, .${bs.seriesName}, .${bs.statValue}, .${bs.cardName}, .${bs.panelHeading}, .${bs.portraitName}`, `color: ${onSurface};`);
	rule(`.${bs.overviewText}, .${bs.detailOverview}`, `color: ${os(0.75)};`);
	rule(`.${bs.progressLine}, .${bs.statLabel}, .${bs.panelCount}`, `color: ${os(0.65)};`);
	rule(`.${bs.track}`, `background: ${os(0.18)};`);
	rule(`.${bs.trackFill}`, `background: ${accent};`);
	rule(`.${bs.panel}, .${bs.stat}, .${bs.collectionCard}, .${bs.boardPanel}, .${bs.hero}`, `background: ${os(0.06)};`);
	rule(`.${bs.stripCover}, .${bs.heroCover}, .${bs.tag}`, `background: ${os(0.08)};`);
	rule(`.${bs.tag}`, `color: ${os(0.8)};`);
	rule(`.${bs.collectionCard}:focus`, `border-color: ${focusColor}; box-shadow: ${glowOr('none')};`);
	rule(`.${bs.portrait}:focus .${bs.face}`, `box-shadow: 0 0 0 4px ${focusColor};`);
	rule(`.${bs.search}`, `background: ${os(0.08)}; color: ${onSurface};`);
	rule(`.${bs.search}:focus`, `border-color: ${focusColor};`);
	rule(`.${bs.detailPanel}`, `background: ${surface};`);
	rule(`.${bs.subjects} .${chip}`, `background: ${os(0.09)}; color: ${os(0.8)};`);
	rule(`.${bs.subjects} .${ms.chipCurrent}:not(:focus)`, `background: ${accentA(0.16)}; color: ${accent};`);
	rule(`.${bs.subjects} .${chip}:focus`, `background: ${accent}; border-color: ${accent}; color: ${onAccent}; box-shadow: 0 0 14px 1px ${accentA(0.45)};`);
	rule(`.${bc.cover}`, `background: ${os(0.08)}; border-radius: ${cardRadius};`);
	rule(`.${bc.card}:focus .${bc.cover}`, `border-color: ${focusColor}; box-shadow: ${glowOr('none')};`);
	rule(`.${bc.title}`, `color: ${os(0.9)};`);
	rule(`.${bc.card}:focus .${bc.title}`, `color: ${onSurface};`);
	rule(`.${bc.subtitle}`, `color: ${os(0.6)};`);
	rule(`.${bc.placeholderIcon}`, `fill: ${os(0.35)};`);
	rule(`.${bc.progress}`, `background: ${accent};`);
	rule(`.${bc.numberBadge}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${br.rail}`, `border-right-color: ${os(0.06)};`);
	rule(`.${br.railTitle}, .${br.railRow}, .${br.continueTitle}`, `color: ${onSurface};`);
	rule(`.${br.railSubtitle}`, `color: ${os(0.6)};`);
	rule(`.${br.railHeader}`, `color: ${os(0.5)};`);
	rule(`.${br.railRow} svg`, `fill: ${os(0.8)};`);
	rule(`.${br.railRow}:focus`, `box-shadow: 0 0 0 3px ${focusColor};`);
	rule(`.${br.railCount}, .${br.continueSubtitle}`, `color: ${os(0.62)};`);
	rule(`.${br.railSelected}`, `background: ${accentA(0.16)};`);
	rule(`.${br.railSelected} svg`, `fill: ${accent};`);
	rule(`.${br.railSelected} .${br.railCount}`, `color: ${accent};`);
	rule(`.${br.continueTile}`, `background: ${os(0.06)};`);
	rule(`.${br.continueTile}:focus`, `box-shadow: 0 0 0 3px ${focusColor};`);
	rule(`.${br.continueCover}, .${br.continueCoverAudio}`, `background: ${surfaceVariant};`);
	rule(`.${br.continuePlaceholder}`, `fill: ${os(0.4)};`);
	rule(`.${br.continueProgress}`, `background: ${os(0.14)};`);
	rule(`.${br.continueProgress} div, .${br.continuePlay}`, `background: ${accent};`);
	rule(`.${br.continuePlay} svg`, `fill: ${onAccent};`);
	rule(`.${br.continueMeta}`, `color: ${os(0.68)};`);

	// Detail screens, nouveau layout
	rule(`.${nouveauCardsCss.card}:focus, .${nouveauCardsCss.landscapeDetails}:focus, .${nouveauCardsCss.person}:focus .${nouveauCardsCss.avatar}`, `border-color: ${focusColor};`);
	rule(`.${nouveauCardsCss.progressFill}, .${nouveauCardsCss.nextUp}`, `background: ${accent};`);
	rule(`.${nouveauSectionsCss.sortButton}:focus`, `border-color: ${focusColor};`);
	rule(`.${nouveauFooterCss.trackActive} .${nouveauFooterCss.trackDot}`, `background: ${accent};`);
	rule(`.${nouveauFooterCss.capabilityRetry}`, `color: ${accent};`);
	rule(`.${nouveauFooterCss.capabilityRetry}:focus`, `border-color: ${focusColor};`);
	rule(`.${modernDetailCss.overflowPanel}`, `background: ${surfaceA(0.97)}; border-color: ${os(0.12)};`);
	rule(`.${modernDetailCss.overflowTitle}`, `color: ${onBackground};`);
	rule(`.${itemMenuCss.panel}`, `background: ${surfaceA(0.97)}; border-color: ${os(0.12)};`);
	rule(`.${itemMenuCss.title}, .${itemMenuCss.row}, .${itemMenuCss.button}`, `color: ${onBackground};`);
	rule(`.${itemMenuCss.row}:focus, .${itemMenuCss.button}:focus`, `background: ${os(0.1)}; border-color: ${focusColor};`);
	rule(`.${playbackInfoCss.panel}`, `background-color: ${surfaceA(0.9)};`);
	rule(`.${tabBarCss.tab}`, `color: ${os(0.75)};`);
	rule(`.${tabBarCss.tabActive}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${tabBarCss.tab}:focus`, `border-color: ${focusColor};`);
	rule(`.${overviewCss.spottable}:focus`, `border-color: ${focusColor};`);
	rule(`.${overviewCss.readMoreBtn}`, `color: ${accent};`);

	// Detail screens, stage layout
	rule(`.${stageCss.chip}:focus, .${stageCss.name}:focus`, `border-color: ${focusColor};`);
	rule(`.${stageCss.cell}:focus`, `background: ${accentA(0.1)}; border-color: ${focusColor};`);
	rule(`.${stageCss.card}:focus .${stageCss.cardArt}::after, .${stageCss.person}:focus .${stageCss.avatarRing}`, `border-color: ${focusColor};`);
	rule(`.${stageCss.progressFill}, .${stageCss.statusUpcoming}`, `background: ${accent};`);
	rule(`.${stageCss.metaRating}`, `background: ${accentA(0.15)};`);
	rule(`.${stageCss.cardWatched}, .${stageCss.posterWatched}`, `background: ${badgeWatched}; border-color: ${onBadge};`);
	rule(`.${stageCss.cardWatched} svg, .${stageCss.posterWatched} svg, .${stageCss.cardFavorite} svg, .${stageCss.posterFavorite} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
	rule(`.${quickLookCss.season}:focus, .${quickLookCss.open}:focus`, `border-color: ${focusColor};`);
	rule(`.${quickLookCss.progressFill}, .${quickLookCss.seasonFill}`, `background: ${accent};`);
	['actionsStacked', 'actionsCentered'].forEach((row) => {
		rule(`.${modernDetailCss[row]} > .${modernDetailCss.actionBtn}:first-child`, `background-color: ${accent}; color: ${onAccent};`);
		rule(`.${modernDetailCss[row]} > .${modernDetailCss.actionBtn}:first-child:focus`, `background-color: ${buttonFocused}; border-color: ${focusColor}; color: ${onButtonFocused};`);
		rule(`.${modernDetailCss[row]} > .${modernDetailCss.actionActive}`, `background-color: ${accentA(0.18)}; color: ${accent};`);
		rule(`.${modernDetailCss[row]} > .${modernDetailCss.actionActive}[data-spotlight-id='details-favorite-btn']`, 'background-color: rgba(255, 71, 87, 0.18); color: #e50914;');
	});
	rule(`.${tabBarCss.barFocused}::after`, `border-color: ${focusColor};`);

	// Detail screens, frost layout. Every color keeps the strength the stylesheet gives it. Text,
	// hairlines and the light fills take the page's text color, the glass and placeholders the
	// surface, the dim and fades over the art the background, and focus the focused button color.
	const fr = frostCss;
	const ink = (a) => `rgba(${toRgbTriplet(c.onBackground)}, ${a})`;
	const ground = (a) => `rgba(${toRgbTriplet(c.background)}, ${a})`;
	const focusFill = (a) => `rgba(${toRgbTriplet(c.buttonFocused)}, ${a})`;
	rule(`.${fr.frost}, .${fr.readMore}`, `color: ${onBackground};`);
	rule(`.${fr.dim}`, `background-color: ${ground(0.55)};`);
	rule(`.${fr.artFade}`, `background-image: linear-gradient(to top, ${ground(0.95)}, ${ground(0.74)} 50%, ${ground(0)} 80%), linear-gradient(to right, ${ground(0.5)}, ${ground(0)} 62%);`);
	rule(`.${fr.window}`, `background: ${surfaceA(0.55)};`);
	rule(`.${fr.toolbarPane}, .${fr.tabPane}`, `background: ${surfaceA(0.9)};`);
	rule(`.${fr.readMore}`, `background: ${surfaceA(0.97)};`);
	rule(`.${fr.still}, .${fr.seasonPoster}, .${fr.avatar}, .${fr.wideThumb}, .${fr.posterThumb}`, `background: ${surfaceA(1)};`);
	rule(`.${fr.window}::after, .${fr.toolbarPane}::after, .${fr.tabPane}::after`, `border-color: ${ink(0.08)}; border-top-color: ${ink(0.24)};`);
	rule(`.${fr.strip}`, `border-color: ${ink(0.14)};`);
	rule(`.${ratingsCss.ratingColumn} + .${ratingsCss.ratingColumn}`, `border-left-color: ${ink(0.14)};`);
	rule(`.${ratingsCss.columnName}`, `color: ${ink(0.62)};`);
	rule(`.${ratingsCss.columnValue}`, `color: ${ink(0.94)};`);
	rule(`.${fr.infoRow} + .${fr.infoRow}`, `border-top-color: ${ink(0.08)};`);
	rule(['headingCaps', 'creditLabel', 'trackChevron', 'watchHeading', 'caps', 'playedIcon', 'avatarIcon', 'groupTitle', 'infoLabel']
		.map((name) => `.${fr[name]}`).join(', '), `color: ${ink(0.62)};`);
	rule(`.${fr.metaLine}`, `color: ${ink(0.78)};`);
	rule(`.${fr.metaRating}, .${fr.techChip}`, `border-color: ${ink(0.55)}; color: ${ink(0.85)};`);
	rule(`.${fr.statusUpcoming}`, `background: ${accent};`);
	rule(`.${fr.status}`, `color: ${ink(0.8)};`);
	rule(`.${fr.textBody}, .${fr.posterTitle}`, `color: ${ink(0.9)};`);
	rule(`.${fr.credits}, .${fr.readMoreText}`, `color: ${ink(0.92)};`);
	rule(`.${fr.infoValue}`, `color: ${ink(0.94)};`);
	rule(`.${fr.trackValue}, .${fr.rowSide}`, `color: ${ink(0.72)};`);
	rule(`.${fr.watchOthers}, .${fr.pill}`, `color: ${ink(0.68)};`);
	rule(`.${fr.rowOverview}, .${fr.castRole}, .${fr.readMoreMeta}`, `color: ${ink(0.65)};`);
	rule(`.${fr.statusTrack}, .${fr.rowBar}`, `background: ${rangeTrack};`);
	rule(`.${fr.barFill}`, `background: ${rangeProgress};`);
	rule(`.${fr.card}`, `background: ${ink(0.06)};`);
	rule(`.${fr.pills}, .${fr.statusPill}`, `background: ${ink(0.08)};`);
	rule(`.${fr.track}, .${fr.watchCard}`, `background: ${ink(0.1)};`);
	rule(`.${fr.watchLogo}`, `background: ${ink(0.12)};`);
	rule(`.${fr.details}:focus .${fr.card}`, `background: ${focusFill(0.12)};`);
	rule(`.${fr.text}:focus, .${fr.row}:focus, .${fr.castTile}:focus, .${fr.extraTile}:focus, .${fr.posterTile}:focus`, `background: ${focusFill(0.14)};`);
	rule(`.${fr.tabSelected}`, `background: ${ink(0.16)};`);
	rule(`.${fr.pillSelected}`, `background: ${ink(0.18)}; color: ${onBackground};`);
	rule(`.${fr.track}:focus`, `background: ${focusFill(0.32)};`);
	rule(`.${fr.pill}:focus, .${fr.tab}:focus`, `background: ${focusFill(0.38)}; color: ${onBackground};`);
	// Frost's toolbar: Play is an accent pill that fills like Modern's labeled Play when focused, and
	// the rest are bare icons on a light platter while focused, with their label in a chip above.
	const frosted = `.${modernDetailCss.actionsFrosted} >`;
	const actionBtn = modernDetailCss.actionBtn;
	const favorite = `.${modernDetailCss.actionActive}[data-spotlight-id='details-favorite-btn']`;
	rule(`${frosted} .${actionBtn}`, `color: ${onButtonNormal};`);
	rule(`${frosted} .${actionBtn}:focus`, `background: transparent; border-color: transparent; color: ${onButtonNormal};`);
	rule(`${frosted} .${modernDetailCss.actionActive}, ${frosted} .${modernDetailCss.actionActive}:focus`, `color: ${accent};`);
	rule(`${frosted} ${favorite}, ${frosted} ${favorite}:focus`, 'color: #ff375f;');
	rule(`${frosted} .${actionBtn}:not(:first-child):focus .${modernDetailCss.actionIcon}`, `background: ${focusFill(0.32)};`);
	rule(`${frosted} .${actionBtn}:not(:first-child) .${modernDetailCss.actionText}`, `background: ${surfaceA(0.97)}; color: ${onSurface};`);
	rule(`${frosted} .${actionBtn}:first-child`, `background: ${accentA(0.86)}; background-clip: padding-box; color: ${onAccent};`);
	rule(`${frosted} .${actionBtn}:first-child:focus`, `background: ${buttonFocused}; background-clip: padding-box; border-color: ${focusFill(0.3)}; color: ${onButtonFocused};`);

	// Home screen chrome
	rule(`.${browseCss.page}`, `background: ${background};`);
	rule(`.${browseCss.ayaFrame}`, `background: ${background};`);
	rule(`.${browseCss.ayaFocusRing}`, `border-color: ${focusColor}; box-shadow: ${glowOr(`0 0 18px 1px ${accentA(0.3)}`)};`);
	rule(`.${browseCss.ayaTitle}`, `color: ${onSurface}; text-shadow: 0 0 20px ${scrim(0.72)};`);
	rule(`.${browseCss.ayaIndicator}`, `background: ${os(0.3)};`);
	rule(`.${browseCss.ayaIndicatorActive}`, `background: ${onSurface};`);
	rule(`.${backdropCss.globalBackdropOverlay}`, `background: ${toCssColor(c.scrim)};`);
	rule(`.${browseCss.detailPlaceholder} p, .${browseCss.empty}`, `color: ${os(0.7)};`);
	// The card takes the media bar's own overlay color at three quarters of its
	// opacity, outlined with the theme's card border.
	const mediaBarFill = toCssColorWithAlpha(
		resolveOverlayColor(options.mediaBarOverlayColor),
		((options.mediaBarOverlayOpacity ?? 50) / 100) * 0.75
	);
	rule(`.${browseCss.featuredInfoBox}`, `background-color: ${mediaBarFill}; background-image: none; border: ${b.cardBorder.width}px solid ${toCssColor(b.cardBorder.color)}; border-radius: 16px;`);
	rule(`.${browseCss.trailerActive} .${browseCss.featuredInfoBox}`, `background-color: transparent; background-image: none;`);
	rule(`.${browseCss.featuredTitle}, .${browseCss.makdTitle}, .${browseCss.galleryVerticalTitle}, .${browseCss.galleryActiveTitle}, .${browseCss.galleryCreditValue}, .${browseCss.bannerTitle}`, `color: ${onBackground};`);
	rule(`.${browseCss.metaItem}`, `color: ${os(0.9)};`);
	rule(`.${browseCss.metaItem}:not(:last-child)::after`, `color: ${os(0.5)};`);
	rule(`.${browseCss.metaBadge}`, `border-color: ${os(0.4)};`);
	rule(`.${browseCss.featuredOverview}, .${browseCss.galleryOverview}`, `color: ${os(0.9)};`);
	rule(`.${browseCss.carouselNav}`, `color: ${onBackground};`);
	rule(`.${browseCss.carouselNav}:focus`, `background: ${scrim(0.85)};`);
	rule(`.${browseCss.featuredIndicators}, .${browseCss.makdDots}`, `background: ${scrim(0.55)};`);
	rule(`.${browseCss.indicatorDot}`, `background: ${os(0.5)};`);
	rule(`.${browseCss.indicatorDot}.${browseCss.active}`, `background: ${onSurface};`);
	rule(`.${browseCss.makdOverview}`, `color: ${os(0.95)};`);
	rule(`.${browseCss.makdDot}`, `background: ${os(0.35)};`);
	rule(`.${browseCss.makdDotActive}`, `background: ${focusColor};`);
	rule(`.${browseCss.galleryIndex}`, `color: ${os(0.85)};`);
	rule(`.${browseCss.galleryActiveRight}`, `background: ${scrim(0.55)}; border-color: ${os(0.12)};`);
	rule(`.${browseCss.galleryPill}`, `color: ${onBackground}; background: ${scrim(0.35)};`);
	rule(`.${browseCss.galleryPillOutlined}`, `background: transparent; border-color: ${os(0.55)};`);
	rule(`.${browseCss.galleryCreditLabel}`, `color: ${accent};`);
	rule(`.${browseCss.galleryShimmer} span`, `background: ${os(0.1)};`);
	rule(`.${skeletonCss.box}`, `background-color: ${theme.isGlass ? 'rgba(255, 255, 255, 0.16)' : os(0.14)};`);
	rule(`.${browseCss.bannerCard}:focus`, `border-color: ${focusColor}; box-shadow: ${glowOr(`0 0 18px ${accentA(0.4)}`)};`);
	rule(`.${browseCss.bannerGradient}`, `background: linear-gradient(to right, ${scrim(0.9)}, ${scrim(0)});`);
	rule(`.${browseCss.bannerMeta}`, `color: ${os(0.75)};`);
	rule(`.${browseCss.bannerDot}`, `background: ${os(0.4)};`);
	rule(`.${browseCss.bannerDotActive}`, `background: ${onBackground};`);

	// The classic info band above the rows
	rule(`.${browseCss.detailTitle}, .${browseCss.infoLead}`, `color: ${onBackground};`);
	rule(`.${browseCss.infoText}`, `color: ${os(0.8)};`);
	rule(`.${browseCss.infoDot}`, `color: ${os(0.5)};`);
	rule(`.${browseCss.infoBadge}`, `background: ${chipBackground}; border: ${chipBorder}; border-radius: ${chipRadius}; color: ${os(0.85)};`);
	rule(`.${browseCss.detailSummary}`, `color: ${os(0.85)};`);

	// Cards, both row styles
	for (const cardCss of [mediaCardCss, modernCardCss]) {
		rule(`.${cardCss.image}, .${cardCss.placeholder}, .${cardCss.imageContainer}, .${cardCss.genreOverlay}`, `border-radius: ${cardRadius};`);
		// Artists stay round whatever corners the theme gives the other cards.
		if (cardCss.circle) rule(`.${cardCss.circle} .${cardCss.image}, .${cardCss.circle} .${cardCss.placeholder}, .${cardCss.circle} .${cardCss.imageContainer}`, 'border-radius: 50%;');
		rule(`.${cardCss.image}, .${cardCss.placeholder}`, `border: ${b.cardBorder.width}px solid ${toCssColor(b.cardBorder.color)};`);
		rule(`.${cardCss.card}:focus .${cardCss.image}, .${cardCss.card}:focus .${cardCss.placeholder}`, `border-color: ${focusColor}; border-width: 4px; box-shadow: ${glowOr('0 8px 24px rgba(0, 0, 0, 0.6)')};`);
		rule(`.${cardCss.previewFrame}`, `border-radius: ${cardRadius};`);
		rule(`.${cardCss.previewRing}`, `border-color: ${focusColor}; border-radius: ${cardRadius}; box-shadow: ${glowOr('0 8px 24px rgba(0, 0, 0, 0.6)')};`);
		// The Fire TV WebView only shows a video it can put on its own hardware plane and a
		// rounded clip keeps it off one, so the stylesheet squares the frame, the ring and the
		// container around them while a preview is up, which this sheet would otherwise round back
		rules.push(`${prefix}.vega .${cardCss.previewFrame}, ${prefix}.vega .${cardCss.previewRing}, ${prefix}.vega .${cardCss.imageContainer}.${cardCss.previewHost} { border-radius: 0; }`);
		rule(`.${cardCss.placeholder}`, `background: linear-gradient(135deg, ${accentA(0.25)} 0%, ${accentA(0.05)} 50%, transparent 100%), ${surfaceVariant};`);
		rule(`.${cardCss.placeholderTitle}`, `color: ${onSurface};`);
		rule(`.${cardCss.title}`, `color: ${theme.id === 'neon_pulse' ? accent : onSurface};`);
		rule(`.${cardCss.progressBar}`, `background: ${scrim(0.54)};`);
		rule(`.${cardCss.progress}`, `background: ${accent};`);
		rule(`.${cardCss.watchedBadge}`, `background: ${badgeWatched}; border-color: ${onBadge};`);
		rule(`.${cardCss.watchedBadge} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
		rule(`.${cardCss.unplayedCount}`, `background: ${badgeUnplayed}; color: ${onBadge}; border-color: ${onBadge};`);
		rule(`.${cardCss.favoriteBadge}`, `background: ${recordingActive}; border-color: ${onBadge};`);
		rule(`.${cardCss.favoriteBadge} svg`, `fill: ${onBadge}; stroke: ${onBadge};`);
		rule(`.${cardCss.serverBadge}`, `background: ${surface}; color: ${onSurface};`);
		rule(`.${cardCss.seerrMissing}`, `background: ${accent};`);
		rule(`.${cardCss.seerrMissing} svg`, `fill: ${onBadge};`);
		rule(`.${cardCss.seerrBanner}`, `border-width: ${b.cardBorder.width}px ${b.cardBorder.width}px 0; border-radius: ${b.cardRadius.topLeft}px ${b.cardRadius.topRight}px 0 0;`);
		rule(`.${cardCss.card}:focus .${cardCss.seerrBanner}`, 'border-width: 4px 4px 0;');
	}

	rule(`.${mediaCardCss.seerr5}`, `background: ${onSurface}; border-color: ${statusAvailable};`);
	rule(`.${mediaCardCss.seerr4}`, `background: ${statusAvailable};`);
	rule(`.${mediaCardCss.seerr3}`, `border-color: ${statusRequested};`);
	rule(`.${mediaCardCss.seerr2}`, `background: ${onSurface}; border-color: ${statusPending};`);
	rule(`.${modernCardCss.focusRing}`, `border-color: ${focusColor};`);
	rule(`.${seerrDotCss.dot}`, `background: ${onBadge}; border-color: ${onBadge};`);
	rule(`.${seerrDotCss.available}`, `border-color: ${statusAvailable}; color: ${statusAvailable};`);
	rule(`.${seerrDotCss.partial}`, `background: ${statusAvailable}; border-color: ${statusAvailable}; color: ${onBadge};`);
	rule(`.${seerrDotCss.processing}`, `border-color: ${statusRequested}; color: ${statusRequested};`);
	rule(`.${seerrDotCss.pending}`, `border-color: ${statusPending}; color: ${statusPending};`);

	// The Seerr banner across a poster, with dark ink on a fill as light as Pending's yellow.
	const bannerInk = (hex) => (relativeLuminance(hex) > 0.45 ? '#000000' : onBadge);
	[
		['available', theme.semantic.statusAvailable],
		['processing', theme.semantic.statusRequested],
		['pending', theme.semantic.statusPending]
	].forEach(([fill, hex]) => {
		rule(`.${seerrBannerCss.banner}.${seerrBannerCss[fill]}`, `background: ${toCssColor(hex)}; color: ${bannerInk(hex)};`);
	});
	rule(`.${mediaCardCss.seriesName}`, `color: ${onSurface};`);
	rule(`.${mediaCardCss.episodeInfo}, .${modernCardCss.secondaryTitle}`, `color: ${theme.id === 'neon_pulse' ? onSurface : os(0.6)};`);
	rule(`.${mediaCardCss.homeText} .${mediaCardCss.episodeInfo}`, `color: ${theme.id === 'neon_pulse' ? onSurface : os(0.65)};`);
	rule(`.${modernCardCss.placeholderIcon}`, `color: ${os(0.45)};`);
	rule(`.${modernCardCss.overview}`, `color: ${theme.id === 'neon_pulse' ? onSurface : os(0.7)};`);
	rule(`.${modernCardCss.platformWebos} .${modernCardCss.image}`, `border-radius: ${bumpRadius(b.cardRadius, 2)};`);
	rule(`.${modernCardCss.platformWebos} .${modernCardCss.previewFrame}, .${modernCardCss.platformWebos} .${modernCardCss.previewRing}`, `border-radius: ${bumpRadius(b.cardRadius, 2)};`);

	// Row shells
	rule(`.${mediaRowCss.title}, .${modernRowCss.title}`, `color: ${onSurface}; text-shadow: ${textGlow};`);
	rule(`.${mediaRowCss.subtitle}, .${modernRowCss.subtitle}`, `color: ${os(0.5)};`);
	rule(`.${watchingNowRowCss.subtitle}`, `color: ${os(0.95)};`);
	rule(`.${watchingNowRowCss.globeIcon}`, `color: ${onSurface};`);
	rule(`.${mediaRowCss.seeAll}`, `background: ${os(0.08)}; color: ${os(0.7)};`);
	rule(`.${mediaRowCss.seeAll}:focus`, `border-color: ${accent}; background: ${accentA(0.22)}; color: ${onSurface}; box-shadow: 0 0 14px 1px ${accentA(0.45)};`);
	rule(`.${mediaRowCss.seeAllChevron}`, `color: ${accent};`);

	// Ratings
	rule(`.${ratingsCss.ratingItem}, .${ratingsCss.ratingCompactBadge}`, `background: ${scrim(0.45)};`);
	rule(`.${ratingsCss.ratingItemPlain}`, `background: transparent;`);
	rule(`.${ratingsCss.ratingValue}, .${ratingsCss.ratingName}, .${ratingsCss.ratingNameCompact}`, `color: ${onSurface};`);
	rule(`.${ratingsCss.ratingValueCompact}`, `color: ${onBackground};`);

	// Focus rings on the screens that load on demand
	const {player, playerOverlays, episodeBrowser, genreBrowse, seerrDiscover, seerrBrowse, seerrPosterCard, calendar} = lazySheets;
	const ring = (sheet, names, states) => names.flatMap((name) => states.map((state) => `.${sheet[name]}${state}`)).join(', ');
	if (player) {
		rule(ring(player, ['liveBtn', 'chapterItem'], [':hover', ':focus']), `border-color: ${focusColor};`);
		rule(`.${player.trackItem}:focus`, `background: ${accentA(0.3)};`);
	}
	if (playerOverlays) {
		rule(ring(playerOverlays, ['offsetBtn', 'actionBtn', 'settingItem'], [':hover', ':focus']), `border-color: ${focusColor};`);
		// Older engines drop a whole rule over one selector they can't read, so this stands alone
		rule(`.${playerOverlays.sliderItem}:focus-within`, `border-color: ${focusColor};`);
	}
	if (episodeBrowser) {
		rule(ring(episodeBrowser, ['episode'], [':hover', ':focus']), `border-color: ${focusColor};`);
	}
	if (genreBrowse) {
		rule(ring(genreBrowse, ['filterButton', 'sortButton', 'letterButton'], [':focus']), `border-color: ${focusColor};`);
	}
	// Core draws every Seerr ring and focus border in its focus color.
	if (seerrDiscover) {
		rule(`.${seerrDiscover.tileRing}`, `border-color: ${focusColor};`);
		rule(`.${seerrDiscover.pill}:focus`, `border-color: ${focusColor};`);
	}
	if (seerrBrowse) {
		rule(ring(seerrBrowse, ['chip', 'letter', 'toolButton'], [':focus']), `box-shadow: inset 0 0 0 2px ${focusColor};`);
	}
	if (seerrPosterCard) {
		rule(`.${seerrPosterCard.ring}`, `border-color: ${focusColor};`);
	}
	if (calendar) {
		rule(`.${calendar.row}:focus::after, .${calendar.card}:focus::after, .${calendar.cell}:focus::after`, `border-color: ${focusColor};`);
		rule(`.${calendar.button}:focus, .${calendar.tab}:focus`, `background: ${onSurface} !important; border-color: ${focusColor}; color: ${inkOn(c.onSurface) === '0, 0, 0' ? 'rgba(0, 0, 0, 0.87)' : '#fff'};`);
	}

	// Pixel themes square off every fixed radius.
	if (theme.isPixel) {
		rule([
			`.${sidebarCss.sidebarItem}`, `.${sidebarCss.libraryItem}`, `.${sidebarCss.userBtn}`,
			`.${navBarCss.navPill}`, `.${navBarCss.navBtn}`,
			`.${settingsCss.listItem}`, `.${settingsCss.listItemIcon}`, `.${settingsCss.valueBubble}`, `.${settingsCss.dialog}`, `.${panelCss.panel}`, `.${settingsCss.pageAlone}`,
			`.${settingsCss.themeCard}`, `.${settingsCss.themeCardStripe}`, `.${settingsCss.input}`,
			`.${settingsCss.actionButton}`, `.${settingsCss.settingsButtonPrimary}`, `.${settingsCss.playbackTimePreview}`, `.${searchCss.searchInputWrapper}`,
			`.${settingsCss.syncCard}`, `.${settingsCss.syncTransferCard}`, `.${settingsCss.syncChip}`,
			`.${detailsCss.poster}`, `.${detailsCss.btnAction}`, `.${detailsCss.nextUpCard}`,
			`.${detailsCss.episodeCard}`, `.${detailsCss.chapterCard}`, `.${detailsCss.extraCard}`,
			`.${detailsCss.seasonPosterWrapper}`, `.${detailsCss.episodeNumber}`, `.${detailsCss.badge}`,
			`.${detailsCss.trackItem}`, `.${detailsCss.actionBtn}`, `.${detailsCss.toast}`, `.${detailsCss.seasonEp}`,
			`.${modernDetailCss.actionBtn}`, `.${modernDetailCss.upNextCard}`,
			`.${tabBarCss.tabBar}`, `.${tabBarCss.tab}`, `.${overviewCss.spottable}`,
			`.${browseCss.featuredInfoBox}`, `.${browseCss.bannerCard}`, `.${browseCss.galleryActiveRight}`,
			`.${browseCss.galleryPill}`, `.${browseCss.makdDots}`, `.${browseCss.featuredIndicators}`
		].join(', '), 'border-radius: 0;');
	}

	return rules.join('\n');
};

// Creates or refreshes the injected style element. Appending on every call also
// moves it back to the end of the head.
export const applyThemeOverrides = (theme, options) => {
	lastApplied = [theme, options];
	if (typeof document === 'undefined') return;
	let element = document.getElementById(STYLE_ELEMENT_ID);
	if (!element) {
		element = document.createElement('style');
		element.id = STYLE_ELEMENT_ID;
	}
	element.textContent = buildThemeOverrideCss(theme, options);
	document.head.appendChild(element);
};

export const registerThemeSheet = (name, css) => {
	lazySheets[name] = css;
	if (!lastApplied || rebuildQueued) return;
	rebuildQueued = true;
	// A screen's modules load together, so their sheets go in with one rebuild
	Promise.resolve().then(() => {
		rebuildQueued = false;
		applyThemeOverrides(...lastApplied);
	});
};
