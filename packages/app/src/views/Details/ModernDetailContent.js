import {useState, useMemo, useCallback, useRef, useEffect} from 'react';
import {isMdblistEnabled, isRatingSourceAllowed} from '../../services/mdblistApi';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {Scroller} from '@enact/sandstone/Scroller';

import MediaCard from '../../components/MediaCard';
import {SeerrStatusBadge, SeerrDownloadBars} from '../../components/seerr/SeerrStatusBadge';
import {SeerrChips, SeerrFacts, SeerrStreaming, SeerrCollectionBanner} from '../../components/seerr/SeerrSections';
import RatingsRow from '../../components/RatingsRow';
import DetailsTabBar from '../../components/DetailsTabBar';
import ModernActionButtons from './ModernActionButtons';
import {getImageUrl, formatDuration} from '../../utils/helpers';
import {formatPlaybackDuration} from '../../utils/playbackTimeLabels';
import {castPhotoUrl, hidesMediaDescription} from './detailsMedia';
import {splitAdditionalParts} from './extraCategories';
import {studioCardsFor, studioLogoIndex} from './studioLogos';
import ExpandableOverview from './ExpandableOverview';
import ModernFileInformation from './ModernFileInformation';
import {ReviewCards} from './ReviewCard';
import {KEYS} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import {arrange} from '../../utils/buttonLayout';
import {DETAIL_METADATA} from '../../utils/detailMetadataLayout';
import {fetchUpcomingEpisode, formatUpcomingEpisode} from '../../utils/upcomingEpisode';
import {episodeCardTitle} from '../../utils/episodeCardTitle';
import useItemMenuHold, {itemWithIdAt} from '../../hooks/useItemMenuHold';
import {AnimeEpisodePills, AnimeItemPills} from '../../components/AnimeMarkerPills';
import {scrimStyle} from '../../utils/scrimImage';
import PlaylistSortFilterBar, {EmptyPlaylistFilterState, EmptyPlaylistState} from '../../components/PlaylistSortFilterBar';
import {
	sortAndFilterPlaylistTracks,
	showsPlaylistOrder,
	playlistRowMenu,
	PLAYLIST_SORT_ORDER,
	PLAYLIST_SORT_RANDOM,
	SORT_DIR_ASC,
	PLAYED_ALL
} from '../../utils/playlistSortFilter';

import useCollectionSort from './useCollectionSort';
import {sortLabel} from './nouveau/nouveauCollectionSort';
import NouveauSortDialog from './nouveau/sections/NouveauSortDialog';

import css from './ModernDetailContent.module.less';
import sectionsCss from './nouveau/sections/NouveauSections.module.less';

const SpottableDiv = Spottable('div');

// Same stops as .scrim and .backdropPerson .scrim in the stylesheet.
const SCRIM = [
	{to: 'right', rgb: '11, 13, 16', stops: [[0, 1], [0.35, 0.9], [0.6, 0.45], [0.85, 0]]},
	{to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.42, 0.4], [0.8, 0]]},
	{at: [0.72, 0.28], rgb: '0, 0, 0', stops: [[0.42, 0], [1, 0.45]]}
];
const PERSON_SCRIM = [{to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.5, 0.6], [1, 0.45]]}];
const NO_TRACKS = [];

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
		item, effectiveServerUrl, effectiveApi, serverToken, settings, showsSection,
		isEpisode, isSeries, isSeason, isPerson, isBoxSet, isAlbum, isMusicArtist, isPlaylist,
		backdropUrl, posterUrl, logoUrl, onLogoError,
		year, runtime, endsAt, officialRating, seasonCount, genres, tagline,
		seasons, episodes, similar, reviews = [], onSelectReview, extras, cast, crew = [], nextUp, collectionItems, collectionSections = [], albumTracks, artistAlbums, playlistItems, personMovies, personSeries, birthDate, birthPlace, episodeRatings,
		techBadges = [], techSize, overviewBackRef,
		mediaSource, supportsMediaSourceSelection, selectedAudioIndex, selectedSubtitleIndex,
		handleChapterSelect, handleExtraSelect, playTrack, playlistMenu,
		onSelectItem, onSelectPerson, onSelectStudio,
		seerr, seerrNav, onSelectSeerrCard, spotlightBackRef, collectionMenu, loadMoreCollectionItems,
		handlePlay, handleShuffle, onWatchWithGroup
	} = props;

	// A collection's play order, sorted the same way as in Nouveau.
	const collectionSort = useCollectionSort(isBoxSet ? effectiveApi : null, item.Id, isBoxSet ? playlistItems : NO_TRACKS);
	const collectionSortOpenRef = useRef(false);
	collectionSortOpenRef.current = collectionSort.sortOpen;
	const closeCollectionSort = collectionSort.closeSort;

	const [sortBy, setSortBy] = useState(PLAYLIST_SORT_ORDER);
	const [sortDirection, setSortDirection] = useState(SORT_DIR_ASC);
	const [playedFilter, setPlayedFilter] = useState(PLAYED_ALL);
	const [favoriteOnly, setFavoriteOnly] = useState(false);
	const [mediaTypeFilter, setMediaTypeFilter] = useState(null);
	const [randomSeed, setRandomSeed] = useState(42);

	const availableMediaTypes = useMemo(() => {
		if (!isPlaylist || !playlistItems) return [];
		const set = new Set();
		playlistItems.forEach((t) => {
			const type = t.MediaType || t.Type;
			if (type) set.add(type);
		});
		return Array.from(set);
	}, [isPlaylist, playlistItems]);

	const displayedPlaylistTracks = useMemo(() => {
		if (!isPlaylist) return playlistItems || [];
		return sortAndFilterPlaylistTracks({
			tracks: playlistItems || [],
			sortBy,
			sortDirection,
			playedFilter,
			favoriteOnly,
			mediaTypeFilter,
			randomSeed
		});
	}, [isPlaylist, playlistItems, sortBy, sortDirection, playedFilter, favoriteOnly, mediaTypeFilter, randomSeed]);

	const handleSortChange = useCallback((newSort, newDir) => {
		setSortBy(newSort);
		setSortDirection(newDir);
		if (newSort === PLAYLIST_SORT_RANDOM) {
			setRandomSeed(Date.now());
		}
	}, []);

	const handleFilterChange = useCallback(({playedFilter: pf, favoriteOnly: fo, mediaTypeFilter: mtf}) => {
		if (pf !== undefined) setPlayedFilter(pf);
		if (fo !== undefined) setFavoriteOnly(fo);
		if (mtf !== undefined) setMediaTypeFilter(mtf);
	}, []);

	const handleReset = useCallback(() => {
		setSortBy(PLAYLIST_SORT_ORDER);
		setSortDirection(SORT_DIR_ASC);
		setPlayedFilter(PLAYED_ALL);
		setFavoriteOnly(false);
		setMediaTypeFilter(null);
		setRandomSeed(Date.now());
	}, []);

	const episodeAt = useCallback((target) => itemWithIdAt(episodes, 'data-episode-id', target), [episodes]);
	const episodeMenuHold = useItemMenuHold(episodeAt);

	const tracks = isPlaylist ? displayedPlaylistTracks : albumTracks;
	const trackAt = useCallback((target) => {
		const card = target.closest?.('[data-index]');
		const idx = card ? parseInt(card.getAttribute('data-index'), 10) : -1;
		if (idx >= 0 && idx < tracks.length) return tracks[idx];
		return itemWithIdAt(tracks, 'data-track-id', target);
	}, [tracks]);
	const playlistOrderShown = showsPlaylistOrder({sortBy, sortDirection, playedFilter, favoriteOnly, mediaTypeFilter});
	const trackMenuOptions = useMemo(
		() => (isPlaylist ? playlistRowMenu(playlistMenu, displayedPlaylistTracks, playlistOrderShown) : playlistMenu),
		[isPlaylist, playlistMenu, displayedPlaylistTracks, playlistOrderShown]
	);
	const trackMenuHold = useItemMenuHold(trackAt, trackMenuOptions);
	const handleTrackClick = useCallback((ev) => {
		const track = trackAt(ev.currentTarget);
		if (track) {
			if (isPlaylist) {
				playTrack(track, displayedPlaylistTracks);
			} else {
				playTrack(track);
			}
		}
	}, [trackAt, playTrack, isPlaylist, displayedPlaylistTracks]);

	const handleModernPlay = useCallback((targetItem, tracksOverride) => {
		if (isPlaylist) {
			const queue = Array.isArray(tracksOverride) ? tracksOverride : displayedPlaylistTracks;
			const validTarget = (targetItem && !Array.isArray(targetItem) && targetItem.Id)
				? queue.find((t) => (targetItem.PlaylistItemId ? t.PlaylistItemId === targetItem.PlaylistItemId : t.Id === targetItem.Id))
				: null;
			const first = validTarget || queue[0];
			handlePlay?.(first, queue);
		} else {
			handlePlay?.(targetItem, tracksOverride);
		}
	}, [isPlaylist, displayedPlaylistTracks, handlePlay]);

	const handleModernWatchWithGroup = useCallback((targetItem) => {
		if (isPlaylist) {
			const queue = displayedPlaylistTracks;
			const validTarget = (targetItem && !Array.isArray(targetItem) && targetItem.Id)
				? queue.find((t) => (targetItem.PlaylistItemId ? t.PlaylistItemId === targetItem.PlaylistItemId : t.Id === targetItem.Id))
				: null;
			const first = validTarget || queue[0];
			onWatchWithGroup?.(first, queue);
		} else {
			onWatchWithGroup?.(targetItem);
		}
	}, [isPlaylist, displayedPlaylistTracks, onWatchWithGroup]);

	const handleModernShuffle = useCallback((tracksOverride) => {
		if (isPlaylist) {
			const queue = Array.isArray(tracksOverride) ? tracksOverride : displayedPlaylistTracks;
			handleShuffle?.(queue);
		} else {
			handleShuffle?.(tracksOverride);
		}
	}, [isPlaylist, displayedPlaylistTracks, handleShuffle]);

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
	const played = item.UserData?.Played;
	const isFavorite = item.UserData?.IsFavorite;
	const hideMediaDescription = hidesMediaDescription(item, settings);

	const menuBackRef = useRef(null);
	const sortFilterBackRef = useRef(null);
	useEffect(() => {
		if (!spotlightBackRef) return undefined;
		const handler = () => {
			if (collectionSortOpenRef.current) {
				closeCollectionSort();
				return true;
			}
			return Boolean(sortFilterBackRef.current?.() || menuBackRef.current?.());
		};
		spotlightBackRef.current = handler;
		return () => {
			if (spotlightBackRef.current === handler) spotlightBackRef.current = null;
		};
	}, [spotlightBackRef, closeCollectionSort]);

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
	const studios = showsSection('studios') ? item.Studios : undefined;
	const [tmdbCompanies, setTmdbCompanies] = useState(null);
	useEffect(() => {
		let cancelled = false;
		const tmdbId = item.ProviderIds?.Tmdb;
		if (!settings.useMoonfinPlugin || !tmdbId || !studios?.length || !effectiveApi?.getStudioCompanies) {
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
	}, [item.Id, item.ProviderIds, studios, settings.useMoonfinPlugin, isSeries, effectiveApi]);

	// Only the Jellyfin studios are listed, so selecting one matches the library filter, and
	// each borrows a TMDB logo when the names line up.
	const studioCards = useMemo(
		() => studioCardsFor(studios, studioLogoIndex(tmdbCompanies, effectiveServerUrl, serverToken)),
		[tmdbCompanies, studios, effectiveServerUrl, serverToken]
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

	// Metadata pieces, arranged according to the user's settings.
	// A piece carries its kind so the status can render as a coloured pill and
	// the runtime can lead with a clock.
	const metaPieces = useMemo(() => {
		const orderedItems = arrange(DETAIL_METADATA, {
			order: settings.detailMetadataOrderTv,
			hidden: settings.hiddenDetailMetadataTv
		});

		const pieceFor = (id) => {
			switch (id) {
				case 'year':
					return year ? [{kind: 'text', text: String(year)}] : [];
				case 'parentalRating':
					return officialRating ? [{kind: 'text', text: officialRating}] : [];
				case 'runtimeAndSeasons': {
					const parts = [];
					if (isSeries && seasonCount) {
						parts.push({kind: 'text', text: $L('{count} Seasons').replace('{count}', seasonCount)});
					} else if (isSeason && episodes.length) {
						parts.push({kind: 'text', text: $L('{count} Episodes').replace('{count}', episodes.length)});
					} else if (isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null) {
						let label = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
						const rating = episodeRatings?.[item.IndexNumber];
						const showEpisodeRating = settings.tmdbEpisodeRatingsEnabled && isRatingSourceAllowed(settings.mdblistRatingSources, 'tmdb');
						if (showEpisodeRating && rating) label += ` · ${rating}`;
						parts.push({kind: 'text', text: label});
					} else if (isPlaylist) {
						const count = displayedPlaylistTracks.length;
						const totalTicks = displayedPlaylistTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);
						parts.push({kind: 'text', text: `${count} ${count !== 1 ? $L('Items') : $L('Item')}`});
						if (totalTicks > 0) parts.push({kind: 'runtime', text: formatDuration(totalTicks)});
					} else if (runtime) {
						parts.push({kind: 'runtime', text: runtime});
						if (endsAt) parts.push({kind: 'text', text: endsAt});
					}
					return parts;
				}
				case 'status':
					if (isSeries && item.Status === 'Continuing') return [{kind: 'status', text: $L('Continuing')}];
					if (isSeries && item.Status === 'Ended') return [{kind: 'status', text: $L('Ended'), ended: true}];
					return [];
				case 'upcomingEpisodeDate':
					if (upcomingEpisodeText) return [{kind: 'upcoming', text: upcomingEpisodeText}];
					return [];
				case 'genres':
					return genres.length ? [{kind: 'text', text: genres.slice(0, 3).join(' · ')}] : [];
				case 'seerrAvailability':
					return seerr.statusPills?.length > 0 ? [{kind: 'seerr'}] : [];
				default:
					return [];
			}
		};

		return orderedItems.flatMap((itemDef) => pieceFor(itemDef.id));
	}, [settings.detailMetadataOrderTv, settings.hiddenDetailMetadataTv, year, officialRating, isSeries, seasonCount, isSeason, episodes.length, isEpisode, item.ParentIndexNumber, item.IndexNumber, item.Status, episodeRatings, settings.tmdbEpisodeRatingsEnabled, settings.mdblistRatingSources, runtime, endsAt, genres, upcomingEpisodeText, seerr.statusPills, isPlaylist, displayedPlaylistTracks]);

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

	const collectionTabLabel = collectionSections.length > 1 ? $L('Collections') : collectionSections[0]?.name;
	const chapters = showsSection('chapters') ? item.Chapters : undefined;
	// On an episode the Episodes tab lists the rest of its season, which is the More episodes
	// section. A season's own list is the page itself.
	const listsEpisodes = isSeason || (isEpisode && showsSection('moreEpisodes'));
	const showsDetails = showsSection('mediaInfo') &&
		(item.Type === 'Book' || (supportsMediaSourceSelection && mediaSource?.MediaStreams?.length));
	// Tabs are data-driven, appearing only when their data is present. A section the viewer
	// switched off counts as one with nothing in it, so its tab goes the same way.
	const {parts: additionalParts, others: otherExtras} = useMemo(() => splitAdditionalParts(extras), [extras]);

	const tabs = useMemo(() => {
		const list = [];
		if (isSeries && seasons.length) list.push({id: 'seasons', label: $L('Seasons')});
		if (listsEpisodes && episodes.length) list.push({id: 'episodes', label: $L('Episodes')});
		if (isPerson) {
			if (personMovies.length) list.push({id: 'movies', label: $L('Movies')});
			if (personSeries.length) list.push({id: 'series', label: $L('TV Shows')});
		}
		if ((isAlbum && albumTracks.length) || isPlaylist) list.push({id: 'tracks', label: $L('Tracks')});
		if (isMusicArtist && artistAlbums.length) list.push({id: 'albums', label: $L('Albums')});
		if (isBoxSet && collectionItems.length) list.push({id: 'items', label: $L('Items')});
		if (cast.length) list.push({id: 'cast', label: $L('Cast')});
		if (crew.length) list.push({id: 'crew', label: $L('Crew')});
		if (studios?.length) list.push({id: 'studios', label: $L('Studios')});
		// After the collection's own tabs, so it still opens on what it holds.
		if (isBoxSet && playlistItems.length) list.push({id: 'collectionPlaylist', label: $L('Playlist')});
		if (chapters?.length) list.push({id: 'chapters', label: $L('Chapters')});
		if (additionalParts.length) list.push({id: 'additionalParts', label: $L('Additional Parts')});
		if (otherExtras.length) list.push({id: 'extras', label: $L('Extras')});
		if (showsDetails) list.push({id: 'details', label: $L('Details')});
		if (collectionSections.length) list.push({id: 'collection', label: collectionTabLabel});
		if (similar.length) list.push({id: 'similar', label: $L('More Like This')});
		if (reviews.length) list.push({id: 'reviews', label: $L('Reviews')});
		if (seerr.hasTabContent) list.push({id: 'seerr', label: seerr.displayName});
		return list;
	}, [isSeries, seasons.length, listsEpisodes, episodes.length, isPerson, personMovies.length, personSeries.length, isAlbum, isPlaylist, albumTracks.length, isMusicArtist, artistAlbums.length, isBoxSet, collectionItems.length, playlistItems.length, collectionSections.length, collectionTabLabel, cast.length, crew.length, studios, chapters, additionalParts.length, otherExtras.length, showsDetails, similar.length, reviews.length, seerr.hasTabContent, seerr.displayName]);

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
				// its content once it has rendered. On an episode it lands on
				// that episode's own row.
				const id = active.closest('[data-id]')?.dataset.id;
				if (id) {
					ev.preventDefault();
					ev.stopPropagation();
					setActiveTab(id);
					window.requestAnimationFrame(() => {
						const opened = tabContentRef.current;
						const first = opened?.querySelector(`.${css.currentEpisode}`) || opened?.querySelector('.spottable');
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

	const renderGrid = (items, cardType, onSelect = onSelectItem, menuOptions) => (
		<RowContainer className={css.grid}>
			{items.map((it) => (
				<MediaCard key={it.Id} item={it} serverUrl={effectiveServerUrl} cardType={cardType} onSelect={onSelect} menuOptions={menuOptions} />
			))}
		</RowContainer>
	);

	const renderEpisodesTab = () => (
		<RowContainer className={css.episodeList} {...episodeMenuHold}>
			{episodes.map((ep) => {
				const thumb = ep.ImageTags?.Primary ? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80}) : null;
				const epRuntime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : '';
				const progress = ep.UserData?.PlayedPercentage || 0;
				return (
					<SpottableDiv key={ep.Id} className={`${css.episodeRow} ${isEpisode && ep.Id === item.Id ? css.currentEpisode : ''}`} data-episode-id={ep.Id} onClick={handleEpisodeClick}>
						<div className={css.episodeThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbPlaceholder} />}
							{ep.UserData?.Played && <div className={css.episodeWatched}><Icon path={DETAIL_ICON_PATHS.watched} /></div>}
							{progress > 0 && <div className={css.thumbProgress}><div style={{width: `${Math.min(progress, 100)}%`}} /></div>}
						</div>
						<div className={css.episodeBody}>
							<span className={css.episodeName}>{episodeCardTitle(ep.Name, ep.IndexNumber)}</span>
							{epRuntime && <span className={css.episodeMeta}>{epRuntime}</span>}
							<AnimeEpisodePills episode={ep} serverUrl={effectiveServerUrl} large />
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
					? getImageUrl(effectiveServerUrl, item.Id, `Chapter/${i}`, {maxWidth: 400, tag: chapter.ImageTag})
					: null;
				return (
					<SpottableDiv key={i} className={css.chapterCard} data-start-ticks={chapter.StartPositionTicks} onClick={handleChapterSelect}>
						<div className={css.chapterThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbPlaceholder} />}
							<span className={css.chapterTime}>{formatPlaybackDuration(chapter.StartPositionTicks / 10000000)}</span>
						</div>
						<span className={css.chapterName}>{chapter.Name || `${$L('Chapter')} ${i + 1}`}</span>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderExtrasTab = (items) => (
		<RowContainer className={css.grid}>
			{items.map((extra) => {
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
		return (
			<div className={css.tracksContainer}>
				{isPlaylist && (
					<PlaylistSortFilterBar
						sortBy={sortBy}
						sortDirection={sortDirection}
						onSortChange={handleSortChange}
						playedFilter={playedFilter}
						favoriteOnly={favoriteOnly}
						mediaTypeFilter={mediaTypeFilter}
						availableMediaTypes={availableMediaTypes}
						onFilterChange={handleFilterChange}
						onReset={handleReset}
						backHandlerRef={sortFilterBackRef}
					/>
				)}
				{isPlaylist && playlistItems.length === 0 ? (
					<EmptyPlaylistState />
				) : isPlaylist && displayedPlaylistTracks.length === 0 ? (
					<EmptyPlaylistFilterState onReset={handleReset} />
				) : (
					<RowContainer className={css.trackList} {...(isPlaylist ? trackMenuHold : {})}>
						{tracks.map((track, i) => (
							<SpottableDiv key={track.PlaylistItemId || `${track.Id}_${i}`} className={css.trackRow} data-track-id={track.Id} data-playlist-item-id={track.PlaylistItemId} data-index={i} onClick={handleTrackClick}>
								<span className={css.trackIndex}>{isPlaylist ? i + 1 : (track.IndexNumber || i + 1)}</span>
								<span className={css.trackTitle}>{track.Name}</span>
								{track.RunTimeTicks && <span className={css.trackDuration}>{formatDuration(track.RunTimeTicks)}</span>}
							</SpottableDiv>
						))}
					</RowContainer>
				)}
			</div>
		);
	};

	const handleCollectionTrackClick = useCallback((ev) => {
		const entry = collectionSort.sorted[parseInt(ev.currentTarget.dataset.index, 10)];
		if (entry) playTrack(entry, collectionSort.sorted);
	}, [collectionSort.sorted, playTrack]);

	// The rest of a long collection is read as focus nears the end of what's in.
	const handleCollectionTrackFocus = useCallback((ev) => {
		if (parseInt(ev.currentTarget.dataset.index, 10) >= collectionSort.sorted.length - 5) loadMoreCollectionItems?.();
	}, [collectionSort.sorted.length, loadMoreCollectionItems]);

	const renderCollectionPlaylistTab = () => (
		<div className={css.tracksContainer}>
			<div className={sectionsCss.railHeader}>
				<SpottableDiv className={sectionsCss.sortButton} onClick={collectionSort.openSort}>
					{sortLabel(collectionSort.sortOption)}
				</SpottableDiv>
			</div>
			<RowContainer className={css.trackList}>
				{collectionSort.sorted.map((entry, i) => (
					<SpottableDiv key={entry.Id} className={css.trackRow} data-index={i} onClick={handleCollectionTrackClick} onFocus={handleCollectionTrackFocus}>
						<span className={css.trackIndex}>{i + 1}</span>
						<span className={css.trackTitle}>{entry.SeriesName ? `${entry.SeriesName} · ${entry.Name}` : entry.Name}</span>
						{entry.RunTimeTicks && <span className={css.trackDuration}>{formatDuration(entry.RunTimeTicks)}</span>}
					</SpottableDiv>
				))}
			</RowContainer>
		</div>
	);

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
	// clear of the navbar, so the heading is left the same room the first row gets. It animates
	// because Enact's own scroll is still running here, and a jump would cut it off.
	const handleSectionFocus = useCallback((ev) => {
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
			scrollToRef.current?.({position: {y: Math.max(0, offset - clearance)}, animate: true});
		});
	}, []);

	// Everything Seerr adds to a title, in one tab: where it is filed, the production facts,
	// where it streams, what it is like, and the collection it belongs to.
	const renderSeerrTab = () => (
		<div className={css.sectionStack}>
			{seerr.pieces.chips && <SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />}
			{seerr.pieces.collection && <SeerrCollectionBanner collection={seerr.details.collection} onOpen={seerrNav?.onOpenCollection} />}
			{seerr.pieces.facts && <SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />}
			{seerr.pieces.streaming && <SeerrStreaming providers={seerr.streamingProviders} />}
			{seerr.pieces.recommendations && (
				<div onFocus={handleSectionFocus}>
					<h3 className={css.sectionHeading}>{$L('Recommendations')}</h3>
					{renderGrid(seerr.recommendationCards, 'portrait', onSelectSeerrCard)}
				</div>
			)}
			{seerr.pieces.similar && (
				<div onFocus={handleSectionFocus}>
					<h3 className={css.sectionHeading}>{$L('Similar')}</h3>
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
				return renderGrid(collectionItems, 'portrait', onSelectItem, collectionMenu);
			case 'collection':
				if (collectionSections.length === 1) return renderGrid(collectionSections[0].items, 'portrait');
				return (
					<div className={css.sectionStack}>
						{collectionSections.map((section) => (
							<div key={section.id} onFocus={handleSectionFocus}>
								<h3 className={css.sectionHeading}>{section.name}</h3>
								{renderGrid(section.items, 'portrait')}
							</div>
						))}
					</div>
				);
			case 'similar':
				return renderGrid(similar, 'portrait');
			case 'reviews':
				return (
					<RowContainer className={css.grid}>
						<ReviewCards reviews={reviews} onSelect={onSelectReview} />
					</RowContainer>
				);
			case 'cast':
				return renderPeople(cast);
			case 'crew':
				return renderPeople(crew);
			case 'chapters':
				return renderChaptersTab();
			case 'additionalParts':
				return renderExtrasTab(additionalParts);
			case 'extras':
				return renderExtrasTab(otherExtras);
			case 'tracks':
				return renderTracksTab();
			case 'collectionPlaylist':
				return renderCollectionPlaylistTab();
			case 'studios':
				return renderStudiosTab();
			case 'details':
				return (
					<ModernFileInformation
						item={item}
						mediaSource={mediaSource}
						effectiveApi={effectiveApi}
						selectedAudioIndex={selectedAudioIndex}
						selectedSubtitleIndex={selectedSubtitleIndex}
						settings={settings}
					/>
				);
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
			{metaPieces.length > 0 && (
				<div className={css.metaRow}>
					{metaPieces.map((piece, i) => {
						if (piece.kind === 'seerr') {
							return <SeerrStatusBadge key={i} seerr={seerr} className={css.metaBadge} />;
						}
						return (
							<span key={i} className={css.metaItem}>
								{piece.kind === 'runtime' && (
									<svg className={css.metaIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
										<path d={DETAIL_ICON_PATHS.schedule} />
									</svg>
								)}
								{piece.kind === 'upcoming' && (
									<span className={`${css.statusBadge} ${css.statusUpcoming}`}>
										<svg className={css.metaIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
											<path d={DETAIL_ICON_PATHS.calendar} />
										</svg>
										{piece.text}
									</span>
								)}
								{piece.kind === 'status' && (
									<span className={`${css.statusBadge} ${piece.ended ? css.statusEnded : ''}`}>{piece.text}</span>
								)}
								{(piece.kind === 'text' || piece.kind === 'runtime') && piece.text}
							</span>
						);
					})}
				</div>
			)}
			<AnimeItemPills item={item} serverUrl={effectiveServerUrl} large />
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
				<div className={css.scrim} style={scrimStyle(isPerson ? PERSON_SCRIM : SCRIM, gradientScale)} />
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
									<ExpandableOverview text={isPerson && !showsSection('biography') ? '' : item.Overview} itemId={item.Id} className={css.descriptionSlot} backRef={overviewBackRef} />
								</>
							)}
							{!isPerson && (
								<ModernActionButtons
									{...props}
									handlePlay={handleModernPlay}
									handleShuffle={handleModernShuffle}
									onWatchWithGroup={handleModernWatchWithGroup}
									playlistTracks={isPlaylist ? displayedPlaylistTracks : undefined}
									hasTech={hasTech}
									played={played}
									isFavorite={isFavorite}
									onFocusRow={handleActionsFocus}
									downTarget="details-tab-bar"
									menuBackRef={menuBackRef}
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

export default ModernDetailContent;
