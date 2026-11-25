import {getTokenParam} from '../../../services/jellyfinApi.js';
import {isPlexServer, plexImageUrl} from '../../../utils/plexUrls.js';
import {isSiloServer, siloImageUrl} from '../../../utils/siloUrls.js';

const TICKS_PER_MINUTE = 600000000;

// Items can come from any server in unified mode, so the URL uses the item's own server details
// when it carries them.
export const buildItemImageUrl = (item, fallbackServerUrl, fallbackAccessToken) => {
	const serverUrl = item?._serverUrl || fallbackServerUrl;
	const accessToken = item?._serverAccessToken || fallbackAccessToken;
	if (!serverUrl || !item?.Id) return '';

	const tag = item.ImageTags?.Primary || item.SeriesPrimaryImageTag || item.ParentThumbImageTag || '';
	if (isPlexServer(serverUrl)) return plexImageUrl(serverUrl, item.Id, 'Primary', {fillWidth: 320, fillHeight: 480, tag}) || '';
	if (isSiloServer(serverUrl)) return siloImageUrl(serverUrl, item.Id, 'Primary', {tag}) || '';
	const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
	const tokenParam = accessToken ? `&${getTokenParam(item._serverType)}=${encodeURIComponent(accessToken)}` : '';

	return `${serverUrl}/Items/${item.Id}/Images/Primary?fillWidth=320&fillHeight=480&quality=80${tagParam}${tokenParam}`;
};

const formatRuntime = (ticks) => {
	if (!ticks) return '';
	const totalMinutes = Math.floor(Number(ticks) / TICKS_PER_MINUTE);
	if (!totalMinutes) return '';
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
};

export const getInfoBits = (item) => [
	item?.OfficialRating,
	item?.ProductionYear ? String(item.ProductionYear) : '',
	formatRuntime(item?.RunTimeTicks),
	item?.Genres?.length ? item.Genres.slice(0, 3).join(', ') : ''
].filter(Boolean);
