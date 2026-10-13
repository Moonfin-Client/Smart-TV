import $L from '@enact/i18n/$L';

export const PLAYLIST_SORT_ORDER = 'playlistOrder';
export const PLAYLIST_SORT_NAME = 'name';
export const PLAYLIST_SORT_ARTIST = 'artist';
export const PLAYLIST_SORT_ALBUM = 'album';
export const PLAYLIST_SORT_RUNTIME = 'runtime';
export const PLAYLIST_SORT_DATE_ADDED = 'dateAdded';
export const PLAYLIST_SORT_PREMIERE_DATE = 'premiereDate';
export const PLAYLIST_SORT_COMMUNITY_RATING = 'communityRating';
export const PLAYLIST_SORT_CRITIC_RATING = 'criticRating';
export const PLAYLIST_SORT_DATE_PLAYED = 'datePlayed';
export const PLAYLIST_SORT_PLAY_COUNT = 'playCount';
export const PLAYLIST_SORT_RANDOM = 'random';

export const SORT_DIR_ASC = 'ascending';
export const SORT_DIR_DESC = 'descending';

export const PLAYED_ALL = 'all';
export const PLAYED_WATCHED = 'watched';
export const PLAYED_UNWATCHED = 'unwatched';
export const PLAYED_IN_PROGRESS = 'inProgress';

export const sortLabel = (sortBy) => {
	switch (sortBy) {
		case PLAYLIST_SORT_ORDER:
			return $L('Playlist Order');
		case PLAYLIST_SORT_NAME:
			return $L('Name');
		case PLAYLIST_SORT_ARTIST:
			return $L('Artist');
		case PLAYLIST_SORT_ALBUM:
			return $L('Album');
		case PLAYLIST_SORT_RUNTIME:
			return $L('Duration');
		case PLAYLIST_SORT_DATE_ADDED:
			return $L('Date Added');
		case PLAYLIST_SORT_PREMIERE_DATE:
			return $L('Release Date');
		case PLAYLIST_SORT_COMMUNITY_RATING:
			return $L('Community Rating');
		case PLAYLIST_SORT_CRITIC_RATING:
			return $L('Critic Rating');
		case PLAYLIST_SORT_DATE_PLAYED:
			return $L('Last Played');
		case PLAYLIST_SORT_PLAY_COUNT:
			return $L('Play Count');
		case PLAYLIST_SORT_RANDOM:
			return $L('Random');
		default:
			return sortBy;
	}
};

export const playedFilterLabel = (status) => {
	switch (status) {
		case PLAYED_WATCHED:
			return $L('Watched');
		case PLAYED_UNWATCHED:
			return $L('Unplayed');
		case PLAYED_IN_PROGRESS:
			return $L('In Progress');
		case PLAYED_ALL:
		default:
			return $L('All');
	}
};

export const playlistSortOptions = () => [
	{id: PLAYLIST_SORT_ORDER, label: sortLabel(PLAYLIST_SORT_ORDER)},
	{id: PLAYLIST_SORT_NAME, label: sortLabel(PLAYLIST_SORT_NAME)},
	{id: PLAYLIST_SORT_ARTIST, label: sortLabel(PLAYLIST_SORT_ARTIST)},
	{id: PLAYLIST_SORT_ALBUM, label: sortLabel(PLAYLIST_SORT_ALBUM)},
	{id: PLAYLIST_SORT_RUNTIME, label: sortLabel(PLAYLIST_SORT_RUNTIME)},
	{id: PLAYLIST_SORT_DATE_ADDED, label: sortLabel(PLAYLIST_SORT_DATE_ADDED)},
	{id: PLAYLIST_SORT_PREMIERE_DATE, label: sortLabel(PLAYLIST_SORT_PREMIERE_DATE)},
	{id: PLAYLIST_SORT_COMMUNITY_RATING, label: sortLabel(PLAYLIST_SORT_COMMUNITY_RATING)},
	{id: PLAYLIST_SORT_CRITIC_RATING, label: sortLabel(PLAYLIST_SORT_CRITIC_RATING)},
	{id: PLAYLIST_SORT_DATE_PLAYED, label: sortLabel(PLAYLIST_SORT_DATE_PLAYED)},
	{id: PLAYLIST_SORT_PLAY_COUNT, label: sortLabel(PLAYLIST_SORT_PLAY_COUNT)},
	{id: PLAYLIST_SORT_RANDOM, label: sortLabel(PLAYLIST_SORT_RANDOM)}
];

export const playedFilterOptions = () => [
	{id: PLAYED_ALL, label: playedFilterLabel(PLAYED_ALL)},
	{id: PLAYED_WATCHED, label: playedFilterLabel(PLAYED_WATCHED)},
	{id: PLAYED_UNWATCHED, label: playedFilterLabel(PLAYED_UNWATCHED)},
	{id: PLAYED_IN_PROGRESS, label: playedFilterLabel(PLAYED_IN_PROGRESS)}
];

const seededShuffle = (array, seed = 42) => {
	let s = seed;
	const rng = () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};
	const copy = [...array];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

const parseDate = (val) => {
	if (!val) return 0;
	const parsed = Date.parse(val);
	return isNaN(parsed) ? 0 : parsed;
};

export const sortAndFilterPlaylistTracks = ({
	tracks = [],
	sortBy = PLAYLIST_SORT_ORDER,
	sortDirection = SORT_DIR_ASC,
	playedFilter = PLAYED_ALL,
	favoriteOnly = false,
	mediaTypeFilter = null,
	randomSeed = 42
} = {}) => {
	// 1. Filter tracks
	const filtered = tracks.filter((item) => {
		if (favoriteOnly && !item.UserData?.IsFavorite) {
			return false;
		}

		if (playedFilter === PLAYED_WATCHED) {
			if (!item.UserData?.Played) return false;
		} else if (playedFilter === PLAYED_UNWATCHED) {
			const pos = item.UserData?.PlaybackPositionTicks || 0;
			if (item.UserData?.Played || pos > 0) return false;
		} else if (playedFilter === PLAYED_IN_PROGRESS) {
			const pos = item.UserData?.PlaybackPositionTicks || 0;
			if (item.UserData?.Played || pos <= 0) return false;
		}

		if (mediaTypeFilter && mediaTypeFilter !== 'all') {
			const type = item.MediaType || item.Type;
			if (type !== mediaTypeFilter) return false;
		}

		return true;
	});

	// 2. Sort tracks
	if (sortBy === PLAYLIST_SORT_ORDER) {
		if (sortDirection === SORT_DIR_DESC) {
			return [...filtered].reverse();
		}
		return filtered;
	}

	if (sortBy === PLAYLIST_SORT_RANDOM) {
		return seededShuffle(filtered, randomSeed);
	}

	const sorted = [...filtered].sort((a, b) => {
		let cmp = 0;
		switch (sortBy) {
			case PLAYLIST_SORT_NAME: {
				const aName = a.SortName || a.Name || '';
				const bName = b.SortName || b.Name || '';
				cmp = aName.toLowerCase().localeCompare(bName.toLowerCase());
				break;
			}
			case PLAYLIST_SORT_ARTIST: {
				const aArtist = a.AlbumArtist || a.Artists?.[0] || a.ArtistItems?.[0]?.Name || '';
				const bArtist = b.AlbumArtist || b.Artists?.[0] || b.ArtistItems?.[0]?.Name || '';
				cmp = aArtist.toLowerCase().localeCompare(bArtist.toLowerCase());
				break;
			}
			case PLAYLIST_SORT_ALBUM: {
				const aAlbum = a.Album || '';
				const bAlbum = b.Album || '';
				cmp = aAlbum.toLowerCase().localeCompare(bAlbum.toLowerCase());
				break;
			}
			case PLAYLIST_SORT_RUNTIME: {
				const aTicks = a.RunTimeTicks || 0;
				const bTicks = b.RunTimeTicks || 0;
				cmp = aTicks - bTicks;
				break;
			}
			case PLAYLIST_SORT_DATE_ADDED: {
				const aDate = parseDate(a.DateCreated);
				const bDate = parseDate(b.DateCreated);
				cmp = aDate - bDate;
				break;
			}
			case PLAYLIST_SORT_PREMIERE_DATE: {
				const aDate = parseDate(a.PremiereDate) || (a.ProductionYear ? Date.UTC(a.ProductionYear, 0, 1) : 0);
				const bDate = parseDate(b.PremiereDate) || (b.ProductionYear ? Date.UTC(b.ProductionYear, 0, 1) : 0);
				cmp = aDate - bDate;
				break;
			}
			case PLAYLIST_SORT_COMMUNITY_RATING: {
				const aRating = a.CommunityRating || 0;
				const bRating = b.CommunityRating || 0;
				cmp = aRating - bRating;
				break;
			}
			case PLAYLIST_SORT_CRITIC_RATING: {
				const aRating = a.CriticRating || 0;
				const bRating = b.CriticRating || 0;
				cmp = aRating - bRating;
				break;
			}
			case PLAYLIST_SORT_DATE_PLAYED: {
				const aDate = parseDate(a.UserData?.LastPlayedDate);
				const bDate = parseDate(b.UserData?.LastPlayedDate);
				cmp = aDate - bDate;
				break;
			}
			case PLAYLIST_SORT_PLAY_COUNT: {
				const aCount = a.UserData?.PlayCount || 0;
				const bCount = b.UserData?.PlayCount || 0;
				cmp = aCount - bCount;
				break;
			}
			default:
				break;
		}

		if (cmp === 0) {
			const aName = a.Name || '';
			const bName = b.Name || '';
			cmp = aName.toLowerCase().localeCompare(bName.toLowerCase());
		}

		return sortDirection === SORT_DIR_ASC ? cmp : -cmp;
	});

	return sorted;
};
