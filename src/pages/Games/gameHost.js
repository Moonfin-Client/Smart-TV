// The DOM GamePlayer needs, kept out of its component: EmulatorJS draws into a layer of its own,
// created here and removed on exit, and Back and the controller screen's keys are taken before
// EmulatorJS or the canvas see them.

// The canvas gets the same stacking the video player gives it, so the layer can go either side.
export const mountGameLayer = () => {
  const app = document.getElementById('app')
  if (app) {
    app.style.position = 'absolute'
    app.style.left = '0'
    app.style.top = '0'
    app.style.zIndex = '1'
  }
  const root = document.createElement('div')
  root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden;background:#000;z-index:0;'
  const game = document.createElement('div')
  game.id = 'game'
  // Keeps the webOS magic remote pointer from triggering EmulatorJS's own hover menu and click UI.
  game.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;'
  root.appendChild(game)
  document.body.appendChild(root)
  return {
    // Above the canvas while the game or EmulatorJS's own screens are showing, under it otherwise.
    raise: (above) => {
      root.style.zIndex = above ? '99998' : '0'
    },
    remove: () => {
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

// keydown and keyup, ahead of everything else. Returns the remover.
export const captureGameKeys = (fn) => {
  window.addEventListener('keydown', fn, true)
  window.addEventListener('keyup', fn, true)
  return () => {
    window.removeEventListener('keydown', fn, true)
    window.removeEventListener('keyup', fn, true)
  }
}

// The game gives up the keyboard while a canvas panel is up.
export const blurGame = () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
}

export const focusGame = () => {
  try {
    window.EJS_emulator.elements.parent.focus()
  } catch (e) {
    // EmulatorJS has nothing to focus yet.
  }
}

export const revokeBlobs = (urls) =>
  urls.forEach((u) => {
    try {
      URL.revokeObjectURL(u)
    } catch (e) {
      // Already gone.
    }
  })
