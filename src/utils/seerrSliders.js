import seerrApi from '../services/seerrApi';
import {getServerUrl} from '../services/jellyfinApi';
import {isSameServer, isSeerrSliderRow} from './pickedRows';

// Types 1 to 12 are Seerr's own rows, which this app draws itself, so only the custom ones an admin
// adds are read.
const SLIDER_TYPES = {
	movieKeyword: 13,
	movieGenre: 14,
	tvKeyword: 15,
	tvGenre: 16,
	search: 17,
	studio: 18,
	network: 19,
	movieStreaming: 20,
	tvStreaming: 21
};

const CACHE_MS = 5 * 60 * 1000;

// Spaces as %20 and the characters encodeURIComponent leaves alone escaped too, since a search
// slider carries free text that Seerr would otherwise read differently.
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// An entry without a numeric id or type is skipped rather than failing the whole list.
const parseSlider = (json) => {
	if (!json || typeof json.id !== 'number' || typeof json.type !== 'number') return null;
	return {
		id: Math.trunc(json.id),
		type: Math.trunc(json.type),
		enabled: json.enabled !== false,
		title: json.title == null ? '' : String(json.title).trim(),
		data: json.data == null ? '' : String(json.data).trim()
	};
};

// Seerr stores a streaming slider's data as "<region>,<provider ids>".
const streamingQuery = (path, data) => {
	const [region = '', providers = ''] = data.split(',').map((part) => part.trim());
	return region && providers ? `${path}?watchRegion=${encode(region)}&watchProviders=${encode(providers)}` : null;
};

// The Seerr route behind a slider's results, the same ones Seerr's own Discover page uses, or null
// for a type this app doesn't know.
const sliderQuery = ({type, data}) => {
	if (!data) return null;
	switch (type) {
		case SLIDER_TYPES.movieKeyword: return `discover/movies?keywords=${encode(data)}`;
		case SLIDER_TYPES.tvKeyword: return `discover/tv?keywords=${encode(data)}`;
		case SLIDER_TYPES.movieGenre: return `discover/movies?genre=${encode(data)}`;
		case SLIDER_TYPES.tvGenre: return `discover/tv?genre=${encode(data)}`;
		case SLIDER_TYPES.search: return `search?query=${encode(data)}`;
		case SLIDER_TYPES.studio: return `discover/movies/studio/${encode(data)}`;
		case SLIDER_TYPES.network: return `discover/tv/network/${encode(data)}`;
		case SLIDER_TYPES.movieStreaming: return streamingQuery('discover/movies', data);
		case SLIDER_TYPES.tvStreaming: return streamingQuery('discover/tv', data);
		default: return null;
	}
};

// A slider without a title has nothing to label its row with.
export const isSupportedSlider = (slider) => slider.enabled && slider.title !== '' && sliderQuery(slider) !== null;

let cached = null;
// The last list Seerr answered with, which the Home Sections editor reads to hide the rows of
// sliders Seerr has switched off.
let lastSliders = null;

// Home asks once per row, so a read is shared for a few minutes per server. A forced read always
// goes to the server, and a failed one isn't kept.
export const loadDiscoverSliders = ({force = false} = {}) => {
	const key = getServerUrl();
	if (!force && cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return cached.promise;
	const promise = seerrApi.getDiscoverSliders().then((list) => {
		lastSliders = list.map(parseSlider).filter(Boolean);
		return lastSliders;
	});
	const entry = {key, at: Date.now(), promise};
	cached = entry;
	promise.catch(() => {
		if (cached === entry) cached = null;
	});
	return promise;
};

const sliderFor = (row, sliders) => sliders.find((slider) => String(slider.id) === row.sliderId && String(slider.type) === row.sliderType);

// Until Seerr has answered, a slider row is taken to still be on.
export const isSliderRowLive = (row) => !lastSliders || Boolean(sliderFor(row, lastSliders)?.enabled);

// This server's slider rows brought in line with Seerr: renamed to their current titles and
// dropped once Seerr no longer has them. One Seerr switched off keeps its entry.
export const reconcileSliderRows = (rows, sliders, serverUrl) => {
	let changed = false;
	const next = [];
	rows.forEach((row) => {
		if (!isSeerrSliderRow(row) || !isSameServer(row.serverUrl, serverUrl)) {
			next.push(row);
			return;
		}
		const live = sliderFor(row, sliders);
		if (!live) {
			changed = true;
		} else if (live.title && live.title !== row.name) {
			next.push({...row, name: live.title});
			changed = true;
		} else {
			next.push(row);
		}
	});
	return {rows: next, changed};
};

// Search can turn up people, and only titles make cards.
export const loadSliderPage = async (slider, page = 1) => {
	const body = await seerrApi.getDiscoverSliderPage(sliderQuery(slider), page);
	const results = (body?.results || []).filter((item) => {
		const mediaType = item.mediaType || item.media_type;
		return mediaType === 'movie' || mediaType === 'tv';
	});
	return {results, totalPages: body?.totalPages || 1};
};

// The first page of a slider a Home row stands for, with Seerr's current version of the slider. A
// slider Seerr no longer has, or has switched off, gives no row.
export const loadSliderHomeRow = async (row) => {
	const slider = sliderFor(row, await loadDiscoverSliders());
	if (!slider || !isSupportedSlider(slider)) return null;
	const {results} = await loadSliderPage(slider, 1);
	return {slider, results};
};
