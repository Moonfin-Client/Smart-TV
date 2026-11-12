// Display helpers for retro games. Thumbnail art comes from
// gamesApi.gameThumbUrl.

// Strips the extension from a filename.
export const thumbName = (fileName) => {
	if (!fileName) return '';
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(0, dot) : fileName;
};

// A name copied through a Mac or Samba share stores the characters Windows refuses as private use
// code points from U+F020, a trailing dot as U+F029.
const MAC_SMB_CHARACTERS = ['"', '*', ':', '<', '>', '?', '\\', '|', ' ', '.'];

// A safe display title. A name copied through a Mac or Samba share gets its characters back, the
// replacement char and control bytes some ROM folder names carry are dropped, and the file name
// without its extension stands in when nothing legible is left.
export const gameDisplayTitle = (title, fileName) => {
	const cleaned = (title || '')
		.replace(/[\uF020-\uF029]/g, (c) => MAC_SMB_CHARACTERS[c.charCodeAt(0) - 0xF020])
		.replace(/�/g, '')
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x1F\x7F]/g, '')
		.trim();
	return cleaned || thumbName(fileName);
};

// The title without trailing No-Intro tags such as "(USA)" or "(Rev 1)", for the details screen,
// which shows the region on its own, and for Home's game rows. Lists keep the tags so two releases
// stay apart.
export const gameHeadline = (title, fileName) => {
	const display = gameDisplayTitle(title, fileName);
	return display.replace(/(\s*[([][^()[\]]*[)\]])+$/, '').trim() || display;
};

// A cover the server has no art for leaves the seeded colour behind it showing.
export const hideBrokenArt = (ev) => { ev.target.style.visibility = 'hidden'; };

// Art never draws taller than the portrait card.
export const PORTRAIT_HEIGHT = 1.34;

// A box art's card, in multiples of the portrait card's width. Portrait and square art keep the
// width and get shorter, landscape art widens up to half again, and art with no size is the
// portrait card.
export const boxArtCell = (aspect) => {
	if (!(aspect > 0) || !isFinite(aspect)) return {width: 1, height: PORTRAIT_HEIGHT};
	const ratio = Math.min(Math.max(aspect, 0.69), 1.5);
	if (ratio <= 1) return {width: 1, height: Math.min(1 / ratio, PORTRAIT_HEIGHT)};
	const width = Math.min(1 + (ratio - 1) * 1.16, 1.5);
	return {width, height: width / ratio};
};

// Whether art would leave a visible gap in a card of cellAspect, which then shows it whole.
export const boxArtNeedsFill = (aspect, cellAspect) => {
	if (aspect == null || !(cellAspect > 0)) return false;
	const difference = aspect / cellAspect;
	return difference < 0.95 || difference > 1.05;
};

// The middle box art shape, so one odd box can't reshape a whole system grid.
export const medianAspect = (aspects) => {
	const ratios = [];
	aspects.forEach((ratio) => ratios.push(ratio));
	if (!ratios.length) return null;
	ratios.sort((a, b) => a - b);
	const mid = Math.floor(ratios.length / 2);
	return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
};

const GRID_ASPECT_KEY = 'moonfin_game_grid_cell_aspect:';

export const savedGridAspect = (scope) => {
	try {
		const aspect = parseFloat(localStorage.getItem(GRID_ASPECT_KEY + scope));
		return aspect > 0 ? aspect : null;
	} catch {
		return null;
	}
};

export const saveGridAspect = (scope, aspect) => {
	try {
		localStorage.setItem(GRID_ASPECT_KEY + scope, String(aspect));
	} catch {
		// The next visit takes the shape from the sizes again.
	}
};

// Stable, pleasant fallback color for poster placeholders when no thumbnail resolves.
export const gameFallbackColor = (seed) => {
	let hash = 0;
	const s = seed || '';
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) & 0x7fffffff;
	}
	return `hsl(${hash % 360}, 45%, 26%)`;
};
