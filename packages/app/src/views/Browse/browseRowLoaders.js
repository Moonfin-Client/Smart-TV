// The rows that fill in behind the first paint. Each one fetches its own slice and hands it
// straight to appendRows, so a slow one only holds up its own row rather than the screen.

import $L from '@enact/i18n/$L';
import {scopedGetItems} from '../../services/libraryScope';
import {genericCollectionLabel, mergeRecentRows} from '../../utils/mergeRecentRows';
import {latestMediaFetchLimitForCollection, normalizeLatestMediaItems} from '../../utils/latestMediaRowNormalizer';

import {HOME_ROW_ITEM_FIELDS, createApiForServer, getServerType} from '../../services/jellyfinApi';
import {getAllServersArray} from '../../services/multiServerManager';
import {loadSinceYouWatchedRows, loadRewatchItems} from '../../services/homeRecommendations';
import {FAVORITE_ROW_CONFIGS, getItemGenreNames, stableIndex} from './browseFilters';
import {loadCollectionRowItems} from './collectionRowItems';
import {apiSortBy, getGenresIncludeTypes, isPlaylistOrder, resolveSortOrder} from '../../utils/homeRowSorting';
import {collapseLatestTvItems} from '../../utils/latestMediaRowNormalizer';
import {isPickedRow, isPickedRowShown, isSameServer} from '../../utils/pickedRows';
import mapBounded from '../../utils/mapBounded';

// How many sections from the top load with Home. A picked row below them waits until Home comes
// near it, so a Home with hundreds of collections doesn't fetch them all up front.
const EAGER_SECTION_COUNT = 8;

// The sort settings and enabled flags every loader reads, worked out once rather than by each
// of them. Everything here is a plain function of the settings and the row list, apart from the
// Seerr state, which is read when the Since you watched rows load.
export const buildLoaderContext = ({api, serverUrl, settings, homeRowsConfig, eligibleLibraries, recommendations, appendRows}) => {
	const rowEnabled = (id) => homeRowsConfig.some((row) => row.enabled && row.id === id);
	const enabledRows = homeRowsConfig.filter((row) => row.enabled);
	const pickedRows = enabledRows.filter((row) => isPickedRow(row) && isPickedRowShown(row, settings, serverUrl, getServerType()));
	// Playlist order is not a server sort field, so every row hands the server
	// the fallback and the rows that honor the arrangement check the setting
	// itself.
	const favoriteSortBy = apiSortBy(settings.favoritesRowSortBy || 'SortName');
	const collectionsSortBy = apiSortBy(settings.collectionsRowSortBy || 'SortName');
	const genresSortBy = apiSortBy(settings.genresRowSortBy || 'SortName');
	const playlistsSortBy = apiSortBy(settings.playlistsRowSortBy || 'SortName');
	const audioRowsSortBy = apiSortBy(settings.audioRowsSortBy || 'SortName');

	return {
		api,
		serverUrl,
		settings,
		appendRows,
		eligibleLibraries,
		recommendations,
		favoriteSortBy,
		favoriteSortOrder: resolveSortOrder(favoriteSortBy, settings.favoritesRowSortOrder),
		collectionsSortBy,
		collectionsSortOrder: resolveSortOrder(collectionsSortBy, settings.collectionsRowSortOrder),
		genresSortBy,
		genresSortOrder: resolveSortOrder(genresSortBy, settings.genresRowSortOrder),
		genresIncludeTypes: getGenresIncludeTypes(settings.genresRowItemFilter),
		playlistsSortBy,
		playlistsSortOrder: resolveSortOrder(playlistsSortBy, settings.playlistsRowSortOrder),
		audioRowsSortBy,
		audioRowsSortOrder: resolveSortOrder(audioRowsSortBy, settings.audioRowsSortOrder),
		audioArtistsEnabled: settings.displayAudioRows && rowEnabled('audioartists'),
		audioAlbumsEnabled: settings.displayAudioRows && rowEnabled('audioalbums'),
		audioPlaylistsEnabled: settings.displayAudioRows && rowEnabled('audioplaylists'),
		resumeAudioEnabled: settings.displayAudioRows && rowEnabled('resumeaudio'),
		recordingsEnabled: rowEnabled('activerecordings'),
		onNowEnabled: rowEnabled('onnow'),
		rewatchEnabled: settings.displayRewatchRow !== false && rowEnabled('rewatch'),
		studiosEnabled: settings.displayStudiosRows && rowEnabled('studios'),
		enabledPluginSections: pickedRows.filter((row) => enabledRows.indexOf(row) < EAGER_SECTION_COUNT),
		deferredPluginSections: pickedRows.filter((row) => enabledRows.indexOf(row) >= EAGER_SECTION_COUNT),
		sinceYouWatchedIndexes: homeRowsConfig
			.filter((row) => row.enabled && row.id.startsWith('sinceyouwatched'))
			.map((row) => parseInt(row.id.replace('sinceyouwatched', ''), 10))
			.filter((idx) => idx >= 1)
			.sort((a, b) => a - b)
	};
};

// A playlist opens into the things it holds. Playlist order comes from the
// dedicated endpoint, which returns them exactly as they were arranged.
const expandPlaylistsToItems = async (api, playlists, limit, usePlaylistOrder, sortBy, sortOrder) => {
	const expanded = await Promise.all(playlists.map(async (playlist) => {
		if (playlist?.Type !== 'Playlist') return [playlist];
		try {
			const result = usePlaylistOrder
				? await api.getPlaylistItems(playlist.Id, limit)
				: await api.getItems({ParentId: playlist.Id, SortBy: sortBy, SortOrder: sortOrder, Limit: limit, Fields: HOME_ROW_ITEM_FIELDS});
			const items = result?.Items || [];
			return items.length ? items : [playlist];
		} catch (_error) {
			return [playlist];
		}
	}));
	return [].concat(...expanded).slice(0, limit);
};

const loadLatestAndRecentlyReleased = async (ctx) => {
	const {api, appendRows, eligibleLibraries, settings} = ctx;
	try {
		let includeItemTypes = 'Movie,Series';
		switch (settings.recentlyReleasedSeriesType) {
			case 'season': {
				includeItemTypes = 'Movie,Season';
				break;
			}
			case 'episode': {
				includeItemTypes = 'Movie,Episode';
				break;
			}
		}

		const [latestResults, recentlyReleasedResults] = await Promise.all([
			Promise.all(
				eligibleLibraries.map(lib =>
					api.getLatest(lib.Id, latestMediaFetchLimitForCollection(lib.CollectionType, 16))
						.then(latest => ({lib, latest}))
						.catch(() => null)
				)
			),
			Promise.all(
				eligibleLibraries.map(lib =>
					api.getRecentlyReleased(lib.Id, 16, includeItemTypes)
						.then(latest => ({lib, latest}))
						.catch(() => null)
				)
			)
		]);

		const rows = [];
		if (settings.mergeRecentRowsByType) {
			const latestEntries = latestResults
				.filter((r) => r && r.latest?.length > 0)
				.map((r) => ({
					lib: r.lib,
					items: normalizeLatestMediaItems(r.latest, {collectionType: r.lib?.CollectionType, limit: 16})
				}));
			for (const merged of mergeRecentRows(latestEntries, 'DateCreated')) {
				rows.push({
					id: `latest-merged-${merged.collectionType}`,
					title: $L('Recently Added {libraryName}').replace('{libraryName}', genericCollectionLabel(merged.collectionType)),
					items: merged.items,
					type: merged.cardType,
					isLatestRow: true
				});
			}
			const releasedEntries = recentlyReleasedResults
				.filter((r) => r && r.latest?.Items?.length > 0)
				.map((r) => ({lib: r.lib, items: r.latest.Items}));
			for (const merged of mergeRecentRows(releasedEntries, 'PremiereDate')) {
				rows.push({
					id: `recently-released-merged-${merged.collectionType}`,
					title: $L('Recently Released {libraryName}').replace('{libraryName}', genericCollectionLabel(merged.collectionType)),
					items: merged.items,
					type: merged.cardType,
					isRecentlyReleasedRow: true
				});
			}
			appendRows(rows);
			return;
		}
		for (const result of latestResults) {
			if (result && result.latest?.length > 0) {
				const items = normalizeLatestMediaItems(result.latest, {collectionType: result.lib?.CollectionType, limit: 16});
				if (items.length > 0) {
					const libraryTitle = result.lib.Name;
					const rowId = `latest-${result.lib.Id}`;
					rows.push({
						id: rowId,
						title: $L('Recently Added {libraryName}').replace('{libraryName}', libraryTitle),
						items,
						library: result.lib,
						type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
						isLatestRow: true
					});
				}
			}
		}
		for (const result of recentlyReleasedResults) {
			if (result && result.latest?.Items?.length > 0) {
				const libraryTitle = result.lib.Name;
				const rowId = `recently-released-${result.lib.Id}`;
				rows.push({
					id: rowId,
					title: $L('Recently Released {libraryName}').replace('{libraryName}', libraryTitle),
					items: result.latest.Items,
					library: result.lib,
					type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
					isRecentlyReleasedRow: true
				});
			}
		}
		appendRows(rows);
	} catch (e) {
		console.warn('[Browse] Failed to load latest items:', e);
	}
};

const loadCollections = async (ctx) => {
	const {api, appendRows, collectionsSortBy, collectionsSortOrder, settings} = ctx;
	if (!settings.displayCollectionsRows) return;
	try {
		const collectionsResult = await scopedGetItems(api, {
			IncludeItemTypes: 'BoxSet',
			Recursive: true,
			SortBy: collectionsSortBy,
			SortOrder: collectionsSortOrder,
			Limit: 20,
			Fields: `${HOME_ROW_ITEM_FIELDS},DateCreated,PremiereDate,CommunityRating,CriticRating,RunTimeTicks`
		}).catch(() => null);
		if (collectionsResult?.Items?.length > 0) {
			appendRows([{
				id: 'collections',
				title: $L('Collections'),
				items: collectionsResult.Items,
				type: 'portrait'
			}]);
		}
	} catch (e) {
		console.warn('[Browse] Failed to load collections:', e);
	}
};

const loadStudios = async (ctx) => {
	const {api, appendRows, studiosEnabled, settings} = ctx;
	if (!studiosEnabled) return;
	const sortBy = apiSortBy(settings.studiosRowSortBy || 'SortName');
	try {
		const result = await api.getStudios(20, sortBy, resolveSortOrder(sortBy, settings.studiosRowSortOrder)).catch(() => null);
		if (result?.Items?.length > 0) {
			appendRows([{
				id: 'studios',
				title: $L('Studios'),
				items: result.Items,
				type: 'landscape'
			}]);
		}
	} catch (e) {
		console.warn('[Browse] Failed to load studios:', e);
	}
};

const loadFavorites = async (ctx) => {
	const {api, appendRows, favoriteSortBy, favoriteSortOrder, settings} = ctx;
	if (!settings.displayFavoritesRows) return;
	try {
		const favoriteResults = await Promise.all(
			FAVORITE_ROW_CONFIGS.map((rowConfig) =>
				scopedGetItems(api, {
					IncludeItemTypes: rowConfig.includeItemTypes,
					Filters: 'IsFavorite',
					SortBy: favoriteSortBy,
					SortOrder: favoriteSortOrder,
					Recursive: true,
					Limit: 20,
					Fields: HOME_ROW_ITEM_FIELDS
				})
				.then((result) => ({rowConfig, result}))
				.catch(() => null)
			)
		);
		const rows = [];
		favoriteResults.filter(Boolean).forEach((favoriteResult) => {
			const items = favoriteResult?.result?.Items || [];
			if (items.length === 0) return;
			rows.push({
				id: favoriteResult.rowConfig.id,
				title: $L(favoriteResult.rowConfig.title),
				items,
				type: favoriteResult.rowConfig.type
			});
		});
		appendRows(rows);
	} catch (e) {
		console.warn('[Browse] Failed to load favorites:', e);
	}
};

const loadGenres = async (ctx) => {
	const {api, appendRows, genresIncludeTypes, genresSortBy, genresSortOrder, settings} = ctx;
	if (!settings.displayGenresRows) return;
	try {
		const genresResult = await api.getGenres(undefined, genresIncludeTypes, genresSortBy, genresSortOrder).catch(() => null);
		if (genresResult?.Items?.length > 0) {
			let enrichedItems = genresResult.Items;
			const genresSortByLower = (settings.genresRowSortBy || 'SortName').toLowerCase();
			if (genresSortByLower === 'sortname' || genresSortByLower === 'name') {
				enrichedItems = [...enrichedItems].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
			} else if (genresSortByLower === 'random') {
				enrichedItems = [...enrichedItems].sort(() => Math.random() - 0.5);
			}

			try {
				const genreNames = enrichedItems.map((genre) => genre.Name).filter(Boolean);
				// One query, filtered to the genres we actually have. Sorting at
				// random turns into ORDER BY RANDOM() on the server, a full scan of
				// the item table that no index can help, which is far too expensive
				// to run on every home load. Any stable sort avoids it.
				const repResult = await api.getItems({
					IncludeItemTypes: genresIncludeTypes,
					Recursive: true,
					Fields: 'PrimaryImageAspectRatio,Genres,ImageTags,BackdropImageTags',
					Genres: genreNames.join('|'),
					Limit: Math.min(Math.max(genreNames.length * 8, 50), 300),
					SortBy: 'SortName'
				});
				const repItems = repResult?.Items || [];

				enrichedItems = enrichedItems.map(genre => {
					const genreLower = genre.Name.toLowerCase();
					const matchingItems = repItems.filter(item =>
						getItemGenreNames(item).includes(genreLower)
					);
					const matchingWithBackdrop = matchingItems.filter(item =>
						item.BackdropImageTags?.length > 0 || item.ImageTags?.Thumb
					);
					const pool = matchingWithBackdrop.length > 0 ? matchingWithBackdrop : matchingItems;
					const rep = pool.length > 0 ? pool[stableIndex(genre.Name, pool.length)] : null;

					if (rep) {
						return {
							...genre,
							Type: 'Genre',
							_representative: rep
						};
					}
					return {
						...genre,
						Type: 'Genre'
					};
				});

				// Fallback resolution for any genres that missed the bulk query
				const missingGenres = enrichedItems.filter(g => !g._representative);
				if (missingGenres.length > 0) {
					const fallbackResults = await Promise.all(
						missingGenres.map(async (genre) => {
							try {
								const res = await api.getItems({
									IncludeItemTypes: genresIncludeTypes,
									Recursive: true,
									Fields: 'PrimaryImageAspectRatio,Genres,ImageTags,BackdropImageTags',
									Genres: genre.Name,
									Limit: 1,
									SortBy: 'SortName'
								});
								return { genreId: genre.Id, rep: res?.Items?.[0] || null };
							} catch (err) {
								return { genreId: genre.Id, rep: null };
							}
						})
					);

					enrichedItems = enrichedItems.map(genre => {
						if (genre._representative) return genre;
						const found = fallbackResults.find(r => r.genreId === genre.Id);
						if (found && found.rep) {
							return {
								...genre,
								Type: 'Genre',
								_representative: found.rep
							};
						}
						return genre;
					});
				}
			} catch (e) {
				console.warn('[Browse] Failed to enrich genres:', e);
			}

			appendRows([{
				id: 'genres',
				title: $L('Genres'),
				items: enrichedItems,
				type: 'portrait',
				isGenreRow: true
			}]);
		}
	} catch (e) {
		console.warn('[Browse] Failed to load genres:', e);
	}
};

const loadPlaylistsAndMusic = async (ctx) => {
	const {api, appendRows, audioAlbumsEnabled, audioArtistsEnabled, audioPlaylistsEnabled, audioRowsSortBy, audioRowsSortOrder, onNowEnabled, playlistsSortBy, playlistsSortOrder, recordingsEnabled, resumeAudioEnabled, settings} = ctx;
	try {
		const [playlistsResult, audioArtistsResult, audioAlbumsResult, audioPlaylistsResult, resumeAudioResult, recordingsResult, onNowResult] = await Promise.all([
			settings.displayPlaylistsRows ? api.getPlaylists(playlistsSortBy, playlistsSortOrder).catch(() => null) : Promise.resolve(null),
			audioArtistsEnabled ? scopedGetItems(api, {IncludeItemTypes: 'MusicArtist', Limit: 20, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Fields: HOME_ROW_ITEM_FIELDS}, {via: (params) => api.getAlbumArtists(params)}).catch(() => null) : Promise.resolve(null),
			audioAlbumsEnabled ? scopedGetItems(api, {IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Limit: 20, Fields: HOME_ROW_ITEM_FIELDS}).catch(() => null) : Promise.resolve(null),
			audioPlaylistsEnabled ? api.getPlaylists(audioRowsSortBy, audioRowsSortOrder).catch(() => null) : Promise.resolve(null),
			resumeAudioEnabled ? api.getResumeAudioItems(20).catch(() => null) : Promise.resolve(null),
			recordingsEnabled ? api.getLiveTvRecordings().catch(() => null) : Promise.resolve(null),
			onNowEnabled ? api.getLiveTvAiringPrograms(20).catch(() => null) : Promise.resolve(null)
		]);

		const rows = [];
		if (playlistsResult?.Items?.length > 0) {
			const playlistItems = settings.playlistsRowShowEpisodes
				? await expandPlaylistsToItems(api, playlistsResult.Items, 20, isPlaylistOrder(settings.playlistsRowSortBy), playlistsSortBy, playlistsSortOrder)
				: playlistsResult.Items;
			rows.push({
				id: 'playlists',
				title: $L('Playlists'),
				items: playlistItems,
				type: 'square'
			});
		}
		if (audioArtistsResult?.Items?.length > 0) {
			rows.push({
				id: 'audioartists',
				title: $L('Music Artists'),
				items: audioArtistsResult.Items,
				type: 'square'
			});
		}
		if (audioAlbumsResult?.Items?.length > 0) {
			rows.push({
				id: 'audioalbums',
				title: $L('Music Albums'),
				items: audioAlbumsResult.Items,
				type: 'square'
			});
		}
		if (audioPlaylistsResult?.Items?.length > 0) {
			const audioPlaylists = audioPlaylistsResult.Items.filter(item => item.MediaType === 'Audio');
			if (audioPlaylists.length > 0) {
				rows.push({
					id: 'audioplaylists',
					title: $L('Music Playlists'),
					items: audioPlaylists,
					type: 'square'
				});
			}
		}
		if (resumeAudioResult?.Items?.length > 0) {
			rows.push({
				id: 'resumeaudio',
				title: $L('Continue Listening'),
				items: resumeAudioResult.Items,
				type: 'square'
			});
		}
		if (recordingsResult?.Items?.length > 0) {
			rows.push({
				id: 'activerecordings',
				title: $L('Recordings'),
				items: recordingsResult.Items,
				type: 'landscape'
			});
		}
		if (onNowResult?.Items?.length > 0) {
			rows.push({
				id: 'onnow',
				title: $L('On Now'),
				items: onNowResult.Items,
				type: 'landscape'
			});
		}
		appendRows(rows);
	} catch (e) {
		console.warn('[Browse] Failed to load playlists/music:', e);
	}
};

const PICKED_ROW_LIMIT = 40;

// A collection picked from another signed in server loads from that server, and its cards carry
// the server along so they open there
const pickedRowSource = async (ctx, row) => {
	// A Silo section row from Moonbase's defaults names no server: it is the one signed in.
	if (!row.serverUrl || isSameServer(row.serverUrl, ctx.serverUrl)) return {api: ctx.api, server: null};
	const server = (await getAllServersArray()).find((entry) => isSameServer(entry.url, row.serverUrl));
	if (!server) return null;
	return {api: createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin'), server};
};

const loadPickedRowItems = async (ctx, api, row) => {
	const {settings} = ctx;
	// Silo sends a section's whole row at once, in its own order.
	if (row.source === 'server') return (await api.getServerHomeSectionItems(row.itemId, PICKED_ROW_LIMIT))?.Items || [];
	if (row.source === 'collections') {
		return loadCollectionRowItems(api, row.itemId, {
			limit: PICKED_ROW_LIMIT,
			usePlaylistOrder: isPlaylistOrder(settings.collectionsRowSortBy),
			sortBy: ctx.collectionsSortBy,
			sortOrder: ctx.collectionsSortOrder,
			showEpisodes: settings.collectionsRowShowEpisodes
		});
	}
	if (row.source === 'genres') {
		const result = await api.getItems({
			GenreIds: row.itemId,
			IncludeItemTypes: ctx.genresIncludeTypes,
			ExcludeItemTypes: 'Episode',
			SortBy: ctx.genresSortBy,
			SortOrder: ctx.genresSortOrder,
			Recursive: true,
			Limit: PICKED_ROW_LIMIT,
			Fields: HOME_ROW_ITEM_FIELDS
		});
		return result?.Items || [];
	}
	const playlist = isPlaylistOrder(settings.playlistsRowSortBy)
		? await api.getPlaylistItems(row.itemId, PICKED_ROW_LIMIT)
		: await api.getItems({ParentId: row.itemId, SortBy: ctx.playlistsSortBy, SortOrder: ctx.playlistsSortOrder, Limit: PICKED_ROW_LIMIT, Fields: HOME_ROW_ITEM_FIELDS});
	const items = playlist?.Items || [];
	return settings.playlistsRowShowEpisodes ? items : collapseLatestTvItems(items);
};

const fetchPluginSectionRow = async (ctx, row) => {
	try {
		const source = await pickedRowSource(ctx, row);
		if (!source) return null;
		const items = await loadPickedRowItems(ctx, source.api, row);
		if (items.length === 0) return null;
		const {server} = source;
		return {
			id: row.id,
			title: row.name,
			items: server
				? items.map((item) => ({
					...item,
					_serverId: server.serverId,
					_serverName: server.name,
					_serverUrl: server.url,
					_serverUserId: server.userId,
					_serverAccessToken: server.accessToken,
					_serverType: server.serverType || 'jellyfin'
				}))
				: items,
			type: 'portrait',
			isPluginRow: true
		};
	} catch (_error) {
		return null;
	}
};

// The picked rows Home held back, three at a time, each landing as soon as it's in.
export const loadDeferredSections = (ctx, sections, onDone) => mapBounded(sections, 3, async (section) => {
	const row = await fetchPluginSectionRow(ctx, section);
	if (row) ctx.appendRows([row]);
	onDone(section.id);
});

// Also run on its own when Seerr signs in or out, which only these rows read.
export const loadSinceYouWatched = async (ctx) => {
	const {api, settings, sinceYouWatchedIndexes} = ctx;
	if (sinceYouWatchedIndexes.length === 0) return;
	const recommendations = ctx.recommendations();
	const rows = await loadSinceYouWatchedRows(api, {
		sinceYouWatchedSource: settings.sinceYouWatchedSource,
		sinceYouWatchedSourceItem: settings.sinceYouWatchedSourceItem,
		sinceYouWatchedSourceType: settings.sinceYouWatchedSourceType,
		sinceYouWatchedIncludeWatched: settings.sinceYouWatchedIncludeWatched,
		tmdbApiKey: settings.tmdbApiKey,
		recommendationsSupported: recommendations.recommendationsSupported
	}, sinceYouWatchedIndexes, recommendations.seerrEnabled && recommendations.seerrAuthenticated).catch(() => []);
	// The Seerr state moved while these loaded, so the load it started has the rows to keep.
	if (ctx.recommendations() !== recommendations) return;
	ctx.appendRows(rows.map((row) => ({
		id: row.id,
		title: $L('Since you watched {name}').replace('{name}', row.seedName),
		items: row.items,
		type: 'portrait',
		isOnlineRecoRow: row.isSeerr === true
	})));
};

const loadPluginsAndRewatch = async (ctx) => {
	const {api, appendRows, enabledPluginSections, rewatchEnabled, settings} = ctx;
	try {
		const [pluginRows, rewatchItems] = await Promise.all([
			Promise.all(enabledPluginSections.map((section) => fetchPluginSectionRow(ctx, section))),
			rewatchEnabled
				? loadRewatchItems(api, {
					rewatchIncludeMovies: settings.rewatchIncludeMovies,
					rewatchIncludeShows: settings.rewatchIncludeShows,
					rewatchIncludeCollections: settings.rewatchIncludeCollections,
					rewatchSortBy: settings.rewatchSortBy
				}).catch(() => null)
				: Promise.resolve(null)
		]);

		const rows = pluginRows.filter(Boolean);
		if (rewatchItems && rewatchItems.length > 0) {
			rows.push({
				id: 'rewatch',
				title: $L('Rewatch'),
				items: rewatchItems,
				type: 'portrait'
			});
		}
		appendRows(rows);
	} catch (e) {
		console.warn('[Browse] Failed to load picked rows and Rewatch:', e);
	}
};
// Fired together rather than in sequence: their requests queue on the media server anyway, so
// holding the later ones back would only delay those rows without easing the load. Each names
// the home sections it fetches, so a section still waiting on its loader can hold its place and
// one it skips is never taken for empty.
const fetched = (flags) => Object.keys(flags).filter((id) => flags[id]);
export const BROWSE_ROW_LOADERS = [
	{load: loadLatestAndRecentlyReleased, sections: () => ['latest-media', 'recently-released']},
	{load: loadCollections, sections: (ctx) => fetched({collections: ctx.settings.displayCollectionsRows})},
	{load: loadStudios, sections: (ctx) => fetched({studios: ctx.studiosEnabled})},
	{load: loadFavorites, sections: (ctx) => (ctx.settings.displayFavoritesRows ? FAVORITE_ROW_CONFIGS.map((row) => row.id) : [])},
	{load: loadGenres, sections: (ctx) => fetched({genres: ctx.settings.displayGenresRows})},
	{load: loadPlaylistsAndMusic, sections: (ctx) => fetched({
		playlists: ctx.settings.displayPlaylistsRows,
		audioartists: ctx.audioArtistsEnabled,
		audioalbums: ctx.audioAlbumsEnabled,
		audioplaylists: ctx.audioPlaylistsEnabled,
		resumeaudio: ctx.resumeAudioEnabled,
		activerecordings: ctx.recordingsEnabled,
		onnow: ctx.onNowEnabled
	})},
	{load: loadPluginsAndRewatch, sections: (ctx) => [...ctx.enabledPluginSections.map((section) => section.id), ...fetched({rewatch: ctx.rewatchEnabled})]},
	{load: loadSinceYouWatched, sections: (ctx) => ctx.sinceYouWatchedIndexes.map((index) => `sinceyouwatched${index}`)}
];
