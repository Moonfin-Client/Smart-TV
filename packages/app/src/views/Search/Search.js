import {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {isPaused} from '@enact/spotlight/Pause';
import {useAuth} from '../../context/AuthContext';
import {pointerHover} from '../../utils/focusScroll';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import * as connectionPool from '../../services/connectionPool';
import * as gamesApi from '../../services/gamesApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import ProxiedImage from '../../components/ProxiedImage';
import DetailsTabBar from '../../components/DetailsTabBar';
import GameCard from '../../components/GameCard';
import {KEYS} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {isGameLibrary, resolveGameLibraryId} from '../../utils/gameLibrary';
import {groupSearchResults, aspectClassForType, isCircleType, filterByName, fetchAllGames, filterGames} from '../../utils/searchGroups';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import useStorage from '../../hooks/useStorage';
import {
	initialCardCount,
	expandedCardCount,
	searchArtworkOptions,
	shouldMountSearchRow
} from './searchWindow';

import css from './Search.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', leaveFor: {up: 'search-tabs'}}, 'div');
// Without a default element, entering the container lands on Clear, since that
// is first in the DOM. Point it at the chips so arriving here offers a search.
const RecentContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	defaultElement: '[data-recent-chip]'
}, 'div');

const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_LENGTH = 2;
const GLOBAL_FETCH_LIMIT = 240;
const SEERR_CAP = 24;
const RECENT_SEARCHES_KEY = 'search_recentQueries';
const RECENT_SEARCHES_MAX = 10;

const SearchIcon = () => (
	<svg viewBox="0 0 24 24" fill="currentColor" className={css.searchIcon}>
		<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
	</svg>
);

const cardSizeClass = (type) => {
	const aspect = aspectClassForType(type);
	if (aspect === 'wide') return {card: css.cardWide, img: css.imgWide};
	if (aspect === 'square') return {card: css.cardSquare, img: css.imgSquare};
	return {card: css.cardPoster, img: css.imgPoster};
};

const jellyfinSubtitle = (item) => {
	switch (item.Type) {
		case 'Episode':
			return `${item.SeriesName || ''} S${item.ParentIndexNumber ?? '?'}E${item.IndexNumber ?? '?'}`;
		case 'Person':
			return $L('Person');
		case 'MusicArtist':
		case 'AlbumArtist':
			return $L('Artist');
		case 'MusicAlbum':
			return item.AlbumArtist || item.ProductionYear || '';
		case 'Audio':
			return item.AlbumArtist || item.Artists?.[0] || item.Album || '';
		default:
			return item.ProductionYear || '';
	}
};

const Search = ({onSelectItem, onSelectSeerrItem, onSelectPerson, onSelectGame, onPlayChannel}) => {
	const {api, serverUrl, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const {isEnabled: seerrEnabled, api: seerrApi, displayName: seerrName} = useSeerr();

	const [query, setQuery] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [groups, setGroups] = useState([]);
	const [seerrResults, setSeerrResults] = useState([]);
	const [gameResults, setGameResults] = useState([]);
	const [activeTab, setActiveTab] = useState('all');
	const [activeRowIndex, setActiveRowIndex] = useState(0);
	const [visibleCardCounts, setVisibleCardCounts] = useState({});
	const [recentSearches, saveRecentSearches] = useStorage(RECENT_SEARCHES_KEY, []);

	// doSearch records into this list, so it reads the current value through a
	// ref rather than taking a dependency that would rebuild it on every search.
	const recentSearchesRef = useRef(recentSearches);
	useEffect(() => {
		recentSearchesRef.current = recentSearches;
	}, [recentSearches]);

	const debounceRef = useRef(null);
	const requestIdRef = useRef(0);
	const lastResultNamesRef = useRef([]);
	const scrollerRefs = useRef({});
	const gameLibrariesRef = useRef([]);
	const hasLiveTvRef = useRef(false);
	const allGamesRef = useRef(null);

	// Discover game and Live TV libraries once so search can widen its scope.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const views = await api.getLibraries();
				if (cancelled) return;
				const libs = views?.Items || [];
				gameLibrariesRef.current = libs
					.filter((lib) => isGameLibrary(lib.Id, lib.CollectionType, lib.Name))
					.map((lib) => ({...lib, Id: resolveGameLibraryId(lib)}));
				hasLiveTvRef.current = libs.some((lib) => lib.CollectionType === 'livetv');
			} catch (_err) {
				void _err;
			}
		})();
		return () => { cancelled = true; };
	}, [api]);

	const seerrLabel = seerrName || $L('Seerr');

	// Focus the All pill itself. Focusing the tab container would land on the
	// first pill, which is Seerr or Games when either has results.
	const focusAllTab = useCallback(() => {
		if (!Spotlight.focus('[data-spotlight-id="search-tabs"] [data-id="all"]')) {
			Spotlight.focus('search-tabs');
		}
	}, []);

	// Recorded once a search actually returns, so the half-typed prefixes that
	// the debounce fires along the way never reach the list.
	const rememberSearch = useCallback((q) => {
		const trimmed = q.trim();
		if (!trimmed) return;
		const current = recentSearchesRef.current || [];
		const deduped = current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
		const next = [trimmed, ...deduped].slice(0, RECENT_SEARCHES_MAX);
		recentSearchesRef.current = next;
		saveRecentSearches(next);
	}, [saveRecentSearches]);

	const doSearch = useCallback(async (searchQuery) => {
		const q = (searchQuery || '').trim();
		if (q.length < MIN_SEARCH_LENGTH) {
			setGroups([]);
			setSeerrResults([]);
			setGameResults([]);
			setActiveRowIndex(0);
			setVisibleCardCounts({});
			return;
		}

		const requestId = ++requestIdRef.current;
		const isStudioQuery = q.toLowerCase().startsWith('studio:');
		setIsLoading(true);

		try {
			const [libraryResult, channels] = await Promise.all([
				unifiedMode
					? connectionPool.searchAllServers(q, GLOBAL_FETCH_LIMIT).then((serverItems) => ({Items: serverItems}))
					: api.search(q, GLOBAL_FETCH_LIMIT),
				hasLiveTvRef.current && !isStudioQuery
					? api.getLiveTvChannels(0, 500).then((r) => r?.Items || []).catch(() => [])
					: Promise.resolve([])
			]);
			if (requestId !== requestIdRef.current) return;

			const items = [...(libraryResult.Items || []), ...filterByName(channels, q)];
			lastResultNamesRef.current = items.map((found) => found.Name).filter(Boolean);
			setGroups(groupSearchResults(items));
			setActiveRowIndex(0);
			setVisibleCardCounts({});
			setIsLoading(false);
			rememberSearch(q);
			// A new query always starts on All. Focus it once the tabs render, unless
			// the user is still typing, in which case Spotlight is paused and the
			// input keeps focus until they press down.
			setActiveTab('all');
			if (!isPaused()) {
				setTimeout(focusAllTab, 50);
			}

			// Seerr and Games load after the library results so the rows appear first.
			if (seerrEnabled && seerrApi && !isStudioQuery) {
				seerrApi.search(q).then((res) => {
					if (requestId !== requestIdRef.current) return;
					const filtered = (res.results || []).filter((r) => r.mediaType !== 'person').slice(0, SEERR_CAP);
					setSeerrResults(filtered);
				}).catch((err) => console.error('Seerr search failed:', err));
			} else {
				setSeerrResults([]);
			}

			if (gameLibrariesRef.current.length > 0 && !isStudioQuery) {
				if (!allGamesRef.current) {
					allGamesRef.current = await fetchAllGames(gameLibrariesRef.current);
				}
				if (requestId !== requestIdRef.current) return;
				setGameResults(filterGames(allGamesRef.current, q));
			} else {
				setGameResults([]);
			}
		} catch (err) {
			if (requestId !== requestIdRef.current) return;
			console.error('Search failed:', err);
			setGroups([]);
			setSeerrResults([]);
			setGameResults([]);
			setIsLoading(false);
		}
	}, [api, seerrEnabled, seerrApi, unifiedMode, focusAllTab, rememberSearch]);

	const handleInputChange = useCallback((e) => {
		let value = e.target.value;
		try { value = decodeURIComponent(escape(value)); } catch (_err) { void _err; }
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => doSearch(value), SEARCH_DEBOUNCE_MS);
	}, [doSearch]);

	// Titles for the keyboard's suggestion chips. These come out of the results the
	// screen already loaded, so offering them costs no extra trip to the server.
	const fetchKeyboardSuggestions = useCallback((text) => {
		const typed = text.trim().toLowerCase();
		if (!typed) return [];
		return lastResultNamesRef.current.filter((name) => name.toLowerCase().indexOf(typed) >= 0);
	}, []);

	const handleClearSearch = useCallback(() => {
		setQuery('');
		setGroups([]);
		setSeerrResults([]);
		setGameResults([]);
		setActiveRowIndex(0);
		setVisibleCardCounts({});
		Spotlight.focus('search-input');
	}, []);

	// Picking a past query runs it straight away. The debounce only exists to
	// throttle typing, and there is nothing left to wait for here.
	const handleSelectRecent = useCallback((e) => {
		const term = e.currentTarget.dataset.term;
		if (!term) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		setQuery(term);
		doSearch(term);
	}, [doSearch]);

	const handleClearRecent = useCallback(() => {
		recentSearchesRef.current = [];
		saveRecentSearches([]);
		Spotlight.focus('search-input');
	}, [saveRecentSearches]);

	const totalCount = useMemo(() => (
		groups.reduce((sum, g) => sum + g.items.length, 0) + seerrResults.length + gameResults.length
	), [groups, seerrResults, gameResults]);

	const tabs = useMemo(() => {
		const list = [];
		if (seerrResults.length > 0) list.push({id: 'seerr', label: `${seerrLabel}: ${seerrResults.length}`});
		if (gameResults.length > 0) list.push({id: 'games', label: `${$L('Games')}: ${gameResults.length}`});
		list.push({id: 'all', label: `${$L('All')}: ${totalCount}`});
		groups.forEach((g) => list.push({id: g.key, label: `${g.title}: ${g.items.length}`}));
		return list;
	}, [groups, seerrResults.length, gameResults.length, totalCount, seerrLabel]);

	const hasResults = totalCount > 0;

	// Keep the active tab valid as results change.
	useEffect(() => {
		if (!tabs.find((t) => t.id === activeTab)) setActiveTab('all');
	}, [tabs, activeTab]);

	const handleSelectTab = useCallback((id) => setActiveTab(id), []);

	// Rows shown in the All tab: groups first, then Seerr, then Games.
	const allRows = useMemo(() => {
		const rows = groups.map((g) => ({id: g.key, title: g.title, items: g.items, kind: 'jellyfin'}));
		if (seerrResults.length > 0) rows.push({id: 'seerr', title: seerrLabel, items: seerrResults, kind: 'seerr'});
		if (gameResults.length > 0) rows.push({id: 'games', title: $L('Games'), items: gameResults, kind: 'game'});
		return rows;
	}, [groups, seerrResults, gameResults, seerrLabel]);

	useEffect(() => {
		setTimeout(() => Spotlight.focus('search-input'), 100);
	}, []);

	useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

	const showRecent = !hasResults &&
		query.trim().length < MIN_SEARCH_LENGTH &&
		(recentSearches?.length || 0) > 0;

	// D-pad hand-offs between the input, the tabs and the content.
	// Where leaving the field downward lands, which is also where the keyboard
	// hands focus when it is dismissed upward. False when there is nothing below
	// the field yet.
	const focusBelowInput = useCallback(() => {
		if (hasResults) {
			focusAllTab();
			return true;
		}
		if (showRecent) {
			Spotlight.focus('search-recent');
			return true;
		}
		return false;
	}, [hasResults, showRecent, focusAllTab]);

	const handleInputKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		if (focusBelowInput()) e.preventDefault();
	}, [focusBelowInput]);

	const focusContent = useCallback(() => {
		if (activeTab === 'all') setActiveRowIndex(0);
		Spotlight.focus(activeTab === 'all' ? 'search-row-0' : 'search-grid');
	}, [activeTab]);

	// The press is stopped as well as prevented. Spotlight makes its own move once
	// the event reaches the top, and it would make that move out of whatever was
	// just focused here rather than out of the tabs.
	const handleTabsKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('search-input');
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			focusContent();
		}
	}, [focusContent]);

	const handleRowKeyDown = useCallback((e) => {
		const rowIndex = parseInt(e.currentTarget.dataset.rowIndex, 10);
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex === 0) {
				Spotlight.focus('search-tabs');
			} else {
				setActiveRowIndex(rowIndex - 1);
				Spotlight.focus(`search-row-${rowIndex - 1}`);
			}
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			if (rowIndex < allRows.length - 1) {
				setActiveRowIndex(rowIndex + 1);
				Spotlight.focus(`search-row-${rowIndex + 1}`);
			}
		}
	}, [allRows.length]);

	const handleRowFocus = useCallback((rowId, rowIndex, itemCount) => (e) => {
		if (pointerHover()) return;
		setActiveRowIndex((current) => current === rowIndex ? current : rowIndex);
		const card = e.target.closest('[data-spotlight-id]');
		const scroller = scrollerRefs.current[rowId];
		if (!card || !scroller) return;
		const spotlightId = card.getAttribute('data-spotlight-id') || '';
		const indexMatch = /-item-(\d+)$/.exec(spotlightId);
		if (indexMatch) {
			const focusedIndex = parseInt(indexMatch[1], 10);
			setVisibleCardCounts((current) => {
				const visible = current[rowId] || initialCardCount(itemCount);
				const expanded = expandedCardCount(visible, focusedIndex, itemCount);
				return expanded === visible ? current : {...current, [rowId]: expanded};
			});
		}
		const cardRect = card.getBoundingClientRect();
		const scrollerRect = scroller.getBoundingClientRect();
		if (cardRect.left < scrollerRect.left) {
			scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
		} else if (cardRect.right > scrollerRect.right) {
			scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
		}
	}, []);

	const handleSelectJellyfin = useCallback((item) => {
		if (item.Type === 'Person') {
			onSelectPerson?.(item);
		} else if (item.Type === 'TvChannel' || item.Type === 'LiveTvChannel') {
			(onPlayChannel || onSelectItem)?.(item);
		} else {
			onSelectItem?.(item);
		}
	}, [onSelectItem, onSelectPerson, onPlayChannel]);

	// One click handler for every card keeps a stable reference across the grid
	// instead of a closure per card.
	const handleCardClick = useCallback((e) => {
		const {kind, id} = e.currentTarget.dataset;
		if (kind === 'seerr') {
			// The route the discover and browse rows take. It opens the real library
			// item when Seerr already has one for the title, and the screen that can
			// request it when it does not.
			const item = seerrResults.find((i) => String(i.id) === id);
			if (item) onSelectSeerrItem?.(item);
			return;
		}
		for (const group of groups) {
			const item = group.items.find((i) => i.Id === id);
			if (item) { handleSelectJellyfin(item); return; }
		}
	}, [groups, seerrResults, onSelectSeerrItem, handleSelectJellyfin]);

	const handleGameSelect = useCallback((game) => onSelectGame?.(game._library, game), [onSelectGame]);

	const renderJellyfinCard = useCallback((item, spotlightId) => {
		const aspect = aspectClassForType(item.Type);
		const {card, img} = cardSizeClass(item.Type);
		const circle = isCircleType(item.Type);
		const itemServerUrl = item._serverUrl || serverUrl;
		const hasImage = item.ImageTags?.Primary || item.PrimaryImageTag;
		const primaryTag = item.ImageTags?.Primary || item.PrimaryImageTag;
		let imageUrl = hasImage
			? getImageUrl(itemServerUrl, item.Id, 'Primary', searchArtworkOptions(aspect, primaryTag))
			: null;
		if (!imageUrl && item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
			imageUrl = getImageUrl(
				itemServerUrl,
				item.AlbumId,
				'Primary',
				searchArtworkOptions(aspect, item.AlbumPrimaryImageTag)
			);
		}
		return (
			<SpottableDiv
				key={item.Id}
				className={`${css.card} ${card}`}
				onClick={handleCardClick}
				data-kind="jellyfin"
				data-id={item.Id}
				spotlightId={spotlightId}
			>
				<div className={`${css.cardImg} ${img} ${circle ? css.imgCircle : ''}`}>
					{unifiedMode && item._serverName && <div className={css.serverBadge}>{item._serverName}</div>}
					{imageUrl
						? <img className={css.cardImage} src={imageUrl} alt={item.Name} loading="lazy" />
						: <div className={css.cardPlaceholder}>{circle ? '👤' : '🎬'}</div>}
					{item.UserData?.Played && (
						<div className={css.watchedBadge}>
							<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
						</div>
					)}
				</div>
				<div className={css.cardTitle}>{item.Name}</div>
				<div className={css.cardSubtitle}>{jellyfinSubtitle(item)}</div>
			</SpottableDiv>
		);
	}, [serverUrl, unifiedMode, handleCardClick]);

	const renderSeerrCard = useCallback((item, spotlightId) => {
		const imageUrl = item.posterPath ? seerrApi.getImageUrl(item.posterPath, 'w300') : null;
		const year = item.releaseDate ? new Date(item.releaseDate).getFullYear()
			: item.firstAirDate ? new Date(item.firstAirDate).getFullYear() : '';
		return (
			<SpottableDiv
				key={`seerr-${item.id}`}
				className={`${css.card} ${css.cardPoster}`}
				onClick={handleCardClick}
				data-kind="seerr"
				data-id={String(item.id)}
				spotlightId={spotlightId}
			>
				<div className={`${css.cardImg} ${css.imgPoster}`}>
					{imageUrl
						? <ProxiedImage className={css.cardImage} src={imageUrl} alt={item.title || item.name} />
						: <div className={css.cardPlaceholder}>{item.mediaType === 'movie' ? '🎬' : '📺'}</div>}
				</div>
				<div className={css.cardTitle}>{item.title || item.name}</div>
				<div className={css.cardSubtitle}>{year}</div>
			</SpottableDiv>
		);
	}, [seerrApi, handleCardClick]);

	const renderGameCard = useCallback((game, spotlightId) => (
		<GameCard
			key={`game-${game.id}`}
			game={game}
			artUrl={gamesApi.gameThumbUrl(resolveGameLibraryId(game._library), game.id)}
			width={150}
			spotlightId={spotlightId}
			onSelect={handleGameSelect}
		/>
	), [handleGameSelect]);

	const renderCard = useCallback((kind, item, spotlightId) => {
		if (kind === 'seerr') return renderSeerrCard(item, spotlightId);
		if (kind === 'game') return renderGameCard(item, spotlightId);
		return renderJellyfinCard(item, spotlightId);
	}, [renderSeerrCard, renderGameCard, renderJellyfinCard]);

	// The active grid tab (a type group, Seerr, or Games).
	const gridConfig = useMemo(() => {
		if (activeTab === 'seerr') return {items: seerrResults, kind: 'seerr'};
		if (activeTab === 'games') return {items: gameResults, kind: 'game'};
		const group = groups.find((g) => g.key === activeTab);
		if (!group) return null;
		return {items: group.items, kind: 'jellyfin'};
	}, [activeTab, groups, seerrResults, gameResults]);

	const renderContent = () => {
		if (activeTab === 'all') {
			return (
				<div className={css.resultsContainer}>
					{allRows.map((row, rowIndex) => {
						const mounted = shouldMountSearchRow(rowIndex, activeRowIndex);
						const visibleCount = visibleCardCounts[row.id] || initialCardCount(row.items.length);
						const firstType = row.kind === 'jellyfin' ? row.items[0]?.Type : 'Movie';
						const placeholderSize = cardSizeClass(firstType);
						return (
						<RowContainer
							key={row.id}
							className={css.resultRow}
							spotlightId={`search-row-${rowIndex}`}
							data-row-index={rowIndex}
							onKeyDown={handleRowKeyDown}
						>
							<h2 className={css.rowTitle}>{row.title}<span className={css.rowCount}> ({row.items.length})</span></h2>
							<div
								className={css.rowScroller}
								ref={(el) => { scrollerRefs.current[row.id] = el; }}
								onFocus={handleRowFocus(row.id, rowIndex, row.items.length)}
							>
								{mounted ? (
									<div className={css.resultItems}>
										{row.items.slice(0, visibleCount).map((item, idx) => renderCard(row.kind, item, `${row.id}-item-${idx}`))}
									</div>
								) : (
									<div className={css.resultItems} aria-hidden="true">
										<div className={`${css.card} ${placeholderSize.card} ${css.windowPlaceholder}`}>
											<div className={`${css.cardImg} ${placeholderSize.img}`} />
											<div className={css.cardTitle}>&nbsp;</div>
											<div className={css.cardSubtitle}>&nbsp;</div>
										</div>
									</div>
								)}
							</div>
						</RowContainer>
						);
					})}
				</div>
			);
		}
		if (!gridConfig) return null;
		return (
			<GridContainer className={css.gridWrapper} spotlightId="search-grid">
				<div className={css.grid}>
					{gridConfig.items.map((item, idx) => renderCard(gridConfig.kind, item, `grid-item-${idx}`))}
				</div>
			</GridContainer>
		);
	};

	return (
		<div className={css.searchContainer}>
			<div className={css.searchInputSection}>
				<div className={css.searchInputWrapper}>
					<SearchIcon />
					<SpottableInput
						type="text"
						purpose="search"
						recents={recentSearches}
						suggestionsBuilder={fetchKeyboardSuggestions}
						className={css.searchInput}
						placeholder={$L('Search movies, shows, music, and more...')}
						value={query}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						onExitTop={focusBelowInput}
						spotlightId="search-input"
						autoComplete="off"
					/>
					{query && <button className={css.clearBtn} onClick={handleClearSearch}>×</button>}
				</div>
			</div>

			<div className={css.searchResults}>
				{hasResults && (
					<div className={css.tabsRow} onKeyDown={handleTabsKeyDown}>
						<DetailsTabBar
							tabs={tabs}
							activeId={activeTab}
							onSelect={handleSelectTab}
							onActivate={handleSelectTab}
							expanded
							spotlightId="search-tabs"
						/>
					</div>
				)}

				{isLoading && !hasResults ? (
					<div className={css.loadingIndicator}><LoadingSpinner /><p>{$L('Searching...')}</p></div>
				) : showRecent ? (
					<RecentContainer className={css.recentSection} spotlightId="search-recent">
						<div className={css.recentHeader}>
							<h2 className={css.recentTitle}>{$L('Recent Searches')}</h2>
							<SpottableButton className={css.recentClear} onClick={handleClearRecent}>
								{$L('Clear')}
							</SpottableButton>
						</div>
						<div className={css.recentList}>
							{recentSearches.map((term) => (
								<SpottableButton
									key={term}
									className={css.recentChip}
									data-recent-chip
									data-term={term}
									onClick={handleSelectRecent}
								>
									{term}
								</SpottableButton>
							))}
						</div>
					</RecentContainer>
				) : !query || query.length < MIN_SEARCH_LENGTH ? (
					<div className={css.emptyState}>
						<SearchIcon />
						<h2>{$L('Search for content')}</h2>
						<p>{$L('Find movies, TV shows, music, and more')}</p>
					</div>
				) : !hasResults ? (
					<div className={css.noResults}>
						<h2>{$L('No results found')}</h2>
						<p>{$L('Try a different search term')}</p>
					</div>
				) : (
					renderContent()
				)}
			</div>
		</div>
	);
};

export default Search;
