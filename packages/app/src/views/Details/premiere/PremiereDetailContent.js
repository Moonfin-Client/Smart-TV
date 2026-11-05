import {useCallback, useLayoutEffect, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import RatingsRow from '../../../components/RatingsRow';
import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import {SeerrDownloadBars} from '../../../components/seerr/SeerrStatusBadge';
import {useSettings} from '../../../context/SettingsContext';
import {isMdblistEnabled} from '../../../services/mdblistApi';
import {toRgbTriplet} from '../../../theme/themeSpec';
import {getLogoUrl} from '../../../utils/helpers';
import {KEYS} from '../../../utils/keys';
import {cleanOverview} from '../../../utils/overviewText';
import {rem, rootScale} from '../../../utils/rootScale';
import {scrimStyle} from '../../../utils/scrimImage';
import {CORE_ICON_PATHS} from '../../Settings/settingsCoreIcons';
import {hidesMediaDescription} from '../detailsMedia';
import {SpottableDiv} from '../detailsSpottables';
import DetailMetaRow from '../DetailMetaRow';
import ModernActionButtons from '../ModernActionButtons';
import ModernDetailContent from '../ModernDetailContent';
import useDetailPage, {focusAtTop, hasSpottable, scrollPage} from '../useDetailPage';
import {ACTIONS, NAVBAR, drawsStage, stageSubtitle} from '../stage/stageRules';
import {premiereDim, premiereNeighbour, premiereScrim} from './premiereRules';

import stageCss from '../stage/StageDetailContent.module.less';
import css from './PremiereDetailContent.module.less';

// The title centered over its backdrop, filling the first screen, with the buttons and ratings
// under it. Every other part of the page is a framed section further down, each its own stop for
// the D-pad, and an arrow at the foot of the backdrop hints at them. A title that's only in Seerr
// gets the same page with Request in place of play, its seasons as request cards and Seerr's own
// sections.

const SHOW_TYPES = ['Series', 'Season', 'Episode'];

// How far under the top of the screen a section settles once focus brings it up.
const SECTION_TOP = 40;

// A row runs on through its frame's padding to the frame's edge, where it's cut off.
const FRAME_PADDING = 30;

// The box the logo is fitted to, growing a small one as well as shrinking a large one.
const LOGO_BOX = {width: 868, height: 238};

// Core's episode card for the width a section leaves it, beside a sidebar or under a toolbar.
const EPISODE_CARD = {sidebar: 418, top: 431};

// Left on Auto, a TV would line up every button it has. Play, four circles and the ellipsis keep
// the row the width of the title.
const AUTO_BUTTONS = 6;

const SIDES = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

const PremiereScreen = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, effectiveServerUrl, backdropUrl, logoUrl, onLogoError, tagline,
		techBadges = [], techSize
	} = props;
	const {activeTheme} = useSettings();

	const scrollerRef = useRef(null);
	const stopsRef = useRef([]);
	const overviewRef = useRef(null);
	const navbarTop = settings.navbarPosition !== 'left';

	// Focus lands first and the page is put back where it was, so the browser's own scroll to the
	// focused card never runs ahead, and then the section is brought up near the top of the screen,
	// so the page reads down one section at a time. A section that drew nothing has no height and is
	// passed over.
	const focusStop = useCallback((id) => {
		const scroller = scrollerRef.current;
		const section = scroller?.querySelector(`[data-stage-stop="${id}"]`);
		if (!section || !section.offsetHeight) return false;
		const before = scroller.scrollTop;
		if (!Spotlight.focus(id)) return false;
		scroller.scrollTop = before;
		const top = before + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - SECTION_TOP * rootScale();
		const target = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
		if (Math.abs(target - before) >= 1) scrollPage(scroller, target);
		return true;
	}, []);

	// A press that finds nothing to focus keeps going the way it was headed.
	const go = useCallback((target, direction) => {
		let next = target;
		while (next) {
			if (next === NAVBAR) {
				focusAtTop(scrollerRef.current, 'navbar');
				return;
			}
			if (next === ACTIONS) {
				// Back to whichever button was focused last, since the row enters where it left off.
				focusAtTop(scrollerRef.current, 'details-action-buttons');
				return;
			}
			if (focusStop(next)) return;
			next = premiereNeighbour(stopsRef.current, next, direction, navbarTop);
		}
	}, [focusStop, navbarTop]);

	const move = useCallback((from, direction) => {
		go(premiereNeighbour(stopsRef.current, from, direction, navbarTop), direction);
	}, [go, navbarTop]);

	const handleNavigateUp = useCallback((from) => move(from, 'up'), [move]);
	const handleNavigateDown = useCallback((from) => move(from, 'down'), [move]);
	const handleActionsUp = useCallback(() => move(ACTIONS, 'up'), [move]);
	const handleActionsDown = useCallback(() => move(ACTIONS, 'down'), [move]);

	const page = useDetailPage(props, {onNavigateUp: handleNavigateUp, onNavigateDown: handleNavigateDown, bleedRight: FRAME_PADDING});

	// Up and down between the sections that don't take the press themselves. Left and right stay in
	// a section, except Left off the start of one beside a sidebar, and a section with nothing to
	// press keeps both.
	const handleKeyDown = useCallback((ev) => {
		const side = SIDES[ev.keyCode];
		if (!side) return;
		const active = document.activeElement;
		const stop = active?.closest?.('[data-stage-stop]');
		if (!stop || active.closest('[data-stage-trap]') || hasSpottable(stop, active, side)) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (side === 'up' || side === 'down') move(stop.dataset.stageStop, side);
		else if (side === 'left' && !navbarTop && stop !== active) Spotlight.focus('navbar');
	}, [move, navbarTop]);

	// The whole overview, unless it would push the title off the top, when it gives up the lines
	// there's no room for. Measured again whenever the page draws and once the logo has a size.
	const fitOverview = useCallback(() => {
		const el = overviewRef.current;
		if (!el) return;
		el.style.display = '';
		el.style.webkitLineClamp = '';
		const line = parseFloat(window.getComputedStyle(el).lineHeight);
		if (!(line > 0) || el.scrollHeight <= el.clientHeight + 1) return;
		const lines = Math.floor((el.clientHeight + 1) / line);
		if (lines < 1) el.style.display = 'none';
		else el.style.webkitLineClamp = String(lines);
	}, []);

	useLayoutEffect(fitOverview);

	const handleLogoLoad = useCallback((ev) => {
		const logo = ev.currentTarget;
		if (logo.naturalWidth && logo.naturalHeight) {
			const fit = Math.min(LOGO_BOX.width / logo.naturalWidth, LOGO_BOX.height / logo.naturalHeight);
			logo.style.width = rem(logo.naturalWidth * fit);
			logo.style.height = rem(logo.naturalHeight * fit);
		}
		fitOverview();
	}, [fitOverview]);

	const metaClasses = useMemo(() => ({...stageCss, metaRow: `${stageCss.metaRow} ${css.centered}`}), []);

	const base = toRgbTriplet(activeTheme.colors.background);
	const scrim = premiereScrim(base, premiereDim(settings.backdropBlurDetail));

	const isShow = SHOW_TYPES.indexOf(item.Type) >= 0;
	const partOfShow = item.Type === 'Season' || item.Type === 'Episode';
	const name = (partOfShow && item.SeriesName) || item.Name;
	const subtitle = stageSubtitle(item);
	const overview = Boolean(item.Overview) && !hidesMediaDescription(item, settings) ? cleanOverview(item.Overview) : '';
	const backdropShown = settings.detailsBackdropEnabled !== false && backdropUrl;

	// The sections in reading order, each with the title its frame carries. A row of cards carries
	// its own.
	const framed = (stop, title) => stop && {...stop, title};
	let showStop = null;
	if (seerrOnly) {
		showStop = isShow ? page.seerrSeasonsStop() : null;
	} else if (item.Type === 'Series' || item.Type === 'Season' || (item.Type === 'Episode' && showsSection('moreEpisodes'))) {
		showStop = framed(page.episodesStop({cardWidth: navbarTop ? EPISODE_CARD.top : EPISODE_CARD.sidebar}), $L('Episodes'));
	}
	const stops = [
		showStop,
		framed(page.tracksStop(), $L('Audio & Subtitles')),
		framed(page.factsStop({weighByText: true}), $L('Details')),
		...page.rowStops()
	].filter(Boolean);
	stopsRef.current = stops.map((stop) => stop.id);

	return (
		<div
			ref={scrollerRef}
			className={`${css.scroller} ${navbarTop ? '' : css.sidebarOffset}`}
			style={{backgroundColor: `rgb(${base})`}}
			onScroll={page.handleScroll}
			onKeyDown={handleKeyDown}
		>
			<div className={css.hero}>
				<div className={css.backdrop}>
					{backdropShown && <img className={css.backdropImage} src={backdropUrl} alt="" />}
					<div className={css.scrim} style={scrimStyle(scrim)} />
				</div>
				<div className={css.heroText}>
					{logoUrl
						? <img className={css.logo} src={getLogoUrl(effectiveServerUrl, item, {maxWidth: 800, quality: 90})} alt={name} onError={onLogoError} onLoad={handleLogoLoad} />
						: <h1 className={css.title}>{name}</h1>}
					{subtitle && <div className={css.subtitle}>{subtitle}</div>}
					<div className={css.meta}>
						<DetailMetaRow {...props} numbersEpisode={false} classes={metaClasses} trailing={techSize} genreSeparator={' • '} />
						{techBadges.length > 0 && (
							<div className={`${stageCss.techRow} ${css.centered}`}>
								{techBadges.map((badge, i) => <span key={i} className={stageCss.techChip}>{badge.label}</span>)}
							</div>
						)}
					</div>
					<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
					{tagline && <div className={css.tagline}>{tagline}</div>}
					{overview && <p ref={overviewRef} className={css.overview}>{overview}</p>}
					<div className={css.downloads}><SeerrDownloadBars seerr={seerr} /></div>
				</div>
				<div className={css.actions}>
					<ModernActionButtons
						{...props}
						played={item.UserData?.Played}
						isFavorite={item.UserData?.IsFavorite}
						centered
						omitTrackButtons
						maxVisibleButtons={AUTO_BUTTONS}
						overflowAsMenu
						menuBackRef={page.menuBackRef}
						onNavigateUp={handleActionsUp}
						onNavigateDown={handleActionsDown}
					/>
				</div>
				<div className={css.ratings}>
					<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />
				</div>
				{stops.length > 0 && (
					<svg className={css.arrow} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d={CORE_ICON_PATHS.keyboard_arrow_down} />
					</svg>
				)}
			</div>
			<div className={css.sections}>
				{stops.map((stop) => (stop.whole
					? (
						<SpottableDiv key={stop.id} className={`${css.section} ${css.whole}`} spotlightId={stop.id} data-stage-stop={stop.id} data-title={stop.title}>
							{stop.node}
						</SpottableDiv>
					)
					: (
						<div key={stop.id} className={css.section} data-stage-stop={stop.id}>
							{stop.title && <h2 className={css.sectionTitle}>{stop.title}</h2>}
							{stop.node}
						</div>
				)))}
			</div>
		</div>
	);
};

// Everything that isn't a film, a show or a video goes to Modern, decided before any of Premiere's
// own hooks run.
const PremiereDetailContent = (props) => (
	drawsStage(props.item.Type) ? <PremiereScreen {...props} /> : <ModernDetailContent {...props} />
);

export default PremiereDetailContent;
