import {useState, useMemo, useCallback, useRef, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {Scroller} from '@enact/sandstone/Scroller';

import MediaCard from '../../components/MediaCard';
import RatingsRow from '../../components/RatingsRow';
import DetailsTabBar from '../../components/DetailsTabBar';
import {getImageUrl, formatDuration} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from './detailIcons';

import css from './ModernDetailContent.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const Icon = ({path}) => (
	<svg className={css.icon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

// A circular icon button that expands into a labeled pill when focused.
const ActionButton = ({path, label, detail, onClick, active, primary, spotlightId}) => (
	<SpottableDiv
		className={`${css.actionBtn} ${primary ? css.actionPrimary : ''} ${active ? css.actionActive : ''}`}
		onClick={onClick}
		spotlightId={spotlightId}
	>
		<span className={css.actionIcon}><Icon path={path} /></span>
		<span className={css.actionText}>
			<span className={css.actionLabel}>{label}</span>
			{detail && <span className={css.actionDetail}>{detail}</span>}
		</span>
	</SpottableDiv>
);

const ModernDetailContent = (props) => {
	const {
		item, effectiveServerUrl, effectiveApi, serverToken, settings,
		isEpisode, isSeries, isSeason, isPerson, isBoxSet, isAlbum, isMusicArtist, isPlaylist, isBook, isReadableBook,
		backdropUrl, posterUrl, logoUrl, invertLogo, onLogoError,
		year, runtime, endsAt, officialRating, seasonCount, genres, tagline,
		hasPlaybackPosition, resumeTimeText,
		seasons, episodes, similar, extras, cast, nextUp, collectionItems, albumTracks, artistAlbums, playlistItems, personMovies, personSeries, birthDate, birthPlace, episodeRatings,
		mediaSource, supportsMediaSourceSelection, hasMultipleVersions, hasMultipleAudio,
		handlePlay, handleResume, handleShuffle, handleTrailer, handleToggleWatched, handleToggleFavorite, handleGoToSeries,
		handleOpenVersionModal, handleOpenAudioModal, handleOpenSubtitleModal, handleOpenMediaInfo, handleOpenPlaylistModal, handleOpenDeleteDialog,
		handleChapterSelect, handleExtraSelect, handleTrackPlay,
		onSelectItem, onSelectPerson, onSelectStudio,
		canChangeArtwork, handleOpenArtworkModal
	} = props;

	const hasTrailer = item.LocalTrailerCount > 0 || (item.RemoteTrailers?.length > 0) || isSeries;
	const played = item.UserData?.Played;
	const isFavorite = item.UserData?.IsFavorite;

	const [canToggle, setCanToggle] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const descriptionRef = useRef(null);

	// Reset expanded state when navigating to a different item. Keyed on the id so an
	// in-place update to the same item doesn't collapse the text.
	useEffect(() => {
		setIsExpanded(false);
		setCanToggle(false);
	}, [item?.Id]);

	// Detect if description text overflows 4 lines
	useEffect(() => {
		const el = descriptionRef.current;
		if (el && !isExpanded) {
			setCanToggle(el.scrollHeight > el.clientHeight);
		}
	}, [item?.Overview, isExpanded]);

	const handleToggleExpand = useCallback(() => {
		setIsExpanded(prev => !prev);
	}, []);

	const scrollToRef = useRef(null);
	const handleScrollTo = useCallback((fn) => {
		scrollToRef.current = fn;
	}, []);
	const handleActionsFocus = useCallback((ev) => {
		// Only scroll to the top when focus enters the row from outside, not when
		// moving between buttons, otherwise the content below redraws every step.
		if (ev.currentTarget.contains(ev.relatedTarget)) return;
		if (scrollToRef.current) scrollToRef.current({position: {y: 0}, animate: true});
	}, []);
	const handleActionsKeyDown = useCallback((ev) => {
		// Down moves into the tab bar, which 5-way doesn't reach on its own.
		if (ev.keyCode === KEYS.DOWN) {
			if (Spotlight.focus('details-tab-bar')) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		// Keep left/right focus inside the button row so the edges don't jump to
		// the up next card or leak out of the row.
		if (ev.keyCode !== KEYS.LEFT && ev.keyCode !== KEYS.RIGHT) return;
		const buttons = Array.from(ev.currentTarget.querySelectorAll(`.${css.actionBtn}`));
		const idx = buttons.indexOf(document.activeElement);
		if (idx === -1) return;
		if ((ev.keyCode === KEYS.LEFT && idx === 0) || (ev.keyCode === KEYS.RIGHT && idx === buttons.length - 1)) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, []);
	const handleUpNextKeyDown = useCallback((ev) => {
		// Up from the next up card returns to the top navbar when it's present.
		if (ev.keyCode === KEYS.UP && Spotlight.focus('navbar')) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, []);

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

	const studioCards = useMemo(() => {
		// Only list the Jellyfin studios so selecting one matches the library
		// filter, and borrow a TMDB logo when the names line up (ignoring case
		// and punctuation, since both lists usually come from TMDB originally).
		const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
		const byName = new Map((tmdbCompanies || []).map((c) => [norm(c.name), c]));
		return (item.Studios || []).map((s) => {
			const match = byName.get(norm(s.Name));
			return {
				key: s.Id || s.Name,
				name: s.Name,
				logo: match?.hasLogo ? `${effectiveServerUrl}/Moonfin/Tmdb/StudioImage/${match.id}?api_key=${serverToken}` : null
			};
		});
	}, [tmdbCompanies, item.Studios, effectiveServerUrl, serverToken]);

	// Metadata pieces, joined by CSS separators rather than string concatenation.
	const metaPieces = useMemo(() => {
		const pieces = [];
		if (year) pieces.push(String(year));
		if (officialRating) pieces.push(officialRating);
		if (isSeries && seasonCount) pieces.push($L('{count} Seasons').replace('{count}', seasonCount));
		if (isSeason && episodes.length) pieces.push($L('{count} Episodes').replace('{count}', episodes.length));
		if (isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null) {
			let label = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
			const rating = episodeRatings?.[item.Id];
			if (settings.tmdbEpisodeRatingsEnabled && rating) label += ` · ${rating}%`;
			pieces.push(label);
		}
		if (isSeries && item.Status === 'Continuing') pieces.push($L('Ongoing'));
		if (isSeries && item.Status === 'Ended') pieces.push($L('Ended'));
		if (runtime) pieces.push(runtime);
		if (runtime && endsAt) pieces.push(endsAt);
		if (genres.length) pieces.push(genres.slice(0, 3).join(', '));
		return pieces;
	}, [year, officialRating, isSeries, seasonCount, isSeason, episodes.length, isEpisode, item.ParentIndexNumber, item.IndexNumber, item.Id, item.Status, episodeRatings, settings.tmdbEpisodeRatingsEnabled, runtime, endsAt, genres]);

	const handleCastClick = useCallback((ev) => {
		const personId = ev.currentTarget.dataset.personId;
		const person = cast.find((c) => c.Id === personId);
		if (person) onSelectPerson?.(person);
	}, [cast, onSelectPerson]);

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
		if (cast.length) list.push({id: 'cast', label: $L('Cast & Crew')});
		if (item.Studios?.length) list.push({id: 'studios', label: $L('Studios')});
		if (item.Chapters?.length) list.push({id: 'chapters', label: $L('Chapters')});
		if (extras.length) list.push({id: 'extras', label: $L('Extras')});
		if (supportsMediaSourceSelection && mediaSource?.MediaStreams?.length) list.push({id: 'details', label: $L('Details')});
		if (similar.length) list.push({id: 'similar', label: $L('More Like This')});
		return list;
	}, [isSeries, seasons.length, isSeason, isEpisode, episodes.length, isPerson, personMovies.length, personSeries.length, isAlbum, isPlaylist, albumTracks.length, playlistItems.length, isMusicArtist, artistAlbums.length, isBoxSet, collectionItems.length, cast.length, item.Studios, item.Chapters, extras.length, supportsMediaSourceSelection, mediaSource, similar.length]);

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
			const rect = active.getBoundingClientRect();
			const hasAbove = Array.from(content.querySelectorAll('.spottable'))
				.some((el) => el !== active && el.getBoundingClientRect().bottom <= rect.top + 1);
			const pill = tabBar?.querySelector(`[data-id="${currentTab}"]`);
			if (!hasAbove && pill && Spotlight.focus(pill)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		}
	}, [currentTab]);

	const renderGrid = (items, cardType) => (
		<RowContainer className={css.grid}>
			{items.map((it) => (
				<MediaCard key={it.Id} item={it} serverUrl={effectiveServerUrl} cardType={cardType} onSelect={onSelectItem} />
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
							{progress > 0 && <div className={css.upNextProgress}><div style={{width: `${Math.min(progress, 100)}%`}} /></div>}
						</div>
						<div className={css.episodeBody}>
							<span className={css.episodeName}>{label}</span>
							{epRuntime && <span className={css.episodeMeta}>{epRuntime}</span>}
							{ep.Overview && <p className={css.episodeOverview}>{ep.Overview}</p>}
						</div>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);

	const renderCastTab = () => (
		<RowContainer className={css.grid}>
			{cast.map((person) => {
				const photo = person.PrimaryImageTag
					? getImageUrl(effectiveServerUrl, person.Id, 'Primary', {maxHeight: 300, quality: 80})
					: null;
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

	const renderDetailsTab = () => {
		const streams = mediaSource?.MediaStreams || [];
		return (
			<div className={css.detailsPanel}>
				{streams.map((stream, i) => (
					<div key={i} className={css.detailStream}>
						<div className={css.detailStreamHeader}>{stream.Type}{stream.Language ? ` (${stream.Language})` : ''}</div>
						{stream.DisplayTitle && <div className={css.detailStreamLine}>{stream.DisplayTitle}</div>}
					</div>
				))}
			</div>
		);
	};

	const renderTabContent = () => {
		switch (currentTab) {
			case 'seasons':
				return renderGrid(seasons, 'portrait');
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
			case 'similar':
				return renderGrid(similar, 'portrait');
			case 'cast':
				return renderCastTab();
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
			default:
				return null;
		}
	};

	const renderActionButtons = () => (
		<RowContainer className={css.actions} spotlightId="details-action-buttons" onFocus={handleActionsFocus} onKeyDown={handleActionsKeyDown}>
			{hasPlaybackPosition && !isBook && (
				<ActionButton primary path={DETAIL_ICON_PATHS.play} label={$L('Resume')} detail={resumeTimeText} onClick={handleResume} spotlightId="details-primary-btn" />
			)}
			{(isBook ? isReadableBook : true) && (
				<ActionButton
					primary={!hasPlaybackPosition}
					path={isBook ? DETAIL_ICON_PATHS.book : hasPlaybackPosition ? DETAIL_ICON_PATHS.restart : DETAIL_ICON_PATHS.play}
					label={isBook ? $L('Read') : hasPlaybackPosition ? $L('Restart') : $L('Play')}
					onClick={handlePlay}
					spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}
				/>
			)}
			{(isSeries || isSeason) && <ActionButton path={DETAIL_ICON_PATHS.shuffle} label={$L('Shuffle')} onClick={handleShuffle} />}
			{hasMultipleVersions && <ActionButton path={DETAIL_ICON_PATHS.version} label={$L('Version')} onClick={handleOpenVersionModal} />}
			{hasMultipleAudio && <ActionButton path={DETAIL_ICON_PATHS.audio} label={$L('Audio')} onClick={handleOpenAudioModal} />}
			{supportsMediaSourceSelection && <ActionButton path={DETAIL_ICON_PATHS.subtitle} label={$L('Subtitle')} onClick={handleOpenSubtitleModal} />}
			{hasTrailer && <ActionButton path={DETAIL_ICON_PATHS.trailer} label={$L('Trailer')} onClick={handleTrailer} />}
			<ActionButton path={DETAIL_ICON_PATHS.watched} label={played ? $L('Watched') : $L('Mark Watched')} active={played} onClick={handleToggleWatched} spotlightId="details-watched-btn" />
			<ActionButton path={DETAIL_ICON_PATHS.favorite} label={isFavorite ? $L('Favorited') : $L('Favorite')} active={isFavorite} onClick={handleToggleFavorite} spotlightId="details-favorite-btn" />
			{isEpisode && item.SeriesId && <ActionButton path={DETAIL_ICON_PATHS.series} label={$L('Series')} onClick={handleGoToSeries} />}
			{supportsMediaSourceSelection && <ActionButton path={DETAIL_ICON_PATHS.mediaInfo} label={$L('Media Info')} onClick={handleOpenMediaInfo} />}
			<ActionButton path={DETAIL_ICON_PATHS.playlist} label={$L('Add to Playlist')} onClick={handleOpenPlaylistModal} />
			{item.CanDelete && <ActionButton path={DETAIL_ICON_PATHS.delete} label={$L('Delete')} onClick={handleOpenDeleteDialog} />}
			{canChangeArtwork && <ActionButton path={DETAIL_ICON_PATHS.artwork} label={$L('Change Artwork')} onClick={handleOpenArtworkModal} spotlightId="details-artwork-btn" />}
		</RowContainer>
	);

	const heroTitle = () => {
		if (logoUrl && !isPerson) {
			return <img className={`${css.logo} ${invertLogo ? css.logoInvert : ''}`} src={logoUrl} alt={item.Name} onError={onLogoError} />;
		}
		const titleText = isEpisode && item.SeriesName ? item.SeriesName : item.Name;
		return <h1 className={css.title}>{titleText}</h1>;
	};

	const renderUpNext = () => {
		const ep = nextUp?.[0];
		if (!ep) return null;
		const thumb = ep.ImageTags?.Primary ? getImageUrl(effectiveServerUrl, ep.Id, 'Primary', {maxWidth: 400, quality: 80}) : null;
		const label = ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:E${ep.IndexNumber}` : '';
		const progress = ep.UserData?.PlayedPercentage || 0;
		return (
			<RowContainer className={css.upNext} onKeyDown={handleUpNextKeyDown}>
				<div className={css.upNextLabel}>{$L('Next Up')}</div>
				{/* eslint-disable-next-line react/jsx-no-bind */}
				<SpottableDiv className={css.upNextCard} onClick={() => onSelectItem?.(ep)}>
					<div className={css.upNextThumb}>
						{thumb && <img src={thumb} alt="" />}
						<div className={css.upNextPlay}><Icon path={DETAIL_ICON_PATHS.play} /></div>
						{progress > 0 && <div className={css.upNextProgress}><div style={{width: `${Math.min(progress, 100)}%`}} /></div>}
					</div>
					<div className={css.upNextInfo}>
						<span className={css.upNextTitle}>{label ? `${label} ${ep.Name}` : ep.Name}</span>
						{ep.Overview && <span className={css.upNextOverview}>{ep.Overview}</span>}
					</div>
				</SpottableDiv>
			</RowContainer>
		);
	};

	const personBorn = () => {
		if (!isPerson) return null;
		const parts = [];
		if (birthDate) parts.push(birthDate.getFullYear());
		if (birthPlace) parts.push(birthPlace);
		if (!parts.length) return null;
		return <div className={css.personBorn}>{parts.join(' · ')}</div>;
	};

	return (
		<>
			<div className={`${css.backdrop} ${isPerson ? css.backdropPerson : ''}`}>
				{backdropUrl && !isPerson && <img className={css.backdropImage} src={backdropUrl} alt="" />}
			</div>
			<Scroller cbScrollTo={handleScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
				<div className={css.content}>
					<div className={`${css.hero} ${nextUp?.[0] ? css.hasUpNext : ''}`}>
						<div className={`${css.heroMain} ${isPerson ? css.heroPerson : ''}`}>
							{isPerson && posterUrl && <img className={css.personAvatar} src={posterUrl} alt="" />}
							{heroTitle()}
							{isEpisode && <div className={css.episodeTitle}>{item.Name}</div>}
							{personBorn()}
							{metaPieces.length > 0 && (
								<div className={css.metaRow}>
									{metaPieces.map((piece, i) => <span key={i} className={css.metaItem}>{piece}</span>)}
								</div>
							)}
							{!isPerson && <RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false} />}
							{tagline && <div className={css.tagline}>{tagline}</div>}
							{item.Overview && (
								<SpottableDiv
									className={`${css.descriptionContainer} ${canToggle ? css.descriptionContainerSpottable : ''}`}
									onClick={canToggle ? handleToggleExpand : null}
									spotlightDisabled={!canToggle}
								>
									<p ref={descriptionRef} className={`${css.overview} ${!isExpanded ? css.overviewCollapsed : ''}`}>
										{item.Overview}
									</p>
									{canToggle && <div className={css.readMoreBtn}>{isExpanded ? $L('Read Less') : $L('Read More')}</div>}
								</SpottableDiv>
							)}
						</div>
						{renderUpNext()}
					</div>
					{!isBoxSet && !isPerson && renderActionButtons()}
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
