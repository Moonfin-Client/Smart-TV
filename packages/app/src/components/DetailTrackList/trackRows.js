// The pieces of a track row, worked out apart from the markup so the shapes a row can take
// are pinned by tests rather than read off the screen.

// Audio runs short enough to read as minutes and seconds. Anything longer, an audiobook
// chapter or an episode, reads better in hours and minutes.
export const trackRuntimeLabel = (ticks, isAudio) => {
	if (!ticks) return '';
	const totalSeconds = Math.floor(ticks / 10000000);
	if (isAudio) {
		const minutes = Math.floor(totalSeconds / 60);
		return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
	}
	const totalMinutes = Math.floor(totalSeconds / 60);
	const hours = Math.floor(totalMinutes / 60);
	return hours > 0 ? `${hours}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
};

// An episode in a collection's playlist order leads with its series, since the episode name
// alone says little about where it sits.
export const trackTitle = (track) => (
	track.Type === 'Episode' ? (track.SeriesName || track.Name) : track.Name
);

export const trackSubtitle = (track, {isAudiobook = false, showAlbum = false} = {}) => {
	if (track.Type === 'Episode') {
		const season = track.ParentIndexNumber;
		const episode = track.IndexNumber;
		return season != null && episode != null ? `S${season}:E${episode} - ${track.Name}` : track.Name;
	}
	if (isAudiobook) return '';

	const artist = track.Artists?.length ? track.Artists.join(', ') : (track.AlbumArtist || '');
	if (showAlbum && track.Album) {
		return artist ? `${track.Album} • ${artist}` : track.Album;
	}
	return artist;
};

// The line under the title, which is whatever of the two there is to say.
export const trackSecondLine = (track, options = {}) => {
	const isAudio = track.Type === 'Audio';
	return [trackSubtitle(track, options), trackRuntimeLabel(track.RunTimeTicks, isAudio)]
		.filter(Boolean)
		.join(' • ');
};

// The number shown against a track. A playlist counts its own positions, since the tracks in
// it carry the numbers they had on their own albums.
export const trackNumber = (track, position, isPlaylist) => (
	isPlaylist ? position + 1 : (track.IndexNumber ?? position + 1)
);

// Disc headings only earn their place on an album that actually spans more than one.
export const spansMultipleDiscs = (tracks = []) => (
	new Set(tracks.map((track) => track.ParentIndexNumber ?? 1)).size > 1
);

// The rows to draw, with a disc heading inserted wherever the disc number changes.
export const trackRowsFor = (tracks = [], groupByDisc = false) => {
	const grouped = groupByDisc && spansMultipleDiscs(tracks);
	const rows = [];
	let previousDisc = null;
	tracks.forEach((track, index) => {
		const disc = track.ParentIndexNumber ?? 1;
		if (grouped && disc !== previousDisc) {
			rows.push({kind: 'disc', disc, key: `disc-${disc}`});
			previousDisc = disc;
		}
		rows.push({kind: 'track', track, index, key: `track-${track.PlaylistItemId || track.Id}-${index}`});
	});
	return rows;
};
