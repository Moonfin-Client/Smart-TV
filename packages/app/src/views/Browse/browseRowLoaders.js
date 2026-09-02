// The rows that fill in behind the first paint. Each one fetches its own slice and hands it
// straight to appendRows, so a slow one only holds up its own row rather than the screen.

import $L from '@enact/i18n/$L';
import {genericCollectionLabel, mergeRecentRows} from '../../utils/mergeRecentRows';

import {HOME_ROW_ITEM_FIELDS} from '../../services/jellyfinApi';
import {loadSinceYouWatchedRows, loadRewatchItems} from '../../services/homeRecommendations';
import {FAVORITE_ROW_CONFIGS, getItemGenreNames, parsePluginSpec, stableIndex} from './browseFilters';
import {apiSortBy, getGenresIncludeTypes, isPlaylistOrder, resolveSortOrder} from '../../utils/homeRowSorting';

// The sort settings and enabled flags every loader reads, worked out once rather than by each
// of them. Everything here is a plain function of the settings and the row list.
export const buildLoaderContext = ({api, settings, homeRowsConfig, eligibleLibraries, seerrEnabled, seerrAuthenticated, appendRows}) => {
	const rowEnabled = (id) => homeRowsConfig.some((row) => row.enabled && row.id === id);
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
		settings,
		appendRows,
		eligibleLibraries,
		seerrEnabled,
		seerrAuthenticated,
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
		rewatchEnabled: settings.displayRewatchRow !== false && rowEnabled('rewatch'),
		studiosEnabled: settings.displayStudiosRows && rowEnabled('studios'),
		enabledPluginSections: (settings.pluginSections || []).filter((section) => section.enabled),
		sinceYouWatchedIndexes: homeRowsConfig
			.filter((row) => row.enabled && row.id.startsWith('sinceyouwatched'))
			.map((row) => parseInt(row.id.replace('sinceyouwatched', ''), 10))
			.filter((idx) => idx >= 1)
			.sort((a, b) => a - b)
	};
};

// Replaces each series with its episodes for the collection rows that asked for
// it, keeping movies and anything else where they were.
const expandSeriesToEpisodes = async (api, items, limit) => {
	const expanded = await Promise.all(items.map(async (item) => {
		if (item?.Type !== 'Series') return [item];
		try {
			const result = await api.getItems({
				ParentId: item.Id,
				IncludeItemTypes: 'Episode',
				Recursive: true,
				SortBy: 'ParentIndexNumber,IndexNumber',
				SortOrder: 'Ascending',
				Limit: limit,
				Fields: HOME_ROW_ITEM_FIELDS
			});
			const episodes = result?.Items || [];
			return episodes.length ? episodes : [item];
		} catch (_error) {
			return [item];
		}
	}));
	return [].concat(...expanded).slice(0, limit);
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
					api.getLatest(lib.Id, 16)
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
				.map((r) => ({lib: r.lib, items: r.latest}));
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
				const libraryTitle = result.lib.Name;
				const rowId = `latest-${result.lib.Id}`;
				rows.push({
					id: rowId,
					title: $L('Recently Added {libraryName}').replace('{libraryName}', libraryTitle),
					items: result.latest,
					library: result.lib,
					type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
					isLatestRow: true
				});
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
		const collectionsResult = await api.getCollections(20, collectionsSortBy, collectionsSortOrder).catch(() => null);
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
				api.getItems({
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
	const {api, appendRows, audioAlbumsEnabled, audioArtistsEnabled, audioPlaylistsEnabled, audioRowsSortBy, audioRowsSortOrder, playlistsSortBy, playlistsSortOrder, recordingsEnabled, resumeAudioEnabled, settings} = ctx;
	try {
		const [playlistsResult, audioArtistsResult, audioAlbumsResult, audioPlaylistsResult, resumeAudioResult, recordingsResult] = await Promise.all([
			settings.displayPlaylistsRows ? api.getPlaylists(playlistsSortBy, playlistsSortOrder).catch(() => null) : Promise.resolve(null),
			audioArtistsEnabled ? api.getAlbumArtists({Limit: 20, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Fields: HOME_ROW_ITEM_FIELDS}).catch(() => null) : Promise.resolve(null),
			audioAlbumsEnabled ? api.getItems({IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Limit: 20, Fields: HOME_ROW_ITEM_FIELDS}).catch(() => null) : Promise.resolve(null),
			audioPlaylistsEnabled ? api.getPlaylists(audioRowsSortBy, audioRowsSortOrder).catch(() => null) : Promise.resolve(null),
			resumeAudioEnabled ? api.getResumeAudioItems(20).catch(() => null) : Promise.resolve(null),
			recordingsEnabled ? api.getLiveTvRecordings().catch(() => null) : Promise.resolve(null)
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
		appendRows(rows);
	} catch (e) {
		console.warn('[Browse] Failed to load playlists/music:', e);
	}
};

const loadPluginsAndRecos = async (ctx) => {
	const {api, appendRows, collectionsSortBy, collectionsSortOrder, enabledPluginSections, rewatchEnabled, seerrAuthenticated, seerrEnabled, settings, sinceYouWatchedIndexes} = ctx;
	const fetchPluginSectionRow = async (section) => {
		if (!section?.enabled) return null;
		const spec = parsePluginSpec(section.specJson);
		if (!spec || typeof spec !== 'object') return null;
		const limit = Number.isFinite(Number(spec.limit)) ? Number(spec.limit) : 20;
		const title = section.name || section.displayText || $L('Plugin Section');
		const fields = HOME_ROW_ITEM_FIELDS;

		try {
			let items = [];
			switch (spec.kind) {
				case 'recentlyReleasedMovies': {
					const result = await api.getItems({
						IncludeItemTypes: 'Movie',
						SortBy: 'PremiereDate',
						SortOrder: 'Descending',
						Recursive: true,
						Limit: limit,
						Fields: fields
					});
					items = result?.Items || [];
					break;
				}
				case 'recentlyReleasedEpisodes': {
					const result = await api.getItems({
						IncludeItemTypes: 'Episode',
						SortBy: 'PremiereDate',
						SortOrder: 'Descending',
						Recursive: true,
						Limit: limit,
						Fields: fields
					});
					items = result?.Items || [];
					break;
				}
				case 'watchAgain': {
					const result = await api.getItems({
						IncludeItemTypes: 'Movie,Series',
						Filters: 'IsPlayed',
						SortBy: 'DatePlayed',
						SortOrder: 'Descending',
						Recursive: true,
						Limit: limit,
						Fields: fields
					});
					items = result?.Items || [];
					break;
				}
				case 'recentlyAddedInLibrary': {
					const libraryIds = Array.isArray(spec.libraryIds) ? spec.libraryIds : [];
					const responses = await Promise.all(
						libraryIds.map((libraryId) => api.getItems({
							ParentId: libraryId,
							IncludeItemTypes: 'Movie,Series',
							SortBy: 'DateCreated',
							SortOrder: 'Descending',
							Recursive: true,
							Limit: limit,
							Fields: fields
						}).catch(() => null))
					);
					items = responses.flatMap((response) => response?.Items || []).slice(0, limit);
					break;
				}
				case 'custom': {
					const includeItemTypes = Array.isArray(spec.includeItemTypes)
						? spec.includeItemTypes.join(',')
						: 'Movie,Series';
					const sortBy = spec.sortBy || 'Random';
					const sortOrder = spec.sortOrderDirection || 'Ascending';
					const params = {
						IncludeItemTypes: includeItemTypes,
						SortBy: sortBy,
						SortOrder: sortOrder,
						Recursive: true,
						Limit: limit,
						Fields: fields
					};
					if (spec.type === 'genre' && spec.source) params.Genres = spec.source;
					if (spec.type === 'person' && spec.source) params.PersonIds = spec.source;
					if (spec.type === 'studio' && spec.source) params.StudioIds = spec.source;
					if (spec.type === 'collection' && spec.source) params.ParentId = spec.source;
					const result = await api.getItems(params);
					items = result?.Items || [];
					break;
				}
				case 'collection': {
					const collectionId = spec.collectionId || null;
					if (!collectionId) {
						items = [];
						break;
					}
					const usesArrangement = isPlaylistOrder(settings.collectionsRowSortBy);
					const result = await api.getCollectionItems(
						collectionId,
						limit,
						usesArrangement ? null : collectionsSortBy,
						collectionsSortOrder
					);
					items = result?.Items || [];
					if (settings.collectionsRowShowEpisodes) {
						items = await expandSeriesToEpisodes(api, items, limit);
					}
					break;
				}
				case 'genre': {
					const params = {
						IncludeItemTypes: spec.includeItemTypes || 'Movie,Series',
						SortBy: spec.sortBy || 'SortName',
						SortOrder: spec.sortOrder || 'Ascending',
						Recursive: true,
						Limit: limit,
						Fields: fields
					};
					if (spec.genreId) {
						params.GenreIds = spec.genreId;
					} else if (spec.genreName) {
						params.Genres = spec.genreName;
					}
					const result = await api.getItems(params);
					items = result?.Items || [];
					break;
				}
				default:
					items = [];
			}

			if (items.length === 0) return null;
			const cardTypeHint = spec.cardType || spec.section?.CardType || spec.section?.cardType || spec.section?.Layout || spec.section?.layout;
			const normalizedCardType = typeof cardTypeHint === 'string' ? cardTypeHint.toLowerCase() : '';
			const viewModeHint = spec.viewMode || spec.section?.ViewMode || spec.section?.viewMode || '';
			const normalizedViewMode = typeof viewModeHint === 'string' ? viewModeHint.toLowerCase() : '';
			let rowType = 'portrait';
			if (normalizedViewMode.includes('portrait')) {
				rowType = 'portrait';
			} else if (normalizedViewMode.includes('square')) {
				rowType = 'square';
			} else if (
				normalizedViewMode.includes('landscape') ||
				normalizedViewMode.includes('small') ||
				normalizedViewMode.includes('backdrop') ||
				normalizedCardType.includes('landscape') ||
				normalizedCardType.includes('thumb') ||
				spec.kind === 'recentlyReleasedEpisodes'
			) {
				rowType = 'landscape';
			}
			return {
				id: section.id,
				title,
				items,
				type: rowType,
				isPluginRow: true,
				pluginSource: section.source
			};
		} catch (_error) {
			return null;
		}
	};

	try {
		const [pluginRows, sinceYouWatchedRows, rewatchItems] = await Promise.all([
			Promise.all(enabledPluginSections.map((section) => fetchPluginSectionRow(section))),
			sinceYouWatchedIndexes.length
				? loadSinceYouWatchedRows(api, {
					sinceYouWatchedSource: settings.sinceYouWatchedSource,
					sinceYouWatchedSourceItem: settings.sinceYouWatchedSourceItem,
					sinceYouWatchedSourceType: settings.sinceYouWatchedSourceType,
					sinceYouWatchedIncludeWatched: settings.sinceYouWatchedIncludeWatched,
					tmdbApiKey: settings.tmdbApiKey
				}, sinceYouWatchedIndexes, seerrEnabled && seerrAuthenticated).catch(() => [])
				: Promise.resolve([]),
			rewatchEnabled
				? loadRewatchItems(api, {
					rewatchIncludeMovies: settings.rewatchIncludeMovies,
					rewatchIncludeShows: settings.rewatchIncludeShows,
					rewatchIncludeCollections: settings.rewatchIncludeCollections,
					rewatchSortBy: settings.rewatchSortBy
				}).catch(() => null)
				: Promise.resolve(null)
		]);

		const rows = [];
		pluginRows.filter(Boolean).forEach((pluginRow) => rows.push(pluginRow));
		sinceYouWatchedRows.forEach((row) => {
			rows.push({
				id: row.id,
				title: $L('Since you watched {name}').replace('{name}', row.seedName),
				items: row.items,
				type: 'portrait',
				isOnlineRecoRow: row.isSeerr === true
			});
		});
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
		console.warn('[Browse] Failed to load plugins/recos:', e);
	}
};
// Fired together rather than in sequence: their requests queue on the media server anyway, so
// holding the later ones back would only delay those rows without easing the load.
export const BROWSE_ROW_LOADERS = [
	loadLatestAndRecentlyReleased,
	loadCollections,
	loadStudios,
	loadFavorites,
	loadGenres,
	loadPlaylistsAndMusic,
	loadPluginsAndRecos
];
