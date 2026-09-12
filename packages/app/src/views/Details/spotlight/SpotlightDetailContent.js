import {useState, useMemo, useCallback, useEffect, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {isMdblistEnabled} from '../../../services/mdblistApi';

import RatingsRow from '../../../components/RatingsRow';
import {SeerrStatusBadge, SeerrDownloadBars} from '../../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrCollectionBanner} from '../../../components/seerr/SeerrSections';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {iconViewBox} from '../../../components/icons/iconViewBox';
import {hidesMediaDescription} from '../detailsMedia';
import ExpandableOverview from '../ExpandableOverview';
import DetailActionButtons from '../DetailActionButtons';
import {KEYS} from '../../../utils/keys';
import {spotlightCardsFor, spotlightCardFor} from './spotlightCards';
import {spotlightMetaPieces} from './spotlightMeta';
import {summaryCardHeight, summaryCardWidth, heroWidth} from './summaryCardLayout';
import SpotlightSummaryCard from './SpotlightSummaryCard';
import SpotlightSectionModal from './SpotlightSectionModal';

import css from './SpotlightDetailContent.module.less';

const BandContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const cardSpotlightId = (id) => `spotlight-card-${id}`;

const SpotlightDetailContent = (props) => {
	const {
		item, settings, effectiveServerUrl, seerr, seerrNav, seerrOnly,
		isPerson, isEpisode, backdropUrl, posterUrl, logoUrl, onLogoError,
		year, officialRating, seasonCount, genres = [], tagline, techBadges = [], techSize,
		overviewBackRef, episodes = [], birthDate, birthPlace,
		cardState, cardActions, onToggleNavbar
	} = props;

	const [openCardId, setOpenCardId] = useState(null);
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

	// The navbar steps aside while the band has focus, since the cards sit where it would be.
	const navbarHiddenRef = useRef(false);
	const setNavbarHidden = useCallback((hidden) => {
		if (navbarHiddenRef.current === hidden) return;
		navbarHiddenRef.current = hidden;
		onToggleNavbar?.(!hidden);
	}, [onToggleNavbar]);

	const handleBandFocus = useCallback(() => setNavbarHidden(true), [setNavbarHidden]);
	const handleBandBlur = useCallback((ev) => {
		if (!ev.currentTarget.contains(ev.relatedTarget)) setNavbarHidden(false);
	}, [setNavbarHidden]);

	useEffect(() => () => setNavbarHidden(false), [setNavbarHidden]);

	// Up out of the band goes back to the action row, which 5-way does not reach on its own
	// because the hero above is much wider than the card under the remote.
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
					{!isPerson && <DetailActionButtons {...props} maxVisibleButtons={5} overflowAsMenu />}
					<SeerrDownloadBars seerr={seerr} />
					{seerr.collection && <SeerrCollectionBanner collection={seerr.collection} onOpen={seerrNav?.onSelectItem} />}
				</div>
				{cards.length > 0 && (
					<BandContainer
						className={css.cardBand}
						style={{width: `${bandWidth}px`}}
						onFocus={handleBandFocus}
						onBlur={handleBandBlur}
						onKeyDown={handleBandKeyDown}
					>
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
				onClose={handleCloseModal}
				onNearEnd={openCardId === 'boxset_items' ? cardActions.loadMoreCollectionItems : null}
			/>
		</>
	);
};

export default SpotlightDetailContent;
