import $L from '../../../services/i18n.js'
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { drawn } from '../shell/sprite.js'
import { fetchBook, startPage } from '../../../utils/books.js'
import { openComicPages } from '../../../utils/comicPages.js'
import { FIXED_LAYOUT_INVERT_KEY } from '../../../utils/readerSettings.js'
import { getFromStorage, saveToStorage } from '../../../services/storage.js'
import { getApiKey, getServerUrl } from '../../../services/jellyfinApi.js'
import { pageProgress } from './bookProgress.js'
import { blobUrl, dropUrl, fitPage, invertedUrl } from './readerDom.js'
import { tx } from '../../fx.js'

// Pages this far from the current one stay ready, the rest are let go.
const KEEP_AROUND = 2
const DIRECTION_KEY = 'book_reader_comic_direction'
const AUTO_HIDE_KEY = 'book_reader_comic_auto_hide'
const HIDE_AFTER_MS = 4000
const CLEAR = '#00000000'

// Left and right follow the reading direction, so in a right to left comic Left is the next page.
const comicPageStep = (name, rtl) => {
  if (name === 'right') return rtl ? -1 : 1
  if (name === 'left') return rtl ? 1 : -1
  return 0
}

// A 48px ring with a quarter of it lit, turning once every 0.8 seconds while it can be seen.
function RingSpinner(props) {
  const [turns, setTurns] = createSignal(0)
  let node
  onMount(() => {
    const turn = () => {
      if (drawn(node)) setTurns(turns() + 1)
    }
    turn()
    const timer = setInterval(turn, 800)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <view x={props.x} y={props.y} width={48} height={48}>
      <view width={48} height={48} borderRadius={24} color={CLEAR} border={{ width: 4, color: hex('#ffffff33') }} />
      <view
        ref={node}
        transition={{ rotation: { duration: 800, easing: 'linear' } }}
        width={48}
        height={48}
        pivot={0.5}
        rotation={turns() * Math.PI * 2}
        borderRadius={24}
        color={CLEAR}
        borderTop={{ width: 4, color: hex('#ffffff') }}
      />
    </view>
  )
}

// A CBZ, CBT, CBR or CB7 comic a page at a time, the title over it and the page count under it,
// with reading direction, invert and auto hide toggles. Each page is unpacked to a blob URL only
// when it's near the one shown. It takes every key and calls props.onComicClose() when Back leaves
// the comic. Its node has open(item, archive).
export default function ComicViewer(props) {
  const [src, setSrc] = createSignal('')
  const [imageLoaded, setImageLoaded] = createSignal(false)
  const [pageSize, setPageSize] = createSignal({ w: 1920, h: 1080 })
  const [ready, setReady] = createSignal(false)
  const [status, setStatus] = createSignal('loading')
  const [error, setError] = createSignal('')
  const [showInfo, setShowInfo] = createSignal(true)
  const [inBars, setInBars] = createSignal(false)
  const [bar, setBar] = createSignal(0)
  const [rtl, setRtl] = createSignal(false)
  const [invert, setInvert] = createSignal(false)
  const [autoHide, setAutoHide] = createSignal(true)
  const [title, setTitle] = createSignal('')
  const [counter, setCounter] = createSignal('')
  const my = { urls: {}, inverted: {}, page: 0, count: 0, source: null, progress: null, closed: false, hideTimer: null }
  const boldFont = uiFont('bold')
  const font = uiFont()
  const hint = ['◀ ▶ ' + $L('Navigate'), 'OK ' + $L('Menu')].join('   ')
  // The arrows aren't in the SDF atlas, so the hint takes the canvas font.
  const hintFont = fontFor(hint)
  const toggles = () => [
    { i: 0, x: 1656, icon: rtl() ? 'core_format_textdirection_r_to_l' : 'core_format_textdirection_l_to_r', on: rtl() },
    { i: 1, x: 1740, icon: 'core_invert_colors', on: invert() },
    { i: 2, x: 1824, icon: autoHide() ? 'core_visibility_off' : 'core_visibility', on: autoHide() },
  ]

  onCleanup(() => {
    my.closed = true
    clearTimeout(my.hideTimer)
    if (my.progress) my.progress.flush()
    if (my.source) my.source.close()
    Object.keys(my.urls).forEach((k) => dropUrl(my.urls[k]))
  })

  const fail = (text) => {
    setError(text)
    setStatus('error')
    setReady(false)
  }
  const showPage = async () => {
    const page = my.page
    let url = my.urls[page] || ''
    if (url && invert()) {
      if (!my.inverted[page]) {
        try {
          my.inverted[page] = await invertedUrl(url)
        } catch (e) {
          my.inverted[page] = url
        }
      }
      if (page !== my.page || !invert()) return
      url = my.inverted[page]
    }
    if (url === src()) return
    setImageLoaded(false)
    setSrc(url)
  }
  const go = (page) => {
    my.page = page
    setCounter(page + 1 + ' / ' + my.count)
    my.progress.update(page, my.count)
    const urls = my.urls
    Object.keys(urls).forEach((k) => {
      if (Math.abs(Number(k) - page) <= KEEP_AROUND) return
      dropUrl(urls[k])
      delete urls[k]
      delete my.inverted[k]
    })
    for (let p = page - 1; p <= page + KEEP_AROUND; p++) {
      if (p < 0 || p >= my.count || p in urls) continue
      urls[p] = null
      const source = my.source
      source.load(p).then(
        (blob) => {
          if (my.closed || my.source !== source || urls[p] !== null) return
          urls[p] = blobUrl(blob)
          if (p === my.page) showPage()
        },
        () => {
          if (!my.closed) fail($L('Failed to open comic'))
        },
      )
    }
    showPage()
  }
  const turn = (step) => {
    const next = Math.min(Math.max(my.page + step, 0), my.count - 1)
    if (next !== my.page) go(next)
  }
  // The bars hide a few seconds after they show unless they're set to stay.
  const scheduleHide = () => {
    clearTimeout(my.hideTimer)
    if (!ready() || !autoHide() || !showInfo()) return
    my.hideTimer = setTimeout(hideBars, HIDE_AFTER_MS)
  }
  // Focus leaves the bars as they hide, so a stray OK can't press a control nobody can see.
  const hideBars = () => {
    clearTimeout(my.hideTimer)
    setShowInfo(false)
    setInBars(false)
  }
  const open = async (item, archive) => {
    setTitle(item.Name || $L('Comic'))
    try {
      const [buffer, storedInvert, storedDirection, storedAutoHide] = await Promise.all([
        fetchBook(item, getServerUrl(), getApiKey()),
        getFromStorage(FIXED_LAYOUT_INVERT_KEY).catch(() => null),
        getFromStorage(DIRECTION_KEY).catch(() => null),
        getFromStorage(AUTO_HIDE_KEY).catch(() => null),
      ])
      const source = await openComicPages(buffer, archive)
      if (my.closed) {
        source.close()
        return
      }
      my.source = source
      setInvert(storedInvert === true)
      setRtl(storedDirection === 'rtl')
      setAutoHide(storedAutoHide !== false)
      my.count = source.names.length
      if (!my.count) return fail($L('No pages found.'))
      my.progress = pageProgress(item)
      setStatus('')
      setReady(true)
      go(startPage(item, my.count))
      scheduleHide()
    } catch (e) {
      console.warn('[comic] open failed', e)
      if (!my.closed) fail($L('Failed to open comic'))
    }
  }
  const toggle = (i) => {
    if (i === 0) {
      setRtl(!rtl())
      saveToStorage(DIRECTION_KEY, rtl() ? 'rtl' : 'ltr').catch(() => {})
    } else if (i === 1) {
      setInvert(!invert())
      saveToStorage(FIXED_LAYOUT_INVERT_KEY, invert()).catch(() => {})
      showPage()
    } else {
      setAutoHide(!autoHide())
      saveToStorage(AUTO_HIDE_KEY, autoHide()).catch(() => {})
    }
    scheduleHide()
  }
  const key = (name) => () => {
    if (showInfo()) scheduleHide()
    if (!ready()) return true
    // The remote walks the bars while they're up. A press from outside only brings focus in.
    if (showInfo() && inBars()) {
      if (name === 'left' && bar() > 0) setBar(bar() - 1)
      else if (name === 'right' && bar() < 2) setBar(bar() + 1)
      else if (name === 'enter') toggle(bar())
      return true
    }
    if (showInfo()) {
      setInBars(true)
      setBar(0)
      return true
    }
    const step = comicPageStep(name, rtl())
    if (step) turn(step)
    else {
      setShowInfo(true)
      scheduleHide()
    }
    return true
  }
  const pageSpinner = () => status() === '' && (!src() || !imageLoaded())
  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color="#000000"
      onLeft={key('left')}
      onRight={key('right')}
      onUp={key('up')}
      onDown={key('down')}
      onEnter={key('enter')}
      onBack={() => {
        if (showInfo() && ready()) hideBars()
        else props.onComicClose()
        return true
      }}
      // Nothing else reaches the page behind the comic.
      onKeyPress={() => true}
    >
      <view>
        <Show when={src()}>
          <view
            transition={tx({ alpha: { duration: imageLoaded() ? 200 : 0, easing: 'ease-in' } })}
            x={(1920 - pageSize().w) / 2}
            y={(1080 - pageSize().h) / 2}
            width={pageSize().w}
            height={pageSize().h}
            src={src()}
            alpha={imageLoaded() ? 1 : 0.01}
            onEvent={{
              loaded: (node, e) => {
                const d = (e && e.dimensions) || {}
                if (d.w && d.h) setPageSize(fitPage(d.w, d.h))
                setImageLoaded(true)
              },
            }}
          />
        </Show>
      </view>
      <view>
        <Show when={pageSpinner()}>
          <RingSpinner x={936} y={516} />
        </Show>
        <Show when={status() === 'loading'}>
          <RingSpinner x={936} y={489.5} />
        </Show>
      </view>
      <text fontFamily={font} fontSize={24} x={960} y={562} mountX={0.5} color="#ffffff99" alpha={status() === 'loading' ? 1 : 0}>
        {$L('Opening comic...')}
      </text>
      <text fontFamily={font} fontSize={28} x={960} y={499} mountX={0.5} color="#ff6b6b" alpha={status() === 'error' ? 1 : 0}>
        {error()}
      </text>
      <text fontFamily={font} fontSize={24} x={960} y={555} mountX={0.5} color="#ffffff99" alpha={status() === 'error' ? 1 : 0}>
        {$L('Press Back to close')}
      </text>
      <view transition={{ alpha: { duration: 300 } }} alpha={showInfo() && ready() ? 1 : 0}>
        <view width={1920} height={81} colorTop="#000000b3" colorBottom="#00000000" />
        <text fontFamily={fontFor(title(), 'bold')} fontSize={32} x={36} y={25} color="#ffffff">
          {title()}
        </text>
        <view y={899} width={1920} height={100} color="#0000008c" />
        <view>
          <For each={[0, 1, 2]}>
            {(i) => {
              const tg = () => toggles()[i]
              return (
                <view x={tg().x} y={915} width={72} height={72}>
                  <view width={72} height={72} borderRadius={36} color={tg().on ? '#00a4dc' : '#ffffff24'} />
                  <view width={72} height={72} borderRadius={36} color={CLEAR} border={{ width: 4, color: hex('#ffffff') }} alpha={inBars() && bar() === i ? 1 : 0} />
                  <view x={18} y={18} width={36} height={36} src={'icons/' + tg().icon + '.webp'} color={tg().on ? '#ffffff' : '#ffffffb3'} />
                </view>
              )
            }}
          </For>
        </view>
        <view y={999} width={1920} height={81} colorTop="#00000000" colorBottom="#000000b3" />
        <text fontFamily={boldFont} fontSize={28} x={36} y={1025} color="#ffffff">
          {counter()}
        </text>
        <text fontFamily={hintFont} fontSize={20} x={1884} y={1029} mountX={1} color="#ffffff80">
          {hint}
        </text>
      </view>
    </view>
  )
}
