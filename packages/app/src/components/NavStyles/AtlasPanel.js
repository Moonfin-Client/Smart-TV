import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useAuth} from '../../context/AuthContext';
import {getApiForItem} from '../../services/connectionPool';
import seerrApi from '../../services/seerrApi';
import {tagWithServerOf} from '../../utils/episodeBrowser';
import {isGameLibrary} from '../../utils/gameLibrary';
import {isLiveTvLibrary} from '../../utils/liveTvLibrary';
import {KEYS} from '../../utils/keys';
import {modernCardImageUrl} from '../MediaCard/cardArtwork';
import {ChevronRightIcon} from '../icons/navIcons';
import {libraryCoverUrl} from './navDestinations';

import css from './AtlasBar.module.less';

const SpottableButton = Spottable('button');

// A button that hands its action to the panel, which closes before running it.
const PanelButton = ({action, onChoose, ...rest}) => {
	const handleClick = useCallback(() => onChoose(action), [action, onChoose]);
	return <SpottableButton {...rest} onClick={handleClick} />;
};

const PanelContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: `.${css.link}`
}, 'section');

export const atlasPanelKind = (entry) => {
	if (entry.key === 'livetv' || (entry.library && isLiveTvLibrary(entry.library))) return 'livetv';
	if (entry.key === 'discover') return 'discover';
	if (entry.key === 'libraries') return 'libraries';
	if (entry.library) return 'library';
	return null;
};

const collectionOf = (library) => String(library?.CollectionType || '').toLowerCase();

// Only links that land on a screen this app already has. The section's own page comes first.
export const atlasLinks = (kind, entry, handlers, allLibraries = []) => {
	const go = (label, onClick) => ({label, onClick});
	if (kind === 'libraries') return entry.libraries.map((lib) => go(lib.Name, () => handlers.onSelectLibrary?.(lib)));
	if (kind === 'livetv') {
		return [
			go($L('Guide'), handlers.onLiveTv),
			handlers.onOpenRecordings && go($L('Recordings'), handlers.onOpenRecordings)
		].filter(Boolean);
	}
	if (kind === 'discover') {
		return [
			go($L('Trending'), handlers.onDiscover),
			...(handlers.onOpenSeerrShortcut ? [
				go($L('Popular Movies'), () => handlers.onOpenSeerrShortcut('movies')),
				go($L('Popular Series'), () => handlers.onOpenSeerrShortcut('series')),
				go($L('Requests'), () => handlers.onOpenSeerrShortcut('requests'))
			] : [])
		];
	}
	const library = entry.library;
	const links = [go($L('Browse all'), entry.onClick)];
	if (isGameLibrary(library.Id, library.CollectionType, library.Name)) return links;
	const type = collectionOf(library);
	const collections = type === 'movies' && allLibraries.find((other) => collectionOf(other) === 'boxsets');
	if (collections) links.push(go($L('Collections'), () => handlers.onSelectLibrary?.(collections)));
	if (type === 'movies' || type === 'tvshows') links.push(go($L('Genres'), handlers.onGenres));
	if (type !== 'music') links.push(go($L('Favorites'), handlers.onFavorites));
	return links;
};

const itemsOf = (result) => (Array.isArray(result) ? result : result?.Items || []);

const loadPanel = async (kind, entry, api, serverType) => {
	let failed = false;
	// A failed request leaves its part of the panel empty, and the load isn't cached so the next
	// open asks again.
	const soft = (request) => request.catch(() => {
		failed = true;
		return null;
	});
	if (kind === 'livetv') {
		const recordings = await soft(api.getLiveTvRecordings({limit: 2}));
		return {cards: itemsOf(recordings).slice(0, 2), cardsTitle: $L('Recent Recordings'), failed};
	}
	if (kind === 'discover') {
		const [trending, popular] = await Promise.all([
			soft(seerrApi.trending(1)),
			soft(seerrApi.trendingMovies(1))
		]);
		return {
			seerr: true,
			cards: (trending?.results || []).slice(0, 2),
			cardsTitle: $L('Trending'),
			posters: (popular?.results || []).slice(0, 4),
			postersTitle: $L('Popular Movies'),
			failed
		};
	}
	const library = entry.library;
	if (isGameLibrary(library.Id, library.CollectionType, library.Name)) return {};
	const libraryApi = getApiForItem(library) || api;
	const music = collectionOf(library) === 'music';
	// Plex has no resume list for one library, so it would show every library's titles.
	const skipResume = music || (library._serverType || serverType) === 'plex';
	const [resume, latest] = await Promise.all([
		skipResume ? null : soft(libraryApi.getResumeItems(2, library.Id)),
		soft(libraryApi.getLatest(library.Id, 4))
	]);
	// A title read from another server carries that server along, so Details and the images reach it.
	return {
		cards: tagWithServerOf(library, itemsOf(resume).slice(0, 2)),
		cardsTitle: $L('Continue in {section}').replace('{section}', library.Name),
		posters: tagWithServerOf(library, itemsOf(latest).slice(0, 4)),
		postersTitle: $L('Recently Added'),
		square: music,
		failed
	};
};

// Read once per session for each panel, keeping only loads that came back whole. A home refresh
// empties it.
const panelCache = new Map();
if (typeof window !== 'undefined') {
	window.addEventListener('moonfin:browseRefresh', () => panelCache.clear());
}

const usePanelData = (kind, entry) => {
	const {api, serverUrl, serverType, user} = useAuth();
	const cacheKey = `${serverUrl}|${user?.Id}|${entry.key}`;
	const [data, setData] = useState(() => panelCache.get(cacheKey) || null);

	useEffect(() => {
		const cached = panelCache.get(cacheKey);
		if (cached) {
			setData(cached);
			return undefined;
		}
		setData(null);
		if (kind === 'libraries') return undefined;
		let live = true;
		loadPanel(kind, entry, api, serverType).then((loaded) => {
			if (!loaded.failed) panelCache.set(cacheKey, loaded);
			if (live) setData(loaded);
		}, () => {});
		return () => {
			live = false;
		};
	}, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

	return data;
};

const seerrImage = (path, size) => (path ? seerrApi.getImageUrl(path, size) : null);

const yearOf = (item) => String(item.ProductionYear || item.releaseDate || item.firstAirDate || '').slice(0, 4);

const cardText = (item, seerr) => {
	if (seerr) return {title: item.title || item.name, sub: yearOf(item)};
	if (item.SeriesName) return {title: item.SeriesName, sub: item.Name};
	return {title: item.Name, sub: yearOf(item)};
};

const AtlasPanel = ({entry, kind, tabId, accent, libraries, handlers, onClose}) => {
	const {serverUrl} = useAuth();
	const data = usePanelData(kind, entry);
	const links = atlasLinks(kind, entry, handlers, libraries);

	// Focus goes back to the tab first, as a classic bar button keeps it, and the page that
	// opens takes it from there.
	const choose = useCallback((action) => {
		Spotlight.focus(tabId);
		onClose();
		action?.();
	}, [onClose, tabId]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.UP && e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		const up = e.keyCode === KEYS.UP;
		if (!Spotlight.move(up ? 'up' : 'down') && up) {
			onClose();
			Spotlight.focus(tabId);
		}
	}, [onClose, tabId]);

	const seerr = Boolean(data?.seerr);
	const cards = data?.cards || [];
	const posters = kind === 'libraries' ? entry.libraries.slice(0, 4) : (data?.posters || []);
	const openItem = (item) => {
		if (seerr) return () => handlers.onSelectSeerrItem?.(item);
		if (kind === 'livetv' && handlers.onPlayRecording) return () => handlers.onPlayRecording(item);
		return () => handlers.onSelectItem?.(item);
	};
	const posterAction = (item) => (kind === 'libraries' ? () => handlers.onSelectLibrary?.(item) : openItem(item));
	const cardUrl = (item) => (seerr
		? seerrImage(item.backdropPath, 'w780')
		: modernCardImageUrl(item, true, {itemServerUrl: item._serverUrl || serverUrl}));
	const posterUrl = (item) => {
		if (seerr) return seerrImage(item.posterPath, 'w342');
		if (kind === 'libraries') return libraryCoverUrl(item, serverUrl);
		return modernCardImageUrl(item, false, {itemServerUrl: item._serverUrl || serverUrl});
	};

	return (
		<PanelContainer className={css.panel} spotlightId="navbar-panel" spotlightRestrict="self-only" onKeyDown={handleKeyDown}>
			<div className={css.linksColumn}>
				<div className={css.sectionTitle}>{entry.label}</div>
				{links.map((link, index) => (
					<PanelButton key={link.label} className={css.link} action={link.onClick} onChoose={choose} spotlightId={index === 0 ? 'navbar-panel-first' : undefined}>
						<span className={css.linkLabel}>{link.label}</span>
						<ChevronRightIcon className={css.linkChevron} />
					</PanelButton>
				))}
			</div>

			{cards.length > 0 && (
				<>
					<div className={css.divider} />
					<div className={css.column}>
						<div className={css.columnTitle}>{data.cardsTitle}</div>
						<div className={css.cardRow}>
							{cards.map((item) => {
								const {title, sub} = cardText(item, seerr);
								const url = cardUrl(item);
								const percent = item.UserData?.PlayedPercentage;
								return (
									<PanelButton key={item.Id || item.id} className={css.card} action={openItem(item)} onChoose={choose}>
										<div className={css.cardArt} style={url ? {backgroundImage: `url(${url})`} : null}>
											{percent > 0 && (
												<div className={css.progressTrack}>
													<div className={css.progressFill} style={{width: `${Math.min(100, percent)}%`, background: accent}} />
												</div>
											)}
										</div>
										<div className={css.cardTitle}>{title}</div>
										{sub && <div className={css.cardSub}>{sub}</div>}
									</PanelButton>
								);
							})}
						</div>
					</div>
				</>
			)}

			{posters.length > 0 && (
				<div className={`${css.column} ${css.postersColumn}`}>
					<div className={css.columnTitle}>{kind === 'libraries' ? $L('Libraries') : data.postersTitle}</div>
					<div className={css.cardRow}>
						{posters.map((item) => {
							const url = posterUrl(item);
							const shape = kind === 'libraries' ? css.wide : (data?.square ? css.square : '');
							return (
								<PanelButton key={item.Id || item.id} className={`${css.poster} ${shape}`} action={posterAction(item)} onChoose={choose}>
									<div className={css.posterArt} style={url ? {backgroundImage: `url(${url})`} : null}>
										{!url && <span className={css.posterName}>{item.Name || item.title || item.name}</span>}
									</div>
								</PanelButton>
							);
						})}
					</div>
				</div>
			)}
		</PanelContainer>
	);
};

export default AtlasPanel;
