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
	isValidHexColor,
	radiusToCss,
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
import searchCss from '../views/Search/Search.module.less';
import detailsCss from '../views/Details/Details.module.less';
import modernDetailCss from '../views/Details/ModernDetailContent.module.less';
import overviewCss from '../views/Details/ExpandableOverview.module.less';
import tabBarCss from '../components/DetailsTabBar/DetailsTabBar.module.less';
import browseCss from '../views/Browse/Browse.module.less';
import mediaCardCss from '../components/MediaCard/MediaCard.module.less';
import modernCardCss from '../components/MediaCard/ModernMediaCard.module.less';
import mediaRowCss from '../components/MediaRow/MediaRow.module.less';
import modernRowCss from '../components/MediaRow/ModernMediaRow.module.less';
import ratingsCss from '../components/RatingsRow/RatingsRow.module.less';

const STYLE_ELEMENT_ID = 'moonfin-theme-overrides';

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

	const background = toCssColor(c.background);
	const onBackground = toCssColor(c.onBackground);
	const surface = toCssColor(c.surface);
	const surfaceVariant = toCssColor(c.surfaceVariant);
	const onSurface = toCssColor(c.onSurface);
	const accent = toCssColor(c.accent);
	const onAccent = toCssColor(c.onAccent);
	const buttonNormal = toCssColor(c.buttonNormal);
	const buttonFocused = toCssColor(c.buttonFocused);
	const buttonActive = toCssColor(c.buttonActive);
	const onButtonNormal = toCssColor(c.onButtonNormal);
	const onButtonFocused = toCssColor(c.onButtonFocused);
	const inputBackground = toCssColor(c.inputBackground);
	const inputFocused = toCssColor(c.inputFocused);
	const inputBorder = toCssColor(c.inputBorder);
	const inputBorderFocused = toCssColor(c.inputBorderFocused);
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

	const focusColor = isValidHexColor(options.focusBorderColor)
		? toCssColor(options.focusBorderColor)
		: toCssColor(b.focusBorder.color);
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

	// The glow a tile falls back to when the theme carries none of its own.
	const tileGlow = glowOr(`0 0 14px 0.5px ${accentA(0.22)}`);
	// A focused row fills with the theme's own colour, anything from near white to
	// a saturated cyan, so its text is picked against that fill rather than assumed
	// dark. The quieter line stays close behind the heading, since a caption at half
	// strength on a bright fill is what turns unreadable from across a room.
	const focusInk = inkOn(c.buttonFocused);
	const invertedStrong = `rgba(${focusInk}, 0.92)`;
	const invertedSoft = `rgba(${focusInk}, 0.75)`;
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

	// Settings
	rule(`.${settingsCss.page}`, `background: ${background};`);
	rule(`.${settingsCss.sectionTitle}`, `color: ${onBackground};`);
	rule(`.${settingsCss.listItem}, .${settingsCss.sliderContainer}, .${settingsCss.themeCard}`, `background: ${surfaceA(0.82)}; border: 1px solid ${tileBorderColor};`);
	const tileFocus = `background: ${buttonFocused}; border-color: ${accentA(0.72)}; box-shadow: ${tileGlow};`;
	rule(`.${settingsCss.listItem}:focus, .${settingsCss.themeCard}:focus`, tileFocus);
	// The older engines treat focus-within as a parse error that voids the whole
	// rule, so it always stands alone instead of joining the selectors above.
	rule(`.${settingsCss.sliderContainer}:focus-within`, tileFocus);
	rule(`.${settingsCss.listItemSelected}, .${settingsCss.themeCardSelected}`, `border-color: ${accent};`);
	rule(`.${settingsCss.listItemHeading}`, `color: ${onSurface};`);
	rule(`.${settingsCss.listItemCaption}, .${settingsCss.listItemValue}, .${settingsCss.chevronIcon}, .${settingsCss.sliderValue}`, `color: ${os(0.7)};`);
	rule(`.${settingsCss.sliderTitle}, .${settingsCss.themeCardName}, .${settingsCss.playbackTimeRow}`, `color: ${onSurface};`);
	// The focused tile fills with the light button color, so its content flips dark.
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemHeading}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.sliderContainer}:focus-within .${settingsCss.sliderTitle}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemCaption}, .${settingsCss.listItem}:focus .${settingsCss.listItemValue}, .${settingsCss.listItem}:focus .${settingsCss.chevronIcon}`, `color: ${invertedSoft};`);
	// The theme cards fill the same way the rows do, so their text flips with them
	rule(`.${settingsCss.themeCard}:focus .${settingsCss.themeCardName}`, `color: ${invertedStrong};`);
	rule(`.${settingsCss.themeCard}:focus .${settingsCss.themeCardDescription}`, `color: ${invertedSoft};`);
	rule(`.${settingsCss.sliderContainer}:focus-within .${settingsCss.sliderValue}`, `color: ${invertedSoft};`);
	rule(`.${settingsCss.listItemIcon}`, `background: ${accentA(0.14)}; border: 1px solid ${accentA(0.42)}; box-sizing: border-box; color: ${os(0.78)};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.listItemIcon}`, `background: ${accentA(0.22)}; border-color: ${accentA(0.64)}; color: ${invertedSoft};`);
	rule(`.${settingsCss.toggleTrack}`, `background: ${surfaceVariant};`);
	rule(`.${settingsCss.toggleOn}`, `background: ${accent};`);
	rule(`.${settingsCss.toggleThumb}`, `background: ${onSurface};`);
	rule(`.${settingsCss.toggleOn} .${settingsCss.toggleThumb}`, `background: ${onAccent};`);
	rule(`.${settingsCss.radioOuter}`, `border-color: ${os(0.35)};`);
	rule(`.${settingsCss.listItem}:focus .${settingsCss.radioOuter}`, `border-color: rgba(0, 0, 0, 0.35);`);
	rule(`.${settingsCss.radioSelected}`, `border-color: ${accent};`);
	rule(`.${settingsCss.radioInner}`, `background: ${accent};`);
	rule(`.${settingsCss.settingsSlider}`, `--slider-active-bg-color: ${accent}; --slider-knob-bg-color: ${onSurface};`);
	rule(`.${settingsCss.divider}`, `background: ${os(0.12)};`);
	rule(`.${settingsCss.actionBar}`, `border-top-color: ${os(0.12)};`);
	rule(`.${settingsCss.input}, .${settingsCss.searchInput}`, `background: ${inputBackground}; border-color: ${inputBorder}; color: ${onSurface};`);
	rule(`.${settingsCss.input}:focus, .${settingsCss.input}[data-focused], .${settingsCss.searchInput}:focus, .${settingsCss.searchInput}[data-focused]`, `background: ${inputFocused}; border-color: ${inputBorderFocused};`);
	rule(`.${settingsCss.input} input::-webkit-input-placeholder, .${settingsCss.searchInput} input::-webkit-input-placeholder`, `color: ${os(0.45)};`);
	rule(`.${settingsCss.input} input::placeholder, .${settingsCss.searchInput} input::placeholder`, `color: ${os(0.45)};`);
	rule(`.${settingsCss.actionButton}`, `background: ${buttonNormal}; color: ${onButtonNormal}; border-color: ${tileBorderColor};`);
	rule(`.${settingsCss.actionButton}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${settingsCss.dangerButton}:focus`, `background: ${recordingActive} !important; border-color: ${recordingActive} !important; color: #fff;`);
	rule(`.${settingsCss.actionButtonActive}`, `background: ${buttonActive}; color: ${onButtonNormal};`);
	rule(`.${settingsCss.statusMessage}, .${settingsCss.authHint}, .${settingsCss.viewDescription}, .${settingsCss.themeCardDescription}, .${settingsCss.themeStoreMessage}`, `color: ${os(0.7)};`);
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
	rule(`.${detailsCss.posterBadgeWatched}, .${detailsCss.watchedIndicator}`, `background: ${badgeWatched};`);
	rule(`.${detailsCss.posterBadgeWatched} svg, .${detailsCss.watchedIndicator} svg`, `fill: ${onBadge};`);
	rule(`.${detailsCss.posterBadgeFavorite} svg, .${detailsCss.favoriteBadge} svg`, `fill: ${recordingActive};`);
	rule(`.${detailsCss.posterBadgeFavorite}, .${detailsCss.favoriteBadge}`, `background: ${scrim(0.6)};`);
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
	rule(`.${detailsCss.unplayedCount}`, `background: ${badgeUnplayed}; color: ${onBadge};`);
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
	rule(`.${detailsCss.selected}`, `background: ${accentA(0.3)}; border-color: ${focusColor};`);
	rule(`.${detailsCss.selected}::after`, `color: ${accent};`);
	rule(`.${detailsCss.trackPlayed} svg`, `fill: ${accent};`);
	rule(`.${detailsCss.actionBtn}`, `background: ${os(0.1)}; border-color: ${os(0.2)}; color: ${onBackground};`);
	rule(`.${detailsCss.actionBtn}:hover, .${detailsCss.actionBtn}:focus`, `background: ${accentA(0.3)}; border-color: ${focusColor};`);
	rule(`.${detailsCss.toast}`, `background: ${surfaceA(0.9)}; color: ${onBackground}; border-color: ${os(0.12)};`);
	rule(`.${detailsCss.trailerCloseBtn}`, `background: ${os(0.15)}; color: ${onBackground};`);

	// Detail screens, modern layout
	rule(`.${modernDetailCss.metaRow}, .${modernDetailCss.techSize}`, `color: ${os(0.75)};`);
	rule(`.${modernDetailCss.actionPrimary}`, `background-color: ${accent}; color: ${onAccent};`);
	rule(`.${modernDetailCss.actionBtn}:focus`, `background: ${buttonFocused}; border-color: ${focusColor}; color: ${buttonInk};`);
	rule(`.${modernDetailCss.upNextCard}`, `background-color: ${surfaceA(0.82)};`);
	rule(`.${modernDetailCss.upNextCard}:focus`, `border-color: ${focusColor};`);
	rule(`.${modernDetailCss.upNextLabel}`, `color: ${accent};`);
	rule(`.${modernDetailCss.upNextProgress} > div`, `background: ${accent};`);
	rule(`.${modernDetailCss.seerrHeading}`, `color: ${onBackground};`);
	rule(`.${tabBarCss.tabBar}`, `background: ${os(0.08)};`);
	rule(`.${tabBarCss.tab}`, `color: ${os(0.75)};`);
	rule(`.${tabBarCss.tabActive}`, `background: ${accent}; color: ${onAccent};`);
	rule(`.${tabBarCss.tab}:focus`, `border-color: ${focusColor};`);
	rule(`.${overviewCss.spottable}:focus`, `border-color: ${focusColor};`);
	rule(`.${overviewCss.readMoreBtn}`, `color: ${accent};`);

	// Home screen chrome
	rule(`.${browseCss.page}`, `background: ${background};`);
	rule(`.${browseCss.ayaFrame}`, `background: ${background};`);
	rule(`.${browseCss.ayaFocusRing}`, `border-color: ${focusColor}; box-shadow: ${glowOr(`0 0 18px 1px ${accentA(0.3)}`)};`);
	rule(`.${browseCss.ayaTitle}`, `color: ${onSurface}; text-shadow: 0 0 20px ${scrim(0.72)};`);
	rule(`.${browseCss.ayaIndicator}`, `background: ${os(0.3)};`);
	rule(`.${browseCss.ayaIndicatorActive}`, `background: ${onSurface};`);
	rule(`.${browseCss.globalBackdropOverlay}`, `background: ${toCssColor(c.scrim)};`);
	rule(`.${browseCss.featuredGradient}`, `background: -webkit-linear-gradient(top, ${scrim(0.3)} 0%, ${scrim(0.1)} 40%, ${scrim(0.8)} 100%); background: linear-gradient(to bottom, ${scrim(0.3)} 0%, ${scrim(0.1)} 40%, ${scrim(0.8)} 100%);`);
	rule(`.${browseCss.loadingContainer} p, .${browseCss.detailPlaceholder} p, .${browseCss.empty}`, `color: ${os(0.7)};`);
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
	rule(`.${browseCss.bannerCard}:focus`, `border-color: ${focusColor}; box-shadow: ${glowOr(`0 0 18px ${accentA(0.4)}`)};`);
	rule(`.${browseCss.bannerGradient}`, `background: linear-gradient(to right, ${scrim(0.9)}, ${scrim(0)});`);
	rule(`.${browseCss.bannerMeta}`, `color: ${os(0.75)};`);
	rule(`.${browseCss.bannerDot}`, `background: ${os(0.4)};`);
	rule(`.${browseCss.bannerDotActive}`, `background: ${onBackground};`);

	// The classic info band above the rows
	rule(`.${browseCss.detailTitle}`, `color: ${onBackground};`);
	rule(`.${browseCss.infoText}`, `color: ${os(0.8)};`);
	rule(`.${browseCss.infoDot}`, `color: ${os(0.5)};`);
	rule(`.${browseCss.infoBadge}`, `background: ${chipBackground}; border: ${chipBorder}; border-radius: ${chipRadius}; color: ${os(0.8)};`);
	rule(`.${browseCss.detailSummary}`, `color: ${os(0.85)};`);

	// Cards, both row styles
	for (const cardCss of [mediaCardCss, modernCardCss]) {
		rule(`.${cardCss.image}, .${cardCss.placeholder}, .${cardCss.imageContainer}, .${cardCss.genreOverlay}`, `border-radius: ${cardRadius};`);
		rule(`.${cardCss.image}, .${cardCss.placeholder}`, `border: ${b.cardBorder.width}px solid ${toCssColor(b.cardBorder.color)};`);
		rule(`.${cardCss.card}:focus .${cardCss.image}`, `border-color: ${focusColor}; border-width: 4px; box-shadow: ${glowOr('0 8px 24px rgba(0, 0, 0, 0.6)')};`);
		rule(`.${cardCss.placeholder}`, `background: linear-gradient(135deg, ${accentA(0.25)} 0%, ${accentA(0.05)} 50%, transparent 100%), ${surfaceVariant};`);
		rule(`.${cardCss.placeholderTitle}`, `color: ${onSurface};`);
		rule(`.${cardCss.title}`, `color: ${theme.id === 'neon_pulse' ? accent : onSurface};`);
		rule(`.${cardCss.progressBar}`, `background: ${scrim(0.54)};`);
		rule(`.${cardCss.progress}`, `background: ${accent};`);
		rule(`.${cardCss.watchedBadge}`, `background: ${badgeWatched};`);
		rule(`.${cardCss.watchedBadge} svg`, `fill: ${onBadge};`);
		rule(`.${cardCss.unplayedCount}`, `background: ${badgeUnplayed}; color: ${onBadge};`);
		rule(`.${cardCss.favoriteBadge}`, `color: ${recordingActive};`);
		rule(`.${cardCss.serverBadge}`, `background: ${surface}; color: ${onSurface};`);
		rule(`.${cardCss.seerr5}`, `background: ${onSurface}; border-color: ${statusAvailable};`);
		rule(`.${cardCss.seerr4}`, `background: ${statusAvailable};`);
		rule(`.${cardCss.seerr3}`, `border-color: ${statusRequested};`);
		rule(`.${cardCss.seerr2}`, `background: ${onSurface}; border-color: ${statusPending};`);
	}
	rule(`.${mediaCardCss.seriesName}`, `color: ${onSurface};`);
	rule(`.${mediaCardCss.episodeInfo}, .${modernCardCss.secondaryTitle}`, `color: ${theme.id === 'neon_pulse' ? onSurface : os(0.6)};`);
	rule(`.${modernCardCss.placeholderIcon}`, `color: ${os(0.45)};`);
	rule(`.${modernCardCss.overview}`, `color: ${theme.id === 'neon_pulse' ? onSurface : os(0.7)};`);
	rule(`.${modernCardCss.platformWebos} .${modernCardCss.image}`, `border-radius: ${bumpRadius(b.cardRadius, 2)};`);

	// Row shells
	rule(`.${mediaRowCss.title}, .${modernRowCss.title}`, `color: ${onSurface}; text-shadow: ${textGlow};`);
	rule(`.${mediaRowCss.subtitle}, .${modernRowCss.subtitle}`, `color: ${os(0.5)};`);
	rule(`.${mediaRowCss.seeAll}`, `background: ${os(0.08)}; color: ${os(0.7)};`);
	rule(`.${mediaRowCss.seeAll}:focus`, `border-color: ${accent}; background: ${accentA(0.22)}; color: ${onSurface}; box-shadow: 0 0 14px 1px ${accentA(0.45)};`);
	rule(`.${mediaRowCss.seeAllChevron}`, `color: ${accent};`);

	// Ratings
	rule(`.${ratingsCss.ratingItem}, .${ratingsCss.ratingCompactBadge}`, `background: ${scrim(0.45)};`);
	rule(`.${ratingsCss.ratingItemPlain}`, `background: transparent;`);
	rule(`.${ratingsCss.ratingValue}, .${ratingsCss.ratingName}, .${ratingsCss.ratingNameCompact}`, `color: ${onSurface};`);
	rule(`.${ratingsCss.ratingValueCompact}`, `color: ${onBackground};`);

	// Pixel themes square off every fixed radius.
	if (theme.isPixel) {
		rule([
			`.${sidebarCss.sidebarItem}`, `.${sidebarCss.libraryItem}`, `.${sidebarCss.userBtn}`,
			`.${navBarCss.navPill}`, `.${navBarCss.navBtn}`,
			`.${settingsCss.listItem}`, `.${settingsCss.listItemIcon}`, `.${settingsCss.sliderContainer}`,
			`.${settingsCss.themeCard}`, `.${settingsCss.themeCardStripe}`, `.${settingsCss.input}`,
			`.${settingsCss.searchInput}`, `.${settingsCss.actionButton}`, `.${settingsCss.playbackTimePreview}`, `.${searchCss.searchInputWrapper}`,
			`.${detailsCss.poster}`, `.${detailsCss.btnAction}`, `.${detailsCss.nextUpCard}`,
			`.${detailsCss.episodeCard}`, `.${detailsCss.chapterCard}`, `.${detailsCss.extraCard}`,
			`.${detailsCss.seasonPosterWrapper}`, `.${detailsCss.episodeNumber}`, `.${detailsCss.badge}`,
			`.${detailsCss.trackItem}`, `.${detailsCss.actionBtn}`, `.${detailsCss.toast}`, `.${detailsCss.seasonEp}`,
			`.${modernDetailCss.actionBtn}`, `.${modernDetailCss.actionPrimary}`, `.${modernDetailCss.upNextCard}`,
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
	if (typeof document === 'undefined') return;
	let element = document.getElementById(STYLE_ELEMENT_ID);
	if (!element) {
		element = document.createElement('style');
		element.id = STYLE_ELEMENT_ID;
	}
	element.textContent = buildThemeOverrideCss(theme, options);
	document.head.appendChild(element);
};
