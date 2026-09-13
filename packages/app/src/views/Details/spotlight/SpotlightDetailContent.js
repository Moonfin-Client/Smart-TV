import {useState, useMemo, useCallback, useEffect, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {isMdblistEnabled} from '../../../services/mdblistApi';

import RatingsRow from '../../../components/RatingsRow';
import {SeerrStatusBadge, SeerrDownloadBars} from '../../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrCollectionBanner, hasSeerrChips} from '../../../components/seerr/SeerrSections';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {iconViewBox} from '../../../components/icons/iconViewBox';
import {hidesMediaDescription} from '../detailsMedia';
import {hasMediaFacts} from '../../../utils/seerrMediaFacts';
import {useSeerr} from '../../../context/SeerrContext';
import ExpandableOverview from '../ExpandableOverview';
import ModernActionButtons from '../ModernActionButtons';
import {KEYS} from '../../../utils/keys';
import {spotlightCardsFor, spotlightCardFor} from './spotlightCards';
import {studioCardsFor, studioLogoIndex} from '../studioLogos';
import {loadSeerrPersonCredits} from '../seerrPersonCredits';
import {spotlightMetaPieces} from './spotlightMeta';
import {summaryCardHeight, summaryCardWidth, heroWidth} from './summaryCardLayout';
import SpotlightSummaryCard from './SpotlightSummaryCard';
import SpotlightSectionModal from './SpotlightSectionModal';

import css from './SpotlightDetailContent.module.less';

const BandContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const cardSpotlightId = (id) => `spotlight-card-${id}`;

// Shared so an item with no credits does not hand the memo a new array each render.
const EMPTY_LIST = [];

const SpotlightDetailContent = (props) => {
	const {
		item, settings, effectiveServerUrl, seerr, seerrNav, seerrOnly,
		isPerson, isEpisode, backdropUrl, posterUrl, logoUrl, onLogoError,
		year, officialRating, seasonCount, genres = [], tagline, techBadges = [], techSize,
		overviewBackRef, episodes = [], birthDate, birthPlace,
		effectiveApi, serverToken, seasons = [], similar = [], similarSource, extras = [], cast = [], crew = [],
		nextUp = [], collectionItems = [], missingCollectionItems = [], parentCollections = [],
		albumTracks = [], artistAlbums = [], playlistItems = [], personMovies = [], personSeries = [],
		filmography, loadMoreCollectionItems,
		onSelectItem, onSelectPerson, onSelectStudio, onSelectSeerrCard,
		handleChapterSelect, handleExtraSelect, handleTrackPlay,
		onReorderPlaylistItem, onRemovePlaylistItem, canManagePlaylist, spotlightBackRef
	} = props;

	const {isEnabled: seerrEnabled} = useSeerr();
	const [openCardId, setOpenCardId] = useState(null);
	const [tmdbCompanies, setTmdbCompanies] = useState(null);
	const [seerrCredits, setSeerrCredits] = useState({appearances: [], crewCredits: []});
	const [viewport, setViewport] = useState(() => ({
		width: typeof window === 'undefined' ? 1920 : window.innerWidth,
		height: typeof window === 'undefined' ? 1080 : window.innerHeight
	}));

	useEffect(() => {
		const onResize = () => setViewport({width: window.innerWidth, height: window.innerHeight});
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	// Blur and opacity share one stored value, and the stored range reaches 40 while this scale
	// stops at 25, so anything above 25 is held at full rather than blacking the backdrop out.
	const blurAmount = Number(settings.backdropBlurDetail ?? 20);
	const opacityFactor = Math.min(1, blurAmount / 25);
	const backdropStyle = {
		'--opacity-alpha': opacityFactor * (isPerson ? 0.40 : 0.80),
		'--gradient-scale': 0.3 + 0.7 * opacityFactor
	};

	// Studio logos come from the plugin TMDB proxy, which caches them server side using its own
	// key, so the client only needs the plugin to be switched on.
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		if (!settings.useMoonfinPlugin || !tmdbId || !item.Studios?.length || !effectiveApi?.getStudioCompanies) {
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
	}, [item.Id, item.ProviderIds, item.Studios, item.Type, settings.useMoonfinPlugin, effectiveApi]);

	// Seerr is an extra on a person page, so a failure leaves the card with the library lists.
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		setSeerrCredits({appearances: [], crewCredits: []});
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
		() => studioCardsFor(item.Studios, studioLogoIndex(tmdbCompanies, effectiveServerUrl, serverToken)),
		[item.Studios, tmdbCompanies, effectiveServerUrl, serverToken]
	);

	// A person's filmography is rebuilt on every render, so the list itself is what the memo
	// below watches rather than the object holding it.
	const otherCredits = filmography?.guestAppearances || EMPTY_LIST;

	const cardState = useMemo(() => ({
		item, serverUrl: effectiveServerUrl, settings, seerrOnly,
		seasons, episodes, similar, similarSource, extras, cast, crew, nextUp,
		seriesEpisodes: episodes,
		collectionItems, missingCollectionItems, parentCollections,
		albumTracks, artistAlbums, playlistItems,
		personMovies, personSeries, filmography: otherCredits,
		seerrAppearances: seerrCredits.appearances, seerrCrewCredits: seerrCredits.crewCredits,
		studioCards, canManagePlaylist,
		seerr: {
			recommendations: seerr.recommendationCards || [],
			similar: seerr.similarCards || [],
			hasChips: hasSeerrChips(seerr.details),
			hasFacts: hasMediaFacts(seerr.details, seerr.mediaType)
		},
		fallbackImageUrl: backdropUrl
	}), [
		item, effectiveServerUrl, settings, seerrOnly, seasons, episodes, similar, similarSource,
		extras, cast, crew, nextUp, collectionItems, missingCollectionItems, parentCollections,
		albumTracks, artistAlbums, playlistItems, personMovies, personSeries, otherCredits,
		seerrCredits, studioCards, canManagePlaylist, backdropUrl,
		seerr.recommendationCards, seerr.similarCards, seerr.details, seerr.mediaType
	]);

	const cardActions = useMemo(() => ({
		openItem: onSelectItem,
		openSeerrItem: onSelectSeerrCard,
		openPerson: onSelectPerson,
		openStudio: onSelectStudio,
		playFromChapter: handleChapterSelect,
		playExtra: handleExtraSelect,
		playTrack: handleTrackPlay,
		reorderTrack: onReorderPlaylistItem,
		removeTrack: onRemovePlaylistItem,
		loadMoreCollectionItems
	}), [
		onSelectItem, onSelectSeerrCard, onSelectPerson, onSelectStudio, handleChapterSelect,
		handleExtraSelect, handleTrackPlay, onReorderPlaylistItem, onRemovePlaylistItem,
		loadMoreCollectionItems
	]);

	const cards = useMemo(() => spotlightCardsFor(cardState), [cardState]);

	// The open card is re-derived as the view data fills in, so a card opened before its Seerr
	// lookup landed gains those rows while it is still on screen.
	const openCard = useMemo(
		() => (openCardId ? spotlightCardFor(openCardId, cardState) : null),
		[openCardId, cardState]
	);

	const metaPieces = useMemo(
		() => spotlightMetaPieces({item, year, officialRating, seasonCount, episodeCount: episodes.length, genres}),
		[item, year, officialRating, seasonCount, episodes.length, genres]
	);

	const bandWidth = heroWidth(viewport.width);
	const cardHeight = summaryCardHeight(viewport.height);
	const cardWidth = summaryCardWidth(bandWidth, cards.length, cardHeight);

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
		if (Spotlight.focus('details-primary-btn')) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, []);

	const hasTech = Boolean(techSize) || techBadges.length > 0;
	const hideMediaDescription = hidesMediaDescription(item, settings);

	const heroTitle = () => {
		if (isEpisode) {
			return (
				<>
					{logoUrl
						? <img className={`${css.logo} ${css.logoEpisode}`} src={logoUrl} alt={item.SeriesName} onError={onLogoError} />
						: item.SeriesName && <div className={css.seriesLabel}>{item.SeriesName}</div>}
					<h1 className={css.title}>{item.Name}</h1>
				</>
			);
		}
		if (logoUrl && !isPerson) {
			return <img className={css.logo} src={logoUrl} alt={item.Name} onError={onLogoError} />;
		}
		return <h1 className={css.title}>{item.Name}</h1>;
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
			</div>
			<div className={`${css.page} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`}>
				<div className={css.hero} style={{width: `${bandWidth}px`}}>
					{isPerson && posterUrl && <img className={css.personAvatar} src={posterUrl} alt="" />}
					{tagline && !isPerson && <div className={css.tagline}>{tagline}</div>}
					{heroTitle()}
					{isPerson && personBorn()}
					{(metaPieces.length > 0 || seerr.statusPills?.length > 0) && (
						<div className={css.metaRow}>
							{metaPieces.map((piece, i) => (
								<span key={i} className={css.metaItem}>
									{piece.kind === 'runtime' && <svg className={css.metaIcon} viewBox={iconViewBox(DETAIL_ICON_PATHS.schedule)} fill="currentColor" aria-hidden="true"><path d={DETAIL_ICON_PATHS.schedule} /></svg>}
									{piece.kind === 'status'
										? <span className={`${css.statusBadge} ${piece.ended ? css.statusEnded : ''}`}>{piece.text}</span>
										: piece.text}
								</span>
							))}
							<SeerrStatusBadge seerr={seerr} className={css.metaBadge} />
						</div>
					)}
					{hasTech && !isPerson && (
						<div className={css.techRow}>
							{techSize && <span className={css.techSize}>{techSize}</span>}
							{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
						</div>
					)}
					{!isPerson && <RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />}
					{/* A Seerr only title has a sparse page otherwise, so its Seerr facts render inline. */}
					{seerrOnly && <SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />}
					{seerrOnly && <SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />}
					{!hideMediaDescription && item.Overview && (
						<ExpandableOverview text={item.Overview} itemId={item.Id} className={css.descriptionSlot} backRef={overviewBackRef} />
					)}
					{!isPerson && (
						<ModernActionButtons
							{...props}
							hasTech={hasTech}
							maxVisibleButtons={5}
							overflowAsMenu
							downTarget={cards.length ? cardSpotlightId(cards[0].id) : null}
							menuBackRef={menuBackRef}
						/>
					)}
					<SeerrDownloadBars seerr={seerr} />
					{seerr.collection && <SeerrCollectionBanner collection={seerr.collection} onOpen={seerrNav?.onSelectItem} />}
				</div>
				{cards.length > 0 && (
					<BandContainer className={css.cardBand} style={{width: `${bandWidth}px`}} onKeyDown={handleBandKeyDown}>
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
				)}
			</div>
			<SpotlightSectionModal
				card={openCard}
				serverUrl={effectiveServerUrl}
				actions={cardActions}
				seerr={{details: seerr.details, mediaType: seerr.mediaType, nav: seerrNav}}
				onNearEnd={openCardId === 'boxset_items' ? cardActions.loadMoreCollectionItems : null}
			/>
		</>
	);
};

export default SpotlightDetailContent;
