import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {getImageUrl} from '../../../utils/helpers';
import {rem, rootScale} from '../../../utils/rootScale';
import {castPhotoUrl, seriesThumbUrl} from '../detailsMedia';
import {RowContainer, SpottableDiv} from '../detailsSpottables';
import {spotlightItemImageUrl} from '../spotlight/spotlightImages';
import {nouveauCardImageUrl} from './nouveauCardImage';
import NouveauHero from './hero/NouveauHero';
import NouveauRail from './sections/NouveauRail';
import NouveauRailCard from './cards/NouveauRailCard';
import NouveauPeopleCard from './cards/NouveauPeopleCard';
import NouveauPosterCard from './cards/NouveauPosterCard';
import NouveauLandscapeCard from './cards/NouveauLandscapeCard';
import DetailsTabBar from '../../../components/DetailsTabBar';
import NouveauSortDialog from './sections/NouveauSortDialog';
import PersonDisplayDialog from '../PersonDisplayDialog';
import NouveauDetailsFooter from './footer/NouveauDetailsFooter';
import {buildDiscoveryRails} from './nouveauDiscovery';
import {buildPersonRails} from './nouveauPersonRails';
import {splitFilmography} from '../../../utils/personCredits';
import {loadSeerrPersonCredits, seerrPersonCards} from '../seerrPersonCredits';
import {useSeerr} from '../../../context/SeerrContext';
import {
	HERO, buildNouveauChain, clampNouveauNode, nextNouveauNode, spotlightIdForNouveauNode
} from './nouveauFocusChain';
import {effectiveSeason, groupEpisodesBySeason, seasonOptions} from './nouveauSeasons';
import {sortLabel} from './nouveauCollectionSort';
import useCollectionSort from '../useCollectionSort';
import {chapterDisplayName, collectionSubtitle, extraSubtitle} from './nouveauLabels';
import {
	RAIL_GAP, SECTION_INSET, TOP_BAR_CLEARANCE, TV_RAIL_GAP, discoveryCardWidth, discoveryPosterHeight,
	collectionCardHeight, collectionCardWidth, episodeCardWidth, episodeImageHeight,
	mediaRailArtworkHeight, mediaRailCardWidth,
	peopleAvatarSize, peopleCardWidth
} from './nouveauMetrics';
import {
	SECTION_CHAPTERS, SECTION_COLLECTION, SECTION_DETAILS, SECTION_DISCOVERY, SECTION_EPISODES,
	SECTION_EXTRAS, SECTION_PARENT_COLLECTIONS, SECTION_PARTS, SECTION_PEOPLE, SECTION_REVIEWS, nouveauSectionOrder,
	seerrDiscoveryExpected
} from './nouveauSections';
import {splitAdditionalParts} from '../extraCategories';
import ReviewCard from '../ReviewCard';
import {scrimStyle} from '../../../utils/scrimImage';

import sectionsCss from './sections/NouveauSections.module.less';
import css from './NouveauDetailContent.module.less';

// Nouveau puts everything on one page. The backdrop sits behind, the hero sits at the top, and
// every section follows it down the page as its own band rather than hiding behind a tab or a card.

// The room a docked sidebar takes, which the stylesheet pads the content by.
const SIDEBAR_OFFSET = 120;

// Same stops as .scrim in the stylesheet.
const SCRIM = [
	{at: [0.65, 0.45], rgb: '0, 0, 0', stops: [[0, 0], [0.58, 0], [0.82, 0.12], [1, 0.3]]},
	{to: 'bottom', rgb: '0, 0, 0', stops: [[0, 0.28], [0.18, 0.08], [0.42, 0]]},
	{to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.18, 0.96], [0.38, 0.78], [0.58, 0.48], [0.76, 0.18], [0.94, 0]]},
	{to: 'right', rgb: '11, 13, 16', stops: [[0, 0.96], [0.18, 0.86], [0.38, 0.58], [0.6, 0.22], [0.82, 0]]}
];

const HERO_UNDER_TOP_BAR = {paddingTop: rem(TOP_BAR_CLEARANCE)};

// Older Tizen and webOS WebKit have no smooth scrolling, so they jump instead.
const SMOOTH_SCROLL = typeof document !== 'undefined' && 'scrollBehavior' in document.documentElement.style;

// Looking an item up in the list a card came from, which every rail's select handler needs.
const findIn = (list, key) => list.find((candidate) => String(candidate.Id) === key);

// One value to reset to, so an item with no Seerr credits leaves the rails memo alone.
const NO_PERSON_CREDITS = {cast: [], crew: []};

const NouveauDetailContent = (props) => {
	const {
		item, settings, showsSection, seerr, seerrOnly, isPerson, effectiveServerUrl,
		backdropUrl, similar = [], reviews = [], onSelectReview, extras = [], cast = [], crew = [],
		similarLoaded = false, handleChapterSelect, handleExtraSelect, onSelectPerson,
		onSelectItem, onSelectSeerrCard, handleEpisodePlay, isSeries,
		episodes = [], seriesEpisodes = [], nextUp = [], seasons = [],
		collectionItems = [], collectionSections = [], playlistItems = [], effectiveApi,
		mediaSource, selectedAudioIndex, selectedSubtitleIndex,
		spotlightBackRef, overviewBackRef, seerrNav, onSelectStudio, loadMoreCollectionItems, collectionMenu, collectionOrder
	} = props;

	const {isEnabled: seerrEnabled} = useSeerr();
	const parentCollectionCount = collectionSections.length;
	const [personCredits, setPersonCredits] = useState(NO_PERSON_CREDITS);
	const [displayOpen, setDisplayOpen] = useState(false);
	const openPersonDisplay = useCallback(() => setDisplayOpen(true), []);
	const closePersonDisplay = useCallback(() => setDisplayOpen(false), []);

	// Seerr is an extra on a person page, so a failure leaves the rails the library can fill.
	// Neither list is asked for when the viewer hid both.
	const showsSeerrAppearances = showsSection('seerrPersonAppearances');
	const showsSeerrCrew = showsSection('seerrPersonCrew');
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		setPersonCredits(NO_PERSON_CREDITS);
		if (!isPerson || !tmdbId || !seerrEnabled || (!showsSeerrAppearances && !showsSeerrCrew)) return undefined;
		loadSeerrPersonCredits(tmdbId)
			.then((credits) => {
				if (!cancelled) setPersonCredits(credits);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item.Id, item.ProviderIds, isPerson, seerrEnabled, showsSeerrAppearances, showsSeerrCrew]);

	// Keyed off the list itself rather than a filmography split upstream, which is rebuilt every
	// render and would take the sections and the focus chain with it. A hidden rail has no
	// items, so it never gets a stop.
	const personRails = useMemo(
		() => (isPerson ? buildPersonRails({
			filmography: splitFilmography(similar, showsSection, settings.personPageSortOption),
			appearances: showsSeerrAppearances ? seerrPersonCards(personCredits.cast, false, settings) : [],
			crewCredits: showsSeerrCrew ? seerrPersonCards(personCredits.crew, true, settings) : []
		}) : []),
		[isPerson, similar, personCredits, showsSection, showsSeerrAppearances, showsSeerrCrew, settings]
	);

	const [windowWidth, setWindowWidth] = useState(
		() => (typeof window === 'undefined' ? 1920 : window.innerWidth)
	);

	useEffect(() => {
		const onResize = () => setWindowWidth(window.innerWidth);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	// What a rail actually has to fill: the page less its own insets on both sides, and less the
	// sidebar when the navigation is docked rather than along the top.
	const viewportWidth = windowWidth - SECTION_INSET * 2 -
		(settings.navbarPosition === 'left' ? SIDEBAR_OFFSET : 0);

	// Blur and opacity share one stored value and the stored range runs past this scale, so
	// anything above the top of the scale is held at full rather than blacking the artwork out.
	const blurAmount = Number(settings.backdropBlurDetail ?? 20);
	const opacityFactor = Math.min(1, Math.max(0, blurAmount / 25));
	const backdropStyle = {
		'--opacity-alpha': opacityFactor * (isPerson ? 0.40 : 0.80),
		'--gradient-scale': 0.3 + 0.7 * opacityFactor
	};

	const chapters = showsSection('chapters') ? item.Chapters : undefined;
	const {parts: additionalParts, others: otherExtras} = useMemo(() => splitAdditionalParts(extras), [extras]);

	const sections = useMemo(() => {
		if (isPerson) return [...personRails.map((rail) => rail.id), SECTION_DETAILS];

		const seerrState = seerr || {};
		return nouveauSectionOrder({
			type: item.Type,
			chapterCount: chapters?.length || 0,
			partCount: additionalParts.length,
			extraCount: otherExtras.length,
			actorCount: cast.length,
			// Directors and writers arrive as one crew list here, so the gate weighs two counts.
			directorCount: crew.length,
			similarLoaded,
			similarCount: similar.length,
			reviewCount: reviews.length,
			parentCollectionCount,
			// With both Seerr lists hidden there is nothing to hold the slot open for.
			seerrExpected: (showsSection('seerrSimilar') || showsSection('seerrRecommendations')) && seerrDiscoveryExpected({
				type: item.Type,
				seerrAvailable: Boolean(seerrState.isActive || seerrOnly),
				tmdbId: item.ProviderIds?.Tmdb,
				imdbId: item.ProviderIds?.Imdb
			}),
			// Resolved means the lookup has come back, not that it found anything. An empty answer
			// still counts, which is what lets the rail give its slot up rather than hold it.
			seerrResolved: seerrState.loading !== true,
			seerrSimilarCount: (seerrState.similarCards || []).length,
			seerrRecommendationCount: (seerrState.recommendationCards || []).length
		});
	}, [
		item.Type, chapters, item.ProviderIds, isPerson, personRails, additionalParts.length, otherExtras.length, cast.length,
		crew.length, similarLoaded, similar.length, reviews.length, seerrOnly, seerr, showsSection, parentCollectionCount
	]);

	// A series arrives as one run of episodes and shows a season at a time, so the selector only
	// changes which part of that run is on screen rather than fetching anything.
	const [pickedSeason, setPickedSeason] = useState(null);

	const seasonGroups = useMemo(
		() => groupEpisodesBySeason(isSeries ? seriesEpisodes : episodes),
		[isSeries, seriesEpisodes, episodes]
	);
	const seasonNumbers = useMemo(() => [...seasonGroups.keys()], [seasonGroups]);
	const nextUpSeason = nextUp[0]?.ParentIndexNumber;
	const activeSeason = effectiveSeason(seasonNumbers, pickedSeason, nextUpSeason);
	const seasonTabs = useMemo(() => seasonOptions(seasonGroups, seasons), [seasonGroups, seasons]);
	// Held steady across renders, or the handlers below would be rebuilt every time and the rail
	// would be left holding a stale one.
	const seasonEpisodes = useMemo(
		() => seasonGroups.get(activeSeason) || [],
		[seasonGroups, activeSeason]
	);
	const nextUpId = nextUp[0]?.Id;

	const onSeasonActivate = useCallback((id) => setPickedSeason(Number(id)), []);

	const findEpisode = useCallback(
		(key) => seasonEpisodes.find((candidate) => String(candidate.Id) === key),
		[seasonEpisodes]
	);

	const onEpisodeArtwork = useCallback((ev) => {
		handleEpisodePlay?.(findEpisode(ev.currentTarget.dataset.selectKey));
	}, [findEpisode, handleEpisodePlay]);

	const onEpisodeDetails = useCallback((ev) => {
		const episode = findEpisode(ev.currentTarget.dataset.selectKey);
		if (episode) onSelectItem?.(episode);
	}, [findEpisode, onSelectItem]);

	const {sortOption, sortOptions, sortOpen, openSort, closeSort, chooseSort} = useCollectionSort(collectionOrder);

	const discovery = useMemo(() => buildDiscoveryRails({
		item,
		similar,
		seerrSimilar: seerr?.similarCards || [],
		seerrRecommendations: seerr?.recommendationCards || [],
		hasSeerr: Boolean(seerr?.isActive)
	}), [item, similar, seerr]);

	// One handler for every poster rail, since a card says for itself which side it came from. A
	// person page carries filmography and no discovery, and an item page the other way round, so
	// the two sets never hold the same card.
	const onPosterCard = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		const pools = [discovery.related, discovery.recommendations, ...personRails.map((rail) => rail.items)];
		const found = pools.reduce((hit, pool) => hit || findIn(pool, key), null);
		if (!found) return;
		if (found._seerr) onSelectSeerrCard?.(found);
		else onSelectItem?.(found);
	}, [discovery, personRails, onSelectItem, onSelectSeerrCard]);

	const people = useMemo(() => [...cast, ...crew], [cast, crew]);

	const onPersonCard = useCallback((ev) => {
		const key = ev.currentTarget.dataset.selectKey;
		const person = people.find((candidate) => String(candidate.Id || candidate.Name) === key);
		if (person) onSelectPerson?.(person);
	}, [people, onSelectPerson]);

	const onCollectionCard = useCallback((ev) => {
		const entry = findIn(collectionItems, ev.currentTarget.dataset.selectKey);
		if (entry) onSelectItem?.(entry);
	}, [collectionItems, onSelectItem]);

	const parentCollectionItems = useMemo(() => collectionSections.flatMap((section) => section.items), [collectionSections]);
	const onParentCollectionCard = useCallback((ev) => {
		const entry = findIn(parentCollectionItems, ev.currentTarget.dataset.selectKey);
		if (entry) onSelectItem?.(entry);
	}, [parentCollectionItems, onSelectItem]);

	const onPlaylistArtwork = useCallback((ev) => {
		handleEpisodePlay?.(findIn(playlistItems, ev.currentTarget.dataset.selectKey));
	}, [playlistItems, handleEpisodePlay]);

	const onPlaylistDetails = useCallback((ev) => {
		const entry = findIn(playlistItems, ev.currentTarget.dataset.selectKey);
		if (entry) onSelectItem?.(entry);
	}, [playlistItems, onSelectItem]);

	const onChapterCard = useCallback((ev) => {
		handleChapterSelect?.(Number(ev.currentTarget.dataset.selectKey));
	}, [handleChapterSelect]);

	const onExtraCard = useCallback((ev) => {
		const id = ev.currentTarget.dataset.selectKey;
		const extra = extras.find((candidate) => String(candidate.Id) === id);
		if (extra) handleExtraSelect?.(extra);
	}, [extras, handleExtraSelect]);

	// Chapters and extras are both a widescreen still with a caption, so they share a card and
	// differ only in what they are captioned with.
	const railWidth = mediaRailCardWidth(viewportWidth);
	const railArtwork = mediaRailArtworkHeight(railWidth);
	const personWidth = peopleCardWidth(viewportWidth);
	const personAvatar = peopleAvatarSize(personWidth);
	const posterWidth = discoveryCardWidth(viewportWidth);
	const posterHeight = discoveryPosterHeight(posterWidth);
	const episodeWidth = episodeCardWidth(viewportWidth);
	const episodeImage = episodeImageHeight(episodeWidth);
	const collectionWidth = collectionCardWidth(viewportWidth);
	const collectionHeight = collectionCardHeight(collectionWidth);

	const chapterCards = (chapters || []).map((chapter, index) => ({
		Id: `chapter-${index}`,
		name: chapterDisplayName(chapter.Name, chapter.StartPositionTicks),
		raw: chapter.Name,
		ticks: chapter.StartPositionTicks,
		// The viewer can ask for the series thumbnail instead, which is the only artwork a chapter
		// without a still of its own has to offer.
		imageUrl: (settings.detailUseSeriesThumbnails
			? seriesThumbUrl(effectiveServerUrl, item, {maxWidth: 400, quality: 90})
			: null) ||
			(chapter.ImageTag
				? getImageUrl(effectiveServerUrl, item.Id, `Chapter/${index}`, {
					maxWidth: 400, quality: 90, tag: chapter.ImageTag
				})
				: null)
	}));

	// The page is one column of stops, so a vertical press walks a list rather than measuring every
	// focusable element on screen. Sections fill in behind the first paint, so the handlers read the
	// chain from a ref the render keeps current instead of the one they were built with.
	const scrollerRef = useRef(null);
	const chainRef = useRef([]);
	const nodeRef = useRef(HERO);

	const railNodes = useMemo(() => {
		const ids = [];
		sections.forEach((id) => {
			if (id === SECTION_DETAILS) return;
			if (id === SECTION_COLLECTION) {
				ids.push(id);
				if (playlistItems.length > 0) ids.push(`${id}-playlist`);
				return;
			}
			if (id === SECTION_PARENT_COLLECTIONS) {
				for (let index = 0; index < parentCollectionCount; index++) ids.push(`${id}-${index}`);
				return;
			}
			// Two rails under one heading, so the section is two stops rather than one.
			if (id === SECTION_DISCOVERY) {
				if (discovery.related.length) ids.push(`${id}-similar`);
				if (discovery.recommendations.length) ids.push(`${id}-recommendations`);
				return;
			}
			ids.push(id);
		});
		return ids;
	}, [sections, playlistItems.length, discovery.related.length, discovery.recommendations.length, parentCollectionCount]);

	const chain = useMemo(() => buildNouveauChain({
		hasOverview: Boolean(item.Overview) && (!isPerson || showsSection('biography')),
		hasSeasonSelector: isSeries && seasonNumbers.length > 1,
		rails: railNodes,
		footerRows: sections.includes(SECTION_DETAILS) ? 1 : 0
	}), [item.Overview, isPerson, showsSection, isSeries, seasonNumbers.length, railNodes, sections]);

	chainRef.current = chain;

	// Focusing a card leaves the browser to decide how far to scroll, which lands a rail against the
	// bottom edge with its heading out of sight. Putting the rail's own top at a fixed clearance
	// brings the heading with it and lands in the same place every time. With the bar along the top
	// it also has to clear the bar.
	const topBar = settings.navbarPosition !== 'left';
	const pinToNode = useCallback((spotlightId) => {
		const scroller = scrollerRef.current;
		if (!scroller) return;

		const target = document.querySelector(`[data-spotlight-id="${spotlightId}"]`);
		const section = target?.closest('[data-rail-index]');

		// The hero and its overview sit above the first section, so there is nothing to pin them to
		// and the top of the page is where they belong.
		let top = 0;
		if (section) {
			const inset = (topBar ? TOP_BAR_CLEARANCE : SECTION_INSET) * rootScale();
			const offsetOf = (node) => node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
			top = offsetOf(section) - inset;
			// A section holding two rails, like Similar and Recommendations, can be taller than the
			// screen. A rail that wont fit under the section's top is pinned by its own top instead.
			if (target !== section && offsetOf(target) + target.offsetHeight - top > scroller.clientHeight) {
				top = offsetOf(target) - inset;
			}
		}
		top = Math.max(0, top);

		if (SMOOTH_SCROLL) {
			scroller.scrollTo({top, behavior: 'smooth'});
		} else {
			scroller.scrollTop = top;
		}
	}, [topBar]);

	// A stop can name something that is not on screen: the overview only takes focus when its text
	// is long enough to be worth expanding, and a rail that came back empty draws nothing at all. A
	// press that finds nothing keeps going the way it was headed rather than dying where it is.
	const moveFocus = useCallback((fromSpotlightId, direction) => {
		const held = chainRef.current;
		const from = held.find((stop) => spotlightIdForNouveauNode(stop) === fromSpotlightId);
		let node = from || clampNouveauNode(held, nodeRef.current);

		for (;;) {
			node = nextNouveauNode(held, node, direction);
			if (!node) return;

			const targetId = spotlightIdForNouveauNode(node);
			if (targetId && Spotlight.focus(targetId)) {
				nodeRef.current = node;
				pinToNode(targetId);
				return;
			}
		}
	}, [pinToNode]);

	const handleNavigateUp = useCallback((fromId) => moveFocus(fromId, 'up'), [moveFocus]);
	const handleNavigateDown = useCallback((fromId) => moveFocus(fromId, 'down'), [moveFocus]);

	// BACK is claimed from the inside out: the overflow menu, then the sort dialog, then the expanded
	// overview, and only then the scroll back to the top of the page.
	//
	// The overview is asked here rather than left to answer for itself. The host consults this ref
	// before anything else and the overview's ref last, so a screen that claimed the scroll first
	// would take every press and the overview would never get the chance to close.
	const menuBackRef = useRef(null);

	useEffect(() => {
		if (!spotlightBackRef) return undefined;

		const handler = () => {
			if (menuBackRef.current?.()) return true;
			if (sortOpen) {
				closeSort();
				return true;
			}
			if (displayOpen) {
				closePersonDisplay();
				return true;
			}
			if (overviewBackRef?.current?.()) return true;

			const scroller = scrollerRef.current;
			if (scroller && scroller.scrollTop > 0) {
				scroller.scrollTop = 0;
				nodeRef.current = HERO;
				Spotlight.focus(spotlightIdForNouveauNode(HERO));
				return true;
			}

			// Nothing of this screen's own is open, so the press belongs to whatever raised it.
			return false;
		};

		spotlightBackRef.current = handler;
		return () => {
			if (spotlightBackRef.current === handler) spotlightBackRef.current = null;
		};
	}, [spotlightBackRef, overviewBackRef, sortOpen, closeSort, displayOpen, closePersonDisplay]);

	const renderSection = (id) => {
		if (id === SECTION_CHAPTERS) {
			return (
				<NouveauRail
					title={$L('Chapters')}
					items={chapterCards}
					gap={RAIL_GAP}
					spotlightId={`nouveau-rail-${id}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderChapter}
				/>
			);
		}

		if (id === SECTION_PARTS || id === SECTION_EXTRAS) {
			return (
				<NouveauRail
					title={id === SECTION_PARTS ? $L('Additional Parts') : $L('Extras')}
					items={id === SECTION_PARTS ? additionalParts : otherExtras}
					gap={RAIL_GAP}
					spotlightId={`nouveau-rail-${id}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderExtra}
				/>
			);
		}

		if (id === SECTION_DETAILS) {
			// One stop for the whole footer. The only thing in it that takes focus is a retry, and
			// only while the direct play check has fallen over, so a stop per row would mostly name
			// rows that cannot hold focus.
			return (
				<RowContainer spotlightId="nouveau-footer-0">
					<NouveauDetailsFooter
						item={item}
						showsSection={showsSection}
						mediaSource={mediaSource}
						effectiveApi={effectiveApi}
						selectedAudioIndex={selectedAudioIndex}
						selectedSubtitleIndex={selectedSubtitleIndex}
						seerr={seerr}
						seerrNav={seerrNav}
						onSelectStudio={onSelectStudio}
					/>
				</RowContainer>
			);
		}

		if (id === SECTION_PARENT_COLLECTIONS) {
			return collectionSections.map((section, index) => (
				<NouveauRail
					key={section.id}
					title={section.name}
					items={section.items}
					gap={TV_RAIL_GAP}
					spotlightId={`nouveau-rail-${id}-${index}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderParentCollectionCard}
				/>
			));
		}

		if (id === SECTION_COLLECTION) {
			// The collection keeps the order the server gave it. Only the playable run below it is
			// sorted, which is the one that gets watched through.
			return (
				<>
					<NouveauRail
						title={$L('Collection')}
						items={collectionItems}
						gap={TV_RAIL_GAP}
						spotlightId={`nouveau-rail-${id}`}
						navbarPosition={settings.navbarPosition}
						onNavigateUp={handleNavigateUp}
						onNavigateDown={handleNavigateDown}
						renderItem={renderCollectionCard}
						itemMenu={collectionMenu}
					/>
					{playlistItems.length > 0 && (
						<>
							<div className={sectionsCss.railHeader}>
								<h2 className={sectionsCss.railTitle}>{$L('Playlist')}</h2>
								<SpottableDiv className={sectionsCss.sortButton} onClick={openSort}>
									{sortLabel(sortOption)}
								</SpottableDiv>
							</div>
							<NouveauRail
								items={playlistItems}
								gap={TV_RAIL_GAP}
								spotlightId={`nouveau-rail-${id}-playlist`}
								navbarPosition={settings.navbarPosition}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								onNearEnd={loadMoreCollectionItems}
								renderItem={renderPlaylistCard}
								itemMenu={collectionMenu}
							/>
						</>
					)}
				</>
			);
		}

		if (id === SECTION_EPISODES) {
			// A season is only committed when it is chosen, since following focus along the
			// selector would swap the rail out from under every press.
			return (
				<>
					{isSeries && seasonNumbers.length > 1 && (
						<DetailsTabBar
							tabs={seasonTabs}
							activeId={String(activeSeason)}
							expanded={false}
							onActivate={onSeasonActivate}
							spotlightId="nouveau-season-selector"
							className={css.seasonBar}
						/>
					)}
					<NouveauRail
						title={isSeries ? null : $L('Episodes')}
						items={seasonEpisodes}
						gap={TV_RAIL_GAP}
						spotlightId={`nouveau-rail-${id}`}
						navbarPosition={settings.navbarPosition}
						onNavigateUp={handleNavigateUp}
						onNavigateDown={handleNavigateDown}
						renderItem={renderEpisode}
						itemMenu
					/>
				</>
			);
		}

		if (id === SECTION_DISCOVERY) {
			// Two rails under one heading, so what the library already holds stays ahead of what
			// Seerr merely knows about.
			return (
				<>
					<NouveauRail
						title={$L('Similar')}
						items={discovery.related}
						gap={RAIL_GAP}
						spotlightId={`nouveau-rail-${id}-similar`}
						navbarPosition={settings.navbarPosition}
						onNavigateUp={handleNavigateUp}
						onNavigateDown={handleNavigateDown}
						renderItem={renderPosterCard}
						itemMenu
					/>
					<NouveauRail
						title={$L('Recommendations')}
						items={discovery.recommendations}
						gap={RAIL_GAP}
						spotlightId={`nouveau-rail-${id}-recommendations`}
						navbarPosition={settings.navbarPosition}
						onNavigateUp={handleNavigateUp}
						onNavigateDown={handleNavigateDown}
						renderItem={renderPosterCard}
					/>
				</>
			);
		}

		if (id === SECTION_REVIEWS) {
			return (
				<NouveauRail
					title={$L('Reviews')}
					items={reviews}
					gap={RAIL_GAP}
					spotlightId={`nouveau-rail-${id}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderReview}
				/>
			);
		}

		if (id === SECTION_PEOPLE) {
			// Named for what it actually holds, since an item can arrive with only one of the two.
			const title = cast.length && crew.length ? $L('Cast & Crew')
				: cast.length ? $L('Cast') : $L('Crew');
			return (
				<NouveauRail
					title={title}
					items={people}
					gap={TV_RAIL_GAP}
					spotlightId={`nouveau-rail-${id}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderPerson}
				/>
			);
		}

		const personRail = personRails.find((rail) => rail.id === id);
		if (personRail) {
			return (
				<NouveauRail
					title={personRail.title}
					items={personRail.items}
					gap={RAIL_GAP}
					spotlightId={`nouveau-rail-${id}`}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={handleNavigateUp}
					onNavigateDown={handleNavigateDown}
					renderItem={renderPosterCard}
					itemMenu
				/>
			);
		}

		return null;
	};

	function renderCollectionCard (entry) {
		return (
			<NouveauPosterCard
				imageUrl={spotlightItemImageUrl(effectiveServerUrl, entry)}
				title={entry.Name}
				subtitle={collectionSubtitle(entry)}
				width={collectionWidth}
				height={collectionHeight}
				selectKey={entry.Id}
				onSelect={onCollectionCard}
			/>
		);
	}

	function renderParentCollectionCard (entry) {
		return (
			<NouveauPosterCard
				imageUrl={spotlightItemImageUrl(effectiveServerUrl, entry)}
				title={entry.Name}
				subtitle={collectionSubtitle(entry)}
				width={collectionWidth}
				height={collectionHeight}
				selectKey={entry.Id}
				onSelect={onParentCollectionCard}
			/>
		);
	}

	function renderPlaylistCard (entry) {
		const played = entry.UserData?.PlayedPercentage;
		return (
			<NouveauLandscapeCard
				imageUrl={nouveauCardImageUrl(effectiveServerUrl, entry, {fallbackUrl: backdropUrl})}
				title={entry.Name}
				overview={entry.Overview}
				width={episodeWidth}
				imageHeight={episodeImage}
				progress={played ? played / 100 : 0}
				selectKey={entry.Id}
				onArtworkSelect={onPlaylistArtwork}
				onDetailsSelect={onPlaylistDetails}
			/>
		);
	}

	function renderEpisode (episode) {
		const played = episode.UserData?.PlayedPercentage;
		return (
			<NouveauLandscapeCard
				imageUrl={nouveauCardImageUrl(effectiveServerUrl, episode, {fallbackUrl: backdropUrl})}
				title={episode.Name}
				overview={episode.Overview}
				width={episodeWidth}
				imageHeight={episodeImage}
				isNextUp={Boolean(nextUpId) && episode.Id === nextUpId}
				progress={played ? played / 100 : 0}
				selectKey={episode.Id}
				onArtworkSelect={onEpisodeArtwork}
				onDetailsSelect={onEpisodeDetails}
			/>
		);
	}

	function renderPosterCard (entry) {
		return (
			<NouveauPosterCard
				imageUrl={spotlightItemImageUrl(effectiveServerUrl, entry)}
				title={entry.Name}
				subtitle={entry.Subtitle || (entry.ProductionYear ? String(entry.ProductionYear) : null)}
				width={posterWidth}
				height={posterHeight}
				selectKey={entry.Id}
				onSelect={onPosterCard}
			/>
		);
	}

	function renderPerson (person) {
		return (
			<NouveauPeopleCard
				name={person.Name}
				// Several jobs arrive stacked on separate lines, which a single line card reads as
				// one run-on word.
				role={String(person.Role || '').split('\n').filter(Boolean).join(', ')}
				imageUrl={castPhotoUrl(person, effectiveServerUrl, 360)}
				width={personWidth}
				avatarSize={personAvatar}
				selectKey={person.Id || person.Name}
				onSelect={onPersonCard}
			/>
		);
	}

	function renderReview (review) {
		return <ReviewCard review={review} onSelect={onSelectReview} />;
	}

	function renderChapter (chapter) {
		return (
			<NouveauRailCard
				imageUrl={chapter.imageUrl}
				title={chapter.name}
				placeholderLabel={chapter.raw || chapter.name}
				width={railWidth}
				artworkHeight={railArtwork}
				selectKey={chapter.ticks}
				onSelect={onChapterCard}
			/>
		);
	}

	function renderExtra (extra) {
		return (
			<NouveauRailCard
				imageUrl={nouveauCardImageUrl(effectiveServerUrl, extra, {fallbackUrl: backdropUrl})}
				title={extra.Name}
				subtitle={extraSubtitle(extra)}
				placeholderLabel={extra.Name}
				width={railWidth}
				artworkHeight={railArtwork}
				selectKey={extra.Id}
				onSelect={onExtraCard}
			/>
		);
	}

	return (
		<>
			<div
				className={`${css.backdrop} ${isPerson ? css.backdropPerson : ''}`}
				style={backdropStyle}
			>
				{backdropUrl && <img className={css.backdropImage} src={backdropUrl} alt="" />}
				<div className={css.scrim} style={scrimStyle(SCRIM, backdropStyle['--gradient-scale'])} />
			</div>
			<div ref={scrollerRef} className={css.scroller}>
				<div className={`${css.content} ${topBar ? '' : css.sidebarOffset}`}>
					<div className={css.hero} style={topBar ? HERO_UNDER_TOP_BAR : undefined}>
						<NouveauHero
							{...props}
							menuBackRef={menuBackRef}
							onOpenPersonDisplay={isPerson ? openPersonDisplay : null}
							onNavigateUp={handleNavigateUp}
							onNavigateDown={handleNavigateDown}
						/>
					</div>
					{sections.map((id, index) => (
						<div
							key={id}
							className={`${css.section} ${id === SECTION_DETAILS ? css.sectionDetails : ''}`}
							data-rail-index={index}
							data-rail-id={id}
						>
							{renderSection(id)}
						</div>
					))}
				</div>
			</div>
			{sortOpen && (
				<NouveauSortDialog
					options={sortOptions}
					active={sortOption}
					onSelect={chooseSort}
					onClose={closeSort}
				/>
			)}
			{displayOpen && <PersonDisplayDialog onClose={closePersonDisplay} />}
		</>
	);
};

export default NouveauDetailContent;
