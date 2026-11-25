import { createMemo, createSignal, onMount } from 'solid-js'
import LivePreview from '../../settings/LivePreview.jsx'
import { describeRow, sceneOfRow } from '../../../../pages/Settings/previewRows.js'
import { rowOptionsBlockedReason } from '../../../../pages/Settings/rowOptionsBlocked.js'
import { seerrState } from '../../../../state/seerr.js'
import * as settings from '../../../../state/settings.js'
import { getStore } from '../../../../state/store.js'
import { theme } from '../../../theme.js'

// /lab/previews draws the settings live preview where Settings puts it (828.1, 156.89, 883 tall) on
// Settings' background, wired the way Settings wires it, so each scene can be shot on its own.
// window.__labPreview has focus(sid), the row the list's focus is on, tryIt(key, value, index), a
// picker's focused choice (or tryIt() to stop), and scene(id).
const VIDEO_TYPES = ['movies', 'tvshows', 'music', 'books', 'audiobooks']

export default function PreviewsLab(props) {
  const store = getStore()
  store.navVisible = false
  const [sid, setSid] = createSignal(props.sid || null)
  const [trying, setTrying] = createSignal(null)
  const [scene, setScene] = createSignal(props.scene || 'home')
  const described = createMemo(() => {
    if (!sid()) return null
    const s = settings.all()
    const row = describeRow(sid(), s, {})
    if (!row) return null
    const tr = trying()
    const tried = tr && tr.key === row.key ? { ...s, [row.key]: tr.value } : s
    const blocked = row.key ? rowOptionsBlockedReason(row.key, tried, false) : null
    return blocked ? { ...row, blocked } : row
  })
  const tryingHere = () => !!(trying() && described() && trying().key === described().key)
  const tried = () => (tryingHere() ? { [trying().key]: trying().value } : null)
  const live = () => (tryingHere() ? trying().index : described() ? described().saved : -1)
  const scenes = createMemo(() => {
    const list = ['home', 'details', 'player', 'search']
    const seerr = seerrState()
    if (seerr && seerr.pluginInfo && seerr.pluginInfo.calendarAvailable === true) list.push('calendar')
    if ((store.libraries || []).some((lib) => VIDEO_TYPES.indexOf(String(lib.CollectionType || '').toLowerCase()) >= 0)) list.push('library')
    return list
  })
  let node
  onMount(() => {
    window.__labNode = node
    window.__labPreview = {
      focus: (id) => {
        setSid(id)
        const next = sceneOfRow(describeRow(id, settings.all(), {}))
        if (next) setScene(next)
      },
      tryIt: (key, value, index) => setTrying(key ? { key, value, index: index || 0 } : null),
      scene: setScene,
      chips: () => node && node.setFocus(),
    }
    if (props.sid) window.__labPreview.focus(props.sid)
  })
  return (
    <view width={1920} height={1080} color="#101010ff">
      <LivePreview
        ref={(n) => (node = n)}
        x={828.1}
        y={156.89}
        scenes={scenes()}
        scene={scene()}
        row={described()}
        live={live()}
        tryingHere={tryingHere()}
        tried={tried()}
        accent={theme().accent}
        colH={883}
        onPickScene={setScene}
        onLeaveChips={() => (window.__labEvent = 'leave')}
        onChipsUp={() => (window.__labEvent = 'up')}
      />
    </view>
  )
}
