// Keyless libretro thumbnail art + display helpers for retro games. Ported from the Flutter
// client (lib/util/game_library.dart) so all Moonfin clients resolve box art the same way.

// EmulatorJS core name -> libretro thumbnail platform folder. These names are the No-Intro
// system names libretro keys both thumbnails and metadata on.
const LIBRETRO_PLATFORM = {
	nes: 'Nintendo - Nintendo Entertainment System',
	snes: 'Nintendo - Super Nintendo Entertainment System',
	gb: 'Nintendo - Game Boy',
	gba: 'Nintendo - Game Boy Advance',
	n64: 'Nintendo - Nintendo 64',
	nds: 'Nintendo - Nintendo DS',
	vb: 'Nintendo - Virtual Boy',
	segaMD: 'Sega - Mega Drive - Genesis',
	segaMS: 'Sega - Master System - Mark III',
	segaGG: 'Sega - Game Gear',
	atari2600: 'Atari - 2600',
	atari7800: 'Atari - 7800',
	lynx: 'Atari - Lynx',
	ws: 'Bandai - WonderSwan',
	ngp: 'SNK - Neo Geo Pocket',
	pce: 'NEC - PC Engine - TurboGrafx 16',
	psx: 'Sony - PlayStation',
	psp: 'Sony - PlayStation Portable'
};

// libretro replaces these characters with '_' in thumbnail filenames.
const SANITIZE = /[&*/:`<>?\\|"]/g;

const thumbUrl = (core, title, folder) => {
	if (!core || !title) return null;
	const platform = LIBRETRO_PLATFORM[core];
	if (!platform) return null;
	const sanitized = title.replace(SANITIZE, '_');
	return `https://thumbnails.libretro.com/${encodeURIComponent(platform)}/${folder}/${encodeURIComponent(sanitized)}.png`;
};

// The No-Intro name libretro art is keyed on is the ROM filename (with its region/revision
// tags), not the cleaned display title. Strip the extension only.
export const thumbName = (fileName) => {
	if (!fileName) return '';
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(0, dot) : fileName;
};

export const boxartUrl = (core, fileName) => thumbUrl(core, thumbName(fileName), 'Named_Boxarts');
export const snapUrl = (core, fileName) => thumbUrl(core, thumbName(fileName), 'Named_Snaps');
export const titleScreenUrl = (core, fileName) => thumbUrl(core, thumbName(fileName), 'Named_Titles');

// A safe display title: strip the replacement char and control bytes some ROM folder names
// carry, falling back to the filename without extension when nothing legible remains.
export const gameDisplayTitle = (title, fileName) => {
	// eslint-disable-next-line no-control-regex
	const cleaned = (title || '').replace(/�/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
	return cleaned || thumbName(fileName);
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
