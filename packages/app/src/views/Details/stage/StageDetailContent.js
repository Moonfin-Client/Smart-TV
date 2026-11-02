import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import RatingsRow from '../../../components/RatingsRow';
import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import {iconViewBox} from '../../../components/icons/iconViewBox';
import {SeerrDownloadBars, SeerrSeasonDot} from '../../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrStreaming} from '../../../components/seerr/SeerrSections';
import {isMdblistEnabled} from '../../../services/mdblistApi';
import {getLogoUrl} from '../../../utils/helpers';
import {KEYS} from '../../../utils/keys';
import {rem, rootScale} from '../../../utils/rootScale';
import {serverBlurredUrl} from '../../../utils/serverBlur';
import {FavoriteHeartIcon, WatchedCheckIcon} from '../DetailBadges';
import {castPhotoUrl, hidesMediaDescription} from '../detailsMedia';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {RowContainer, SpottableDiv} from '../detailsSpottables';
import DetailMetaRow from '../DetailMetaRow';
import ExpandableOverview from '../ExpandableOverview';
import ModernActionButtons from '../ModernActionButtons';
import ModernDetailContent from '../ModernDetailContent';
import MinimalistEpisodes, {EPISODES_ID} from '../minimalist/MinimalistEpisodes';
import NouveauRail from '../nouveau/sections/NouveauRail';
import {nouveauCardImageUrl} from '../nouveau/nouveauCardImage';
import {spotlightItemImageUrl} from '../spotlight/spotlightImages';
import {
	ACTIONS, NAVBAR, STAGE_BUTTON_CAP, alignDelta, drawsStage, revealDelta, stageNeighbour, stagePoster, stageScrimAlpha,
	stageSubtitle, stageTrackChoices
} from './stageRules';

import css from './StageDetailContent.module.less';

// The poster-led detail screen. The poster stands on the left with play and the other buttons under
// it, and the title, ratings, tracks and episodes sit beside it. Extras and the rows of other titles
// run full width underneath. A title that's only in Seerr gets the same page with Request in place
// of play, its seasons as request cards and Seerr's own rows underneath.

const SHOW_TYPES = ['Series', 'Season', 'Episode'];

// An opened cell of the people and studios panel holds focus until BACK closes it, the way Core
// traps focus inside the group it entered.
const TrapContainer = SpotlightContainerDecorator({enterTo: 'default-element', leaveFor: {left: '', right: '', up: '', down: ''}}, 'div');

// The room kept above and below the episodes when the page scrolls them into view.
const REVEAL_CLEARANCE = 48;

// Core's spacing for a row of posters: the gap between cards, the room above and beside a focused
// card for it to grow into, and how far the cards sit under the row's title.
const POSTER_ROOM = {gap: 35.7, clearance: 58, bleed: 30, titleGap: 72};

// The page's right margin. Rows run on through it to the screen's edge, as Core's do.
const PAGE_END = 80;

const OVERVIEW_ID = 'stage-overview';

// Past this the toolbar along the top fades out, so it never sits over the rows scrolled up to it.
const TOOLBAR_HIDES_AT = 24;

const SMOOTH_SCROLL = typeof document !== 'undefined' && 'scrollBehavior' in document.documentElement.style;

const Icon = ({path, className}) => (
	<svg className={className} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

const findIn = (list, key) => list.find((candidate) => String(candidate.cardKey || candidate.Id) === key);

const scrollPage = (scroller, top) => {
	if (SMOOTH_SCROLL) scroller.scrollTo({top, behavior: 'smooth'});
	else scroller.scrollTop = top;
};

const hasSpottable = (container, active, above) => {
	const edge = above ? active.getBoundingClientRect().top + 1 : active.getBoundingClientRect().bottom - 1;
	return Array.from(container.querySelectorAll('.spottable')).some((el) => {
		if (el === active) return false;
		const box = el.getBoundingClientRect();
		return above ? box.bottom <= edge : box.top >= edge;
	});
};

const StageScreen = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, seerrNav, effectiveServerUrl, backdropUrl, logoUrl,
		onLogoError, tagline, seasons, episodes, seriesEpisodes, similar = [], extras = [], cast = [],
		crew = [], collectionSections = [], onSelectItem, onSelectPerson, onSelectStudio, onSelectSeerrCard,
		handleEpisodePlay, handleOpenAudioModal, handleOpenSubtitleModal, handleOpenVersionModal,
		spotlightBackRef, techBadges = [], techSize, overviewBackRef
	} = props;

	const scrollerRef = useRef(null);
	const stopsRef = useRef({beside: [], below: []});
	const menuBackRef = useRef(null);
	const toolbarHiddenRef = useRef(false);
	const navbarTop = settings.navbarPosition !== 'left';

	// Which cell of the people and studios panel is open, so its names can take focus.
	const [openGroup, setOpenGroup] = useState(null);

	const handleOpenGroup = useCallback((ev) => {
		const key = ev.currentTarget.dataset.group;
		setOpenGroup(key);
		window.requestAnimationFrame(() => Spotlight.focus(`stage-group-${key}`));
	}, []);

	const closeGroup = useCallback(() => {
		const key = openGroup;
		setOpenGroup(null);
		window.requestAnimationFrame(() => Spotlight.focus(document.querySelector(`[data-group="${key}"]`)));
	}, [openGroup]);

	// App closes the screen on BACK unless something here says it took the press, so the open
	// overflow menu gets its say first, then an open cell of the panel.
	useEffect(() => {
		if (!spotlightBackRef) return undefined;
		const handler = () => {
			if (menuBackRef.current?.()) return true;
			if (!openGroup) return false;
			closeGroup();
			return true;
		};
		spotlightBackRef.current = handler;
		return () => {
			if (spotlightBackRef.current === handler) spotlightBackRef.current = null;
		};
	}, [spotlightBackRef, openGroup, closeGroup]);

	const setToolbarHidden = useCallback((hidden) => {
		if (toolbarHiddenRef.current === hidden) return;
		toolbarHiddenRef.current = hidden;
		window.dispatchEvent(new CustomEvent('moonfin:detailsChrome', {detail: {hidden}}));
	}, []);

	useEffect(() => () => setToolbarHidden(false), [setToolbarHidden]);

	const handleScroll = useCallback((ev) => {
		setToolbarHidden(navbarTop && ev.currentTarget.scrollTop > TOOLBAR_HIDES_AT);
	}, [navbarTop, setToolbarHidden]);

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

	// The buttons and the toolbar both sit at the top of the page, so the page goes back there too.
	const focusAtTop = useCallback((target) => {
		const scroller = scrollerRef.current;
		const before = scroller ? scroller.scrollTop : 0;
		Spotlight.focus(target);
		if (!scroller) return;
		scroller.scrollTop = before;
		scrollPage(scroller, 0);
	}, []);

	// A stop can name a section that drew nothing to focus, like a rail that came back empty, so a
	// press that finds nothing keeps going the way it was headed.
	const go = useCallback((target, direction) => {
		let next = target;
		while (next) {
			if (next === NAVBAR) {
				focusAtTop('navbar');
				return;
			}
			if (next === ACTIONS) {
				// Play, or Request on a title that's only in Seerr.
				focusAtTop(document.querySelector('[data-spotlight-id="details-action-buttons"] .spottable'));
				return;
			}
			if (focusStop(next)) return;
			next = stageNeighbour(stopsRef.current, next, direction, navbarTop);
		}
	}, [focusStop, focusAtTop, navbarTop]);

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
	const episodesUp = useCallback(() => move(EPISODES_ID, 'up'), [move]);
	const episodesDown = useCallback(() => move(EPISODES_ID, 'down'), [move]);

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
		if (hasSpottable(stop, active, up)) return;
		ev.preventDefault();
		ev.stopPropagation();
		move(id, up ? 'up' : 'down');
	}, [move, toActions]);

	const handlePersonCard = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		const person = cast.find((candidate) => String(candidate.Id || candidate.Name) === key) ||
			crew.find((candidate) => String(candidate.Id || candidate.Name) === key);
		if (person) onSelectPerson?.(person);
	}, [cast, crew, onSelectPerson]);

	const handleStudio = useCallback((ev) => {
		const name = ev.currentTarget.dataset.studioName;
		if (name) onSelectStudio?.(name);
	}, [onSelectStudio]);

	const handleExtraCard = useCallback((ev) => {
		const extra = findIn(extras, ev.currentTarget.dataset.selectKey);
		if (extra) handleEpisodePlay?.(extra);
	}, [extras, handleEpisodePlay]);

	const collectionItems = useMemo(() => collectionSections.flatMap((section) => section.items), [collectionSections]);
	const handlePosterCard = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		const found = findIn(similar, key) || findIn(collectionItems, key);
		if (found) onSelectItem?.(found);
	}, [similar, collectionItems, onSelectItem]);

	const handleSeerrCard = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		const card = findIn(seerr.recommendationCards || [], key) || findIn(seerr.similarCards || [], key);
		if (card) onSelectSeerrCard?.(card);
	}, [seerr.recommendationCards, seerr.similarCards, onSelectSeerrCard]);

	const {handleRequestSeason} = seerr;
	const handleSeasonCard = useCallback((ev) => {
		handleRequestSeason?.(Number(ev.currentTarget.dataset.selectKey));
	}, [handleRequestSeason]);

	const isShow = SHOW_TYPES.indexOf(item.Type) >= 0;
	const partOfShow = item.Type === 'Season' || item.Type === 'Episode';
	const poster = stagePoster(effectiveServerUrl, item, settings);
	const progress = item.UserData?.PlayedPercentage || 0;
	const subtitle = stageSubtitle(item);
	const showsOverview = Boolean(item.Overview) && !hidesMediaDescription(item, settings);
	const zoom = settings.cardFocusZoom !== false;
	// Rails are spaced and padded in script, so they follow the root font the stylesheet scales with.
	const scale = rootScale();
	const px = (value) => Math.round(value * scale);

	const renderCard = (entry, onSelect, {imageUrl = spotlightItemImageUrl(effectiveServerUrl, entry), placeholder, subtitle: line, wide, children} = {}) => {
		const played = entry.UserData?.PlayedPercentage;
		return (
			<SpottableDiv
				className={`${css.card} ${wide ? css.extraCard : ''} ${zoom ? '' : css.noZoom}`}
				data-select-key={entry.cardKey || entry.Id}
				onClick={onSelect}
			>
				<div className={css.cardArt}>
					<div className={css.cardClip}>
						{imageUrl
							? <img className={css.cardImage} src={imageUrl} alt="" />
							: <div className={css.cardPlaceholder}>{placeholder}</div>}
						{entry.UserData?.IsFavorite && (
							<div className={css.cardFavorite}><FavoriteHeartIcon /></div>
						)}
						{entry.UserData?.Played && (
							<div className={css.cardWatched}><WatchedCheckIcon compact /></div>
						)}
						{played > 0 && played < 100 && (
							<div className={css.progressTrack}><div className={css.progressFill} style={{width: `${played}%`}} /></div>
						)}
						{children}
					</div>
				</div>
				<div className={css.cardTitle}>{entry.Name}</div>
				{line && <div className={css.cardSubtitle}>{line}</div>}
			</SpottableDiv>
		);
	};
	const renderLibraryPoster = (entry) => renderCard(entry, handlePosterCard);
	const renderSeerrPoster = (entry) => renderCard(entry, handleSeerrCard);

	const renderPerson = (person) => {
		const photo = castPhotoUrl(person, effectiveServerUrl, 400);
		return (
			<SpottableDiv
				className={`${css.person} ${zoom ? '' : css.noZoom}`}
				data-select-key={person.Id || person.Name}
				onClick={handlePersonCard}
			>
				<div className={css.avatarRing}>
					<div className={css.avatar}>
						{photo
							? <img className={css.avatarImage} src={photo} alt="" />
							: <Icon path={DETAIL_ICON_PATHS.group} className={css.avatarIcon} />}
					</div>
				</div>
				<div className={css.personName}>{person.Name}</div>
				{person.Role && <div className={css.personRole}>{String(person.Role).split('\n').filter(Boolean).join(', ')}</div>}
			</SpottableDiv>
		);
	};

	const renderExtra = (extra) => renderCard(extra, handleExtraCard, {
		imageUrl: nouveauCardImageUrl(effectiveServerUrl, extra, {fallbackUrl: backdropUrl}),
		placeholder: extra.Name,
		wide: true
	});

	const seasonMarkers = settings.showSeerrAvailabilityBadges !== false ? seerr.seasonMarkers : null;
	// Core draws a season Seerr knows of as its name on a plain card, with no artwork.
	const renderSeerrSeason = (season) => renderCard(season, handleSeasonCard, {
		imageUrl: null,
		placeholder: season.Name,
		subtitle: season.episodeCount ? String(season.episodeCount) : null,
		children: <SeerrSeasonDot status={seasonMarkers?.get(season.seasonNumber)} />
	});

	const rail = (id, title, items, renderItem, room = POSTER_ROOM, extra) => ({
		id,
		node: (
			<>
				{title && <h2 className={css.rowTitle} style={{marginBottom: rem(Math.max(0, room.titleGap - room.clearance))}}>{title}</h2>}
				<NouveauRail
					items={items}
					gap={px(room.gap)}
					clearance={px(room.clearance)}
					bleed={px(room.bleed)}
					bleedRight={px(PAGE_END)}
					spotlightId={id}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderItem}
					{...extra}
				/>
			</>
		)
	});

	const episodesStop = (besidePoster) => ({
		id: EPISODES_ID,
		node: (
			<MinimalistEpisodes
				item={item}
				settings={settings}
				serverUrl={effectiveServerUrl}
				seasons={seasons}
				episodes={episodes}
				seriesEpisodes={seriesEpisodes}
				onSelectEpisode={onSelectItem}
				onNavigateUp={episodesUp}
				onNavigateDown={episodesDown}
				onLeftEdge={besidePoster ? toActions : undefined}
				bleedRight={px(PAGE_END)}
				large
			/>
		)
	});

	// Beside the poster: the track pickers, the people and studios behind a film, and the seasons or
	// episodes of a show.
	const beside = [];

	const trackOpeners = {audio: handleOpenAudioModal, subtitles: handleOpenSubtitleModal, version: handleOpenVersionModal};
	const trackLooks = {
		audio: {label: $L('Audio'), icon: DETAIL_ICON_PATHS.audio},
		subtitles: {label: $L('Subtitles'), icon: DETAIL_ICON_PATHS.subtitle},
		version: {label: $L('Version'), icon: DETAIL_ICON_PATHS.version}
	};
	const choices = stageTrackChoices(props);
	if (choices.length) {
		beside.push({
			id: 'stage-tracks',
			node: (
				<RowContainer className={css.chipRow} spotlightId="stage-tracks">
					{choices.map((choice) => (
						<SpottableDiv key={choice.id} className={css.chip} onClick={trackOpeners[choice.id]}>
							<Icon path={trackLooks[choice.id].icon} className={css.chipIcon} />
							<span className={css.chipLabel}>{trackLooks[choice.id].label}</span>
							<span className={css.chipValue}>{choice.current}</span>
						</SpottableDiv>
					))}
				</RowContainer>
			)
		});
	}

	// The crew list merges a director who also wrote into one entry, so read the roles from People.
	const people = showsSection('crew') ? item.People || [] : [];
	const directors = people.filter((person) => person.Type === 'Director');
	const writers = people.filter((person) => person.Type === 'Writer');
	const studios = showsSection('studios') ? (item.Studios || []).map((studio) => studio?.Name).filter(Boolean) : [];
	const factGroups = [
		{key: 'directors', title: directors.length === 1 ? $L('Director') : $L('Directors'), names: directors.map((p) => ({key: p.Id || p.Name, name: p.Name, person: true}))},
		{key: 'writers', title: writers.length === 1 ? $L('Writer') : $L('Writers'), names: writers.map((p) => ({key: p.Id || p.Name, name: p.Name, person: true}))},
		{key: 'studios', title: $L('Studio'), names: studios.map((name) => ({key: name, name}))}
	].filter((group) => group.names.length);
	if (!isShow && factGroups.length) {
		beside.push({
			id: 'stage-facts',
			node: (
				<RowContainer className={css.panel} spotlightId="stage-facts">
					{factGroups.map((group, index) => {
						const entered = openGroup === group.key;
						const names = group.names.map((entry) => (entered
							? (
								<SpottableDiv
									key={entry.key}
									className={css.name}
									data-select-key={entry.person ? entry.key : undefined}
									data-studio-name={entry.person ? undefined : entry.name}
									onClick={entry.person ? handlePersonCard : handleStudio}
								>
									{entry.name}
								</SpottableDiv>
							)
							: <div key={entry.key} className={css.name}>{entry.name}</div>));
						return (
							<SpottableDiv
								key={group.key}
								className={`${css.cell} ${index ? css.cellDivided : css.cellFirst} ${index === factGroups.length - 1 ? css.cellLast : ''}`}
								data-group={group.key}
								spotlightDisabled={entered}
								onClick={handleOpenGroup}
							>
								<div className={css.cellTitle}>{group.title}</div>
								{entered
									? <TrapContainer className={css.cellNames} spotlightId={`stage-group-${group.key}`} data-stage-trap>{names}</TrapContainer>
									: <div className={css.cellNames}>{names}</div>}
							</SpottableDiv>
						);
					})}
				</RowContainer>
			)
		});
	}

	if (isShow && seerrOnly) {
		const seerrSeasons = (seerr.details?.seasons || []).filter((season) => season.seasonNumber > 0);
		if (seerrSeasons.length) {
			const cards = seerrSeasons.map((season) => ({
				...season,
				Id: season.seasonNumber,
				Name: season.name || $L('Season {number}').replace('{number}', season.seasonNumber)
			}));
			beside.push(rail('stage-seasons', $L('Seasons'), cards, renderSeerrSeason, {...POSTER_ROOM, gap: 20}, {onLeftEdge: toActions}));
		}
	} else if (item.Type === 'Series' || item.Type === 'Season') {
		beside.push(episodesStop(true));
	}

	// The full width rows under the poster: an episode's run of episodes, the cast, extras, the
	// collections the title belongs to, more like it and what Seerr adds.
	const below = [];
	if (item.Type === 'Episode' && !seerrOnly && showsSection('moreEpisodes')) below.push(episodesStop(false));
	if (cast.length) below.push(rail('stage-cast', $L('Cast'), cast, renderPerson, {gap: 26.7, clearance: 10, bleed: 10, titleGap: 20}));
	if (extras.length) below.push(rail('stage-extras', $L('Extras'), extras, renderExtra, {gap: 30, clearance: 32, bleed: 30, titleGap: 39}));
	collectionSections.forEach((section, index) => {
		if (section.items.length) below.push(rail(`stage-collection-${index}`, section.name, section.items, renderLibraryPoster));
	});
	if (similar.length) below.push(rail('stage-similar', $L('More Like This'), similar, renderLibraryPoster, POSTER_ROOM, {itemMenu: true}));

	const pieces = seerr.pieces || {};
	if (pieces.chips || pieces.facts || pieces.streaming) {
		below.push({
			id: 'stage-seerr',
			node: (
				<RowContainer className={css.seerrBlock} spotlightId="stage-seerr">
					<h2 className={css.rowTitle}>{seerr.displayName}</h2>
					{pieces.chips && <SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />}
					{pieces.facts && <SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />}
					{pieces.streaming && <SeerrStreaming providers={seerr.streamingProviders} />}
				</RowContainer>
			)
		});
	}
	if (pieces.recommendations) {
		below.push(rail('stage-seerr-recommendations', `${seerr.displayName} · ${$L('Recommendations')}`, seerr.recommendationCards, renderSeerrPoster));
	}
	if (pieces.similar) {
		below.push(rail('stage-seerr-similar', `${seerr.displayName} · ${$L('Similar')}`, seerr.similarCards, renderSeerrPoster));
	}

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
			<div ref={scrollerRef} className={css.scroller} onScroll={handleScroll} onKeyDown={handleKeyDown}>
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
									menuBackRef={menuBackRef}
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
						<div key={stop.id} className={css.belowStop} data-stage-stop={stop.id}>{stop.node}</div>
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
