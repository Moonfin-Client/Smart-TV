// The hidden arcade behind the Version row, drawn in a DOM layer over the canvas (see dom.js). One
// requestAnimationFrame loop draws the menu's demo or the game being played, and a paused or
// finished game keeps its last frame under a dim.
import $L from '../../services/i18n.js'
import { fetchBoard, loadDeviceBoards, postScore, recordDeviceRun } from '../../services/miniGamesApi.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import { isBackKey, KEYS } from '../../utils/keys.js'
import { getStore } from '../../state/store.js'
import { memoryCache } from '../../state/browseCache.js'
import { genreGlowRgb } from '../../ui/components/home/galleryGlow.js'
import { GAME_IDS, H, W, drawDim, drawShade, makeGame, simulate } from './games.js'
import { drawHowToIcons, howToMarkup, remoteLines } from './HowToPlay.js'
import { isSoundOn, loadSounds, playSound, setSoundOn, sleepAudio, startMusic, stopMusic, unlockAudio } from './sound.js'
import { esc, mountLayer } from './dom.js'

// The canvas is the 480 x 270 game screen at twice its size, stretched over the TV.
const SC = 2
const ROW_SHIFT = 328
const LEADERBOARDS = GAME_IDS.length
// webOS can send a click with the OK key while its pointer shows, which would count the press twice.
const CLICK_AFTER_KEY_MS = 300
// OK pressed in the last moment of a run shouldn't land on Play again.
const OVER_SETTLE_MS = 500
// Games whose How to play card has been started from, so it only opens by itself before a first run.
const SEEN_KEY = 'afterHoursSeen'

const gameText = () => ({
  'buffer-run': { name: $L('Buffer Run'), genre: $L('Endless runner with a gravity flip'), pitch: $L('The runner from the loading screen finally gets somewhere to go.') },
  'fast-forward': { name: $L('Fast Forward'), genre: $L('Three-lane runner'), pitch: $L('A sprint down three lobby aisles.') },
  'cable-crawl': { name: $L('Cable Crawl'), genre: $L('Grid crawler'), pitch: $L('Steer an HDMI cable around the back of the TV cabinet and plug into signal.') },
  'case-stack': {
    name: $L('Case Stack'),
    genre: $L('One-button stacker'),
    pitch: $L('Build a shelf-high tower of Blu-ray cases, each one a title from your own library with the genre color and uppercase title the bookshelf media bar already uses.'),
  },
  'pixel-purge': { name: $L('Pixel Purge'), genre: $L('Paddle breaker'), pitch: $L('A bad encode left the picture full of blocky artifacts, and they creep down a little every second.') },
})

const spine = (title, rgb) => {
  const [r, g, b] = rgb.split(',').map(Number)
  return { title, col: `rgb(${rgb})`, dark: 0.299 * r + 0.587 * g + 0.114 * b > 150 }
}

// Case Stack's cases are the media bar's titles, colored by genre like the bookshelf bar's spines.
const shelfOf = (items) => {
  const titles = (items || []).filter((item) => item && typeof item.Name === 'string' && item.Name.trim())
  if (titles.length) return titles.map((item) => spine(item.Name.toUpperCase(), genreGlowRgb(item.Genres)))
  const neutral = [$L('Feature Presentation'), $L('Double Feature'), $L('Midnight Movie'), $L("Director's Cut"), $L('Special Edition'), $L('Coming Soon')]
  const genres = ['Comedy', 'Sci-Fi', 'Horror', 'Animation', 'Romance', 'Thriller']
  return neutral.map((title, i) => spine(title.toUpperCase(), genreGlowRgb([genres[i]])))
}

const TROPHY =
  '<svg viewBox="0 0 24 24" width="88" height="88" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="#ffc94a"/>' +
  '<path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" stroke="#ffc94a" stroke-width="1.6" fill="none"/>' +
  '<rect x="10.5" y="12.5" width="3" height="4" fill="#ffc94a"/><rect x="8" y="17" width="8" height="2.5" rx="1" fill="#ffc94a"/></svg>'

const boardMarkup = (rows, me, fresh) => {
  if (!rows) return ''
  if (!rows.length) return `<div class="ah-empty">${esc($L('No scores yet'))}</div>`
  const items = rows
    .map((row, i) => {
      const mine = row.userName === me
      return (
        `<li${mine ? ' class="ah-mine"' : ''}><span class="ah-rank">${i + 1}</span><span class="ah-name">${esc(row.userName)}` +
        (mine ? `<span class="ah-tag">${esc($L('YOU'))}</span>` : '') +
        (i === fresh ? `<span class="ah-tag ah-tagNew">${esc($L('NEW'))}</span>` : '') +
        `</span><span class="ah-score">${esc(Number(row.score).toLocaleString())}</span></li>`
      )
    })
    .join('')
  return `<ol class="ah-board">${items}</ol>`
}

const buttonsMarkup = (buttons, focused) =>
  buttons.map((b, i) => `<div class="ah-button${i === focused ? ' ah-buttonFocused' : ''}" data-btn="${i}">${esc(b.label)}</div>`).join('')

export const openAfterHours = ({ onClose }) => {
  const store = getStore() || {}
  const me = (store.user && store.user.Name) || ''
  const serverName = store.serverName || ''
  const text = gameText()
  const remote = remoteLines()
  // Home keeps the titles its media bar loaded in the browse cache.
  const shelf = shelfOf(memoryCache.featuredItems)

  const s = {
    screen: 'menu',
    focus: 0,
    shift: 0,
    button: 0,
    boards: { source: null, lists: {} },
    result: null,
    soundOn: isSoundOn(),
    howTo: null,
    controlsRun: 0,
  }
  let game = null
  let gameId = GAME_IDS[0]
  let run = 0
  let steer = 0
  let lastKey = 0
  let demoOver = 0
  let overAt = 0
  let seen = {}
  let dimmed = false
  let raf = 0
  let controlsTimer = null
  let closed = false
  const thumbs = {}

  const root = mountLayer('ah-arcade')
  root.tabIndex = -1
  const canvas = document.createElement('canvas')
  canvas.className = 'ah-screen'
  canvas.width = W * SC
  canvas.height = H * SC
  root.appendChild(canvas)
  const overlay = document.createElement('div')
  root.appendChild(overlay)
  const ctx = canvas.getContext('2d', { alpha: false })

  const showDemo = (id) => {
    game = simulate(makeGame(id, shelf), 3)
    demoOver = 0
  }
  showDemo(GAME_IDS[0])

  // A game's thumbnail is simulated once and kept, since the menu row is rebuilt on every visit.
  const thumbFor = (id) => {
    if (thumbs[id]) return thumbs[id]
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const c = off.getContext('2d')
    const g = simulate(makeGame(id, shelf), 4)
    const draw = () => g.draw(c, 4)
    draw()
    thumbs[id] = { canvas: off, redraw: draw }
    return thumbs[id]
  }
  const paintThumbs = () => {
    const els = overlay.querySelectorAll('canvas[data-thumb]')
    for (let i = 0; i < els.length; i++) {
      const c = els[i].getContext('2d')
      if (c) c.drawImage(thumbFor(els[i].getAttribute('data-thumb')).canvas, 0, 0)
    }
  }
  // The HUD's digits come out in the fallback face until the arcade's fonts have loaded.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      Object.keys(thumbs).forEach((id) => thumbs[id].redraw())
      if (s.screen === 'menu') paintThumbs()
    })
  }

  const sourceLine = (from) => (from === 'server' ? $L('Scores from {server}').replace('{server}', serverName) : $L('Scores on this device'))

  const menuMarkup = () => {
    const cards = GAME_IDS.map(
      (id, i) =>
        `<div class="ah-card" data-card="${i}"><canvas width="${W}" height="${H}" class="ah-thumb" data-thumb="${id}"></canvas><span>${esc(text[id].name)}</span></div>`
    ).join('')
    return (
      `<div class="ah-menu"><div class="ah-brand"><span>Moonfin</span><b>${esc($L('After Hours'))}</b></div>` +
      '<div class="ah-info" data-info></div><div data-top></div>' +
      `<div class="ah-row" data-row>${cards}<div class="ah-card" data-card="${LEADERBOARDS}"><div class="ah-thumb ah-trophy">${TROPHY}</div>` +
      `<span>${esc($L('Leaderboards'))}</span></div></div></div>`
    )
  }

  const updateMenu = () => {
    const focused = s.focus < LEADERBOARDS ? text[GAME_IDS[s.focus]] : null
    const info = overlay.querySelector('[data-info]')
    if (!info) return
    info.innerHTML =
      (focused ? `<span class="ah-genre">${esc(focused.genre)}</span>` : '') +
      `<h3>${esc(focused ? focused.name : $L('Leaderboards'))}</h3>` +
      (focused ? `<p>${esc(focused.pitch)}</p>` : '') +
      `<div class="ah-chips"><span><kbd>${esc($L('OK'))}</kbd> ${esc(focused ? $L('Play') : $L('Open'))}</span>` +
      (focused ? `<span data-howto><kbd>${esc($L('Down'))}</kbd> ${esc($L('How to play'))}</span>` : '') +
      `<span><kbd>${esc($L('Back'))}</kbd> ${esc($L('About'))}</span></div>`
    const top = overlay.querySelector('[data-top]')
    top.innerHTML =
      focused && s.boards.source
        ? `<div class="ah-topBox"><span class="ah-heading">${esc(s.boards.source === 'server' ? $L('Top 3 · This server') : $L('Top 3 · This device'))}</span>` +
          `${boardMarkup(s.boards.lists[GAME_IDS[s.focus]] || [], me, -1)}</div>`
        : ''
    const row = overlay.querySelector('[data-row]')
    row.style.transform = `translateX(${-s.shift * ROW_SHIFT}px)`
    const cards = row.querySelectorAll('[data-card]')
    for (let i = 0; i < cards.length; i++) cards[i].className = i === s.focus ? 'ah-card ah-focused' : 'ah-card'
  }

  const pauseButtons = () => [
    {
      label: $L('Resume'),
      run: () => {
        playSound('select')
        setScreen('play')
      },
    },
    {
      label: $L('How to play'),
      run: () => {
        playSound('select')
        openHowTo(gameId, 'pause')
      },
    },
    {
      label: s.soundOn ? $L('Sound on') : $L('Sound off'),
      run: () => {
        setSoundOn(!s.soundOn)
        s.soundOn = !s.soundOn
        render()
      },
    },
    { label: $L('Quit'), run: () => toArcade() },
  ]

  const overButtons = () => [
    {
      label: $L('Play again'),
      run: () => {
        playSound('select')
        startGame(gameId)
      },
    },
    { label: $L('Back to the arcade'), run: () => toArcade() },
  ]

  const backToPause = () => {
    playSound('back')
    s.button = 1
    setScreen('pause')
  }

  const howToButtons = () => {
    if (!s.howTo) return []
    if (s.howTo.from === 'pause') return [{ label: $L('Back to the game'), run: backToPause }]
    return [
      {
        label: $L('Start'),
        run: () => {
          playSound('select')
          seen = { ...seen, [s.howTo.id]: true }
          saveToStorage(SEEN_KEY, seen)
          startGame(s.howTo.id)
        },
      },
      {
        label: $L('Back to the arcade'),
        run: () => {
          playSound('back')
          setScreen('menu')
        },
      },
    ]
  }

  const currentButtons = () => (s.screen === 'pause' ? pauseButtons() : s.screen === 'over' ? overButtons() : s.screen === 'howto' ? howToButtons() : [])

  const render = () => {
    const screen = s.screen
    if (screen === 'menu') {
      overlay.innerHTML = menuMarkup()
      paintThumbs()
      updateMenu()
    } else if (screen === 'play') {
      overlay.innerHTML =
        `<div class="ah-hudRow"><div class="ah-hint"><kbd>${esc($L('Back'))}</kbd> ${esc($L('Pause'))}</div>` +
        `<div class="ah-controlsSlot"><div class="ah-playControls${s.controlsRun ? '' : ' ah-faded'}" data-controls>${esc(remote[gameId])}</div></div></div>`
    } else if (screen === 'pause') {
      overlay.innerHTML = `<div class="ah-pause"><div class="ah-panel"><h3>${esc(text[gameId].name)}</h3>${buttonsMarkup(pauseButtons(), s.button)}</div></div>`
    } else if (screen === 'over' && s.result) {
      const r = s.result
      overlay.innerHTML =
        `<div class="ah-over"><div class="ah-overMain"><div class="ah-gameOver">${esc($L('Game over'))}</div>` +
        `<div class="ah-final">${esc(r.score.toLocaleString())}</div>` +
        (r.rank ? `<div class="ah-newRank">${esc($L('New #{rank} on the board').replace('{rank}', r.rank))}</div>` : '') +
        `<div class="ah-buttons">${buttonsMarkup(overButtons(), s.button)}</div>` +
        (r.source ? `<div class="ah-source">${esc(sourceLine(r.source))}</div>` : '') +
        '</div>' +
        (r.list
          ? `<div class="ah-panel"><span class="ah-heading">${esc($L('{game} · Top 3').replace('{game}', text[r.id].name))}</span>${boardMarkup(r.list, me, r.rank ? r.rank - 1 : -1)}</div>`
          : '') +
        '</div>'
    } else if (screen === 'howto' && s.howTo) {
      overlay.innerHTML = howToMarkup(s.howTo.id, text[s.howTo.id].name, buttonsMarkup(howToButtons(), s.button))
      drawHowToIcons(overlay)
    } else if (screen === 'boards') {
      const source = s.boards.source || (s.result && s.result.source)
      overlay.innerHTML =
        `<div class="ah-boards"><div class="ah-boardsHead"><b>${esc($L('Leaderboards'))}</b>${source ? `<span>${esc(sourceLine(source))}</span>` : ''}</div>` +
        `<div class="ah-boardGrid">${GAME_IDS.map((id) => `<div class="ah-boardCard"><h4>${esc(text[id].name)}</h4>${boardMarkup(s.boards.lists[id] || [], me, -1)}</div>`).join('')}</div></div>`
    } else overlay.innerHTML = ''
  }

  const setButton = (i) => {
    s.button = i
    const els = overlay.querySelectorAll('[data-btn]')
    for (let j = 0; j < els.length; j++) els[j].className = j === i ? 'ah-button ah-buttonFocused' : 'ah-button'
  }

  const stopLoop = () => {
    if (raf) window.cancelAnimationFrame(raf)
    raf = 0
  }

  const startLoop = () => {
    stopLoop()
    ctx.setTransform(SC, 0, 0, SC, 0, 0)
    const screen = s.screen
    if (screen === 'pause' || screen === 'over' || screen === 'howto') {
      // Pause and its How to play card share one frozen frame, which is dimmed once.
      if (!dimmed) drawDim(ctx)
      dimmed = true
      return
    }
    if (screen !== 'menu' && screen !== 'play') return
    dimmed = false
    let last = 0
    const frame = (now) => {
      raf = window.requestAnimationFrame(frame)
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const g = game
      let ended = false
      if (screen === 'menu') {
        if (!g.over) {
          g.ai()
          g.update(dt)
        } else if ((demoOver += dt) > 1.2) {
          g.reset()
          demoOver = 0
        }
      } else if (!g.ended) {
        // A Case Stack miss ends the run from the key press, between updates.
        if (!g.over) g.update(dt)
        if (g.over) {
          g.ended = true
          ended = true
        }
      }
      g.draw(ctx, now / 1000)
      if (screen === 'menu') drawShade(ctx)
      // The run's last frame is drawn before the Game over screen dims it.
      if (ended) endRun()
    }
    raf = window.requestAnimationFrame(frame)
  }

  const music = () => {
    const wanted = s.screen === 'menu' || (s.screen === 'howto' && s.howTo && s.howTo.from !== 'pause')
    if (wanted) startMusic()
    else stopMusic()
  }

  const setScreen = (screen) => {
    const changed = screen !== s.screen
    s.screen = screen
    render()
    if (changed || screen === 'play' || screen === 'menu') startLoop()
    music()
  }

  const endRun = async () => {
    const id = gameId
    const score = game.score
    const mine = ++run
    playSound('crash')
    overAt = Date.now()
    s.button = 0
    s.result = { id, score }
    setScreen('over')
    const placed = await recordDeviceRun(id, { userName: me, score })
    let outcome
    try {
      const rank = await postScore(id, score)
      outcome = { source: 'server', rank, list: await fetchBoard(id) }
    } catch (e) {
      outcome = { source: 'device', rank: placed.rank, list: placed.list }
    }
    if (closed || mine !== run) return
    s.result = { id, score, ...outcome }
    if (s.boards.source === outcome.source) s.boards = { ...s.boards, lists: { ...s.boards.lists, [id]: outcome.list } }
    if (s.screen === 'over') render()
    if (outcome.rank) playSound('fanfare')
  }

  const startGame = (id) => {
    const g = makeGame(id, shelf)
    g.reset()
    g.sfx = playSound
    game = g
    gameId = id
    steer = 0
    run++
    s.controlsRun = run
    s.result = null
    clearTimeout(controlsTimer)
    controlsTimer = setTimeout(() => {
      s.controlsRun = 0
      const el = overlay.querySelector('[data-controls]')
      if (el) el.className = 'ah-playControls ah-faded'
    }, 4000)
    setScreen('play')
  }

  const toArcade = () => {
    playSound('back')
    showDemo(GAME_IDS[Math.min(s.focus, LEADERBOARDS - 1)])
    setScreen('menu')
  }

  const moveFocus = (to, pointer) => {
    if (to < 0 || to > LEADERBOARDS || to === s.focus) return
    playSound('tick')
    s.focus = to
    if (!pointer) s.shift = Math.max(0, to - 3)
    if (to < LEADERBOARDS) showDemo(GAME_IDS[to])
    updateMenu()
  }

  const openHowTo = (id, from) => {
    s.howTo = { id, from }
    s.button = 0
    setScreen('howto')
  }

  const openCard = (i) => {
    playSound('select')
    if (i === LEADERBOARDS) setScreen('boards')
    else if (!seen[GAME_IDS[i]]) openHowTo(GAME_IDS[i], 'first')
    else startGame(GAME_IDS[i])
  }

  const gameKey = (code) => {
    const g = game
    const up = code === KEYS.UP
    const down = code === KEYS.DOWN
    const ok = code === KEYS.ENTER
    switch (gameId) {
      case 'buffer-run': {
        // On the ceiling everything is mirrored, Up and Down included.
        const flipped = g.p.grav < 0
        if (ok || (flipped ? down : up)) g.jump()
        else if (flipped ? up : down) g.duck()
        break
      }
      case 'fast-forward':
        g.press(up ? 'up' : down ? 'down' : ok ? 'ok' : '')
        break
      case 'cable-crawl':
        g.press({ [KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right' }[code])
        break
      case 'case-stack':
        if (ok) g.drop()
        break
      case 'pixel-purge':
        if (code === KEYS.LEFT || code === KEYS.RIGHT) {
          steer = code === KEYS.LEFT ? -1 : 1
          g.p.tx = steer < 0 ? -W : 2 * W
        }
        break
      default:
    }
  }

  const handleKey = (code, back, repeat) => {
    const prev = code === KEYS.LEFT || code === KEYS.UP
    const next = code === KEYS.RIGHT || code === KEYS.DOWN
    const ok = code === KEYS.ENTER
    const screen = s.screen
    if (screen === 'menu') {
      if (back) {
        playSound('back')
        close()
      } else if (code === KEYS.LEFT || code === KEYS.RIGHT) moveFocus(s.focus + (code === KEYS.LEFT ? -1 : 1))
      else if (code === KEYS.DOWN && !repeat && s.focus < LEADERBOARDS) {
        playSound('select')
        openHowTo(GAME_IDS[s.focus], 'menu')
      } else if (ok && !repeat) openCard(s.focus)
    } else if (screen === 'play') {
      if (back) {
        playSound('back')
        s.button = 0
        setScreen('pause')
      } else if (!repeat) gameKey(code)
    } else if (screen === 'pause' || screen === 'over' || screen === 'howto') {
      const buttons = currentButtons()
      if (back) {
        if (screen === 'pause') {
          playSound('back')
          setScreen('play')
        } else if (screen === 'over') toArcade()
        else if (s.howTo.from === 'pause') backToPause()
        else {
          playSound('back')
          setScreen('menu')
        }
      } else if (prev || next) {
        const to = s.button + (prev ? -1 : 1)
        if (to >= 0 && to < buttons.length) {
          playSound('tick')
          setButton(to)
        }
      } else if (ok && !repeat && Date.now() - overAt > OVER_SETTLE_MS) buttons[s.button].run()
    } else if (screen === 'boards' && (back || ok)) {
      playSound('back')
      setScreen('menu')
    }
  }

  // The arcade takes the remote while it's up, ahead of the canvas and the settings screen under it.
  const held = {}
  const ours = (e) => isBackKey(e) || [KEYS.UP, KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT, KEYS.ENTER].indexOf(e.keyCode) >= 0
  const onDown = (e) => {
    if (!ours(e)) return
    e.preventDefault()
    e.stopPropagation()
    unlockAudio()
    const repeat = !!held[e.keyCode]
    held[e.keyCode] = true
    if (e.keyCode === KEYS.ENTER) lastKey = Date.now()
    handleKey(e.keyCode, isBackKey(e), repeat)
  }
  const onUp = (e) => {
    if (!ours(e)) return
    e.preventDefault()
    e.stopPropagation()
    delete held[e.keyCode]
    const dir = e.keyCode === KEYS.LEFT ? -1 : e.keyCode === KEYS.RIGHT ? 1 : 0
    if (dir && dir === steer && gameId === 'pixel-purge' && game.p) {
      steer = 0
      game.p.tx = game.p.x
    }
  }
  // A game left running behind another app would end on its own.
  const onHidden = () => {
    if (document.hidden && s.screen === 'play') {
      s.button = 0
      setScreen('pause')
    }
  }

  // Chrome 38 has no Element.closest.
  const withAttr = (el, name) => {
    for (let n = el; n && n !== root; n = n.parentNode) if (n.getAttribute && n.getAttribute(name) != null) return n
    return null
  }
  // The Magic Remote pointer: it steers Pixel Purge, and a click is a tap everywhere else.
  const pointerOk = () => Date.now() - lastKey > CLICK_AFTER_KEY_MS
  const onMove = (e) => {
    if (s.screen !== 'play' || gameId !== 'pixel-purge') return
    game.p.tx = (e.clientX / (root.getBoundingClientRect().width || 1920)) * W
  }
  const onOver = (e) => {
    const card = withAttr(e.target, 'data-card')
    if (card && s.screen === 'menu') moveFocus(+card.getAttribute('data-card'), true)
    const btn = withAttr(e.target, 'data-btn')
    if (btn) setButton(+btn.getAttribute('data-btn'))
  }
  const onClick = (e) => {
    if (!pointerOk()) return
    const t = e.target
    if (t === canvas) {
      if (s.screen !== 'play') return
      unlockAudio()
      if (gameId === 'buffer-run') game.jump()
      else if (gameId === 'fast-forward') game.press('ok')
      else if (gameId === 'case-stack') game.drop()
      return
    }
    const howto = withAttr(t, 'data-howto')
    if (howto && s.screen === 'menu') return openHowTo(GAME_IDS[s.focus], 'menu')
    const card = withAttr(t, 'data-card')
    if (card && s.screen === 'menu') return openCard(+card.getAttribute('data-card'))
    const btn = withAttr(t, 'data-btn')
    if (btn) {
      const b = currentButtons()[+btn.getAttribute('data-btn')]
      if (b) b.run()
    }
  }

  window.addEventListener('keydown', onDown, true)
  window.addEventListener('keyup', onUp, true)
  document.addEventListener('visibilitychange', onHidden)
  root.addEventListener('mousemove', onMove)
  root.addEventListener('mouseover', onOver)
  root.addEventListener('click', onClick)

  const close = () => {
    if (closed) return
    closed = true
    stopLoop()
    clearTimeout(controlsTimer)
    window.removeEventListener('keydown', onDown, true)
    window.removeEventListener('keyup', onUp, true)
    document.removeEventListener('visibilitychange', onHidden)
    if (root.parentNode) root.parentNode.removeChild(root)
    sleepAudio()
    if (onClose) onClose()
  }

  // The boards come from the server when the plugin answers for every game, otherwise from this TV.
  Promise.all(GAME_IDS.map(fetchBoard))
    .then((lists) => ({ source: 'server', lists: GAME_IDS.reduce((all, id, i) => ({ ...all, [id]: lists[i] }), {}) }))
    .catch(() => loadDeviceBoards().then((lists) => ({ source: 'device', lists })))
    .then((next) => {
      if (closed) return
      s.boards = next
      if (s.screen === 'menu') updateMenu()
      else if (s.screen === 'boards') render()
    })
    .catch(() => {})

  getFromStorage(SEEN_KEY)
    .then((stored) => {
      if (stored && typeof stored === 'object') seen = stored
    })
    .catch(() => {})

  if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
  root.focus()
  loadSounds()
  render()
  startLoop()
  music()
  return { close }
}
