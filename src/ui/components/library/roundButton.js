// The round toolbar button the Genres and Favorites screens share, as a ChromeControl.
export const roundButton = (id, icon, x, y, ms, extra) => ({
  id, group: 'toolbar', kind: 'button', x, y, w: 52, h: 52, r: 26, ms, zoom: 1.12,
  base: '#ffffff14', fill: '#00a4dc4d', ring: true, ringBorder: { w: 1, color: 0xffffffff },
  icon, ix: 13, iy: 13, isz: 26, iconOff: '#ffffff', inkOn: '#ffffff', iconAlpha: 1,
  next: { down: 'out' },
  ...extra,
})
