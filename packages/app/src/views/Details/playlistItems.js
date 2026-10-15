const PAGE_SIZE = 300;

// The detail screen sorts and filters a playlist on the device, so it needs every entry rather
// than the first page. A server that ignores StartIndex still stops once the total is reached.
export const fetchAllPlaylistItems = async (api, playlistId) => {
	const first = await api.getPlaylistItems(playlistId, PAGE_SIZE);
	const items = [...(first?.Items || [])];
	const total = first?.TotalRecordCount ?? items.length;
	while (items.length < total) {
		const page = (await api.getPlaylistItems(playlistId, PAGE_SIZE, items.length))?.Items || [];
		if (!page.length) break;
		items.push(...page);
	}
	return items;
};
