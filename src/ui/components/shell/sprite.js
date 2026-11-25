import { getRenderer } from '@solidtv/solid'

// One texture per frame of a sprite sheet, for a node's `texture` prop. `sheet` is
// { src, map: { frames: { [i]: { x, y, w, h } } } }, as runnerSheet() and moonPhases() bake them.
// The frames are made once per sheet and kept on it, since a sheet is itself cached.
export const spriteFrames = (sheet) => {
  if (sheet.textures) return sheet.textures
  const tx = getRenderer().stage.txManager
  const parent = tx.createTexture('ImageTexture', { src: sheet.src })
  const frames = sheet.map.frames
  sheet.textures = Object.keys(frames).map((k) => {
    const f = frames[k]
    return tx.createTexture('SubTexture', { texture: parent, x: f.x, y: f.y, w: f.w, h: f.h })
  })
  return sheet.textures
}

// Whether a node is drawn, for a repeating update that skips its turn while it can't be seen.
export const drawn = (node) => {
  const lng = node && node.lng
  return !!lng && !!node.parent && lng.worldAlpha !== 0
}
