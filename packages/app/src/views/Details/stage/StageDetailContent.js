import {useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';

import RatingsRow from '../../../components/RatingsRow';
import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import {SeerrDownloadBars} from '../../../components/seerr/SeerrStatusBadge';
import {isMdblistEnabled} from '../../../services/mdblistApi';
import {getLogoUrl} from '../../../utils/helpers';
import {KEYS} from '../../../utils/keys';
import {rootScale} from '../../../utils/rootScale';
import {serverBlurredUrl} from '../../../utils/serverBlur';
import {FavoriteHeartIcon, WatchedCheckIcon} from '../DetailBadges';
import {hidesMediaDescription} from '../detailsMedia';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {RowContainer} from '../detailsSpottables';
import DetailMetaRow from '../DetailMetaRow';
import ExpandableOverview from '../ExpandableOverview';
import ModernActionButtons from '../ModernActionButtons';
import ModernDetailContent from '../ModernDetailContent';
import {EPISODES_ID} from '../minimalist/MinimalistEpisodes';
import useDetailPage, {Icon, focusAtTop, hasSpottable, scrollPage} from '../useDetailPage';
import {
	ACTIONS, NAVBAR, STAGE_BUTTON_CAP, alignDelta, drawsStage, revealDelta, stageNeighbour, stagePoster, stageScrimAlpha,
	stageSubtitle
} from './stageRules';

import css from './StageDetailContent.module.less';

// The poster-led detail screen. The poster stands on the left with play and the other buttons under
// it, and the title, ratings, tracks and episodes sit beside it. Extras and the rows of other titles
// run full width underneath. A title that's only in Seerr gets the same page with Request in place
// of play, its seasons as request cards and Seerr's own rows underneath.

const SHOW_TYPES = ['Series', 'Season', 'Episode'];

// The room kept above and below the episodes when the page scrolls them into view.
const REVEAL_CLEARANCE = 48;

// The page's right margin. Rows run on through it to the screen's edge, as Core's do.
const PAGE_END = 80;

const OVERVIEW_ID = 'stage-overview';

const StageScreen = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, effectiveServerUrl, backdropUrl, logoUrl, onLogoError, tagline,
		techBadges = [], techSize, overviewBackRef
	} = props;

	const scrollerRef = useRef(null);
	const stopsRef = useRef({beside: [], below: []});
	const navbarTop = settings.navbarPosition !== 'left';

	// Focus lands first and the page is put back where it was, so the browser's own scroll to the
	// focused card never runs ahead. The episodes then scroll only as far as it takes to show the
	// whole section, and any other stop lines its focused card up the way Core does.
	const focusStop = useCallback((id) => {
		const scroller = scrollerRef.current;
		const before = scroller ? scroller.scrollTop : 0;
		if (!Spotlight.focus(id)) return false;
		const section = scroller?.querySelector(`[data-stage-stop="${id}"]`);
		if (!section) return true;
		scroller.scrollTop = before;
		const view = scroller.getBoundingClientRect();
		const clearance = REVEAL_CLEARANCE * rootScale();
		const delta = id === EPISODES_ID
			? revealDelta(section.getBoundingClientRect(), {viewTop: view.top + clearance, viewBottom: view.bottom - clearance})
			: alignDelta(document.activeElement.getBoundingClientRect(), {viewTop: view.top, viewBottom: view.bottom});
		if (delta) scrollPage(scroller, before + delta);
		return true;
	}, []);

	// A stop can name a section that drew nothing to focus, like a rail that came back empty, so a
	// press that finds nothing keeps going the way it was headed.
	const go = useCallback((target, direction) => {
		let next = target;
		while (next) {
			if (next === NAVBAR) {
				focusAtTop(scrollerRef.current, 'navbar');
				return;
			}
			if (next === ACTIONS) {
				// Play, or Request on a title that's only in Seerr.
				focusAtTop(scrollerRef.current, document.querySelector('[data-spotlight-id="details-action-buttons"] .spottable'));
				return;
			}
			if (focusStop(next)) return;
			next = stageNeighbour(stopsRef.current, next, direction, navbarTop);
		}
	}, [focusStop, navbarTop]);

	const move = useCallback((from, direction) => {
		go(stageNeighbour(stopsRef.current, from, direction, navbarTop), direction);
	}, [go, navbarTop]);

	const handleNavigateUp = useCallback((from) => move(from, 'up'), [move]);
	const handleNavigateDown = useCallback((from) => move(from, 'down'), [move]);
	const handleActionsUp = useCallback(() => {
		if (navbarTop) go(NAVBAR, 'up');
	}, [go, navbarTop]);
	const handleActionsDown = useCallback(() => move(ACTIONS, 'down'), [move]);
	const handleActionsRight = useCallback(() => move(ACTIONS, 'right'), [move]);
	const toActions = useCallback(() => go(ACTIONS, 'left'), [go]);

	const page = useDetailPage(props, {onNavigateUp: handleNavigateUp, onNavigateDown: handleNavigateDown, bleedRight: PAGE_END});

	// Up and down between the stops that don't take the press themselves. Beside the poster, Left
	// off the first thing in a row goes back to the buttons and Right off the last stays put, rather
	// than dropping into whatever section lies nearest.
	const handleKeyDown = useCallback((ev) => {
		const {keyCode} = ev;
		if (keyCode !== KEYS.UP && keyCode !== KEYS.DOWN && keyCode !== KEYS.LEFT && keyCode !== KEYS.RIGHT) return;
		const active = document.activeElement;
		const stop = active?.closest?.('[data-stage-stop]');
		if (!stop || active.closest('[data-stage-trap]')) return;
		const id = stop.dataset.stageStop;
		if (keyCode === KEYS.LEFT || keyCode === KEYS.RIGHT) {
			if (stopsRef.current.beside.indexOf(id) < 0) return;
			const row = active.parentElement?.closest('[data-spotlight-container]');
			const spottables = row ? row.querySelectorAll('.spottable') : [];
			if (spottables[keyCode === KEYS.LEFT ? 0 : spottables.length - 1] !== active) return;
			ev.preventDefault();
			ev.stopPropagation();
			if (keyCode === KEYS.LEFT) toActions();
			return;
		}
		const up = keyCode === KEYS.UP;
		if (hasSpottable(stop, active, up ? 'up' : 'down')) return;
		ev.preventDefault();
		ev.stopPropagation();
		move(id, up ? 'up' : 'down');
	}, [move, toActions]);

	const isShow = SHOW_TYPES.indexOf(item.Type) >= 0;
	const partOfShow = item.Type === 'Season' || item.Type === 'Episode';
	const poster = stagePoster(effectiveServerUrl, item, settings);
	const progress = item.UserData?.PlayedPercentage || 0;
	const subtitle = stageSubtitle(item);
	const showsOverview = Boolean(item.Overview) && !hidesMediaDescription(item, settings);

	// Beside the poster: the track pickers, the people and studios behind a film, and the seasons or
	// episodes of a show.
	let showStop = null;
	if (isShow && seerrOnly) showStop = page.seerrSeasonsStop(toActions);
	else if (item.Type === 'Series' || item.Type === 'Season') showStop = page.episodesStop({onLeftEdge: toActions});
	const beside = [page.tracksStop(), isShow ? null : page.factsStop(), showStop].filter(Boolean);

	// The full width rows under the poster: an episode's run of episodes, then the rows every page
	// shares.
	const below = [
		item.Type === 'Episode' && !seerrOnly && showsSection('moreEpisodes') ? page.episodesStop() : null,
		...page.rowStops()
	].filter(Boolean);

	// The overview leads the column. It only takes focus once its text runs long enough to open up.
	const besideIds = [...(showsOverview ? [OVERVIEW_ID] : []), ...beside.map((stop) => stop.id)];
	stopsRef.current = {beside: besideIds, below: below.map((stop) => stop.id)};

	const blur = Number(settings.backdropBlurDetail ?? 20);
	const backdropShown = settings.detailsBackdropEnabled !== false && backdropUrl;
	const blurredUrl = backdropShown ? serverBlurredUrl(backdropUrl, blur) : null;

	return (
		<>
			<div className={css.backdrop}>
				{backdropShown && (
					<img
						className={css.backdropImage}
						src={blurredUrl || backdropUrl}
						alt=""
						style={!blurredUrl && blur > 0 ? {filter: `blur(${blur}px)`} : undefined}
					/>
				)}
				<div className={css.scrim} style={{backgroundColor: `rgba(0, 0, 0, ${stageScrimAlpha(blur)})`}} />
			</div>
			<div ref={scrollerRef} className={css.scroller} onScroll={page.handleScroll} onKeyDown={handleKeyDown}>
				<div className={`${css.content} ${navbarTop ? '' : css.sidebarOffset}`}>
					<div className={css.top}>
						<div className={css.posterColumn}>
							<div className={`${css.poster} ${poster.wide ? css.posterWide : ''}`}>
								{poster.url
									? <img className={css.posterImage} src={poster.url} alt="" />
									: <Icon path={DETAIL_ICON_PATHS.series} className={css.posterPlaceholder} />}
								{item.UserData?.IsFavorite && (
									<div className={css.posterFavorite}><FavoriteHeartIcon /></div>
								)}
								{item.UserData?.Played && (
									<div className={css.posterWatched}><WatchedCheckIcon compact /></div>
								)}
								{progress > 0 && progress < 100 && (
									<div className={css.progressTrack}><div className={css.progressFill} style={{width: `${progress}%`}} /></div>
								)}
							</div>
							<div className={css.actions}>
								<ModernActionButtons
									{...props}
									played={item.UserData?.Played}
									isFavorite={item.UserData?.IsFavorite}
									stacked
									omitTrackButtons
									buttonCap={STAGE_BUTTON_CAP}
									overflowAsMenu
									menuBackRef={page.menuBackRef}
									onNavigateUp={handleActionsUp}
									onNavigateDown={handleActionsDown}
									onRightEdge={besideIds.length ? handleActionsRight : undefined}
								/>
							</div>
						</div>
						<div className={css.beside}>
							{logoUrl
								? <img className={css.logo} src={getLogoUrl(effectiveServerUrl, item, {maxWidth: 700, quality: 90})} alt={partOfShow ? item.SeriesName : item.Name} onError={onLogoError} />
								: <h1 className={css.title}>{(partOfShow && item.SeriesName) || item.Name}</h1>}
							{subtitle && <div className={css.subtitle}>{subtitle}</div>}
							<div className={css.meta}>
								<DetailMetaRow {...props} numbersEpisode={false} classes={css} trailing={techSize} genreSeparator={' \u2022 '} />
								{techBadges.length > 0 && (
									<div className={css.techRow}>
										{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
									</div>
								)}
							</div>
							<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
							<div className={css.ratings}>
								<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />
							</div>
							{tagline && <div className={css.tagline}>{tagline}</div>}
							{showsOverview && (
								<RowContainer className={css.overview} spotlightId={OVERVIEW_ID} data-stage-stop={OVERVIEW_ID}>
									<ExpandableOverview text={item.Overview} itemId={item.Id} variant="stage" backRef={overviewBackRef} />
								</RowContainer>
							)}
							<SeerrDownloadBars seerr={seerr} />
							{beside.map((stop) => (
								<div key={stop.id} className={css.besideStop} data-stage-stop={stop.id}>{stop.node}</div>
							))}
						</div>
					</div>
					{below.map((stop) => (
						<div key={stop.id} className={css.belowStop} data-stage-stop={stop.id}>
							{stop.whole ? <RowContainer spotlightId={stop.id}>{stop.node}</RowContainer> : stop.node}
						</div>
					))}
				</div>
			</div>
		</>
	);
};

// Everything that isn't a film, a show or a video goes to Modern, decided before any of Stage's own
// hooks run.
const StageDetailContent = (props) => (
	drawsStage(props.item.Type) ? <StageScreen {...props} /> : <ModernDetailContent {...props} />
);

export default StageDetailContent;
