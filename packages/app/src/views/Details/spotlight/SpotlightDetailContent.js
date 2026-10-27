import {useState, useMemo, useCallback, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {isMdblistEnabled} from '../../../services/mdblistApi';

import RatingsRow from '../../../components/RatingsRow';
import {SeerrStatusBadge, SeerrDownloadBars} from '../../../components/seerr/SeerrStatusBadge';
import {seerrChipCount} from '../../../components/seerr/SeerrSections';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {iconViewBox} from '../../../components/icons/iconViewBox';
import {hidesMediaDescription} from '../detailsMedia';
import {buildMediaFacts} from '../../../utils/seerrMediaFacts';
import {useSeerr} from '../../../context/SeerrContext';
import ExpandableOverview from '../ExpandableOverview';
import ModernActionButtons from '../ModernActionButtons';
import {KEYS} from '../../../utils/keys';
import {spotlightCardsFor, spotlightCardFor} from './spotlightCards';
import {studioCardsFor, studioLogoIndex} from '../studioLogos';
import {loadSeerrPersonCredits, seerrPersonCards} from '../seerrPersonCredits';
import {spotlightMetaPieces} from './spotlightMeta';
import {spotlightCardFallbackUrl} from './spotlightImages';
import {fetchUpcomingEpisode, formatUpcomingEpisode} from '../../../utils/upcomingEpisode';
import {keepFocusInView} from '../../../utils/focusScroll';
import {summaryCardHeight, summaryCardWidth, heroWidth} from './summaryCardLayout';
import SpotlightSummaryCard from './SpotlightSummaryCard';
import SpotlightSectionModal from './SpotlightSectionModal';
import {scrimStyle} from '../../../utils/scrimImage';

import useCollectionSort from '../useCollectionSort';
import {sortLabel} from '../nouveau/nouveauCollectionSort';
import NouveauSortDialog from '../nouveau/sections/NouveauSortDialog';
import css from './SpotlightDetailContent.module.less';

const BandContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const cardSpotlightId = (id) => `spotlight-card-${id}`;

// Same stops as .scrim in the stylesheet.
const SCRIM = [
	{to: 'right', rgb: '11, 13, 16', stops: [[0, 1], [0.35, 0.9], [0.6, 0.45], [0.85, 0]]},
	{to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.45, 0.8], [0.8, 0]]},
	{at: [0.5, 0.5], rgb: '11, 13, 16', stops: [[0.7, 0], [1, 0.32]]}
];

// Shared so an item with no credits does not hand the memo a new array each render.
const EMPTY_LIST = [];
const NO_SEERR_CREDITS = {cast: [], crew: []};

const SpotlightDetailContent = (props) => {
	const {
		item, settings, showsSection, effectiveServerUrl, seerr, seerrNav, seerrOnly,
		isPerson, isEpisode, isSeries, isSeason, backdropUrl, posterUrl, logoUrl, onLogoError,
		year, officialRating, seasonCount, genres = [], tagline, techBadges = [], techSize,
		overviewBackRef, episodes = [], seriesEpisodes = [], birthDate, birthPlace,
		effectiveApi, serverToken, seasons = [], similar = [], similarSource, reviews = [], onSelectReview, extras = [], cast = [], crew = [],
		nextUp = [], collectionItems = [], missingCollectionItems = [], parentCollections = [],
		albumTracks = [], artistAlbums = [], playlistItems = [], personMovies = [], personSeries = [],
		filmography, loadMoreCollectionItems, collectionMenu, collectionOrder,
		mediaSource, hasMultipleVersions, selectedAudioIndex, selectedSubtitleIndex,
		onSelectItem, onSelectPerson, onSelectStudio, onSelectSeerrCard,
		handleChapterSelect, handleExtraSelect, playTrack, playlistMenu,
		onReorderPlaylistItem, onRemovePlaylistItem, canManagePlaylist, spotlightBackRef
	} = props;

	const {isEnabled: seerrEnabled} = useSeerr();
	const [openCardId, setOpenCardId] = useState(null);
	const [tmdbCompanies, setTmdbCompanies] = useState(null);
	const [seerrCredits, setSeerrCredits] = useState(NO_SEERR_CREDITS);
	const [viewport, setViewport] = useState(() => ({
		width: typeof window === 'undefined' ? 1920 : window.innerWidth,
		height: typeof window === 'undefined' ? 1080 : window.innerHeight
	}));

	useEffect(() => {
		const onResize = () => setViewport({width: window.innerWidth, height: window.innerHeight});
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	const backdropStyle = useMemo(() => {
		const blurAmount = Number(settings.backdropBlurDetail ?? 20);
		const opacityFactor = Math.min(1, blurAmount / 25);
		const maxAlpha = isPerson ? 0.40 : 0.80;
		return {
			'--opacity-alpha': opacityFactor * maxAlpha,
			'--gradient-scale': 0.3 + 0.7 * opacityFactor
		};
	}, [isPerson, settings.backdropBlurDetail]);

	// Studio logos come from the plugin TMDB proxy, which caches them server side using its own
	// key, so the client only needs the plugin to be switched on.
	const studios = showsSection('studios') ? item.Studios : undefined;
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		if (!settings.useMoonfinPlugin || !tmdbId || !studios?.length || !effectiveApi?.getStudioCompanies) {
			setTmdbCompanies(null);
			return undefined;
		}
		effectiveApi.getStudioCompanies(tmdbId, item.Type === 'Series' ? 'tv' : 'movie')
			.then((res) => {
				if (!cancelled && res?.success && Array.isArray(res.companies)) setTmdbCompanies(res.companies);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item.Id, item.ProviderIds, studios, item.Type, settings.useMoonfinPlugin, effectiveApi]);

	// Seerr is an extra on a person page, so a failure leaves the card with the library lists.
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		setSeerrCredits(NO_SEERR_CREDITS);
		if (!isPerson || !tmdbId || !seerrEnabled) return undefined;
		loadSeerrPersonCredits(tmdbId)
			.then((credits) => {
				if (!cancelled) setSeerrCredits(credits);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item.Id, item.ProviderIds, isPerson, seerrEnabled]);

	const studioCards = useMemo(
		() => studioCardsFor(studios, studioLogoIndex(tmdbCompanies, effectiveServerUrl, serverToken)),
		[studios, tmdbCompanies, effectiveServerUrl, serverToken]
	);

	// A person's filmography is rebuilt on every render, so the list itself is what the memo
	// below watches rather than the object holding it.
	const otherCredits = filmography?.guestAppearances || EMPTY_LIST;
	const {seerrAppearances, seerrCrewCredits} = useMemo(() => ({
		seerrAppearances: seerrPersonCards(seerrCredits.cast, false, settings),
		seerrCrewCredits: seerrPersonCards(seerrCredits.crew, true, settings)
	}), [seerrCredits, settings]);
	// A collection's play order sorts the same way it does in Modern and Nouveau.
	const isBoxSet = item.Type === 'BoxSet';
	const collectionSort = useCollectionSort(collectionOrder);
	const {openSort: openCollectionSort, sortOption: collectionSortOption} = collectionSort;
	const collectionLoading = Boolean(collectionOrder?.loading);
	const playlistSort = useMemo(() => (isBoxSet ? {
		label: sortLabel(collectionSortOption),
		open: openCollectionSort,
		loading: collectionLoading
	} : null), [isBoxSet, collectionSortOption, openCollectionSort, collectionLoading]);

	const cardFallbackImageUrl = useMemo(
		() => spotlightCardFallbackUrl(effectiveServerUrl, item, backdropUrl),
		[effectiveServerUrl, item, backdropUrl]
	);

	const cardState = useMemo(() => ({
		item, serverUrl: effectiveServerUrl, settings, showsSection, seerrOnly, mediaSource,
		seasons, episodes, seriesEpisodes, similar, similarSource, reviews, extras, cast, crew, nextUp,
		collectionItems, missingCollectionItems, parentCollections,
		albumTracks, artistAlbums, playlistItems, playlistSort,
		personMovies, personSeries, filmography: otherCredits,
		seerrAppearances, seerrCrewCredits,
		studioCards, canManagePlaylist,
		seerr: {
			details: seerr.details,
			recommendations: seerr.recommendationCards || [],
			similar: seerr.similarCards || [],
			chipCount: seerr.pieces.chips ? seerrChipCount(seerr.details) : 0,
			factCount: seerr.pieces.facts ? buildMediaFacts(seerr.details, seerr.mediaType).length : 0,
			streamingCount: seerr.pieces.streaming ? seerr.streamingProviders.length : 0,
			collection: seerr.collection,
			seasonMarkers: settings.showSeerrAvailabilityBadges !== false ? seerr.seasonMarkers : null
		},
		fallbackImageUrl: cardFallbackImageUrl
	}), [
		item, effectiveServerUrl, settings, showsSection, seerrOnly, mediaSource, seasons, episodes, seriesEpisodes, similar, similarSource, reviews,
		extras, cast, crew, nextUp, collectionItems, missingCollectionItems, parentCollections,
		albumTracks, artistAlbums, playlistItems, playlistSort, personMovies, personSeries, otherCredits,
		seerrAppearances, seerrCrewCredits, studioCards, canManagePlaylist, cardFallbackImageUrl,
		seerr.recommendationCards, seerr.similarCards, seerr.details, seerr.mediaType, seerr.collection, seerr.seasonMarkers,
		seerr.pieces.chips, seerr.pieces.facts, seerr.pieces.streaming, seerr.streamingProviders
	]);

	const cardActions = useMemo(() => ({
		openItem: onSelectItem,
		openSeerrItem: onSelectSeerrCard,
		openPerson: onSelectPerson,
		openStudio: onSelectStudio,
		openReview: onSelectReview,
		playFromChapter: handleChapterSelect,
		playExtra: handleExtraSelect,
		playTrack,
		playlistMenu,
		reorderTrack: onReorderPlaylistItem,
		removeTrack: onRemovePlaylistItem,
		loadMoreCollectionItems,
		collectionMenu,
		effectiveApi,
		settings,
		selectedAudioIndex,
		selectedSubtitleIndex
	}), [
		onSelectItem, onSelectSeerrCard, onSelectPerson, onSelectStudio, onSelectReview, handleChapterSelect,
		handleExtraSelect, playTrack, playlistMenu, onReorderPlaylistItem, onRemovePlaylistItem,
		loadMoreCollectionItems, collectionMenu,
		effectiveApi, settings, selectedAudioIndex, selectedSubtitleIndex
	]);

	const cards = useMemo(() => spotlightCardsFor(cardState), [cardState]);

	// The open card is re-derived as the view data fills in, so a card opened before its Seerr
	// lookup landed gains those rows while it is still on screen.
	const openCard = useMemo(
		() => (openCardId ? spotlightCardFor(openCardId, cardState) : null),
		[openCardId, cardState]
	);

	const [upcomingEpisode, setUpcomingEpisode] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!isSeries && !isSeason) {
			setUpcomingEpisode(null);
			return undefined;
		}
		fetchUpcomingEpisode({item, settings, serverUrl: effectiveServerUrl, serverToken})
			.then((res) => {
				if (!cancelled) setUpcomingEpisode(res);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item, isSeries, isSeason, settings, effectiveServerUrl, serverToken]);

	const upcomingEpisodeText = useMemo(() => formatUpcomingEpisode(upcomingEpisode), [upcomingEpisode]);

	const metaPieces = useMemo(
		() => spotlightMetaPieces({
			item,
			year,
			officialRating,
			seasonCount,
			// ChildCount stands in until the episode fetch lands, and stays if it never does.
			episodeCount: episodes.length || item.ChildCount || 0,
			genres,
			upcomingEpisodeText,
			hasSeerrPills: seerr.statusPills?.length > 0,
			settings
		}),
		[item, year, officialRating, seasonCount, episodes.length, genres, upcomingEpisodeText, seerr.statusPills, settings]
	);

	const heroColumnWidth = heroWidth(viewport.width);
	const cardHeight = summaryCardHeight(viewport.height);
	const cardWidth = summaryCardWidth(cardHeight);

	const handleOpenCard = useCallback((card) => setOpenCardId(card.id), []);

	const handleCloseModal = useCallback(() => {
		const id = openCardId;
		setOpenCardId(null);
		if (id) {
			// Back lands on the card that opened the modal rather than wherever the grid left
			// the remote.
			setTimeout(() => Spotlight.focus(cardSpotlightId(id)), 50);
		}
	}, [openCardId]);

	// Up out of the band goes back to the action row, which 5-way does not reach on its own
	// because the hero above is much wider than the card under the remote.
	// App closes the screen on BACK unless something here says it took the press, so the open
	// menu and then the open card each get their say first, innermost one winning.
	const menuBackRef = useRef(null);
	useEffect(() => {
		if (!spotlightBackRef) return undefined;
		spotlightBackRef.current = () => {
			if (menuBackRef.current?.()) return true;
			if (collectionSort.sortOpen) {
				collectionSort.closeSort();
				return true;
			}
			if (!openCardId) return false;
			handleCloseModal();
			return true;
		};
		return () => {
			spotlightBackRef.current = null;
		};
	});

	const handleBandKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.UP) return;
		if (Spotlight.focus('details-primary-btn') || Spotlight.focus('details-action-buttons')) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, []);

	const hasTech = Boolean(techSize) || techBadges.length > 0;
	const hideMediaDescription = hidesMediaDescription(item, settings) || (isPerson && !showsSection('biography'));

	const renderVersionBadge = () => {
		if (!hasMultipleVersions || !mediaSource) return null;
		const versionName = mediaSource.Name || $L('Default');
		return (
			<span className={css.versionBadge}>
				{`[ ${versionName} ]`}
			</span>
		);
	};

	const heroTitle = () => {
		if (isEpisode) {
			return (
				<>
					<div className={css.seriesSlot}>
						{logoUrl ? (
							<div className={css.logoRow}>
								<img className={`${css.logo} ${css.logoEpisode}`} src={logoUrl} alt={item.SeriesName} onError={onLogoError} />
								{renderVersionBadge()}
							</div>
						) : (
							item.SeriesName && (
								<div className={css.seriesLabelRow}>
									<div className={css.seriesLabel}>{item.SeriesName}</div>
									{renderVersionBadge()}
								</div>
							)
						)}
					</div>
					<h1 className={css.title}>
						{item.Name}
						{!logoUrl && !item.SeriesName && renderVersionBadge()}
					</h1>
				</>
			);
		}
		if (logoUrl && !isPerson) {
			return (
				<div className={css.logoRow}>
					<img className={css.logo} src={logoUrl} alt={item.Name} onError={onLogoError} />
					{renderVersionBadge()}
				</div>
			);
		}
		return (
			<h1 className={css.title}>
				{item.Name}
				{renderVersionBadge()}
			</h1>
		);
	};

	const personBorn = () => {
		const parts = [];
		if (birthDate) parts.push(birthDate.getFullYear());
		if (birthPlace) parts.push(birthPlace);
		return parts.length ? <div className={css.personBorn}>{parts.join(' · ')}</div> : null;
	};

	return (
		<>
			<div className={`${css.backdrop} ${isPerson ? css.backdropPerson : ''}`} style={backdropStyle}>
				{backdropUrl && <img className={css.backdropImage} src={backdropUrl} alt="" />}
				<div className={css.scrim} style={scrimStyle(SCRIM, backdropStyle['--gradient-scale'])} />
			</div>
			<div className={`${css.page} ${settings.navbarPosition === 'left' ? css.sidebarOffset : css.topbarOffset}`} onFocus={keepFocusInView}>
				<div className={css.hero} style={{width: `${heroColumnWidth}px`}}>
					{isPerson ? (
						<div className={css.personHeader}>
							{posterUrl && <img className={css.personAvatar} src={posterUrl} alt="" />}
							<div className={css.personInfo}>
								<h1 className={css.title}>{item.Name}</h1>
								{personBorn()}
							</div>
						</div>
					) : (
						<>
							{tagline && <div className={css.tagline}>{tagline}</div>}
							{heroTitle()}
						</>
					)}
					{metaPieces.length > 0 && (
						<div className={css.metaRow}>
							{metaPieces.map((piece, i) => {
								if (piece.kind === 'seerr') {
									return <SeerrStatusBadge key={i} seerr={seerr} className={css.metaBadge} />;
								}
								return (
									<span key={i} className={css.metaItem}>
										{piece.kind === 'runtime' && (
											<svg className={css.metaIcon} viewBox={iconViewBox(DETAIL_ICON_PATHS.schedule)} fill="currentColor" aria-hidden="true">
												<path d={DETAIL_ICON_PATHS.schedule} />
											</svg>
										)}
										{piece.kind === 'upcoming' && (
											<span className={`${css.statusBadge} ${css.statusUpcoming}`}>
												<svg className={css.metaIcon} viewBox={iconViewBox(DETAIL_ICON_PATHS.calendar)} fill="currentColor" aria-hidden="true">
													<path d={DETAIL_ICON_PATHS.calendar} />
												</svg>
												{piece.text}
											</span>
										)}
										{piece.kind === 'status' && (
											<span className={`${css.statusBadge} ${piece.ended ? css.statusEnded : ''}`}>{piece.text}</span>
										)}
										{piece.kind === 'text' && piece.text}
									</span>
								);
							})}
						</div>
					)}
					{hasTech && !isPerson && (
						<div className={css.techRow}>
							{techSize && <span className={css.techSize}>{techSize}</span>}
							{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
						</div>
					)}
					{!isPerson && <RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />}
					{!hideMediaDescription && item.Overview && (
						<ExpandableOverview text={item.Overview} itemId={item.Id} className={css.descriptionSlot} backRef={overviewBackRef} />
					)}
					<ModernActionButtons
						{...props}
						hasTech={hasTech}
						maxVisibleButtons={5}
						overflowAsMenu
						downTarget={cards.length ? cardSpotlightId(cards[0].id) : null}
						menuBackRef={menuBackRef}
					/>
					<SeerrDownloadBars seerr={seerr} />
				</div>
				{cards.length > 0 && (
					<div className={css.cardBandWrapper} onFocus={keepFocusInView}>
						<BandContainer className={css.cardBand} onKeyDown={handleBandKeyDown}>
							{cards.map((card) => (
								<SpotlightSummaryCard
									key={card.id}
									card={card}
									width={cardWidth}
									height={cardHeight}
									spotlightId={cardSpotlightId(card.id)}
									onOpen={handleOpenCard}
								/>
							))}
						</BandContainer>
					</div>
				)}
			</div>
			<SpotlightSectionModal
				card={openCard}
				serverUrl={effectiveServerUrl}
				actions={cardActions}
				seerr={{details: seerr.details, mediaType: seerr.mediaType, collection: seerr.collection, streaming: seerr.streamingProviders, nav: seerrNav}}
				// Paging appends to the playlist list, which is the one that arrives a page at a
				// time. The Movies and Shows grid is fetched whole, so it has nothing to ask for.
				onNearEnd={openCardId === 'playlist_order' ? cardActions.loadMoreCollectionItems : null}
			/>
			{collectionSort.sortOpen && (
				<NouveauSortDialog
					options={collectionSort.sortOptions}
					active={collectionSort.sortOption}
					onSelect={collectionSort.chooseSort}
					onClose={collectionSort.closeSort}
				/>
			)}
		</>
	);
};

export default SpotlightDetailContent;
