import {useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import RatingsRow from '../../../components/RatingsRow';
import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import {SeerrDownloadBars, SeerrSeasonDot} from '../../../components/seerr/SeerrStatusBadge';
import {SeerrStreaming} from '../../../components/seerr/SeerrSections';
import {useSettings} from '../../../context/SettingsContext';
import {isMdblistEnabled} from '../../../services/mdblistApi';
import {toRgbTriplet} from '../../../theme/themeSpec';
import {KEYS} from '../../../utils/keys';
import {cleanOverview} from '../../../utils/overviewText';
import {rem} from '../../../utils/rootScale';
import {scrimStyle} from '../../../utils/scrimImage';
import {CORE_ICON_PATHS} from '../../Settings/settingsCoreIcons';
import {hidesMediaDescription} from '../detailsMedia';
import {RowContainer, SpottableDiv} from '../detailsSpottables';
import DetailMetaRow from '../DetailMetaRow';
import ModernActionButtons from '../ModernActionButtons';
import useDetailPage, {focusAtTop, scrollPage} from '../useDetailPage';
import {ACTIONS, drawsStage, resumeLine, stageSubtitle} from '../stage/stageRules';
import {
	QUICK_LOOK_BUTTON_CAP, QUICK_LOOK_ID, SEASON_GAP, quickLookFacts, quickLookFade, quickLookNeighbour, quickLookSurface,
	seasonCardShare
} from './quickLookRules';

import stageCss from '../stage/StageDetailContent.module.less';
import css from './QuickLookDetailContent.module.less';

// A title in a drawer down the right of the screen it was picked on, rather than a page of its own:
// the backdrop, the name and its numbers, the buttons, the overview, the tracks, and the seasons or
// the people behind it, with the full page a press away. A title that's only in Seerr gets Request
// in place of play, and its seasons each open the request dialog.

const SEASONS_ID = 'quick-look-seasons';
const OPEN_ID = 'quick-look-open';
const ACTION_ROW = '[data-spotlight-id="details-action-buttons"]';

const SIDES = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

const noop = () => {};

const useSurface = () => {
	const {activeTheme} = useSettings();
	return quickLookSurface(toRgbTriplet(activeTheme.colors.background), toRgbTriplet(activeTheme.colors.onBackground));
};

// A press at the edge of the drawer stays in it.
const DrawerContainer = SpotlightContainerDecorator({enterTo: 'last-focused', leaveFor: {left: '', right: '', up: '', down: ''}}, 'div');

// The drawer over a dimmed view of the screen underneath, which a pointer can close by picking it.
export const QuickLookFrame = ({onClose, children}) => {
	const surface = useSurface();
	return (
		<div className={css.frame}>
			<div className={css.dim} onClick={onClose} />
			<DrawerContainer className={css.drawer} spotlightId={QUICK_LOOK_ID} style={{backgroundColor: `rgb(${surface})`}}>
				{children}
			</DrawerContainer>
		</div>
	);
};

const QuickLookScreen = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, effectiveServerUrl, backdropUrl, techBadges = [], techSize,
		seasons = [], nextUp = [], onOpenFullPage, onOpenSeason
	} = props;

	const scrollerRef = useRef(null);
	const stopsRef = useRef([]);
	const surface = useSurface();

	const page = useDetailPage(props, {onNavigateUp: noop, onNavigateDown: noop, bleedRight: 0});

	const go = useCallback((target) => {
		const scroller = scrollerRef.current;
		if (target === ACTIONS) {
			// Back to whichever button was focused last.
			focusAtTop(scroller, 'details-action-buttons');
			return;
		}
		if (!target || !Spotlight.focus(target)) return;
		// The button sits under the scrolling part, so reaching it brings the rest of the drawer into
		// view, the facts and the streaming services included.
		if (target === OPEN_ID && scroller) scrollPage(scroller, scroller.scrollHeight);
	}, []);

	// Up and Down move between the rows, and Left and Right walk along one and stop at its ends. Run
	// before the rows' own handlers, so the buttons never hand Left off to a sidebar.
	const handleKeyDown = useCallback((ev) => {
		const side = SIDES[ev.keyCode];
		if (!side) return;
		const active = document.activeElement;
		const actions = active?.closest?.(ACTION_ROW);
		const row = actions || active?.closest?.('[data-quick-look-stop]');
		if (!row) return;
		if (side === 'left' || side === 'right') {
			const spottables = row.querySelectorAll('.spottable');
			if (spottables[side === 'left' ? 0 : spottables.length - 1] !== active) return;
		} else {
			go(quickLookNeighbour(stopsRef.current, actions ? ACTIONS : row.dataset.quickLookStop, side));
		}
		ev.preventDefault();
		ev.stopPropagation();
	}, [go]);

	const seasonMarkers = settings.showSeerrAvailabilityBadges !== false ? seerr.seasonMarkers : null;
	const {handleRequestSeason} = seerr;
	const handleSeason = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		if (seerrOnly) {
			handleRequestSeason?.(Number(key));
			return;
		}
		const season = seasons.find((candidate) => candidate.Id === key);
		if (season) onOpenSeason?.(season);
	}, [seerrOnly, handleRequestSeason, seasons, onOpenSeason]);

	// A show's seasons as cards, each with how much of it was watched. A season opens its full page,
	// and one that's only in Seerr opens the request dialog on it.
	const seasonsRow = () => {
		const list = seerrOnly
			? (seerr.details?.seasons || []).filter((season) => season.seasonNumber > 0).map((season) => ({
				key: String(season.seasonNumber),
				name: season.name || $L('Season {number}').replace('{number}', season.seasonNumber),
				number: season.seasonNumber
			}))
			: seasons.map((season) => {
				const total = season.ChildCount || 0;
				return {
					key: season.Id,
					name: season.Name,
					total,
					played: total - (season.UserData?.UnplayedItemCount ?? total)
				};
			});
		if (!list.length) return null;
		const {parts, gaps} = seasonCardShare(list.length);
		const width = `calc((100% - ${rem(SEASON_GAP * gaps)}) / ${parts})`;
		return (
			<RowContainer className={css.seasons} spotlightId={SEASONS_ID}>
				{list.map((season) => (
					<SpottableDiv key={season.key} className={css.season} style={{width}} data-select-key={season.key} onClick={handleSeason}>
						<div className={css.seasonHead}>
							<span className={css.seasonName}>{season.name}</span>
							{season.total > 0 && (
								<span className={css.seasonCount}>
									{$L('{played} of {total}').replace('{played}', season.played).replace('{total}', season.total)}
								</span>
							)}
							{seerrOnly && <span className={css.dotSlot}><SeerrSeasonDot status={seasonMarkers?.get(season.number)} /></span>}
						</div>
						{season.total > 0 && (
							<div className={css.seasonTrack}><div className={css.seasonFill} style={{width: `${(season.played / season.total) * 100}%`}} /></div>
						)}
					</SpottableDiv>
				))}
			</RowContainer>
		);
	};

	const partOfShow = item.Type === 'Season' || item.Type === 'Episode';
	const subtitle = stageSubtitle(item);
	const overview = Boolean(item.Overview) && !hidesMediaDescription(item, settings) ? cleanOverview(item.Overview) : '';
	const showImage = settings.detailsBackdropEnabled !== false && Boolean(backdropUrl);
	const progress = resumeLine(item, nextUp);
	const facts = item.Type === 'Series' ? [] : quickLookFacts(item, showsSection);

	const tracks = page.tracksStop({shareRow: true});
	const seasonCards = item.Type === 'Series' ? seasonsRow() : null;
	stopsRef.current = [tracks && tracks.id, seasonCards && SEASONS_ID, OPEN_ID].filter(Boolean);

	return (
		<div className={css.content} onKeyDownCapture={handleKeyDown}>
			<div ref={scrollerRef} className={css.scroller}>
				<div className={css.header}>
					{showImage && (
						<div className={css.backdrop}>
							<img className={css.backdropImage} src={backdropUrl} alt="" />
							<div
								className={css.fade}
								style={scrimStyle(quickLookFade(surface)) || {backgroundImage: `linear-gradient(to bottom, rgba(${surface}, 0) 40%, rgb(${surface}))`}}
							/>
						</div>
					)}
					<div className={`${css.info} ${showImage ? '' : css.infoBare}`}>
						<h1 className={css.title}>{(partOfShow && item.SeriesName) || item.Name}</h1>
						{subtitle && <div className={css.subtitle}>{subtitle}</div>}
						<div className={css.meta}>
							<DetailMetaRow {...props} numbersEpisode={false} classes={stageCss} trailing={techSize} genreSeparator={' • '} />
							{techBadges.length > 0 && (
								<div className={stageCss.techRow}>
									{techBadges.map((badge, i) => <span key={i} className={stageCss.techChip}>{badge.label}</span>)}
								</div>
							)}
						</div>
						<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
					</div>
					<div className={css.closeHint}>{$L('Back to close')}</div>
				</div>
				<div className={css.rest}>
					<div className={css.ratings}>
						<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} labels={false} />
					</div>
					<div className={css.actions}>
						<ModernActionButtons
							{...props}
							played={item.UserData?.Played}
							isFavorite={item.UserData?.IsFavorite}
							centered
							startAligned
							omitTrackButtons
							buttonCap={QUICK_LOOK_BUTTON_CAP}
							overflowAsMenu
							menuBackRef={page.menuBackRef}
						/>
					</div>
					<div className={css.downloads}><SeerrDownloadBars seerr={seerr} /></div>
					{progress && (
						<div className={css.progress}>
							<div className={css.progressTrack}><div className={css.progressFill} style={{width: `${progress.percent}%`}} /></div>
							<span className={css.progressLabel}>{progress.label}</span>
						</div>
					)}
					{overview && <p className={css.overview}>{overview}</p>}
					{tracks && <div className={css.section} data-quick-look-stop={tracks.id}>{tracks.node}</div>}
					{seasonCards && <div className={css.section} data-quick-look-stop={SEASONS_ID}>{seasonCards}</div>}
					{facts.length > 0 && (
						<div className={`${css.section} ${css.facts}`}>
							{facts.map((fact) => (
								<div key={fact.label} className={css.fact}>
									<div className={css.factLabel}>{fact.label}</div>
									<div className={css.factValue}>{fact.value}</div>
								</div>
							))}
						</div>
					)}
					{seerr.pieces?.streaming && (
						<div className={css.section}><SeerrStreaming providers={seerr.streamingProviders} /></div>
					)}
				</div>
			</div>
			<div className={css.foot} data-quick-look-stop={OPEN_ID}>
				<SpottableDiv className={css.open} spotlightId={OPEN_ID} onClick={onOpenFullPage}>
					{$L('Open full page')}
					<svg className={css.openIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d={CORE_ICON_PATHS.chevron_right} />
					</svg>
				</SpottableDiv>
			</div>
		</div>
	);
};

// Quick Look draws what Stage does. Details swaps the drawer for the full page for anything else,
// so nothing is drawn meanwhile.
const QuickLookDetailContent = (props) => (drawsStage(props.item.Type) ? <QuickLookScreen {...props} /> : null);

export default QuickLookDetailContent;
