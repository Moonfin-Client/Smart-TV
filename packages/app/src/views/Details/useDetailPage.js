import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {iconViewBox} from '../../components/icons/iconViewBox';
import {SeerrSeasonDot} from '../../components/seerr/SeerrStatusBadge';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle, seerrTitleStatus} from '../../components/seerr/SeerrStatusBanner';
import {SeerrChips, SeerrFacts, SeerrStreaming} from '../../components/seerr/SeerrSections';
import {rem, rootScale} from '../../utils/rootScale';
import {FavoriteHeartIcon, WatchedCheckIcon} from './DetailBadges';
import {castPhotoUrl} from './detailsMedia';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {RowContainer, SpottableDiv} from './detailsSpottables';
import MinimalistEpisodes, {EPISODES_ID} from './minimalist/MinimalistEpisodes';
import NouveauRail from './nouveau/sections/NouveauRail';
import {nouveauCardImageUrl} from './nouveau/nouveauCardImage';
import {spotlightItemImageUrl} from './spotlight/spotlightImages';
import {factsWeight} from './premiere/premiereRules';
import {stageTrackChoices} from './stage/stageRules';

import css from './stage/StageDetailContent.module.less';

// An opened cell of the people and studios panel holds focus until BACK closes it, the way Core
// traps focus inside the group it entered.
const TrapContainer = SpotlightContainerDecorator({enterTo: 'default-element', leaveFor: {left: '', right: '', up: '', down: ''}}, 'div');

// Core's spacing for a row of posters: the gap between cards, the room above and beside a focused
// card for it to grow into, and how far the cards sit under the row's title.
const POSTER_ROOM = {gap: 35.7, clearance: 58, bleed: 30, titleGap: 72};

// The room between chips sharing a row, which StageDetailContent.module.less keeps too.
const CHIP_GAP = 13.4;

// Past this the toolbar along the top fades out, so it never sits over the rows scrolled up to it.
const TOOLBAR_HIDES_AT = 24;

const SMOOTH_SCROLL = typeof document !== 'undefined' && 'scrollBehavior' in document.documentElement.style;

export const Icon = ({path, className}) => (
	<svg className={className} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

const findIn = (list, key) => list.find((candidate) => String(candidate.cardKey || candidate.Id) === key);

export const scrollPage = (scroller, top) => {
	if (SMOOTH_SCROLL) scroller.scrollTo({top, behavior: 'smooth'});
	else scroller.scrollTop = top;
};

// Focus lands first and the page is put back where it was, so the browser's own scroll to the
// focused element never runs ahead, and then the page goes back to its top.
export const focusAtTop = (scroller, target) => {
	const before = scroller ? scroller.scrollTop : 0;
	Spotlight.focus(target);
	if (!scroller) return;
	scroller.scrollTop = before;
	scrollPage(scroller, 0);
};

// Whether anything in `container` besides `active` takes focus on the given side of it.
export const hasSpottable = (container, active, side) => {
	const at = active.getBoundingClientRect();
	return Array.from(container.querySelectorAll('.spottable')).some((el) => {
		if (el === active) return false;
		const box = el.getBoundingClientRect();
		if (side === 'up') return box.bottom <= at.top + 1;
		if (side === 'down') return box.top >= at.bottom - 1;
		if (side === 'left') return box.right <= at.left + 1;
		return box.left >= at.right - 1;
	});
};

// The scrolling page parts Stage and Premiere share: the track chips, the people and studios panel,
// the episodes, the rows of cards and people, and what Seerr adds. Each part is a stop the page
// moves focus between, and each page lays them out its own way and decides where a press leaves
// one for, through `onNavigateUp` and `onNavigateDown`, which are handed the stop it left.
// `bleedRight` is how far a row runs on past the right edge of where it sits.
//
// The page also hides the toolbar along the top once it scrolls down, and BACK closes the overflow
// menu or an opened cell of the panel before it leaves the screen.
const useDetailPage = (props, {onNavigateUp, onNavigateDown, bleedRight}) => {
	const {
		item, settings, showsSection, seerr, seerrNav, effectiveServerUrl, backdropUrl, seasons, episodes,
		seriesEpisodes, similar = [], extras = [], cast = [], crew = [], collectionSections = [], onSelectItem,
		onSelectPerson, onSelectStudio, onSelectSeerrCard, handleEpisodePlay, handleOpenAudioModal,
		handleOpenSubtitleModal, handleOpenVersionModal, spotlightBackRef
	} = props;

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

	const episodesUp = useCallback(() => onNavigateUp(EPISODES_ID), [onNavigateUp]);
	const episodesDown = useCallback(() => onNavigateDown(EPISODES_ID), [onNavigateDown]);

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
	const seerrStyle = seerrBadgeStyle(settings);
	const renderLibraryPoster = (entry) => renderCard(entry, handlePosterCard);
	const renderSeerrPoster = (entry) => {
		const status = seerrStyle ? seerrTitleStatus(entry) : null;
		return renderCard(entry, handleSeerrCard, {
			children: seerrStyle === 'banner'
				? status && <SeerrStatusBanner status={status} large />
				: status && <span className={css.cardSeerrDot}><SeerrSeasonDot status={status} /></span>
		});
	};

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

	// Core draws a season Seerr knows of as its name on a plain card, with no artwork.
	const renderSeerrSeason = (season) => {
		const status = seerrStyle ? seerr.seasonMarkers?.get(season.seasonNumber) : null;
		return renderCard(season, handleSeasonCard, {
			imageUrl: null,
			placeholder: season.Name,
			subtitle: season.episodeCount ? String(season.episodeCount) : null,
			children: seerrStyle === 'banner'
				? hasSeerrDot(status) && <SeerrStatusBanner status={status} large />
				: <SeerrSeasonDot status={status} />
		});
	};

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
					bleedRight={px(bleedRight)}
					spotlightId={id}
					navbarPosition={settings.navbarPosition}
					onNavigateUp={onNavigateUp}
					onNavigateDown={onNavigateDown}
					renderItem={renderItem}
					{...extra}
				/>
			</>
		)
	});

	// The season tabs over the episode rail. `cardWidth` sizes the cards for the room the page gives
	// the rail.
	const episodesStop = ({onLeftEdge, cardWidth} = {}) => ({
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
				onLeftEdge={onLeftEdge}
				bleedRight={px(bleedRight)}
				cardWidth={cardWidth}
				large
			/>
		)
	});

	// The audio, subtitle and version pickers with what each is set to. With `shareRow` they split one
	// row between them and leave their names off, for a column too narrow for them to wrap. Each keeps
	// its own width up to an even share.
	const tracksStop = ({shareRow = false} = {}) => {
		const choices = stageTrackChoices(props);
		if (!choices.length) return null;
		const share = shareRow ? {maxWidth: `calc(${100 / choices.length}% - ${rem(CHIP_GAP)})`} : undefined;
		const openers = {audio: handleOpenAudioModal, subtitles: handleOpenSubtitleModal, version: handleOpenVersionModal};
		const looks = {
			audio: {label: $L('Audio'), icon: DETAIL_ICON_PATHS.audio},
			subtitles: {label: $L('Subtitles'), icon: DETAIL_ICON_PATHS.subtitle},
			version: {label: $L('Version'), icon: DETAIL_ICON_PATHS.version}
		};
		return {
			id: 'stage-tracks',
			node: (
				<RowContainer className={shareRow ? `${css.chipRow} ${css.chipRowShared}` : css.chipRow} spotlightId="stage-tracks">
					{choices.map((choice) => (
						<SpottableDiv key={choice.id} className={css.chip} style={share} onClick={openers[choice.id]}>
							<Icon path={looks[choice.id].icon} className={css.chipIcon} />
							{!shareRow && <span className={css.chipLabel}>{looks[choice.id].label}</span>}
							<span className={css.chipValue}>{choice.current}</span>
						</SpottableDiv>
					))}
				</RowContainer>
			)
		};
	};

	// The people and studios behind the title, one cell each. A cell takes focus first, and OK opens
	// it so its names can be picked. The crew list merges a director who also wrote into one entry, so
	// the roles are read from People. With `weighByText` each cell's width follows how much text it
	// holds and its names sit side by side, where otherwise the cells split the panel evenly.
	const factsStop = ({weighByText = false} = {}) => {
		const people = showsSection('crew') ? item.People || [] : [];
		const directors = people.filter((person) => person.Type === 'Director');
		const writers = people.filter((person) => person.Type === 'Writer');
		const studios = showsSection('studios') ? (item.Studios || []).map((studio) => studio?.Name).filter(Boolean) : [];
		const groups = [
			{key: 'directors', title: directors.length === 1 ? $L('Director') : $L('Directors'), names: directors.map((p) => ({key: p.Id || p.Name, name: p.Name, person: true}))},
			{key: 'writers', title: writers.length === 1 ? $L('Writer') : $L('Writers'), names: writers.map((p) => ({key: p.Id || p.Name, name: p.Name, person: true}))},
			{key: 'studios', title: $L('Studio'), names: studios.map((name) => ({key: name, name}))}
		].filter((group) => group.names.length);
		if (!groups.length) return null;
		return {
			id: 'stage-facts',
			node: (
				<RowContainer className={`${css.panel} ${weighByText ? css.weighed : ''}`} spotlightId="stage-facts">
					{groups.map((group, index) => {
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
						// An open cell can't stay a disabled spottable, since that blurs any focus that lands
						// inside it, its own names included.
						const Cell = entered ? 'div' : SpottableDiv;
						return (
							<Cell
								key={group.key}
								className={`${css.cell} ${index ? css.cellDivided : css.cellFirst} ${index === groups.length - 1 ? css.cellLast : ''}`}
								data-group={group.key}
								style={weighByText ? {flexGrow: factsWeight(group.names.map((entry) => entry.name))} : undefined}
								onClick={entered ? undefined : handleOpenGroup}
							>
								<div className={css.cellTitle}>{group.title}</div>
								{entered
									? <TrapContainer className={css.cellNames} spotlightId={`stage-group-${group.key}`} data-stage-trap>{names}</TrapContainer>
									: <div className={css.cellNames}>{names}</div>}
							</Cell>
						);
					})}
				</RowContainer>
			)
		};
	};

	// A show that's only in Seerr, its seasons as cards that each open the request sheet.
	const seerrSeasonsStop = (onLeftEdge) => {
		const seerrSeasons = (seerr.details?.seasons || []).filter((season) => season.seasonNumber > 0);
		if (!seerrSeasons.length) return null;
		const cards = seerrSeasons.map((season) => ({
			...season,
			Id: season.seasonNumber,
			Name: season.name || $L('Season {number}').replace('{number}', season.seasonNumber)
		}));
		return rail('stage-seasons', $L('Seasons'), cards, renderSeerrSeason, {...POSTER_ROOM, gap: 20}, {onLeftEdge});
	};

	// The full width rows: the cast, extras, the collections the title belongs to, more like it and
	// what Seerr adds. Seerr's own block is `whole` when it has nothing to press, its numbers and
	// streaming services alone.
	const rowStops = () => {
		const rows = [];
		if (cast.length) rows.push(rail('stage-cast', $L('Cast'), cast, renderPerson, {gap: 26.7, clearance: 10, bleed: 10, titleGap: 20}));
		if (extras.length) rows.push(rail('stage-extras', $L('Extras'), extras, renderExtra, {gap: 30, clearance: 32, bleed: 30, titleGap: 39}));
		collectionSections.forEach((section, index) => {
			if (section.items.length) rows.push(rail(`stage-collection-${index}`, section.name, section.items, renderLibraryPoster));
		});
		if (similar.length) rows.push(rail('stage-similar', $L('More Like This'), similar, renderLibraryPoster, POSTER_ROOM, {itemMenu: true}));

		const pieces = seerr.pieces || {};
		if (pieces.chips || pieces.facts || pieces.streaming) {
			const Block = pieces.chips ? RowContainer : 'div';
			rows.push({
				id: 'stage-seerr',
				whole: !pieces.chips,
				node: (
					<Block className={css.seerrBlock} {...(pieces.chips ? {spotlightId: 'stage-seerr'} : null)}>
						<h2 className={css.rowTitle}>{seerr.displayName}</h2>
						{pieces.chips && <SeerrChips details={seerr.details} mediaType={seerr.mediaType} seerrNav={seerrNav} />}
						{pieces.facts && <SeerrFacts details={seerr.details} mediaType={seerr.mediaType} />}
						{pieces.streaming && <SeerrStreaming providers={seerr.streamingProviders} />}
					</Block>
				)
			});
		}
		if (pieces.recommendations) {
			rows.push(rail('stage-seerr-recommendations', `${seerr.displayName} · ${$L('Recommendations')}`, seerr.recommendationCards, renderSeerrPoster));
		}
		if (pieces.similar) {
			rows.push(rail('stage-seerr-similar', `${seerr.displayName} · ${$L('Similar')}`, seerr.similarCards, renderSeerrPoster));
		}
		return rows;
	};

	return {menuBackRef, handleScroll, episodesStop, tracksStop, factsStop, seerrSeasonsStop, rowStops};
};

export default useDetailPage;
