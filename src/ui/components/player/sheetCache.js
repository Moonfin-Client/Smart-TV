import { getRenderer } from '@solidtv/solid'

// The trickplay sprite sheets already downloaded, so a scrub's next sheets are in the browser's cache by the time a
// tile is cut from them. The last 64 are remembered.
const SHEET_MEMORY = 64
const loaded = []
const pending = {}

export const whenSheetLoaded = (url) => {
  if (!url || loaded.indexOf(url) >= 0 || pending[url]) return
  const image = (pending[url] = new Image())
  image.onload = () => {
    delete pending[url]
    if (loaded.length >= SHEET_MEMORY) loaded.shift()
    loaded.push(url)
  }
  image.onerror = () => {
    delete pending[url]
  }
  image.src = url
}

// A tile goes to the GPU as its own crop of its sheet, 320x180 rather than the 3200x1800 sheet, and a preview tile
// only switches to it once it's up, so it never shows an empty box. The crop rides in the address's fragment, since
// the renderer reloads a picture only when its src changes.
export const tileSrc = (url, tile) => `${url}#${tile.x},${tile.y}`

const tileTexture = (url, tile) =>
  getRenderer().stage.txManager.createTexture('ImageTexture', { src: tileSrc(url, tile), sx: tile.x, sy: tile.y, sw: tile.width, sh: tile.height })

const waiting = {}
// The tiles last put up. Past these many, the oldest ones no node shows go again, so a long scrub holds a few MB,
// not a tile per step. One still shown, or too new for the renderer to free, waits for the next tile.
const TILE_MEMORY = 24
const recent = []
const remember = (tex) => {
  const at = recent.indexOf(tex)
  if (at >= 0) recent.splice(at, 1)
  recent.push(tex)
  for (let i = 0; recent.length > TILE_MEMORY && i < recent.length; ) {
    const old = recent[i]
    if (old.attached === 0 && old.canBeCleanedUp()) {
      recent.splice(i, 1)
      getRenderer().stage.txMemManager.freeTexture(old)
    } else i++
  }
}

export const isTileLoaded = (url, tile) => tileTexture(url, tile).state === 'loaded'

export const whenTileLoaded = (url, tile, done) => {
  const key = tileSrc(url, tile)
  if (waiting[key]) return
  const tex = tileTexture(url, tile)
  waiting[key] = true
  const settle = (ok) => () => {
    delete waiting[key]
    tex.off('loaded', onLoaded)
    tex.off('failed', onFailed)
    if (!ok) return
    remember(tex)
    done()
  }
  const onLoaded = settle(true)
  const onFailed = settle(false)
  tex.on('loaded', onLoaded)
  tex.on('failed', onFailed)
  if (tex.state !== 'loading') getRenderer().stage.txManager.loadTexture(tex)
}
