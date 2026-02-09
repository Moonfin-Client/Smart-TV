import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId} from '../../utils/helpers';
import {isBackKey} from '../../utils/tizenKeys';

import css from './Genres.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const SORT_OPTIONS = [
	{key: 'name-asc', label: 'Name (A-Z)'},
	{key: 'name-desc', label: 'Name (Z-A)'},
	{key: 'count-desc', label: 'Most Items'},
	{key: 'count-asc', label: 'Least Items'},
	{key: 'random', label: 'Random'}
];

const Genres = ({onSelectGenre, onBack}) => {
	const {api, serverUrl, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [genres, setGenres] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [sortOrder, setSortOrder] = useState('name-asc');
	const [showSortModal, setShowSortModal] = useState(false);
	const [selectedLibrary, setSelectedLibrary] = useState(null);
	const [libraries, setLibraries] = useState([]);
	const [showLibraryModal, setShowLibraryModal] = useState(false);

	const sortedGenresRef = useRef([]);

	useEffect(() => {
		const loadLibraries = async () => {
			try {
				let videoLibraries;
				if (unifiedMode) {
					const allLibraries = await connectionPool.getLibrariesFromAllServers();
					videoLibraries = allLibraries.filter(lib =>
						lib.CollectionType === 'movies' || lib.CollectionType === 'tvshows'
					);
				} else {
					const result = await api.getLibraries();
					videoLibraries = (result.Items || []).filter(lib =>
						lib.CollectionType === 'movies' || lib.CollectionType === 'tvshows'
					);
				}
				setLibraries(videoLibraries);
			} catch (err) {
				console.error('Failed to load libraries:', err);
			}
		};
		loadLibraries();
	}, [api, unifiedMode]);

	useEffect(() => {
		const loadGenres = async () => {
			setIsLoading(true);
			try {
				const params = {};
				if (selectedLibrary) {
					params.ParentId = selectedLibrary.Id;
				}

				let genreList;
				if (unifiedMode && !selectedLibrary) {
					genreList = await connectionPool.getGenresFromAllServers();

					// Fetch a pool of random backdrop images from all servers
					let backdropPool = [];
					try {
						const randomItems = await connectionPool.getRandomItemsFromAllServers('both', 30);
						backdropPool = randomItems
							.filter(item => {
								const backdropId = getBackdropId(item);
								return backdropId !== null;
							})
							.map(item => {
								const backdropId = getBackdropId(item);
								const itemServerUrl = item._serverUrl || serverUrl;
								return getImageUrl(itemServerUrl, backdropId, 'Backdrop', {maxWidth: 780, quality: 80});
							});
					} catch (err) {
						console.warn('[Genres] Failed to fetch backdrop pool:', err);
					}

					const unifiedGenres = genreList.map((genre, index) => ({
						id: genre.Id,
						name: genre.Name,
						itemCount: genre.ChildCount || 0,
						backdropUrl: backdropPool.length > 0 ? backdropPool[index % backdropPool.length] : null,
						_unifiedGenre: true
					}));
					setGenres(unifiedGenres);
					setIsLoading(false);
					return;
				} else if (unifiedMode && selectedLibrary?._serverUrl) {
					const serverApi = connectionPool.getApiForItem(selectedLibrary);
					if (serverApi) {
						const result = await serverApi.getGenres(selectedLibrary.Id);
						genreList = (result.Items || []).map(g => ({
							...g,
							_serverUrl: selectedLibrary._serverUrl,
							_serverAccessToken: selectedLibrary._serverAccessToken,
							_serverUserId: selectedLibrary._serverUserId,
							_serverName: selectedLibrary._serverName,
							_serverId: selectedLibrary._serverId
						}));
					} else {
						genreList = [];
					}
				} else {
					const genresResult = await api.getGenres(params.ParentId);
					genreList = genresResult.Items || [];
				}

				// Get item count and backdrop for each genre (single server mode)
				// Process in batches to avoid overwhelming the server
				const BATCH_SIZE = 10;
				const getGenreData = async (genre) => {
					try {
						const itemParams = {
							Genres: genre.Name,
							IncludeItemTypes: 'Movie,Series',
							Recursive: true,
							Limit: 5,
							SortBy: 'Random',
							EnableTotalRecordCount: true,
							Fields: 'BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId'
						};

						if (selectedLibrary) {
							itemParams.ParentId = selectedLibrary.Id;
						}

						let items, itemCount;
						if (unifiedMode && selectedLibrary?._serverUrl) {
							const serverApi = connectionPool.getApiForItem(selectedLibrary);
							if (serverApi) {
								const result = await serverApi.getItems(itemParams);
								items = (result.Items || []).map(item => ({
									...item,
									_serverUrl: selectedLibrary._serverUrl
								}));
								itemCount = result.TotalRecordCount || 0;
							} else {
								items = [];
								itemCount = 0;
							}
						} else {
							const itemsResult = await api.getItems(itemParams);
							items = itemsResult.Items || [];
							itemCount = itemsResult.TotalRecordCount || 0;
						}

						if (itemCount === 0) return null;

						let backdropUrl = null;
						for (const item of items) {
							const backdropId = getBackdropId(item);
							if (backdropId) {
								const itemServerUrl = item._serverUrl || serverUrl;
								backdropUrl = getImageUrl(itemServerUrl, backdropId, 'Backdrop', {maxWidth: 780, quality: 80});
								break;
							}
						}

						return {
							id: genre.Id,
							name: genre.Name,
							itemCount,
							backdropUrl,
							_serverUrl: genre._serverUrl,
							_serverName: genre._serverName,
							_serverId: genre._serverId,
							_serverAccessToken: genre._serverAccessToken,
							_serverUserId: genre._serverUserId
						};
					} catch (err) {
						console.error(`Failed to get data for genre ${genre.Name}:`, err);
						return null;
					}
				};

				// Process in batches
				const allGenresWithData = [];
				for (let i = 0; i < genreList.length; i += BATCH_SIZE) {
					const batch = genreList.slice(i, i + BATCH_SIZE);
					const batchResults = await Promise.all(batch.map(getGenreData));
					allGenresWithData.push(...batchResults);
				}

				// Filter out null entries (empty genres)
				const validGenres = allGenresWithData.filter(g => g !== null);
				setGenres(validGenres);
			} catch (err) {
				console.error('Failed to load genres:', err);
			} finally {
				setIsLoading(false);
			}
		};

		loadGenres();
	}, [api, serverUrl, selectedLibrary, unifiedMode]);

	const sortedGenres = useMemo(() => {
		const sorted = [...genres];
		switch (sortOrder) {
			case 'name-asc':
				sorted.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case 'name-desc':
				sorted.sort((a, b) => b.name.localeCompare(a.name));
				break;
			case 'count-desc':
				sorted.sort((a, b) => b.itemCount - a.itemCount);
				break;
			case 'count-asc':
				sorted.sort((a, b) => a.itemCount - b.itemCount);
				break;
			case 'random':
				sorted.sort(() => Math.random() - 0.5);
				break;
			default:
				break;
		}
		sortedGenresRef.current = sorted;
		return sorted;
	}, [genres, sortOrder]);

	const handleGenreClick = useCallback((ev) => {
		const genreIndex = ev.currentTarget?.dataset?.index;
		if (genreIndex !== undefined) {
			const genre = sortedGenresRef.current[parseInt(genreIndex, 10)];
			if (genre) {
				// For unified genres (from all servers) or cross-server genres, don't pass a libraryId
				const libraryId = (genre._unifiedGenre || genre._serverUrl) ? null : selectedLibrary?.Id;
				onSelectGenre?.(genre, libraryId);
			}
		}
	}, [onSelectGenre, selectedLibrary]);

	const handleOpenLibraryModal = useCallback(() => {
		setShowLibraryModal(true);
	}, []);

	const handleOpenSortModal = useCallback(() => {
		setShowSortModal(true);
	}, []);

	const handleCloseModal = useCallback(() => {
		setShowSortModal(false);
		setShowLibraryModal(false);
	}, []);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				if (showSortModal || showLibraryModal) {
					setShowSortModal(false);
					setShowLibraryModal(false);
				} else {
					onBack?.();
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [showSortModal, showLibraryModal, onBack]);

	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.sortKey;
		if (key) {
			setSortOrder(key);
			setShowSortModal(false);
		}
	}, []);

	const handleLibrarySelect = useCallback((ev) => {
		const libData = ev.currentTarget?.dataset?.library;
		if (libData === 'null') {
			setSelectedLibrary(null);
		} else if (libData) {
			try {
				const lib = JSON.parse(libData);
				setSelectedLibrary(lib);
			} catch {
				// Invalid library data
			}
		}
		setShowLibraryModal(false);
	}, []);

	const renderGenreCard = useCallback(({index, ...rest}) => {
		const genre = sortedGenresRef.current[index];
		if (!genre) return null;

		return (
			<SpottableDiv
				{...rest}
				className={css.genreCard}
				onClick={handleGenreClick}
				data-index={index}
			>
				<div className={css.genreBackdrop}>
					{genre.backdropUrl ? (
						<img
							className={css.genreBackdropImage}
							src={genre.backdropUrl}
							alt=""
							loading="lazy"
						/>
					) : (
						<div className={css.genreBackdropPlaceholder} />
					)}
					<div className={css.genreBackdropOverlay} />
				</div>
				<div className={css.genreInfo}>
					<div className={css.genreName}>{genre.name}</div>
					{genre.itemCount > 0 && (
						<div className={css.genreCount}>{genre.itemCount} items</div>
					)}
				</div>
			</SpottableDiv>
		);
	}, [handleGenreClick]);

	const currentSort = SORT_OPTIONS.find(o => o.key === sortOrder);

	return (
		<div className={css.page}>
			<div className={css.content}>
				<div className={css.header}>
					<div className={css.titleSection}>
						<div className={css.title}>Genres</div>
						{selectedLibrary && (
							<div className={css.subtitle}>{selectedLibrary.Name}</div>
						)}
					</div>
					<div className={css.counter}>{sortedGenres.length} genres</div>
				</div>

				<div className={css.toolbar}>
					<SpottableButton
						className={css.filterButton}
						onClick={handleOpenLibraryModal}
					>
						<svg viewBox="0 0 24 24">
							<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" />
						</svg>
						{selectedLibrary?.Name || 'All Libraries'}
					</SpottableButton>

					<SpottableButton
						className={css.sortButton}
						onClick={handleOpenSortModal}
					>
						<svg viewBox="0 0 24 24">
							<path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
						</svg>
						{currentSort?.label}
					</SpottableButton>
				</div>

				<div className={css.gridContainer}>
					{isLoading ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : sortedGenres.length === 0 ? (
						<div className={css.empty}>No genres found</div>
					) : (
						<VirtualGridList
							className={css.grid}
							dataSize={sortedGenres.length}
							itemRenderer={renderGenreCard}
							itemSize={{minWidth: 320, minHeight: 180}}
							spacing={20}
							spotlightId="genres-grid"
						/>
					)}
				</div>
			</div>

			<Popup
				open={showSortModal}
				onClose={handleCloseModal}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.popupContent}>
					<div className={css.modalTitle}>Sort By</div>
					{SORT_OPTIONS.map((option) => (
						<Button
							key={option.key}
							className={css.popupOption}
							selected={sortOrder === option.key}
							onClick={handleSortSelect}
							data-sort-key={option.key}
						>
							{option.label}
						</Button>
					))}
				</div>
			</Popup>

			<Popup
				open={showLibraryModal}
				onClose={handleCloseModal}
				position="center"
				scrimType="translucent"
				noAutoDismiss
			>
				<div className={css.popupContent}>
					<div className={css.modalTitle}>Select Library</div>
					<Button
						className={css.popupOption}
						selected={!selectedLibrary}
						onClick={handleLibrarySelect}
						data-library="null"
					>
						All Libraries
					</Button>
					{libraries.map(lib => (
						<Button
							key={lib.Id + (lib._serverId || '')}
							className={css.popupOption}
							selected={selectedLibrary?.Id === lib.Id}
							onClick={handleLibrarySelect}
							data-library={JSON.stringify(lib)}
						>
							{unifiedMode && lib._serverName ? `${lib.Name} (${lib._serverName})` : lib.Name}
						</Button>
					))}
				</div>
			</Popup>
		</div>
	);
};

export default Genres;
