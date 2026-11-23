// How far in from the left edge content starts beside the resting Reel or Mosaic control. Mosaic's
// button reaches furthest, 96px in, and this leaves a gap past it.
export const SIDE_CONTROL_ROOM = 120;

// What a details page leaves room for on its left: the classic sidebar's rail down the whole
// edge, the small control Reel and Mosaic keep there until they open, or nothing while the bar
// runs along the top.
export const sideNavRoom = (settings) => {
	if (settings.navbarPosition !== 'left') return null;
	return settings.sidebarStyle === 'reel' || settings.sidebarStyle === 'mosaic' ? 'control' : 'rail';
};

// The page's own class for that room. Every details stylesheet names them the same way, and one
// whose insets already clear the control has no class for it.
export const sideOffsetClass = (room, css) => {
	if (room === 'rail') return css.sidebarOffset;
	return (room === 'control' && css.controlOffset) || '';
};
