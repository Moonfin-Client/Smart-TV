import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {portal, useDialogLayer} from '../../../components/CoreDialog/CoreDialog';
import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import SeerrIcon from '../../../components/icons/SeerrIcon';
import PagedText from '../../../components/PagedText';
import PosterLabels from '../../../components/PosterLabels';
import RatingsRow from '../../../components/RatingsRow';
import {SeerrSeasonDot} from '../../../components/seerr/SeerrStatusBadge';
import SeerrStatusBanner, {seerrBadgeStyle, seerrTitleStatus} from '../../../components/seerr/SeerrStatusBanner';
import {useSettings} from '../../../context/SettingsContext';
import {isMdblistEnabled} from '../../../services/mdblistApi';
import seerrApi from '../../../services/seerrApi';
import {toRgbTriplet} from '../../../theme/themeSpec';
import {animateScrollTop} from '../../../utils/focusScroll';
import {formatDuration, getImageUrl} from '../../../utils/helpers';
import {KEYS} from '../../../utils/keys';
import {cleanOverview} from '../../../utils/overviewText';
import {rootScale} from '../../../utils/rootScale';
import {scrimStyle} from '../../../utils/scrimImage';
import {serverBlurredUrl} from '../../../utils/serverBlur';
import {downloadLabelParts} from '../../../utils/seerrStatus';
import {ModalContainer} from '../../../utils/spotlightContainers';
import {CORE_ICON_PATHS} from '../../Settings/settingsCoreIcons';
import {castPhotoUrl, hidesMediaDescription} from '../detailsMedia';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {SpottableDiv} from '../detailsSpottables';
import DetailMetaRow from '../DetailMetaRow';
import ModernActionButtons from '../ModernActionButtons';
import ModernDetailContent from '../ModernDetailContent';
import {groupEpisodesBySeason, seasonLabel} from '../nouveau/nouveauSeasons';
import {spotlightItemImageUrl} from '../spotlight/spotlightImages';
import {Icon} from '../useDetailPage';
import {ACTIONS, NAVBAR, drawsStage, resumeLine, stageTrackChoices} from '../stage/stageRules';
import {
	FROST_BUTTON_CAP, FROST_COLUMNS, frostCredits, frostInfo, frostNeighbour, frostScrims, frostSeason, frostSeerrGroups,
	frostSeerrStatus, frostSegments, frostStageStyle, frostStatusColors, frostTabs
} from './frostRules';

import css from './FrostDetailContent.module.less';

// The title floats in a glass window over a blurred, dimmed copy of its own art. The buttons sit in a
// toolbar over the window's foot, with the title's parts in a bar of tabs under it. A title that's
// only in Seerr gets Request in place of play, its seasons each with where they stand, and Seerr's
// related titles.

const TABS = {
	overview: {label: () => $L('Overview'), icon: 'smart_display_outlined'},
	episodes: {label: () => $L('Episodes'), icon: 'format_list_bulleted'},
	seasons: {label: () => $L('Seasons'), icon: 'layers_outlined'},
	cast: {label: () => $L('Cast & Crew'), icon: 'people_outline'},
	extras: {label: () => $L('Extras'), icon: 'video_library_outlined'},
	related: {label: () => $L('More Like This'), icon: 'grid_view'},
	details: {label: () => $L('Details'), icon: 'info_outline'}
};

const SEGMENT_LABELS = {
	recommendations: () => $L('Recommendations'),
	similar: () => $L('Similar'),
	about: () => $L('About')
};

const TRACK_LOOKS = {
	audio: {label: () => $L('Audio'), icon: DETAIL_ICON_PATHS.audio},
	subtitles: {label: () => $L('Subtitles'), icon: DETAIL_ICON_PATHS.subtitle},
	version: {label: () => $L('Version'), icon: DETAIL_ICON_PATHS.version}
};

const SIDES = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

// Server blur for the art behind everything, strong enough that it reads as light rather than a
// picture. The same amount goes through CSS where the art isn't the server's own.
const ENVIRONMENT_BLUR = 60;

// The room kept clear at each end of the stage when the bar of tabs has to shrink to fit.
const TAB_BAR_MARGIN = 36;

const READ_MORE_ID = 'frost-read-more';
const ACTION_ROW = '[data-spotlight-id="details-action-buttons"]';

const NONE = [];

const pickFrom = (list, ev) => list[Number(ev.currentTarget.dataset.index)];

const CoreIcon = ({name, className}) => (
	<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d={CORE_ICON_PATHS[name]} />
	</svg>
);

// The whole overview under the title and its facts, in a dialog that OK or BACK closes.
const ReadMore = ({open, title, meta, text, onClose}) => {
	const handleScrimClick = useDialogLayer({open, onClose, spotlightId: READ_MORE_ID});
	if (!open) return null;
	return portal(
		<div className={css.readMoreScrim} onClick={handleScrimClick}>
			<ModalContainer spotlightId={READ_MORE_ID} className={css.readMore}>
				<h2 className={css.readMoreTitle}>{title}</h2>
				{meta && <div className={css.readMoreMeta}>{meta}</div>}
				<PagedText className={css.readMoreText} onClick={onClose}>{text}</PagedText>
			</ModalContainer>
		</div>
	);
};

const FrostScreen = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, effectiveServerUrl, backdropUrl, techBadges = NONE, techSize,
		episodes = NONE, seriesEpisodes = NONE, similar = NONE, extras = NONE, cast = NONE, nextUp = NONE, mediaSource,
		onSelectItem, onSelectPerson, onSelectSeerrCard, handleOpenAudioModal, handleOpenSubtitleModal,
		handleOpenVersionModal, spotlightBackRef
	} = props;

	const [tab, setTab] = useState('overview');
	const [pickedSeason, setPickedSeason] = useState(null);
	const [pickedSegment, setPickedSegment] = useState(null);
	const [readMoreOpen, setReadMoreOpen] = useState(false);

	const rootRef = useRef(null);
	const menuBackRef = useRef(null);
	const tabBarRef = useRef(null);
	// Where focus was in each tab, so coming back lands there again.
	const memoryRef = useRef({});
	// What a key press needs to know, kept current for handlers that outlive a draw.
	const ctxRef = useRef(null);

	const {activeTheme} = useSettings();
	const statusColors = frostStatusColors(activeTheme);
	const scrims = frostScrims(toRgbTriplet(activeTheme.colors.background));

	const navbarTop = settings.navbarPosition !== 'left';
	const pieces = seerr.pieces || {};
	const seerrStyle = seerrBadgeStyle(settings);

	const overview = Boolean(item.Overview) && !hidesMediaDescription(item, settings) ? cleanOverview(item.Overview) : '';
	const tracks = stageTrackChoices(props);
	const credits = frostCredits(item, {cast, showsSection});
	const resume = resumeLine(item, nextUp);

	const allEpisodes = item.Type === 'Season' ? episodes : seriesEpisodes;
	const seasonGroups = useMemo(() => groupEpisodesBySeason(allEpisodes), [allEpisodes]);
	const seasonNumbers = [...seasonGroups.keys()];
	const shownSeason = frostSeason(seasonNumbers, pickedSeason, item.Type === 'Episode' ? item.ParentIndexNumber : null, nextUp[0]?.ParentIndexNumber);
	const seasonEpisodes = seasonGroups.get(shownSeason) || NONE;
	const wantedEpisode = item.Type === 'Episode' ? item.Id : nextUp[0]?.Id;
	const startEpisode = Math.max(0, seasonEpisodes.findIndex((episode) => episode.Id === wantedEpisode));

	const seerrSeasons = useMemo(
		() => (seerrOnly ? (seerr.details?.seasons || []).filter((season) => season.seasonNumber > 0) : []),
		[seerrOnly, seerr.details]
	);

	// A title only in Seerr splits its related titles into Seerr's two lists, and a library title gets
	// those and the rest of what Seerr knows under a tab of their own.
	const seerrSegments = frostSegments(pieces, {about: !seerrOnly});
	const tabs = frostTabs(item, {
		seerrOnly, showsSection, seasons: seerrSeasons.length, cast: cast.length, extras: extras.length,
		related: seerrOnly ? seerrSegments.length : similar.length, seerr: seerrSegments.length
	});
	const shownTab = tabs.indexOf(tab) >= 0 ? tab : 'overview';
	const segments = shownTab === 'seerr' || (seerrOnly && shownTab === 'related') ? seerrSegments : [];
	const shownSegment = segments.indexOf(pickedSegment) >= 0 ? pickedSegment : segments[0];

	const {recommendationCards, similarCards} = seerr;
	const posters = useMemo(() => {
		if (shownTab === 'related' && !seerrOnly) return similar;
		if (shownSegment === 'recommendations') return recommendationCards || NONE;
		if (shownSegment === 'similar') return similarCards || NONE;
		return NONE;
	}, [shownTab, seerrOnly, similar, shownSegment, recommendationCards, similarCards]);

	let pills = [];
	let shownPill = 0;
	if (shownTab === 'episodes' && seasonNumbers.length > 1) {
		pills = seasonNumbers.map((number) => seasonLabel(number));
		shownPill = seasonNumbers.indexOf(shownSeason);
	} else if (segments.length) {
		pills = segments.map((segment) => SEGMENT_LABELS[segment]());
		shownPill = segments.indexOf(shownSegment);
	}

	let start = `${shownTab}:0`;
	if (shownTab === 'episodes') start = `episodes:${startEpisode}`;
	else if (shownSegment === 'about') start = `${shownTab}:about`;

	ctxRef.current = {
		tab: shownTab, tabs, navbarTop, hasText: Boolean(overview), tracks: tracks.length, pills: pills.length, shownPill, start,
		counts: {episodes: seasonEpisodes.length, seasons: seerrSeasons.length, cast: cast.length, extras: extras.length, related: posters.length, seerr: posters.length}
	};

	// Focus lands first and its list is put back where it was, so the browser's own jump to it never
	// runs ahead. The list then brings it two tenths of the way down.
	const focusKey = useCallback((key) => {
		const node = rootRef.current?.querySelector(`[data-frost-key="${key}"]`);
		if (!node) return false;
		const scroller = node.closest('[data-frost-scroll]');
		const before = scroller ? scroller.scrollTop : 0;
		if (!Spotlight.focus(node)) return false;
		if (!scroller) return true;
		scroller.scrollTop = before;
		const room = scroller.clientHeight - node.offsetHeight;
		const target = Math.max(0, Math.min(node.offsetTop - room * 0.2, scroller.scrollHeight - scroller.clientHeight));
		if (document.documentElement.classList.contains('perf-high')) animateScrollTop(scroller, target, 220);
		else scroller.scrollTop = target;
		return true;
	}, []);

	const toActions = useCallback(() => Spotlight.focus('details-action-buttons'), []);

	const toTabBar = useCallback(() => focusKey(`tab:${ctxRef.current.tab}`), [focusKey]);

	// OK on a tab, or Up off the toolbar: where focus was in that tab, or where it starts.
	const enterContent = useCallback(() => {
		const ctx = ctxRef.current;
		const remembered = memoryRef.current[ctx.tab];
		if (remembered && focusKey(remembered)) return;
		let first = ctx.start;
		if (ctx.tab === 'overview') first = ctx.hasText ? 'overview:text' : 'overview:track:0';
		if (!focusKey(first)) focusKey(`tab:${ctx.tab}`);
	}, [focusKey]);

	const handleKeyDown = useCallback((ev) => {
		const side = SIDES[ev.keyCode];
		const key = side && document.activeElement?.dataset?.frostKey;
		if (!key) return;
		ev.preventDefault();
		ev.stopPropagation();
		const ctx = ctxRef.current;
		const target = frostNeighbour(key, side, {...ctx, count: ctx.counts[key.split(':')[0]] || 0});
		if (target === ACTIONS) toActions();
		else if (target === NAVBAR) Spotlight.focus('navbar');
		else if (target) focusKey(target);
	}, [toActions, focusKey]);

	// Focusing a tab opens it, and a spot in a tab's content, though not a pill, is remembered for
	// coming back to.
	const handleFocus = useCallback((ev) => {
		const key = ev.target.dataset?.frostKey || '';
		if (key.indexOf('tab:') === 0) setTab(key.slice(4));
		else if (key && key.indexOf(':pill:') < 0) memoryRef.current[key.split(':')[0]] = key;
	}, []);

	// The bar of tabs shrinks to fit across the stage when a title has more tabs, or longer names,
	// than it has room for.
	useLayoutEffect(() => {
		const pane = tabBarRef.current;
		if (!pane) return;
		pane.style.transform = '';
		const room = pane.parentElement.clientWidth - TAB_BAR_MARGIN * rootScale() * 2;
		if (pane.offsetWidth > room) pane.style.transform = `scale(${room / pane.offsetWidth})`;
	});

	// BACK from anywhere but Play on Overview goes there first, and from there it leaves the page.
	// The overflow menu and the overview dialog close first, and a picker the page opened answers for
	// itself, since focus has left the page for it.
	useEffect(() => {
		if (!spotlightBackRef) return undefined;
		const handler = () => {
			if (menuBackRef.current?.()) return true;
			if (readMoreOpen) {
				setReadMoreOpen(false);
				return true;
			}
			const root = rootRef.current;
			const active = document.activeElement;
			if (!root || !root.contains(active)) return false;
			const play = root.querySelector(`${ACTION_ROW} .spottable`);
			if (!play || (ctxRef.current.tab === 'overview' && active === play)) return false;
			setTab('overview');
			Spotlight.focus(play);
			return true;
		};
		spotlightBackRef.current = handler;
		return () => {
			if (spotlightBackRef.current === handler) spotlightBackRef.current = null;
		};
	}, [spotlightBackRef, readMoreOpen]);

	const openReadMore = useCallback(() => setReadMoreOpen(true), []);
	const closeReadMore = useCallback(() => setReadMoreOpen(false), []);
	const trackOpeners = {audio: handleOpenAudioModal, subtitles: handleOpenSubtitleModal, version: handleOpenVersionModal};

	// Picking a season or a segment starts that tab afresh.
	const handlePill = useCallback((ev) => {
		const pick = ev.currentTarget.dataset;
		if (pick.season != null) setPickedSeason(Number(pick.season));
		else setPickedSegment(pick.segment);
		delete memoryRef.current[ctxRef.current.tab];
	}, []);

	const handleEpisode = useCallback((ev) => {
		const episode = pickFrom(seasonEpisodes, ev);
		if (episode) onSelectItem?.(episode);
	}, [seasonEpisodes, onSelectItem]);
	const {handleRequestSeason} = seerr;
	const handleSeerrSeason = useCallback((ev) => {
		const season = pickFrom(seerrSeasons, ev);
		if (season) handleRequestSeason?.(season.seasonNumber);
	}, [seerrSeasons, handleRequestSeason]);
	const handlePerson = useCallback((ev) => {
		const person = pickFrom(cast, ev);
		if (person) onSelectPerson?.(person);
	}, [cast, onSelectPerson]);
	const handleExtra = useCallback((ev) => {
		const extra = pickFrom(extras, ev);
		if (extra) onSelectItem?.(extra);
	}, [extras, onSelectItem]);
	const handlePoster = useCallback((ev) => {
		const entry = pickFrom(posters, ev);
		if (!entry) return;
		if (entry._seerr) onSelectSeerrCard?.(entry);
		else onSelectItem?.(entry);
	}, [posters, onSelectSeerrCard, onSelectItem]);

	const grid = (name, list, renderTile) => {
		const columns = FROST_COLUMNS[name];
		const rows = [];
		for (let first = 0; first < list.length; first += columns) rows.push(first);
		return rows.map((first) => (
			<div key={first} className={css.gridRow}>
				{list.slice(first, first + columns).map((entry, offset) => renderTile(entry, first + offset))}
			</div>
		));
	};

	const thumb = (url, className, children) => (
		<div className={className}>
			{url && <img className={css.thumbImage} src={url} alt="" />}
			{children}
		</div>
	);

	const bar = (percent, className, color) => (
		<div className={className}><div className={css.barFill} style={{width: `${percent}%`, backgroundColor: color}} /></div>
	);

	const statusLine = () => {
		if (!seerrOnly) {
			if (!resume) return null;
			return (
				<div className={css.status}>
					{bar(resume.percent, css.statusTrack)}
					<span className={css.statusLabel}>{resume.label}</span>
				</div>
			);
		}
		if (!seerr.isActive) return null;
		const download = seerr.hdDownload;
		const status = frostSeerrStatus(seerr.hdStatus, statusColors);
		const color = download ? statusColors.requested : status.color;
		let label = status.label;
		if (download) {
			const {leading, percent} = downloadLabelParts(download, true);
			label = download.isImporting ? leading : [$L('Downloading'), percent, leading].filter(Boolean).join(' · ');
		}
		return (
			<div className={css.status}>
				<span className={css.statusDot} style={{backgroundColor: color}} />
				{download && bar(download.fraction * 100, css.statusTrack, color)}
				<span className={css.statusLabel}>{label}</span>
			</div>
		);
	};

	// For a title only in Seerr, where it streams sits where the track pickers would.
	const watchCard = () => {
		const providers = seerr.streamingProviders || [];
		if (!seerrOnly || !pieces.streaming || !providers.length) return null;
		const [first, ...rest] = providers;
		const logo = seerrApi.getImageUrl(first.logoPath, 'w92');
		return (
			<div className={css.side}>
				<div className={css.watchHeading}>{$L('Streaming on')}</div>
				<div className={css.watchCard}>
					{logo ? <img className={css.watchLogo} src={logo} alt="" /> : <span className={css.watchLogo} />}
					<span className={css.watchText}>
						<span className={css.watchName}>{first.name}</span>
						{rest.length > 0 && <span className={css.watchOthers}>{rest.map((provider) => provider.name).join(', ')}</span>}
					</span>
				</div>
			</div>
		);
	};

	const renderOverview = () => (
		<div className={css.overview}>
			<h1 className={css.title}>{item.Name}</h1>
			<div className={css.metaLine}>
				<DetailMetaRow {...props} classes={css} trailing={techSize} />
				{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
			</div>
			<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
			{statusLine()}
			<div className={css.strip}>
				<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} columns />
			</div>
			<div className={css.lower}>
				<div className={css.lowerText}>
					{overview && (
						<SpottableDiv className={css.text} data-frost-key="overview:text" onClick={openReadMore}>
							<p className={css.textBody}>{overview}</p>
						</SpottableDiv>
					)}
					{credits.length > 0 && (
						<div className={css.credits}>
							{credits.map((credit) => (
								<span key={credit.label} className={css.credit}>
									<span className={css.creditLabel}>{credit.label}</span>
									{credit.names}
								</span>
							))}
						</div>
					)}
				</div>
				{tracks.length > 0 && (
					<div className={css.side}>
						{tracks.map((choice, i) => (
							<SpottableDiv key={choice.id} className={css.track} data-frost-key={`overview:track:${i}`} onClick={trackOpeners[choice.id]}>
								<Icon path={TRACK_LOOKS[choice.id].icon} className={css.trackIcon} />
								<span className={css.trackName}>{TRACK_LOOKS[choice.id].label()}</span>
								<span className={css.trackValue}>{choice.current}</span>
								<CoreIcon name="unfold_more" className={css.trackChevron} />
							</SpottableDiv>
						))}
					</div>
				)}
				{watchCard()}
			</div>
		</div>
	);

	const renderPills = () => pills.length > 0 && (
		<div className={css.pills}>
			<div className={css.pillRow}>
				{pills.map((label, i) => (
					<SpottableDiv
						key={label}
						className={`${css.pill} ${i === shownPill ? css.pillSelected : ''}`}
						data-frost-key={`${shownTab}:pill:${i}`}
						data-season={shownTab === 'episodes' ? seasonNumbers[i] : undefined}
						data-segment={shownTab === 'episodes' ? undefined : segments[i]}
						onClick={handlePill}
					>
						{label}
					</SpottableDiv>
				))}
			</div>
		</div>
	);

	const renderEpisodes = () => (
		<div className={`${css.scroll} ${css.listArea}`} data-frost-scroll>
			<div className={css.scrollBody}>
				{seasonEpisodes.map((episode, i) => {
					const tag = episode.ImageTags?.Primary;
					const runtime = episode.RunTimeTicks;
					const progress = resumeLine(episode);
					return (
						<SpottableDiv key={episode.Id} className={css.row} data-frost-key={`episodes:${i}`} data-index={i} onClick={handleEpisode}>
							{thumb(
								tag ? getImageUrl(effectiveServerUrl, episode.Id, 'Primary', {maxWidth: 400, quality: 90, tag}) : null,
								css.still,
								// Held further in, clear of the still's large rounded corners.
								<PosterLabels item={episode} serverUrl={effectiveServerUrl} scale={0.8} inset={14} top={14} topRight={14} bottom={14} />
							)}
							<div className={css.rowText}>
								{episode.IndexNumber != null && (
									<div className={css.caps}>{$L('Episode {number}').replace('{number}', episode.IndexNumber)}</div>
								)}
								<div className={css.rowName}>{episode.Name}</div>
								{episode.Overview && <div className={css.rowOverview}>{episode.Overview}</div>}
							</div>
							<div className={css.rowSide}>
								<div className={css.rowRuntime}>
									{episode.UserData?.Played && <CoreIcon name="check_circle" className={css.playedIcon} />}
									{runtime ? formatDuration(runtime) : null}
								</div>
								{progress && bar(progress.percent, css.rowBar)}
								{progress && <div className={css.rowLeft}>{progress.label}</div>}
							</div>
						</SpottableDiv>
					);
				})}
			</div>
		</div>
	);

	// A show only in Seerr: each season with its poster and where it stands, opening the request dialog.
	const renderSeasons = () => (
		<div className={`${css.scroll} ${css.listArea}`} data-frost-scroll>
			<div className={css.scrollBody}>
				{seerrSeasons.map((season, i) => {
					const number = $L('Season {number}').replace('{number}', season.seasonNumber);
					const year = season.airDate ? String(season.airDate).slice(0, 4) : '';
					const status = frostSeerrStatus(seerr.seasonMarkers?.get(season.seasonNumber), statusColors);
					return (
						<SpottableDiv key={season.seasonNumber} className={`${css.row} ${css.seasonRow}`} data-frost-key={`seasons:${i}`} data-index={i} onClick={handleSeerrSeason}>
							{thumb(seerrApi.getImageUrl(season.posterPath, 'w342'), css.seasonPoster)}
							<div className={css.rowText}>
								<div className={css.caps}>{[number, year].filter(Boolean).join(' · ')}</div>
								<div className={css.seasonName}>{season.name || number}</div>
								{season.episodeCount > 0 && (
									<div className={css.rowOverview}>{$L('{count} episodes').replace('{count}', season.episodeCount)}</div>
								)}
							</div>
							<span className={css.statusPill}>
								<span className={css.statusDot} style={{backgroundColor: status.color}} />
								{status.label}
							</span>
						</SpottableDiv>
					);
				})}
			</div>
		</div>
	);

	const renderCast = () => (
		<div className={`${css.scroll} ${css.castArea}`} data-frost-scroll>
			<div className={`${css.scrollBody} ${css.castGrid}`}>
				{grid('cast', cast, (person, i) => {
					const photo = castPhotoUrl(person, effectiveServerUrl, 240);
					const role = person.Role ? String(person.Role).split('\n').filter(Boolean).join(', ') : '';
					return (
						<SpottableDiv key={i} className={css.castTile} data-frost-key={`cast:${i}`} data-index={i} onClick={handlePerson}>
							<div className={css.avatar}>
								{photo
									? <img className={css.avatarImage} src={photo} alt="" />
									: <CoreIcon name="person" className={css.avatarIcon} />}
							</div>
							<div className={css.castName}>{person.Name}</div>
							{role && <div className={css.castRole}>{role}</div>}
						</SpottableDiv>
					);
				})}
			</div>
		</div>
	);

	const renderExtras = () => (
		<div className={`${css.scroll} ${css.gridArea}`} data-frost-scroll>
			<div className={`${css.scrollBody} ${css.extrasGrid}`}>
				{grid('extras', extras, (extra, i) => (
					<SpottableDiv key={i} className={css.extraTile} data-frost-key={`extras:${i}`} data-index={i} onClick={handleExtra}>
						{thumb(spotlightItemImageUrl(effectiveServerUrl, extra), css.wideThumb)}
						<div className={css.extraName}>{extra.Name}</div>
					</SpottableDiv>
				))}
			</div>
		</div>
	);

	const renderPosters = () => (
		<div className={`${css.scroll} ${css.gridArea}`} data-frost-scroll>
			<div className={`${css.scrollBody} ${css.posterGrid}`}>
				{grid(shownTab, posters, (entry, i) => {
					const status = entry._seerr ? frostSeerrStatus(entry.mediaInfo?.status, statusColors) : null;
					const bannerStatus = seerrStyle === 'banner' ? seerrTitleStatus(entry) : null;
					return (
						<SpottableDiv key={entry.cardKey || entry.Id || i} className={css.posterTile} data-frost-key={`${shownTab}:${i}`} data-index={i} onClick={handlePoster}>
							{thumb(spotlightItemImageUrl(effectiveServerUrl, entry), css.posterThumb, bannerStatus
								? <SeerrStatusBanner status={bannerStatus} large />
								: status && seerrStyle === 'badge' && (
									<span className={css.posterBadge}><SeerrSeasonDot status={entry.mediaInfo?.status} /></span>
								))}
							<div className={css.posterTitle}>{entry.Name}</div>
							{status && <div className={css.posterStatus} style={{color: status.color}}>{status.label}</div>}
						</SpottableDiv>
					);
				})}
			</div>
		</div>
	);

	// The first group takes one column and the rest the other. The whole of it is one stop, so there's
	// somewhere to land and BACK and the toolbar are a press away.
	const renderGroups = (groups, key) => {
		const group = (entry) => (
			<div key={entry.title || 'facts'} className={css.group}>
				{entry.title && <div className={css.groupTitle}>{entry.title}</div>}
				<div className={css.card}>
					{entry.rows.map(([label, value, logo]) => (
						<div key={label} className={css.infoRow}>
							{logo && <img className={css.infoLogo} src={logo} alt="" />}
							<span className={css.infoLabel}>{label}</span>
							<span className={css.infoValue}>{value}</span>
						</div>
					))}
				</div>
			</div>
		);
		return (
			<SpottableDiv className={css.details} data-frost-key={key}>
				<div className={css.detailsColumn}>{groups.slice(0, 1).map(group)}</div>
				<div className={css.detailsColumn}>{groups.slice(1).map(group)}</div>
			</SpottableDiv>
		);
	};

	const renderSegments = () => (shownSegment === 'about'
		? renderGroups(frostSeerrGroups(seerr), `${shownTab}:about`)
		: renderPosters());

	const content = {
		overview: renderOverview,
		episodes: renderEpisodes,
		seasons: renderSeasons,
		cast: renderCast,
		extras: renderExtras,
		related: seerrOnly ? renderSegments : renderPosters,
		seerr: renderSegments,
		details: () => renderGroups(frostInfo(item, {showsSection, mediaSource, seerr: seerrOnly ? seerr : null}), 'details:0')
	}[shownTab]();

	const tabLabel = (name) => (name === 'seerr' ? seerr.displayName : TABS[name].label());
	const tabIcon = (name) => (name === 'seerr'
		? <SeerrIcon className={css.tabIcon} />
		: <CoreIcon name={TABS[name].icon} className={css.tabIcon} />);

	const backdropShown = settings.detailsBackdropEnabled !== false && Boolean(backdropUrl);
	const blurredUrl = backdropShown ? serverBlurredUrl(backdropUrl, ENVIRONMENT_BLUR) : null;
	const readMoreMeta = [item.Genres?.[0], item.ProductionYear, item.RunTimeTicks > 0 ? formatDuration(item.RunTimeTicks) : null]
		.filter(Boolean).join(' · ');

	return (
		<div ref={rootRef} className={css.frost} onKeyDown={handleKeyDown} onFocus={handleFocus}>
			<div className={css.environment}>
				{backdropShown && (
					<img
						className={css.environmentImage}
						src={blurredUrl || backdropUrl}
						alt=""
						style={blurredUrl ? undefined : {filter: `blur(${ENVIRONMENT_BLUR}px)`}}
					/>
				)}
				<div className={css.dim} style={scrimStyle(scrims.vignette)} />
			</div>
			<div className={css.stage} style={frostStageStyle(navbarTop)}>
				<div className={css.window}>
					<div className={`${css.art} ${shownTab === 'overview' ? '' : css.artHidden}`}>
						{backdropShown && <img className={css.artImage} src={backdropUrl} alt="" />}
						<div className={css.artFade} style={scrimStyle(scrims.artFade)} />
					</div>
					{shownTab !== 'overview' && (
						<div className={css.heading}>
							<div className={css.headingCaps}>{item.Name}</div>
							<h2 className={css.headingTitle}>{tabLabel(shownTab)}</h2>
						</div>
					)}
					{renderPills()}
					{content}
				</div>
				<div className={css.toolbar}>
					<div className={css.toolbarPane}>
						<ModernActionButtons
							{...props}
							played={item.UserData?.Played}
							isFavorite={item.UserData?.IsFavorite}
							frosted
							omitTrackButtons
							buttonCap={FROST_BUTTON_CAP}
							overflowAsMenu
							menuBackRef={menuBackRef}
							onNavigateUp={enterContent}
							onNavigateDown={toTabBar}
						/>
					</div>
				</div>
				<div className={css.tabBar}>
					<div ref={tabBarRef} className={css.tabPane}>
						{tabs.map((name) => (
							<SpottableDiv
								key={name}
								className={`${css.tab} ${name === shownTab ? css.tabSelected : ''}`}
								data-frost-key={`tab:${name}`}
								onClick={enterContent}
							>
								{tabIcon(name)}
								<span className={css.tabLabel}>{tabLabel(name)}</span>
							</SpottableDiv>
						))}
					</div>
				</div>
			</div>
			<ReadMore open={readMoreOpen} title={item.Name} meta={readMoreMeta} text={overview} onClose={closeReadMore} />
		</div>
	);
};

// Everything that isn't a film, a show or a video goes to Modern, decided before any of Frost's own
// hooks run.
const FrostDetailContent = (props) => (
	drawsStage(props.item.Type) ? <FrostScreen {...props} /> : <ModernDetailContent {...props} />
);

export default FrostDetailContent;
