import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Keyboard from '../Keyboard.jsx'
import { OverNav } from '../../layers.jsx'
import { usesNativeKeyboard, openNativeInput } from '../account/nativeInput.js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth } from './look.js'
import { issueScope, statusChip, threadComments } from './RequestsModels.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { ISSUE_STATUS, getIssueStatusInfo, getIssueTypeLabel } from '../../../utils/seerrStatus.js'
import { issueActions } from '../../../pages/Seerr/requestActions.js'

// An issue's report and replies over the requests screen, with a comment field and Send, Resolve
// or Reopen, and Delete Issue, which wants a second press. Focus stays inside: Close, then the
// field and Send, then the action buttons. Back closes it. The holder hears onThreadClose() and
// onThreadChanged(issue), with { id, deleted: true } once it's gone. Props: issue, canManage
// (Seerr's manage issues permission), me (the viewer's id).
// The comment field opens the on-screen keyboard, or the TV's own keyboard when Keyboard Style is
// Native. The thread covers the nav, focuses itself as it mounts, and its node has setFocus().
// The dialog is 1100 wide at x 410, its content 43 in (a 1px border and 42 of padding), 1014 wide.
const THIN = { width: 1, color: hex('#ffffffff') }
const EDGE = { width: 1, color: hex('#ffffff24') }

export default function SeerrIssueThread(props) {
  const [current, setCurrent] = createSignal(null)
  const [comment, setComment] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [armed, setArmed] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [zone, setZone] = createSignal('close')
  const metaFont = uiFont()
  const btnFont = uiFont()
  const boldFont = uiFont('bold')
  const inputFont = uiFont()
  const closeLabel = $L('Close')
  const sendLabel = $L('Send')
  const placeholder = $L('Add a comment')
  let root
  let kb
  let alive = true
  onCleanup(() => (alive = false))

  const model = createMemo(() => {
    const issue = current() || props.issue || {}
    const acts = issueActions(issue, { canManageIssues: props.canManage, me: props.me })
    const info = getIssueStatusInfo(issue)
    const title = (issue.media && (issue.media.title || issue.media.name)) || $L('Issue')
    const scope = issueScope(issue)
    const chip = statusChip(info.label, info.color)
    const metas = [getIssueTypeLabel(issue.issueType)]
    if (scope) metas.push(scope)
    if (issue.createdBy && issue.createdBy.displayName) metas.push($L('Reported by {name}').replace('{name}', issue.createdBy.displayName))
    let mx = chip.w + 16
    const meta = metas.map((text, i) => {
      const at = mx
      mx += textWidth(text, 20) + 16
      return { k: `m${i}`, text, x: at, font: fontFor(text) }
    })
    const comments = threadComments(issue)
    const last = comments[comments.length - 1]
    // The list takes what's left of 84% of the screen and keeps its first 120px either way.
    const fixed = 36 + 86 + 24 + (acts.canAct ? 22 + 54 : 0) + (acts.canAct || acts.canDelete ? 22 + 58 : 0) + 36 + 2
    const listH = Math.max(120, Math.min(last ? last.y + last.h : 0, Math.floor(1080 * 0.84) - fixed))
    const h = fixed + listH
    const composeY = 1 + 36 + 86 + 24 + listH + 22
    const open = issue.status === ISSUE_STATUS.OPEN
    const deleteLabel = armed() ? $L('Press again to confirm') : $L('Delete Issue')
    const deleteW = acts.canDelete ? Math.round(textWidth(deleteLabel, 21, 'bold') + 62) : 0
    const sendW = Math.round(textWidth(sendLabel, 20, 'bold') + 62)
    return {
      title,
      titleFont: fontFor(title, 'bold'),
      chip,
      meta,
      comments,
      listH,
      h,
      top: Math.round((1080 - h) / 2),
      canAct: acts.canAct,
      canDelete: acts.canDelete,
      composeY,
      actionsY: acts.canAct ? composeY + 54 + 22 : composeY,
      sendW,
      inputW: 1014 - sendW - 14,
      toggleLabel: open ? $L('Resolve') : $L('Reopen'),
      toggleInk: open ? '#22c55eff' : '#eab308ff',
      toggleFill: open ? '#22c55e29' : '#eab30829',
      toggleW: acts.canAct ? (acts.canDelete ? 1014 - 14 - deleteW : 1014) : 0,
      deleteLabel,
      deleteW,
      deleteX: 43 + 1014 - deleteW,
      closeW: Math.round(textWidth(closeLabel, 20) + 54),
    }
  })
  // The ring is drawn where focus is, and nowhere while the keyboard has it.
  const ringAt = () => (editing() ? '' : zone())
  // The field's caret sits after the text while it's focused or typed into, and the placeholder
  // gives way to it.
  const caretOn = () => zone() === 'input' || editing()
  const caretX = () => Math.min(model().inputW - 2, textWidth(comment(), 30))
  const fieldText = () => comment() || (caretOn() ? '' : placeholder)
  const canSend = () => !!comment().trim() && !busy()

  // The list's copy leaves comment authors out, so the full issue is read again.
  const load = async () => {
    const id = props.issue && props.issue.id
    if (!id) return
    const fresh = await seerrApi.getIssue(id).catch(() => null)
    if (alive && fresh && props.issue && props.issue.id === id) setCurrent(fresh)
  }
  const apply = (fresh) => {
    setCurrent(fresh)
    if (props.onThreadChanged) props.onThreadChanged(fresh)
  }
  const close = () => props.onThreadClose && props.onThreadClose()
  const stops = () => {
    const out = [['close']]
    if (model().canAct) out.push(['input', 'send'])
    const acts = []
    if (model().canAct) acts.push('toggle')
    if (model().canDelete) acts.push('delete')
    if (acts.length) out.push(acts)
    return out
  }
  const go = (z) => {
    if (zone() === 'delete' && z !== 'delete') setArmed(false)
    setZone(z)
  }
  // Up and Down keep to the side of the dialog focus is on: Close sits over Send and Delete, the
  // field over Resolve.
  const step = (dir) => {
    const rows = stops()
    const r = rows.findIndex((row) => row.indexOf(zone()) !== -1)
    const right = zone() === 'close' || zone() === 'send' || zone() === 'delete'
    const next = rows[r + dir]
    if (!next) return
    go(right ? next[next.length - 1] : next[0])
  }
  const toggleStatus = async () => {
    const issue = current() || props.issue
    if (busy() || !issue) return
    const open = issue.status === ISSUE_STATUS.OPEN
    setBusy(true)
    try {
      const fresh = await seerrApi.setIssueStatus(issue.id, open ? 'resolved' : 'open')
      if (alive) apply(fresh || { ...issue, status: open ? ISSUE_STATUS.RESOLVED : ISSUE_STATUS.OPEN })
    } catch (e) {
      console.warn('[SeerrIssueThread] Status change failed:', e && e.message)
    } finally {
      if (alive) setBusy(false)
    }
  }
  const remove = async () => {
    const issue = current() || props.issue
    if (busy() || !issue) return
    if (!armed()) return setArmed(true)
    setBusy(true)
    try {
      await seerrApi.deleteIssue(issue.id)
      if (props.onThreadChanged) props.onThreadChanged({ id: issue.id, deleted: true })
      close()
    } catch (e) {
      console.warn('[SeerrIssueThread] Delete failed:', e && e.message)
      if (!alive) return
      setBusy(false)
      setArmed(false)
    }
  }
  const send = async () => {
    const message = comment().trim()
    const issue = current() || props.issue
    if (!message || busy() || !issue) return
    setBusy(true)
    try {
      await seerrApi.commentOnIssue(issue.id, message)
      const fresh = await seerrApi.getIssue(issue.id)
      if (!alive) return
      setComment('')
      if (fresh) apply(fresh)
    } catch (e) {
      console.warn('[SeerrIssueThread] Comment failed:', e && e.message)
    } finally {
      if (alive) setBusy(false)
    }
  }
  const closeKeyboard = () => {
    setEditing(false)
    if (root) root.setFocus()
  }
  // The TV's own keyboard over the comment field.
  const openNative = () => {
    setEditing(true)
    const opened = openNativeInput({
      value: comment(),
      rect: { x: 410 + 43, y: model().top + model().composeY, w: model().inputW, h: 54 },
      onChange: (text) => setComment(text),
      onClose: () => closeKeyboard(),
    })
    if (!opened) closeKeyboard()
  }
  const openKeyboard = () => {
    if (busy()) return
    setEditing(true)
    if (usesNativeKeyboard()) return openNative()
    kb.open({ value: comment(), purpose: 'text' })
    kb.setFocus()
  }
  const row = () => stops().find((r) => r.indexOf(zone()) !== -1) || []

  onMount(() => {
    load()
    if (root) root.setFocus()
  })

  const m = model
  return (
    <OverNav>
      <view
        ref={(n) => {
          root = n
          if (props.ref) props.ref(n)
        }}
        width={1920}
        height={1080}
        onUp={() => {
          if (editing()) closeKeyboard()
          else step(-1)
          return true
        }}
        onDown={() => {
          if (!editing()) step(1)
          return true
        }}
        onLeft={() => {
          if (editing()) return true
          const i = row().indexOf(zone())
          if (i > 0) go(row()[i - 1])
          return true
        }}
        onRight={() => {
          if (editing()) return true
          const i = row().indexOf(zone())
          if (i < row().length - 1) go(row()[i + 1])
          return true
        }}
        onEnter={() => {
          const z = zone()
          if (z === 'close') close()
          else if (z === 'input') openKeyboard()
          else if (z === 'send') send()
          else if (z === 'toggle') toggleStatus()
          else if (z === 'delete') remove()
          return true
        }}
        onBack={() => {
          if (editing()) closeKeyboard()
          else close()
          return true
        }}
      >
        <view width={1920} height={1080} color="#000000bf" />
        <view x={410} y={m().top} width={1100} height={m().h} borderRadius={14} color="#181818ff" border={EDGE}>
          <view x={43} y={37} width={1014} height={86}>
            <text y={3.5} fontFamily={m().titleFont} fontSize={38} lineHeight={33} maxWidth={910} maxLines={1} color="#ffffffff">
              {m().title}
            </text>
            <view y={43} width={m().chip.w} height={43} borderRadius={6} color={m().chip.fill} border={{ width: 1, color: hex(m().chip.border) }}>
              <text x={13} y={6.5} fontFamily={m().chip.font} fontSize={18} letterSpacing={0.4} lineHeight={33} color={m().chip.ink}>
                {m().chip.text}
              </text>
            </view>
            <view>
              <For each={m().meta}>
                {(mt) => (
                  <text x={mt.x} y={50} fontFamily={mt.font} fontSize={20} lineHeight={33} color="#ffffff99">
                    {mt.text}
                  </text>
                )}
              </For>
            </view>
            <view x={1014 - m().closeW} width={m().closeW} height={50} borderRadius={10} color="#ffffff14">
              <view width={m().closeW} height={50} borderRadius={10} color="#00000000" border={THIN} alpha={ringAt() === 'close' ? 1 : 0} />
              <text x={27} y={17} fontFamily={btnFont} fontSize={20} lineHeight={1} color="#ffffffff">
                {closeLabel}
              </text>
            </view>
          </view>
          <view x={43} y={147} width={1014} height={m().listH} clipping>
            <For each={m().comments}>
              {(c) => (
                <view y={c.y} width={1014} height={c.h}>
                  <view width={1014} height={c.h} borderRadius={8} color={c.first ? '#ffffff0f' : '#ffffff0a'} />
                  <Show when={c.first}>
                    <view width={5} height={c.h} borderRadius={[8, 0, 0, 8]} color="#00a4dcff" />
                  </Show>
                  <text x={c.textX} y={18} fontFamily={c.authorFont} fontSize={20} lineHeight={33} color="#ffffffff">
                    {c.author}
                  </text>
                  <text x={c.dateX} y={17.5} fontFamily={metaFont} fontSize={17} lineHeight={33} color="#ffffff73">
                    {c.date}
                  </text>
                  <text x={c.textX} y={58} fontFamily={c.bodyFont} fontSize={21} lineHeight={29.4} maxWidth={c.bodyW} color="#ffffffbf">
                    {c.body}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view>
            <Show when={m().canAct}>
              <view x={43} y={m().composeY} width={1014} height={54}>
                <text y={13.5} fontFamily={inputFont} fontSize={30} lineHeight={33} maxWidth={m().inputW} maxLines={1} color={comment() ? '#e6e6e6ff' : '#e6e6e673'}>
                  {fieldText()}
                </text>
                <view y={10.5} x={caretX()} width={2} height={33} color="#00a4dcff" alpha={caretOn() ? 1 : 0} />
                <view x={1014 - m().sendW} width={m().sendW} height={54} borderRadius={10} color={canSend() ? '#00a4dcff' : '#00a4dc73'}>
                  <view width={m().sendW} height={54} borderRadius={10} color="#00000000" border={THIN} alpha={ringAt() === 'send' ? 1 : 0} />
                  <text x={31} y={19} fontFamily={boldFont} fontSize={20} lineHeight={1} color={canSend() ? '#ffffffff' : '#ffffff73'}>
                    {sendLabel}
                  </text>
                </view>
              </view>
            </Show>
          </view>
          <view>
            <Show when={m().canAct}>
              <view x={43} y={m().actionsY} width={m().toggleW} height={58} borderRadius={10} color={m().toggleFill} alpha={busy() ? 0.45 : 1}>
                <view width={m().toggleW} height={58} borderRadius={10} color="#00000000" border={THIN} alpha={ringAt() === 'toggle' ? 1 : 0} />
                <text x={m().toggleW / 2} y={20.25} mountX={0.5} fontFamily={boldFont} fontSize={21} lineHeight={1} color={m().toggleInk}>
                  {m().toggleLabel}
                </text>
              </view>
            </Show>
          </view>
          <view>
            <Show when={m().canDelete}>
              <view x={m().deleteX} y={m().actionsY} width={m().deleteW} height={58} borderRadius={10} color="#ef444424" alpha={busy() ? 0.45 : 1}>
                <view width={m().deleteW} height={58} borderRadius={10} color="#00000000" border={THIN} alpha={ringAt() === 'delete' ? 1 : 0} />
                <text x={31} y={20.25} fontFamily={boldFont} fontSize={21} lineHeight={1} color="#ef4444ff">
                  {m().deleteLabel}
                </text>
              </view>
            </Show>
          </view>
        </view>
        <Keyboard
          overlay
          ref={(n) => (kb = n)}
          onKeyboardChange={(text) => setComment(text)}
          onKeyboardClose={() => closeKeyboard()}
          onKeyboardNative={() => openNative()}
        />
      </view>
    </OverNav>
  )
}
