// The Watch Party and SyncPlay dialogs laid out in pixels, one builder per view. Each draws the model the page builds
// into a sheet (sheet.js) in dialog coordinates, with the body starting at the top of the content box.
import $L from '../../services/i18n.js'
import { titleWithYear, isRoomPlaying } from '../../services/siloWatchParty.js'
import { statusColor } from '../../ui/components/party/feed.js'
import {
  ACCENT, LINE, INK, rgba, white, ink, normal, createSheet, button, btnWidth, BTN_H, controlButton, CONTROL_H, CONTROL_EDGE,
  actionButton, input, INPUT_H, closeButton, avatar, banner, sectionTitle,
} from './sheet.js'
import { flowText } from '../../ui/components/party/sheetMath.js'
import { memberName, memberStatus, partyTitle, itemTitle, voteCount, stateLabel, memberCount, roomMeta } from './partyText.js'

const PAD = 28
const TOP = 20

const roomDotColor = (room) => {
  if (room.kind === 'syncplay' || room.playbackState === 'paused') return '#c8c8c8'
  return room.phase === 'playing' ? '#3ecf8e' : '#f5b942'
}

// Returns its height plus the 12px margin under it.
const hint = (s, k, x, y, w, text) => s.para(k, x, y, text, { size: 18, w, color: ink(0.7) }) + 12

// A pill 32px tall plus its 1px border, with 14px padding at each side. Returns its width.
const chip = (s, k, x, y, label, party, lock) => {
  const tw = s.width(label, 17, 500)
  const w = 28 + 2 + (lock ? 23 : 0) + tw
  const ink = party ? '#8fdcf7' : '#e6e6e6'
  s.box(`${k}:bg`, x, y, w, 34, party ? '#0b3a4c' : '#2e2e2e', 17)
  s.ring(`${k}:ring`, x, y, w, 34, party ? '#1d6f8f' : '#6a6a6a', 1, 17)
  if (lock) s.box(`${k}:icon`, x + 15, y + 8.5, 17, 17, ink, 0, 1, 'party/lock.webp')
  s.text(`${k}:t`, x + 15 + (lock ? 23 : 0), y + 0.5, label, { size: 17, weight: 500, color: ink, lh: LINE })
  return w
}

const nowPlaying = (s, x, y, w, heading, title, primary, secondary, meta, note) => {
  let h = sectionTitle(s, 'np:head', x, y, heading)
  s.box('np:bg', x, y + h, w, 59, rgba(0, 164, 220, 0.1), 10)
  s.ring('np:ring', x, y + h, w, 59, rgba(0, 164, 220, 0.2), 1, 10)
  const metaW = meta ? s.width(meta, 16) : 0
  s.text('np:t', x + 17, y + h + 13, title, { size: 20, weight: 500, mw: w - 34 - 12 - metaW, lh: LINE })
  if (meta) s.text('np:meta', x + w - 17 - metaW, y + h + 13, meta, { size: 16, color: white(0.5), lh: LINE })
  h += 59
  ;[primary, secondary].forEach((b) => {
    if (!b) return
    h += 12
    h += button(s, b.id, x, y + h, w, b.label, b.kind || 'create', b.disabled)
  })
  if (note) h += hint(s, 'np:note', x, y + h, w, note)
  h += 16
  s.box('np:line', x, y + h, w, 1, white(0.08))
  return h + 1
}

// The title, with its muted vote count, takes an equal share of the row like each button.
const voteRow = (s, k, x, y, w, runs, buttons) => {
  const n = buttons.length
  const share = (w - n * 10 - n * CONTROL_EDGE) / (n + 1)
  const lines = flowText(runs, share, (word, style) => s.width(word, 20))
  const textH = lines.length * LINE
  const inner = Math.max(textH, CONTROL_H)
  const top = y + 6
  lines.forEach((line, i) => line.forEach((seg, j) => {
    s.text(`${k}:t${i}.${j}`, x + seg.x, top + (inner - textH) / 2 + i * LINE, seg.text, { size: 20, color: seg.style ? ink(0.6) : INK, lh: LINE })
  }))
  let bx = x + share + 10
  buttons.forEach((b) => {
    controlButton(s, b.id, bx, top + (inner - CONTROL_H) / 2, share + CONTROL_EDGE, b.label, b.active)
    bx += share + CONTROL_EDGE + 10
  })
  return inner + 12
}

const votePanel = (s, x, y, w, m) => {
  const room = m.room
  let h = hint(s, 'vote:hint', x, y, w, room.isHost
    ? $L('Add movies for everyone to vote on, then play the one you want. TV episodes are still your pick.')
    : $L('Vote for what you want to watch. The host plays one.'))
  if (room.isHost) {
    h += input(s, 'search', x, y + h, w, m.search, $L('Search movies')) + 20
    m.results.forEach((movie) => {
      h += voteRow(s, `res:${movie.Id}`, x, y + h, w, [{ text: titleWithYear(movie.Name, movie.ProductionYear), style: 0 }],
        [{ id: `a:${movie.Id}`, label: $L('Add') }])
    })
  }
  if (!m.suggestions.length) {
    s.text('vote:empty', x + w / 2, y + h + 32, $L('No movies to vote on yet.'), { size: 20, color: white(0.4), lh: LINE, mx: 0.5 })
    return h + 97
  }
  m.suggestions.forEach((sg) => {
    const buttons = [{ id: `v:${sg.id}`, label: sg.votedByMe ? $L('Voted') : $L('Vote'), active: sg.votedByMe }]
    if (room.isHost) buttons.push({ id: `p:${sg.id}`, label: $L('Select') }, { id: `x:${sg.id}`, label: $L('Remove') })
    h += voteRow(s, `sg:${sg.id}`, x, y + h, w, [
      { text: titleWithYear(sg.title, sg.subtitle), style: 0 },
      { text: ` · ${voteCount(sg.voteCount)}`, style: 1 },
    ], buttons)
  })
  return h
}

const MEMBER_H = 22 + normal(23) + 2 + normal(18)
const member = (s, x, y, w, m, url) => {
  const id = m.isSelf ? 'self' : `m:${m.profileId}`
  const f = s.is(id)
  const a = m.connected ? 1 : 0.6
  const inner = MEMBER_H - 22
  // An away member dims the whole row, its focus ring and avatar too.
  s.box(`${id}:bg`, x, y, w, MEMBER_H, f ? white(0.08) : '#00000000', 14, a)
  s.ring(`${id}:ring`, x, y, w, MEMBER_H, '#ffffff', 3, 14, f ? a : 0)
  const size = m.isHost ? 50 : 44
  const ay = y + 11 + (inner - size) / 2
  if (m.isHost) s.ring(`${id}:host`, x + 19, ay, 50, 50, '#f5b942', 3, 25, a)
  avatar(s, `${id}:av`, x + 19 + (m.isHost ? 3 : 0), ay + (m.isHost ? 3 : 0), 44, m.displayName, url, 18, a)
  const tx = x + 19 + size + 18
  s.text(`${id}:name`, tx, y + 11, memberName(m), { size: 23, weight: 500, color: INK, mw: x + w - 19 - tx, a })
  const sy = y + 11 + normal(23) + 2
  // The label starts right at the dot, with no gap.
  s.box(`${id}:dot`, tx, sy + (normal(18) - 11) / 2, 11, 11, statusColor(m), 5.5, a)
  s.text(`${id}:status`, tx + 11, sy, memberStatus(m, true), { size: 18, color: '#a8a8a8', a })
  s.focusable(id, x, y, w, MEMBER_H)
  return MEMBER_H
}

const setting = (s, id, x, y, w, label, right) => {
  const f = s.is(id)
  s.box(`${id}:bg`, x, y, w, 70, '#222222', 14)
  s.ring(`${id}:ring`, x, y, w, 70, '#ffffff', 3, 14, f ? 1 : 0)
  const valueW = right.value != null ? s.width(right.value, 21, 500) : 62
  s.text(`${id}:t`, x + 21, y + (70 - normal(22)) / 2, label, { size: 22, weight: 500, mw: w - 21 - valueW - 21 - 12 })
  if (right.value != null) {
    const vw = s.width(right.value, 21, 500)
    s.text(`${id}:v`, x + w - 21 - vw, y + (70 - normal(21)) / 2, right.value, { size: 21, weight: 500, color: '#a8a8a8' })
  } else {
    const on = right.on
    s.box(`${id}:track`, x + w - 21 - 62, y + 17, 62, 36, on ? ACCENT : '#3d3d3d', 18)
    s.box(`${id}:knob`, x + w - 21 - 62 + (on ? 31 : 5), y + 22, 26, 26, on ? '#ffffff' : '#b8b8b8', 13)
  }
  s.focusable(id, x, y, w, 70)
  return 70
}

// The lobby's side column, also used by the player's party panel: the people, the host's room settings, and Leave.
export const partyPeople = (s, x, y, w, m) => {
  const room = m.room
  let h = 18
  const section = (k, text) => {
    s.text(k, x, y + h, text, { size: 20, weight: 500, color: '#33b7e4', lh: LINE })
    h += LINE + 8
  }
  section('people:head', $L('People · {count}').replace('{count}', String(room.members.length)))
  room.members.forEach((mem) => {
    const open = m.picked === mem.profileId && room.isHost && !mem.isSelf
    // Always there and only faded in, since a box the list adds later would draw over the row's avatar.
    s.box(`open:${mem.profileId}`, x, y + h, w, MEMBER_H + 58 + 12, '#262626', 14, open ? 1 : 0)
    h += member(s, x, y + h, w, mem, m.avatarFor(mem.profileId))
    if (!open) return
    const promoteW = 54 + s.width($L('Make host'), 21, 500)
    actionButton(s, 'promote', x + 78, y + h, promoteW, $L('Make host'))
    actionButton(s, 'remove', x + 78 + promoteW + 12, y + h, 54 + s.width($L('Remove'), 21, 500), $L('Remove'))
    h += 58 + 12
  })
  if (room.isHost) {
    h += 18
    section('settings:head', $L('Room settings'))
    if (m.everyoneAllowed) h += setting(s, 'everyone', x, y + h, w, $L('Everyone can control playback'), { on: room.everyoneControls })
    if (m.roomPin == null) {
      h += setting(s, 'pinRow', x, y + h, w, $L('Room PIN'), { value: room.hasPin ? $L('On') : $L('Off') })
    } else {
      // The PIN input's border adds to its 70px, and its 33px line sits at the top.
      const f = s.is('roomPin')
      s.box('roomPin:bg', x, y + h, w, 76, '#222222', 14)
      s.ring('roomPin:ring', x, y + h, w, 76, '#ffffff', 3, 14, f ? 1 : 0)
      s.text('roomPin:t', x + 21, y + h + 3, m.roomPin || $L('Room PIN, 4 to 8 digits'),
        { size: 22, color: m.roomPin ? '#ffffff' : '#757575', mw: w - 42, lh: LINE })
      s.focusable('roomPin', x, y + h, w, 76)
      h += 76
      if (m.pinBad) {
        s.text('roomPin:bad', x, y + h + 6, $L('Use 4 to 8 digits.'), { size: 18, color: '#ffd6d6', lh: LINE })
        h += 6 + LINE
      }
    }
  }
  h += 24
  if (room.isHost) {
    const half = (w - 12) / 2
    actionButton(s, 'leave', x, y + h, half, $L('Leave'))
    actionButton(s, 'end', x + half + 12, y + h, half, $L('End for everyone'), true)
  } else {
    actionButton(s, 'leave', x, y + h, w, $L('Leave'))
  }
  return h + 58
}

const invite = (s, x, y, m) => {
  let h = 30
  s.text('inv:title', x + 230, y + h, $L('Send the invite'), { size: 24, weight: 500, color: INK, lh: LINE, mx: 0.5 })
  h += LINE + 18
  if (m.qr) {
    s.box('inv:qrbg', x + 95, y + h, 270, 270, '#ffffff', 12)
    s.pic('inv:qr', x + 95, y + h, 270, 270, [m.qr], 12)
    h += 270 + 18
  }
  h += s.para('inv:hint', x + 30, y + h, $L('Scan with your phone to get the invite link, then send it from there. Or just share the code.'),
    { size: 19, w: 400, lh: 19 * 1.45, color: ink(0.7), align: 'center' }) + 18
  s.text('inv:code', x + 230, y + h, m.code, { size: 44, weight: 700, color: INK, ls: 6, lh: LINE, mx: 0.5 })
  h += LINE + 30
  s.box('inv:bg', x, y, 460, h, white(0.06), 20)
  return h
}

const buildLobby = (s, m) => {
  const room = m.room
  const playing = isRoomPlaying(room)
  const left = invite(s, PAD, TOP, m)
  const mx = PAD + 460 + 40
  const mw = 584
  let y = TOP
  const title = room.selectedContentId
    ? itemTitle(m.item) || partyTitle(room)
    : room.isHost ? $L('Open a title and choose Watch with group to pick what everyone watches.') : $L('Waiting for the host to pick something.')
  y += nowPlaying(s, mx, y, mw, playing ? $L('Playing') : $L('Up next'), title, m.primary)
  if (room.isHost && !playing) {
    y += 16 + controlButton(s, 'voting', mx, y + 16, mw, `${$L('Let everyone vote on movies')}: ${room.isVoting ? $L('On') : $L('Off')}`, room.isVoting)
  }
  if (room.isVoting) y += 16 + votePanel(s, mx, y + 16, mw, m)
  y += 16 + hint(s, 'lobby:hint', mx, y + 16, mw, $L("Play waits for everyone's player, 10 seconds at most, then counts down 3, 2, 1."))
  const side = partyPeople(s, mx + mw + 40, TOP, 460, m)
  return Math.max(left, y - TOP, side)
}

const tile = (s, x, y, r, labels) => {
  const id = `r:${r.kind}:${r.roomId}`
  const f = s.is(id)
  s.box(`${id}:bg`, x, y, 492, 376, f ? white(0.08) : '#00000000', 18)
  s.ring(`${id}:ring`, x, y, 492, 376, '#ffffff', 3, 18, f ? 1 : 0)
  s.box(`${id}:art`, x + 11, y + 11, 470, 270, '#222222', 14)
  if (r.art.length) s.pic(`${id}:img`, x + 11, y + 11, 470, 270, r.art, 14)
  let cx = x + 25
  s.over = true
  if (labels) cx += chip(s, `${id}:kind`, cx, y + 25, r.kind === 'syncplay' ? $L('SyncPlay') : $L('Watch Party'), r.kind !== 'syncplay') + 8
  if (r.hasPin) chip(s, `${id}:pin`, cx, y + 25, $L('PIN'), false, true)
  s.over = false
  const ty = y + 11 + 270 + 12
  s.text(`${id}:title`, x + 11, ty, r.kind === 'syncplay' ? r.hostName : partyTitle(r) || $L('Nothing picked yet'), { size: 25, weight: 500, color: INK, mw: 470, lh: LINE })
  const my = ty + LINE + 6
  s.box(`${id}:dot`, x + 11, my + 11, 11, 11, roomDotColor(r), 5.5)
  s.text(`${id}:meta`, x + 22, my, roomMeta(r), { size: 19, color: '#bdbdbd', lh: LINE })
  s.focusable(id, x, y, 492, 376)
}

// Shown when Moonbase can't host, or has parties turned off.
const needs = (s, x, y, w, title, text) => {
  let h = 24
  s.text('needs:title', x + 24, y + h, title, { size: 24, weight: 500, color: INK, lh: LINE })
  h += LINE + 10
  if (text) h += hint(s, 'needs:hint', x + 24, y + h, w - 48, text)
  h += 24
  s.box('needs:bg', x, y, w, h, '#1e1e1e', 16)
  return h
}

const buildRooms = (s, m) => {
  if (m.supported === false && m.turnedOff) return needs(s, PAD, TOP, 1584, m.turnedOffText)
  if (m.supported === false && !m.jellyfin) {
    return needs(s, PAD, TOP, 1584, $L('Watch Parties need Moonbase on this server'),
      $L('Ask whoever runs the server to install the Moonbase plugin. On Jellyfin, SyncPlay still works without it.'))
  }
  let y = TOP
  if (m.ended) y += banner(s, 'ended', PAD, y, 460, m.ended) + 12 + 16
  const f = s.is('start')
  const disabled = m.busy || m.supported === null
  const a = disabled ? 0.5 : 1
  s.box('start:bg', PAD, y, 460, 92, f ? '#ffffff' : white(0.1), 18, a)
  s.box('start:icon', PAD + 31, y + 29, 34, 34, ACCENT, 0, a, 'party/plus.webp')
  s.text('start:t', PAD + 83, y + (92 - normal(25)) / 2, $L('Start a watch party'), { size: 25, weight: 500, color: f ? '#101010' : '#ffffff', a })
  s.focusable('start', PAD, y, 460, 92)
  y += 92 + 16
  y += input(s, 'code', PAD, y, 460, m.code, $L('Join with a code'))
  if (m.code.trim()) y += 16 + button(s, 'join', PAD, y + 16, 460, $L('Join'), 'create', m.busy)
  y += 16 + hint(s, 'rooms:hint', PAD, y + 16, 460, $L('Parties you can watch show up here. Got a code from someone? Pick Join with a code.'))
  const tx = PAD + 460 + 56
  let ty = TOP
  if (m.rooms.length) {
    s.text('rooms:count', tx, ty, $L('{count} on this server').replace('{count}', String(m.rooms.length)), { size: 21, color: ink(0.65), lh: LINE })
    ty += LINE + 14
  }
  m.rooms.forEach((r, i) => tile(s, tx + (i % 2) * 518, ty + Math.floor(i / 2) * 402, r, m.jellyfin))
  const rows = Math.ceil(m.rooms.length / 2)
  if (rows) ty += rows * 402 - 26
  return Math.max(y - TOP, ty - TOP)
}

const buildPin = (s, m) => {
  let y = TOP
  s.text('pin:title', PAD, y, m.heading, { size: 24, weight: 500, color: INK, lh: LINE })
  y += LINE + 10 + 16
  if (m.wrong) {
    s.box('pin:err', PAD, y, 620, 59, '#2a1d1d', 12)
    s.ring('pin:errring', PAD, y, 620, 59, '#4a2c2c', 1, 12)
    s.box('pin:lock', PAD + 19, y + 1 + 12 + 8, 17, 17, '#ffd6d6', 0, 1, 'party/lock.webp')
    s.text('pin:errt', PAD + 42, y + 13, m.wrong, { size: 20, color: '#ffd6d6', lh: LINE })
    y += 59 + 16
  }
  y += input(s, 'pin', PAD, y, 620, m.pin, $L('PIN')) + 16
  const joinW = btnWidth(s, $L('Join'))
  button(s, 'pinJoin', PAD, y + 6, joinW, $L('Join'), 'create', m.busy || m.pin.length < 4)
  button(s, 'pinCancel', PAD + joinW + 10, y + 6, btnWidth(s, $L('Cancel')), $L('Cancel'), 'plain')
  return y + 6 + BTN_H + 6 - TOP
}

// Silo's dialog is 480px wide.
const SILO_W = 424
const buildSiloNone = (s, m) => {
  if (m.supported === false) {
    s.text('empty', PAD + SILO_W / 2, TOP + 32, $L("This server doesn't offer Watch Party."), { size: 20, color: white(0.4), lh: LINE, mx: 0.5 })
    return 97
  }
  let y = TOP
  if (m.ended) y += banner(s, 'ended', PAD, y, SILO_W, m.ended) + 12
  y += hint(s, 'silo:hint', PAD, y, SILO_W, $L('Open a title and choose Watch with group to pick what everyone watches.'))
  y += button(s, 'start', PAD, y, btnWidth(s, $L('Start a Watch Party')), $L('Start a Watch Party'), 'create', m.busy || m.supported !== true)
  y += 20
  // The divider's lines meet the word with no gap.
  const jw = s.width($L('Join'), 18)
  s.box('div:l', PAD, y + 16, (SILO_W - jw) / 2, 1, white(0.1))
  s.text('div:t', PAD + SILO_W / 2, y, $L('Join'), { size: 18, color: white(0.35), lh: LINE, mx: 0.5 })
  s.box('div:r', PAD + (SILO_W + jw) / 2, y + 16, (SILO_W - jw) / 2, 1, white(0.1))
  y += LINE + 20
  const bw = btnWidth(s, $L('Join'))
  input(s, 'code', PAD, y, SILO_W - 10 - bw, m.code, $L('Room code or invite link'))
  button(s, 'join', PAD + SILO_W - bw, y, bw, $L('Join'), 'create', !m.code.trim() || m.busy, INPUT_H)
  return y + INPUT_H + 20 - TOP
}

const buildSiloRoom = (s, m) => {
  const room = m.room
  const playing = isRoomPlaying(room)
  let y = TOP
  // The code beside the state badge, whose 33px line and 6px padding make the row 45 tall.
  s.text('code', PAD, y + 6, room.code, { size: 36, weight: 700, ls: 4, lh: LINE })
  const badge = String(m.status).toUpperCase()
  const bw = 28 + s.width(badge, 16, 500, 0.5)
  s.box('badge', PAD + SILO_W - bw, y, bw, 45, playing ? rgba(0, 200, 83, 0.2) : white(0.1), 16)
  s.text('badge:t', PAD + SILO_W - bw + 14, y + 6, badge, { size: 16, weight: 500, ls: 0.5, lh: LINE, color: playing ? '#00c853' : white(0.6) })
  y += 45 + 20
  y += hint(s, 'silo:hint', PAD, y, SILO_W, $L('Others join with this code from their Watch Party screen.')) + 20
  const title = room.selectedContentId
    ? itemTitle(m.item)
    : room.isHost ? $L('Open a title and choose Watch with group to pick what everyone watches.') : $L('Waiting for the host to pick something.')
  y += nowPlaying(s, PAD, y, SILO_W, playing ? $L('Playing') : $L('Up next'), title, m.primary, m.secondary, null, m.resumeNote) + 20
  if (room.isVoting) y += votePanel(s, PAD, y, SILO_W, m) + 20
  const online = room.members.filter((mem) => mem.connected).length
  y += sectionTitle(s, 'members:head', PAD, y, $L('Members ({count})').replace('{count}', String(online)))
  room.members.forEach((mem, i) => {
    const a = mem.connected ? 1 : 0.5
    s.box(`mem:${i}`, PAD, y, SILO_W, 53, white(0.06), 8, a)
    s.box(`mem:${i}:av`, PAD + 16, y + 10.5, 32, 32, white(0.15), 16, a)
    s.text(`mem:${i}:i`, PAD + 32, y + 10.5 + (32 - normal(16)) / 2, (mem.displayName || '?').charAt(0).toUpperCase(), { size: 16, mx: 0.5, a })
    const name = mem.isHost ? `${mem.displayName} ★` : mem.displayName
    s.text(`mem:${i}:n`, PAD + 60, y + 10, name, { size: 20, color: white(0.85), lh: LINE, a })
    if (!mem.connected) s.text(`mem:${i}:off`, PAD + 72 + s.width(name, 20), y + 10, $L('offline'), { size: 20, color: white(0.85), lh: LINE, a: 0.3 })
    y += 53 + 8
  })
  y += 20 - 8
  if (room.isHost) {
    y += sectionTitle(s, 'settings:head', PAD, y, $L('Room settings'))
    const onOff = (on) => (on ? $L('On') : $L('Off'))
    const toggles = [['guests', `${$L('Guests can play and pause')}: ${onOff(room.guestsCanPause)}`, room.guestsCanPause]]
    if (!playing) toggles.push(['voting', `${$L('Let everyone vote on movies')}: ${onOff(room.isVoting)}`, room.isVoting])
    if (m.subtitleLabel != null) toggles.push(['subtitles', `${$L('Subtitles for everyone')}: ${m.subtitleLabel}`, false])
    toggles.forEach(([id, label, on], i) => {
      if (i) y += 10
      y += controlButton(s, id, PAD, y, Math.min(SILO_W, CONTROL_EDGE + s.width(label, 18, 500)), label, on)
    })
    y += 20
  }
  s.box('controls:line', PAD, y, SILO_W, 1, white(0.1))
  y += 1 + 16
  if (room.isHost) y += 12 + button(s, 'end', PAD, y + 12, SILO_W, $L('End Watch Party'), 'leave', m.busy)
  y += 12 + button(s, 'leave', PAD, y + 12, SILO_W, $L('Leave group'), 'leave')
  return y - TOP
}

// Cards have 20px padding inside a 1px line, so their content starts 21px in.
const card = (s, k, x, y, w, h) => {
  s.box(`${k}:bg`, x, y, w, h, white(0.04), 16)
  s.ring(`${k}:ring`, x, y, w, h, white(0.08), 1, 16)
}

const PILL = {
  Idle: ['#bdbdbd', rgba(158, 158, 158, 0.14), rgba(158, 158, 158, 0.45)],
  Waiting: ['#ffb74d', rgba(255, 152, 0, 0.14), rgba(255, 152, 0, 0.45)],
  Paused: ['#b0bec5', rgba(96, 125, 139, 0.14), rgba(96, 125, 139, 0.45)],
  Playing: ['#81c784', rgba(76, 175, 80, 0.14), rgba(76, 175, 80, 0.45)],
}
const PILL_H = 2 + 10 + normal(16)
const pillWidth = (s, state) => 2 + 24 + 15 + s.width(stateLabel(state), 16, 600)
const statePill = (s, k, x, y, state) => {
  const [ink, bg, border] = PILL[state] || PILL.Idle
  const w = pillWidth(s, state)
  s.box(`${k}:bg`, x, y, w, PILL_H, bg, PILL_H / 2)
  s.ring(`${k}:ring`, x, y, w, PILL_H, border, 1, PILL_H / 2)
  s.box(`${k}:dot`, x + 13, y + (PILL_H - 8) / 2, 8, 8, ink, 4)
  s.text(`${k}:t`, x + 28, y + 6, stateLabel(state), { size: 16, weight: 600, color: ink })
}

const SYNC_W = 664
const buildSyncLobby = (s, m) => {
  let y = TOP
  const ch = 1 + 20 + LINE + 4 + LINE + 16 + INPUT_H + 20 + 1
  card(s, 'createCard', PAD, y, SYNC_W, ch)
  s.text('create:title', PAD + 21, y + 21, $L('Create a new group'), { size: 22, weight: 600, lh: LINE })
  s.text('create:hint', PAD + 21, y + 21 + LINE + 4, $L('Watch together with everyone who joins'), { size: 18, color: white(0.6), lh: LINE })
  const iy = y + 21 + LINE + 4 + LINE + 16
  const label = m.creating ? $L('Creating...') : $L('Create')
  const bw = btnWidth(s, label)
  input(s, 'name', PAD + 21, iy, SYNC_W - 42 - 10 - bw, m.name, $L('Group name'))
  const off = !m.name.trim() || m.creating
  button(s, 'create', PAD + SYNC_W - 21 - bw, iy, bw, label, 'create', off, INPUT_H, !off)
  y += ch + 16
  const gy = y
  let h = 21
  const head = m.groups.length ? $L('Available groups · {count}').replace('{count}', String(m.groups.length)) : $L('Available groups')
  h += sectionTitle(s, 'groups:head', PAD + 21, gy + h, head)
  if (!m.groups.length) {
    h += 10 + 4
    s.text('groups:empty', PAD + 25, gy + h, $L('No groups available'), { size: 20, lh: LINE })
    h += LINE + 4
    h += s.para('groups:emptyt', PAD + 25, gy + h, $L('Groups other people create on this server will show up here.'), { size: 18, w: SYNC_W - 50, color: white(0.6) })
    h += 8
  }
  m.groups.forEach((g) => {
    h += 10
    const id = `g:${g.GroupId}`
    const f = s.is(id)
    const names = g.Participants || []
    const info = normal(22) + 4 + normal(18)
    const ch2 = 2 + 28 + Math.max(info, 32, PILL_H, 2 + 12 + normal(18))
    const x = PAD + 21
    const w = SYNC_W - 42
    const top = gy + h
    s.box(`${id}:bg`, x, top, w, ch2, f ? white(0.12) : white(0.06), 12)
    s.ring(`${id}:ring`, x, top, w, ch2, f ? ACCENT : white(0.08), 1, 12)
    s.ring(`${id}:glow`, x - 2, top - 2, w + 4, ch2 + 4, rgba(0, 164, 220, 0.3), 2, 14, f ? 1 : 0)
    let cx = x + 17
    const cy = top + ch2 / 2
    // A picture has no color behind it, so the face it overlaps shows through its clear parts, and only its ring is
    // drawn. Faces after a picture go in the upper layers, so the picture doesn't cover them.
    let lifted = false
    names.slice(0, 3).forEach((name, j) => {
      const av = m.avatarFor(name)
      if (av.url) {
        s.over = true
        s.ring(`${id}:avr${j}`, cx, cy - 18, 36, 36, '#1e1e28', 2, 18)
        s.over = false
        s.pic(`${id}:avp${j}`, cx + 2, cy - 16, 32, 32, [av.url], 16)
        lifted = true
      } else {
        s.over = lifted
        s.box(`${id}:avr${j}`, cx, cy - 18, 36, 36, '#1e1e28', 18)
        s.box(`${id}:avb${j}`, cx + 2, cy - 16, 32, 32, av.color, 16)
        s.over = false
        s.text(`${id}:avt${j}`, cx + 18, cy - normal(16) / 2, (String(name).trim().charAt(0) || '?').toUpperCase(), { size: 16, weight: 700, mx: 0.5 })
      }
      cx += j < Math.min(names.length, 3) - 1 ? 26 : 36
    })
    if (names.length) cx += 12
    const joinW = 2 + 32 + s.width($L('Join'), 18, 600)
    const pillW = pillWidth(s, g.State)
    const right = x + w - 17
    s.box(`${id}:join`, right - joinW, cy - (2 + 12 + normal(18)) / 2, joinW, 2 + 12 + normal(18), rgba(0, 164, 220, 0.1), 12)
    s.ring(`${id}:joinr`, right - joinW, cy - (2 + 12 + normal(18)) / 2, joinW, 2 + 12 + normal(18), rgba(0, 164, 220, 0.5), 1, 12)
    s.text(`${id}:joint`, right - joinW + 17, cy - normal(18) / 2, $L('Join'), { size: 18, weight: 600, color: rgba(0, 164, 220, 0.9) })
    statePill(s, `${id}:pill`, right - joinW - 12 - pillW, cy - PILL_H / 2, g.State)
    const iw = right - joinW - 24 - pillW - cx
    s.text(`${id}:name`, cx, cy - info / 2, g.GroupName || $L('Unnamed Group'), { size: 22, weight: 500, mw: iw })
    s.text(`${id}:meta`, cx, cy - info / 2 + normal(22) + 4, names.length ? names.join(', ') : memberCount(0), { size: 18, color: white(0.5), mw: iw })
    s.focusable(id, x, top, w, ch2)
    h += ch2
  })
  h += 21
  card(s, 'groups', PAD, gy, SYNC_W, h)
  y += h + 16
  s.text('note', PAD + 8, y, $L('Joining a group may replace your current playback queue.'), { size: 16, color: white(0.6), lh: LINE })
  return y + LINE - TOP
}

const buildSyncGroup = (s, m) => {
  const g = m.group
  let y = TOP
  const names = g.Participants || []
  const count = memberCount(names.length)
  const cy0 = y
  let h = 21
  const meta = m.queueLength === 0 ? `${count} · ${$L('nothing queued yet')}` : count
  const pillW = pillWidth(s, g.State)
  s.text('g:title', PAD + 21, cy0 + h, g.GroupName || $L('Group'), { size: 24, weight: 600, lh: LINE })
  s.text('g:meta', PAD + 21, cy0 + h + LINE + 4, meta, { size: 18, color: white(0.5), lh: LINE, mw: SYNC_W - 42 - pillW - 12 })
  statePill(s, 'g:pill', PAD + SYNC_W - 21 - pillW, cy0 + h + (LINE * 2 + 4 - PILL_H) / 2, g.State)
  h += LINE * 2 + 4 + 16
  const chips = names.length ? names : [null]
  let cx = PAD + 21
  let rowTop = cy0 + h
  const chipH = 2 + 8 + 36
  chips.forEach((name, i) => {
    const self = name != null && m.self && String(name).trim().toLowerCase() === m.self
    const label = name == null ? $L('Waiting for members...') : name
    const w = 2 + 4 + 14 + (name == null ? 0 : 36 + 8) + s.width(label, 18) + (self ? 8 + s.width($L('You'), 16) : 0)
    if (cx > PAD + 21 && cx + w > PAD + SYNC_W - 21) {
      cx = PAD + 21
      rowTop += chipH + 10
    }
    s.box(`chip:${i}`, cx, rowTop, w, chipH, white(0.05), chipH / 2)
    s.ring(`chip:${i}:r`, cx, rowTop, w, chipH, white(0.12), 1, chipH / 2)
    let tx = cx + 5
    if (name != null) {
      const av = m.avatarFor(name)
      if (av.url) s.pic(`chip:${i}:pic`, tx, rowTop + 5, 36, 36, [av.url], 18)
      else s.box(`chip:${i}:av`, tx, rowTop + 5, 36, 36, av.color, 18)
      if (!av.url) s.text(`chip:${i}:i`, tx + 18, rowTop + 5 + (36 - normal(16)) / 2, (String(name).trim().charAt(0) || '?').toUpperCase(), { size: 16, weight: 700, mx: 0.5 })
      tx += 36 + 8
    }
    s.text(`chip:${i}:t`, tx, rowTop + (chipH - LINE) / 2, label, { size: 18, lh: LINE })
    if (self) s.text(`chip:${i}:you`, tx + s.width(label, 18) + 8, rowTop + (chipH - LINE) / 2, $L('You'), { size: 16, color: white(0.6), lh: LINE })
    cx += w + 10
  })
  h = rowTop + chipH - cy0 + 21
  card(s, 'g', PAD, cy0, SYNC_W, h)
  y += h + 20
  if (m.queueItem || m.queueLength > 0) {
    const top = y
    let ch = 21
    if (m.queueItem) {
      const np = nowPlaying(s, PAD + 21, top + 21, SYNC_W - 42, $L('Now Playing'), m.queueItem.Name || $L('Unknown'),
        m.showWatch ? { id: 'watch', label: $L('Watch now') } : null, null, m.queueLength > 1 ? `${m.queueIndex + 1} of ${m.queueLength}` : '')
      if (m.queueLength > 0) {
        ch += np + 16
      } else {
        // The card's last now playing block drops its bottom line and padding.
        s.out.boxes.forEach((b) => {
          if (b.k === 'np:line') b.a = 0
        })
        ch += np - 17
      }
    }
    if (m.queueLength > 0) {
      const half = (SYNC_W - 42 - 10) / 2
      controlButton(s, 'shuffle', PAD + 21, top + ch, half, `${$L('Shuffle')}: ${m.shuffle ? $L('On') : $L('Off')}`, m.shuffle)
      controlButton(s, 'repeat', PAD + 21 + half + 10, top + ch, half, `${$L('Repeat')}: ${m.repeatLabel}`, m.repeat)
      ch += CONTROL_H
    }
    ch += 21
    card(s, 'np', PAD, top, SYNC_W, ch)
    y += ch + 20
  }
  s.box('controls:line', PAD, y, SYNC_W, 1, white(0.1))
  y += 1 + 16 + 12
  y += button(s, 'leave', PAD, y, SYNC_W, m.leaving ? $L('Leaving...') : $L('Leave group'), 'leave', m.leaving)
  return y - TOP
}

const BUILD = {
  rooms: buildRooms, pin: buildPin, lobby: buildLobby, siloNone: buildSiloNone, siloRoom: buildSiloRoom,
  syncLobby: buildSyncLobby, syncGroup: buildSyncGroup,
}

const WIDTH = { rooms: 1640, pin: 1640, lobby: 1640, siloNone: 480, siloRoom: 480, syncLobby: 720, syncGroup: 720 }

// The whole dialog: its width, the header (title, the status note, the close button) and the scrolling body.
export const layoutDialog = (m, focusId) => {
  const w = WIDTH[m.kind]
  const head = createSheet(focusId)
  const body = createSheet(focusId)
  let shift = 0
  if (m.error) shift = banner(body, 'error', PAD, TOP, w - 56, m.error) + 12
  let h = BUILD[m.kind](body, m)
  if (shift) {
    const moved = (list) => list.forEach((it) => {
      if (it.k !== 'error:bg' && String(it.k).indexOf('error:t') !== 0) it.y += shift
    })
    moved(body.out.boxes)
    moved(body.out.rings)
    moved(body.out.pics)
    moved(body.out.boxes2)
    moved(body.out.rings2)
    moved(body.out.texts)
    body.out.focusables.forEach((f) => {
      f.y += shift
    })
    h += shift
  }
  const titleW = head.width(m.title, 28, 600)
  // A note baseline-aligned in the title's line grows it to 35.7px, which moves the title up 1.4px.
  const titleTop = 24 + (44 - (m.note ? 35.74 : LINE)) / 2
  head.text('title', PAD, titleTop, m.title, { size: 28, weight: 600, lh: LINE })
  if (m.note) {
    // The note sits on the title's baseline in the same line box.
    const drop = (28 - 20) * 0.9277 - (normal(28) - normal(20)) / 2
    head.text('note', PAD + titleW + 18, titleTop + drop, m.note, { size: 20, color: white(0.65), lh: LINE })
  }
  closeButton(head, 'close', w - PAD, 24)
  head.box('line', 0, 84, w, 1, white(0.1))
  return { w, maxH: w === 1640 ? 972 : 864, head: head.out, body: body.out, bodyH: TOP + h + 28 }
}
