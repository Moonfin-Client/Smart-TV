import {useState, useMemo, useCallback, useRef, useEffect} from 'react';
import {isMdblistEnabled, isRatingSourceAllowed} from '../../services/mdblistApi';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {Scroller} from '@enact/sandstone/Scroller';

import MediaCard from '../../components/MediaCard';
import {SeerrStatusBadge, SeerrDownloadBars} from '../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrCollectionBanner} from '../../components/seerr/SeerrSections';
import RatingsRow from '../../components/RatingsRow';
import DetailsTabBar from '../../components/DetailsTabBar';
import ModernActionButtons from './ModernActionButtons';
import {getImageUrl, formatDuration} from '../../utils/helpers';
import {castPhotoUrl, hidesMediaDescription} from './detailsMedia';
import {studioCardsFor, studioLogoIndex} from './studioLogos';
import ExpandableOverview from './ExpandableOverview';
import {KEYS} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';

import css from './ModernDetailContent.module.less';

const SpottableDiv = Spottable('div');

const Icon = ({path}) => (
	<svg className={css.icon} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// Whether anything focusable sits above the active element, which is what marks
// a top row apart from the rows that can still move up on their own.
const hasSpottableAbove = (container, active) => {
	const top = active.getBoundingClientRect().top + 1;
	return Array.from(container.querySelectorAll('.spottable'))
		.some((el) => el !== active && el.getBoundingClientRect().bottom <= top);
};

const hasSpottableBelow = (container, active) => {
	const bottom = active.getBoundingClientRect().bottom - 1;
	return Array.from(container.querySelectorAll('.spottable'))
		.some((el) => el !== active && el.getBoundingClientRect().top >= bottom);
};

const ModernDetailContent = (props) => {
	const {
		item, effectiveServerUrl, effectiveApi, serverToken, settings,
		isEpisode, isSeries, isSeason, isPerson, isBoxSet, isAlbum, isMusicArtist, isPlaylist,
		backdropUrl, posterUrl, logoUrl, onLogoError,
		year, runtime, endsAt, officialRating, seasonCount, genres, tagline,
		seasons, episodes, similar, extras, cast, crew = [], nextUp, collectionItems, parentCollection = [], parentCollectionName, albumTracks, artistAlbums, playlistItems, personMovies, personSeries, birthDate, birthPlace, episodeRatings,
		techBadges = [], techSize, overviewBackRef,
		mediaSource, supportsMediaSourceSelection,
		handleChapterSelect, handleExtraSelect, handleTrackPlay,
		onSelectItem, onSelectPerson, onSelectStudio,
		seerr, seerrNav, onSelectSeerrCard,
	} = props;

	// Blur and opacity share one stored value, and the blur options reach 40 while
	// this scale stops at 25, so a setting carried over from the classic layout is
	// held at full rather than blacking the backdrop out entirely.
	const blurAmount = Number(settings.backdropBlurDetail ?? 20);
	const opacityFactor = Math.min(1, blurAmount / 25);
	const maxAlpha = isPerson ? 0.40 : 0.80;
	const alpha = opacityFactor * maxAlpha;
	const gradientScale = 0.3 + 0.7 * opacityFactor;

	const backdropStyle = {
		'--opacity-alpha': alpha,
		'--gradient-scale': gradientScale
	};

	const hasUpNext = Boolean(nextUp?.[0]);
	const hasTech = Boolean(techSize) || techBadges.length > 0;
	const hasTrailer = item.LocalTrailerCount > 0 || (item.RemoteTrailers?.length > 0) || isSeries;
	const played = item.UserData?.Played;
	const isFavorite = item.UserData?.IsFavorite;
	const hideMediaDescription = hidesMediaDescription(item, settings);

	const scrollToRef = useRef(null);
	const handleScrollTo = useCallback((fn) => {
		scrollToRef.current = fn;
	}, []);
	const initialPullDone = useRef(false);
	const handleActionsFocus = useCallback(() => {
		if (initialPullDone.current) return;
		initialPullDone.current = true;
		scrollToRef.current?.({position: {y: 0}, animate: false});
	}, []);
	const contentRef = useRef(null);
	const scrollTopRef = useRef(0);
	const handleScroll = useCallback((ev) => {
		scrollTopRef.current = ev.scrollTop;
	}, []);
	// Up from the top row scrolls back to the top first so the hero comes back
	// into view, and only hands focus to the navbar once it is already there. A
	// left docked sidebar swallows the press instead, since it is reached with
	// left rather than up.
	const handleContentKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.UP) return;
		const content = contentRef.current;
		const active = document.activeElement;
		if (!content || !active || !content.contains(active)) return;
		if (hasSpottableAbove(content, active)) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (scrollTopRef.current > 1) {
			scrollToRef.current?.({position: {y: 0}, animate: true});
			return;
		}
		if (settings.navbarPosition !== 'left') Spotlight.focus('navbar');
	}, [settings.navbarPosition]);

	const tabContentRef = useRef(null);

	// Studio logos come from the plugin TMDB proxy, which caches them server-side
	// using its own key, so the client only needs the plugin to be enabled.
	const [tmdbCompanies, setTmdbCompanies] = useState(null);
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		if (!settings.useMoonfinPlugin || !tmdbId || !item.Studios?.length || !effectiveApi?.getStudioCompanies) {
			setTmdbCompanies(null);
			return undefined;
		}
		effectiveApi.getStudioCompanies(tmdbId, isSeries ? 'tv' : 'movie')
			.then((res) => {
				if (!cancelled && res?.success && Array.isArray(res.companies)) setTmdbCompanies(res.companies);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item.Id, item.ProviderIds, item.Studios, settings.useMoonfinPlugin, isSeries, effectiveApi]);

	// Only the Jellyfin studios are listed, so selecting one matches the library filter, and
	// each borrows a TMDB logo when the names line up.
	const studioCards = useMemo(
		() => studioCardsFor(item.Studios, studioLogoIndex(tmdbCompanies, effectiveServerUrl, serverToken)),
		[tmdbCompanies, item.Studios, effectiveServerUrl, serverToken]
	);

	// Metadata pieces, joined by CSS separators rather than string concatenation.
	// A piece carries its kind so the status can render as a coloured pill and
	// the runtime can lead with a clock.
	const metaPieces = useMemo(() => {
		const pieces = [];
		const addText = (text) => {
			if (text) pieces.push({kind: 'text', text});
		};
		if (year) addText(String(year));
		addText(officialRating);
		if (isSeries && seasonCount) addText($L('{count} Seasons').replace('{count}', seasonCount));
		if (isSeason && episodes.length) addText($L('{count} Episodes').replace('{count}', episodes.length));
		if (isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null) {
			let label = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
			// The value is a score out of 10, not a percentage.
			const rating = episodeRatings?.[item.IndexNumber];
			const showEpisodeRating = settings.tmdbEpisodeRatingsEnabled && isRatingSourceAllowed(settings.mdblistRatingSources, 'tmdb');
			if (showEpisodeRating && rating) label += ` · ${rating}`;
			addText(label);
		}
		if (isSeries && item.Status === 'Continuing') pieces.push({kind: 'status', text: $L('Continuing')});
		if (isSeries && item.Status === 'Ended') pieces.push({kind: 'status', text: $L('Ended'), ended: true});
		if (runtime) pieces.push({kind: 'runtime', text: runtime});
		if (runtime && endsAt) addText(endsAt);
		if (genres.length) addText(genres.slice(0, 3).join(' · '));
		return pieces;
	}, [year, officialRating, isSeries, seasonCount, isSeason, episodes.length, isEpisode, item.ParentIndexNumber, item.IndexNumber, item.Status, episodeRatings, settings.tmdbEpisodeRatingsEnabled, settings.mdblistRatingSources, runtime, endsAt, genres]);

	const handleCastClick = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		const person = cast.find((c) => c.Id === personId) || crew.find((c) => c.Id === personId);
		if (person) onSelectPerson?.(person);
	}, [cast, crew, onSelectPerson]);

	const handleEpisodeClick = useCallback((ev) => {
		const episodeId = ev.currentTarget.dataset.episodeId;
		const episode = episodes.find((e) => e.Id === episodeId);
		if (episode) onSelectItem?.(episode);
	}, [episodes, onSelectItem]);

	const handleStudioClick = useCallback((ev) => {
		const name = ev.currentTarget.dataset.studioName;
		if (name) onSelectStudio?.(name);
	}, [onSelectStudio]);

	// Tabs are data-driven, appearing only when their data is present.
	const tabs = useMemo(() => {
		const list = [];
		if (isSeries && seasons.length) list.push({id: 'seasons', label: $L('Seasons')});
		if ((isSeason || isEpisode) && episodes.length) list.push({id: 'episodes', label: $L('Episodes')});
		if (isPerson) {
			if (personMovies.length) list.push({id: 'movies', label: $L('Movies')});
			if (personSeries.length) list.push({id: 'series', label: $L('TV Shows')});
		}
		if ((isAlbum || isPlaylist) && (albumTracks.length || playlistItems.length)) list.push({id: 'tracks', label: $L('Tracks')});
		if (isMusicArtist && artistAlbums.length) list.push({id: 'albums', label: $L('Albums')});
		if (isBoxSet && collectionItems.length) list.push({id: 'items', label: $L('Items')});
		if (cast.length) list.push({id: 'cast', label: $L('Cast')});
		if (crew.length) list.push({id: 'crew', label: $L('Crew')});
		if (item.Studios?.length) list.push({id: 'studios', label: $L('Studios')});
		if (item.Chapters?.length) list.push({id: 'chapters', label: $L('Chapters')});
		if (extras.length) list.push({id: 'extras', label: $L('Extras')});
		if (supportsMediaSourceSelection && mediaSource?.MediaStreams?.length) list.push({id: 'details', label: $L('Details')});
		if (parentCollection.length) list.push({id: 'collection', label: parentCollectionName || $L('Collection')});
		if (similar.length) list.push({id: 'similar', label: $L('More Like This')});
		if (seerr.hasTabContent) list.push({id: 'seerr', label: seerr.displayName});
		return list;
	}, [isSeries, seasons.length, isSeason, isEpisode, episodes.length, isPerson, personMovies.length, personSeries.length, isAlbum, isPlaylist, albumTracks.length, playlistItems.length, isMusicArtist, artistAlbums.length, isBoxSet, collectionItems.length, parentCollection.length, parentCollectionName, cast.length, crew.length, item.Studios, item.Chapters, extras.length, supportsMediaSourceSelection, mediaSource, similar.length, seerr.hasTabContent, seerr.displayName]);

	const [activeTab, setActiveTab] = useState(null);
	// Expanded Tabs on keeps the first tab open and lets focus follow selection.
	// Off starts collapsed and only opens the tab that gets clicked, closing it
	// again when it's clicked while open.
	const expanded = settings.detailExpandedTabs;
	// Music albums and playlists always keep their first tab open.
	const forceFirstTab = isAlbum || isPlaylist;
	const validActiveTab = activeTab && tabs.some((t) => t.id === activeTab) ? activeTab : null;
	const currentTab = validActiveTab || ((expanded || forceFirstTab) ? (tabs[0]?.id || null) : null);

	const handleTabActivate = useCallback((id) => {
		if (expanded) {
			setActiveTab(id);
			return;
		}
		setActiveTab((prev) => (prev === id ? null : id));
	}, [expanded]);

	// Leaving the hero downwards arrives at the tab bar. Left to itself Spotlight
	// picks the pill nearest the overview, which is a wide box whose middle sits well
	// past the first tab, so a collection would open on Studios rather than Items.
	// The press lands on the tab that is already open instead.
	const handleHeroKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.DOWN) return;
		const hero = ev.currentTarget;
		const active = document.activeElement;
		if (!active || !hero.contains(active) || hasSpottableBelow(hero, active)) return;
		const pill = document.querySelector(`[data-spotlight-id="details-tab-bar"] [data-id="${currentTab || tabs[0]?.id}"]`);
		if (pill && Spotlight.focus(pill)) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, [currentTab, tabs]);

	const handleTabsKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.DOWN && ev.keyCode !== KEYS.UP) return;
		const active = document.activeElement;
		const tabBar = document.querySelector('[data-spotlight-id="details-tab-bar"]');
		const content = tabContentRef.current;

		if (tabBar && tabBar.contains(active)) {
			if (ev.keyCode === KEYS.DOWN) {
				// Down opens the focused tab (it may be collapsed) then drops into
				// its content once it has rendered.
				const id = active.closest('[data-id]')?.dataset.id;
				if (id) {
					ev.preventDefault();
					ev.stopPropagation();
					setActiveTab(id);
					window.requestAnimationFrame(() => {
						const first = tabContentRef.current?.querySelector('.spottable');
						if (first) Spotlight.focus(first);
					});
				}
			} else if (Spotlight.focus('details-action-buttons')) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}

		// Up from the top row of the content returns to the tab it belongs to,
		// while lower rows keep their normal 5-way move up within the content.
		if (ev.keyCode === KEYS.UP && content && content.contains(active)) {
			const pill = tabBar?.querySelector(`[data-id="${currentTab}"]`);
			if (!hasSpottableAbove(content, active) && pill && Spotlight.focus(pill)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		}
	}, [currentTab]);

	const renderGrid = (items, cardType, onSelect = onSelectItem) => (
		<RowContainer className={css.grid}>
			{items.map((it) => (
				<MediaCard key={it.Id} item={it} serverUrl={effectiveServerUrl} cardType={cardType} onSelect={onSelect} />
			))}
		</RowContainer>
	);

	const renderEpisodesTab = () => (
		<RowContainer className={css.episodeList}>
			{episodes.map((ep) => {
				const thumb = ep.ImageTags?.Primary ? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80}) : null;
				const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
				const progress = ep.UserData?.PlayedPercentage || 0;
				const label = ep.IndexNumber != null ? `${$L('Episode')} ${ep.IndexNumber} - ${ep.Name}` : ep.Name;
				return (
					<SpottableDiv key={ep.Id} className={css.episodeRow} data-episode-id={ep.Id} onClick={handleEpisodeClick}>
						<div className={css.episodeThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbPlaceholder} />}
							{ep.UserData?.Played && <div className={css.episodeWatched}><Icon path={DETAIL_ICON_PATHS.watched} /></div>}
							{progress > 0 && <div className={css.thumbProgress}><div style={{width: `${Math.min(progress, 100)}%`}} /></div>}
						</div>
						<div className={css.episodeBody}>
							<span className={css.episodeName}>{label}</span>
							{epRuntime && <span className={css.episodeMeta}>{epRuntime}</span>}
							{ep.Overview && !hidesMediaDescription(ep, settings) && <p className={css.episodeOverview}>{ep.Overview}</p>}
						</div>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderPeople = (people) => (
		<RowContainer className={css.grid}>
			{people.map((person) => {
				const photo = castPhotoUrl(person, effectiveServerUrl, 300);
				return (
					<SpottableDiv key={person.Id} className={css.castCard} data-person-id={person.Id} onClick={handleCastClick}>
						<div className={css.castPhoto}>
							{photo ? <img src={photo} alt="" /> : <div className={css.castPhotoPlaceholder}><Icon path={DETAIL_ICON_PATHS.series} /></div>}
						</div>
						<span className={css.castName}>{person.Name}</span>
						{person.Role && <span className={css.castRole}>{person.Role}</span>}
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderChaptersTab = () => (
		<RowContainer className={css.grid}>
			{item.Chapters.map((chapter, i) => {
				const thumb = chapter.ImageTag
					? `${effectiveServerUrl}/Items/${item.Id}/Images/Chapter/${i}?maxWidth=400&tag=${chapter.ImageTag}`
					: null;
				return (
					<SpottableDiv key={i} className={css.chapterCard} data-start-ticks={chapter.StartPositionTicks} onClick={handleChapterSelect}>
						<div className={css.chapterThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbPlaceholder} />}
							<span className={css.chapterTime}>{formatDuration(chapter.StartPositionTicks)}</span>
						</div>
						<span className={css.chapterName}>{chapter.Name || `${$L('Chapter')} ${i + 1}`}</span>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderExtrasTab = () => (
		<RowContainer className={css.grid}>
			{extras.map((extra) => {
				const thumb = extra.ImageTags?.Primary
					? getImageUrl(effectiveServerUrl, extra.Id, 'Primary', {maxWidth: 400, quality: 80})
					: null;
				return (
					<SpottableDiv key={extra.Id} className={css.chapterCard} data-extra-id={extra.Id} onClick={handleExtraSelect}>
						<div className={css.chapterThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbPlaceholder} />}
						</div>
						<span className={css.chapterName}>{extra.Name}</span>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderTracksTab = () => {
		const tracks = isPlaylist ? playlistItems : albumTracks;
		return (
			<RowContainer className={css.trackList}>
				{tracks.map((track, i) => (
					<SpottableDiv key={track.Id} className={css.trackRow} data-track-id={track.Id} onClick={handleTrackPlay}>
						<span className={css.trackIndex}>{track.IndexNumber || i + 1}</span>
						<span className={css.trackTitle}>{track.Name}</span>
						{track.RunTimeTicks && <span className={css.trackDuration}>{formatDuration(track.RunTimeTicks)}</span>}
					</SpottableDiv>
				))}
			</RowContainer>
		);
	};

	const renderStudiosTab = () => (
		<RowContainer className={css.grid}>
			{studioCards.map((studio) => (
				<SpottableDiv key={studio.key} className={css.studioCard} data-studio-name={studio.name} onClick={handleStudioClick}>
					<div className={css.studioImage}>
						{studio.logo ? <img src={studio.logo} alt={studio.name} /> : <Icon path={DETAIL_ICON_PATHS.series} />}
					</div>
					<span className={css.studioName}>{studio.name}</span>
				</SpottableDiv>
			))}
		</RowContainer>
	);

	// The streams are spottable even though there is nothing to activate. Focus is
	// how the tab bar hands over and how the scroller knows where to go, so plain
	// text would leave this tab unreachable.
	const renderDetailsTab = () => {
		const streams = mediaSource?.MediaStreams || [];
		return (
			<RowContainer className={css.detailsPanel}>
				{streams.map((stream, i) => (
					<SpottableDiv key={i} className={css.detailStream}>
						<div className={css.detailStreamHeader}>{stream.Type}{stream.Language ? ` (${stream.Language})` : ''}</div>
						{stream.DisplayTitle && <div className={css.detailStreamLine}>{stream.DisplayTitle}</div>}
					</SpottableDiv>
				))}
			</RowContainer>
		);
	};

	// The season cards carry a marker for what Seerr has, or is getting, for that season.
	const renderSeasonsGrid = () => (
		<RowContainer className={css.grid}>
			{seasons.map((season) => (
				<MediaCard
					key={season.Id}
					item={season}
					serverUrl={effectiveServerUrl}
					cardType="portrait"
					onSelect={onSelectItem}
					seerrSeasonStatus={settings.showSeerrAvailabilityBadges !== false ? seerr.seasonMarkers.get(season.IndexNumber) : null}
				/>
			))}
		</RowContainer>
	);

	// Enact pulls a newly focused card up to the top of the viewport, which takes the
	// heading above it off the screen. Landing on the first row of a grid scrolls to the
	// heading instead, so the row keeps its name. The page already holds its top padding
	// clear of the navbar, so the heading is left the same room the first row gets.
	const handleSeerrRowFocus = useCallback((ev) => {
		const section = ev.currentTarget;
		const card = ev.target.closest('.spottable');
		const heading = section.firstElementChild;
		const grid = section.lastElementChild;
		const content = contentRef.current;
		if (!card || !heading || !grid || !content) return;

		window.requestAnimationFrame(() => {
			// Rows below the first are meant to scroll the heading away.
			if (card.getBoundingClientRect().top - grid.getBoundingClientRect().top > 8) return;
			const offset = heading.getBoundingClientRect().top - content.getBoundingClientRect().top;
			const clearance = parseFloat(window.getComputedStyle(content).paddingTop) || 0;
			scrollToRef.current?.({position: {y: Math.max(0, offset - clearance)}, animate: false});
		});
	}, []);

	// Everything Seerr adds to a title, in one tab: where it is filed, the production facts,
	// what it is like, and the collection it belongs to.
	const renderSeerrTab = () => (
		<div className={css.seerrTab}>
			<SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />
			<SeerrCollectionBanner collection={seerr.details?.collection} onOpen={seerrNav?.onOpenCollection} />
			<SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />
			{seerr.recommendationCards.length > 0 && (
				<div onFocus={handleSeerrRowFocus}>
					<h3 className={css.seerrHeading}>{$L('Recommendations')}</h3>
					{renderGrid(seerr.recommendationCards, 'portrait', onSelectSeerrCard)}
				</div>
			)}
			{seerr.similarCards.length > 0 && (
				<div onFocus={handleSeerrRowFocus}>
					<h3 className={css.seerrHeading}>{$L('Similar')}</h3>
					{renderGrid(seerr.similarCards, 'portrait', onSelectSeerrCard)}
				</div>
			)}
		</div>
	);

	const renderTabContent = () => {
		switch (currentTab) {
			case 'seasons':
				return renderSeasonsGrid();
			case 'episodes':
				return renderEpisodesTab();
			case 'movies':
				return renderGrid(personMovies, 'portrait');
			case 'series':
				return renderGrid(personSeries, 'portrait');
			case 'albums':
				return renderGrid(artistAlbums, 'square');
			case 'items':
				return renderGrid(collectionItems, 'portrait');
			case 'collection':
				return renderGrid(parentCollection, 'portrait');
			case 'similar':
				return renderGrid(similar, 'portrait');
			case 'cast':
				return renderPeople(cast);
			case 'crew':
				return renderPeople(crew);
			case 'chapters':
				return renderChaptersTab();
			case 'extras':
				return renderExtrasTab();
			case 'tracks':
				return renderTracksTab();
			case 'studios':
				return renderStudiosTab();
			case 'details':
				return renderDetailsTab();
			case 'seerr':
				return renderSeerrTab();
			default:
				return null;
		}
	};

	// Declaration order is where a button the user never placed ends up, so keep it stable.

	const personBorn = () => {
		if (!isPerson) return null;
		const parts = [];
		if (birthDate) parts.push(birthDate.getFullYear());
		if (birthPlace) parts.push(birthPlace);
		if (!parts.length) return null;
		return <div className={css.personBorn}>{parts.join(' · ')}</div>;
	};

	// An episode leads with the series (logo or name), then spells out its own
	// title underneath. Everything else puts its logo or name on the one line.
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

	// The title, the facts about it and its ratings. With a Next Up card on
	// screen this is lifted out of the hero column so it keeps the full width.
	const renderTitleBlock = () => (
		<>
			{isPerson && posterUrl && <img className={css.personAvatar} src={posterUrl} alt="" />}
			{heroTitle()}
			{personBorn()}
			{(metaPieces.length > 0 || seerr.statusPills?.length > 0) && (
				<div className={css.metaRow}>
					{metaPieces.map((piece, i) => (
						<span key={i} className={css.metaItem}>
							{piece.kind === 'runtime' && <svg className={css.metaIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d={DETAIL_ICON_PATHS.schedule} /></svg>}
							{piece.kind === 'status'
								? <span className={`${css.statusBadge} ${piece.ended ? css.statusEnded : ''}`}>{piece.text}</span>
								: piece.text}
						</span>
					))}
					<SeerrStatusBadge seerr={seerr} className={css.metaBadge} />
				</div>
			)}
			{hasTech && (
				<div className={css.techRow}>
					{techSize && <span className={css.techSize}>{techSize}</span>}
					{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
				</div>
			)}
			{!isPerson && <RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />}
		</>
	);

	const renderUpNext = () => {
		const ep = nextUp?.[0];
		if (!ep) return null;
		const thumb = ep.ImageTags?.Primary ? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80}) : null;
		const code = ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:E${ep.IndexNumber} - ` : '';
		const progress = ep.UserData?.PlayedPercentage || 0;
		const leftTicks = (ep.RunTimeTicks || 0) - (ep.UserData?.PlaybackPositionTicks || 0);
		const remaining = leftTicks > 0 ? formatDuration(leftTicks) : null;
		return (
			<RowContainer className={css.upNext}>
				{/* eslint-disable-next-line react/jsx-no-bind */}
				<SpottableDiv className={css.upNextCard} spotlightId="details-up-next" onClick={() => onSelectItem?.(ep)}>
					<div className={css.upNextLabel}>{`${$L('Next Up')} - ${code}${ep.Name}`}</div>
					<div className={css.upNextBody}>
						<div className={css.upNextText}>
							{ep.Overview && !hidesMediaDescription(ep, settings) && <span className={css.upNextOverview}>{ep.Overview}</span>}
							<div className={css.upNextFoot}>
								{progress > 0 && <div className={css.upNextProgress}><div style={{width: `${Math.min(progress, 100)}%`}} /></div>}
								{remaining && <span className={css.upNextRemaining}>{$L('{time} remaining').replace('{time}', remaining)}</span>}
							</div>
						</div>
						<div className={css.upNextThumb}>
							{thumb && <img src={thumb} alt="" />}
							<div className={css.upNextPlay}><Icon path={DETAIL_ICON_PATHS.play} /></div>
						</div>
					</div>
				</SpottableDiv>
			</RowContainer>
		);
	};

	return (
		<>
			<div className={`${css.backdrop} ${isPerson ? css.backdropPerson : ''}`} style={backdropStyle}>
				{backdropUrl && !isPerson && <img className={css.backdropImage} src={backdropUrl} alt="" />}
			</div>
			<Scroller cbScrollTo={handleScrollTo} onScroll={handleScroll} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
				<div className={`${css.content} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`} ref={contentRef} onKeyDown={handleContentKeyDown}>
					{hasUpNext && <div className={css.aboveHero}>{renderTitleBlock()}</div>}
					<div className={`${css.hero} ${hasUpNext ? css.hasUpNext : ''}`} onKeyDown={handleHeroKeyDown}>
						<div className={`${css.heroMain} ${isPerson ? css.heroPerson : ''}`}>
							{!hasUpNext && renderTitleBlock()}
							{!hideMediaDescription && (
								<>
									{tagline && <div className={css.tagline}>{tagline}</div>}
									<ExpandableOverview text={item.Overview} itemId={item.Id} className={css.descriptionSlot} backRef={overviewBackRef} />
								</>
							)}
							{!isPerson && (
								<ModernActionButtons
									{...props}
									hasTech={hasTech}
									hasTrailer={hasTrailer}
									played={played}
									isFavorite={isFavorite}
									onFocusRow={handleActionsFocus}
									downTarget="details-tab-bar"
								/>
							)}
						</div>
						{renderUpNext()}
					</div>
					<SeerrDownloadBars seerr={seerr} />
					{tabs.length > 0 && (
						<div className={css.tabsSection} onKeyDown={handleTabsKeyDown}>
							<DetailsTabBar
								tabs={tabs}
								activeId={currentTab}
								onSelect={setActiveTab}
								onActivate={handleTabActivate}
								expanded={expanded}
								spotlightId="details-tab-bar"
							/>
							<div className={css.tabContent} ref={tabContentRef} key={currentTab}>{renderTabContent()}</div>
						</div>
					)}
				</div>
			</Scroller>
		</>
	);
};

export default ModernDetailContent;
