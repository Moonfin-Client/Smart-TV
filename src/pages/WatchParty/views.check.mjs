// Self-check for views.js: node src/pages/WatchParty/views.check.mjs
// Every view's keys are unique in each list (a repeat makes PartyPaint drop a node), the people list keeps its open
// box under its rows, a picture avatar has no color behind it, every view takes its colors from the theme, and the
// room's subtitle choices cycle in order.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { layoutDialog, partyPeople } = await import('./views.js')
const { createSheet, partyLook } = await import('./sheet.js')
const { subtitleChoices, choiceMatches } = await import('./partyText.js')

const member = (id, name, extra = {}) => ({ profileId: id, displayName: name, isHost: false, isSelf: false, connected: true, status: 'ready', ...extra })
const room = {
  roomId: 'r', code: 'KM8ZNM', phase: 'lobby', playbackState: 'idle', isHost: true, isVoting: false, hasPin: false, everyoneControls: false,
  guestsCanPause: false, selectedContentId: null, members: [member('me', 'moonfin', { isSelf: true, isHost: true }), member('p2', 'party')],
}
const avatarFor = (name) => ({ url: name === 'moonfin' ? 'http://x/u.png' : '', color: '#16794f' })
const group = { GroupId: 'g1', GroupName: "party's group", State: 'Idle', Participants: ['party', 'moonfin'] }
const models = [
  { kind: 'syncLobby', title: 'SyncPlay', groups: [group], name: '', avatarFor },
  { kind: 'syncLobby', title: 'SyncPlay', groups: [], name: '', avatarFor },
  { kind: 'syncGroup', title: 'SyncPlay', group, self: 'moonfin', queueItem: null, queueLength: 0, queueIndex: -1, avatarFor, repeatLabel: 'Off' },
  { kind: 'siloNone', title: 'Watch Party', supported: true, ended: '', code: '', error: '' },
  { kind: 'siloRoom', title: 'Watch Party', room, status: 'In the lobby', primary: null, secondary: null, subtitleLabel: 'Off', suggestions: [], error: '' },
]
models.forEach((m) => {
  const laid = layoutDialog(m, null)
  for (const part of [laid.head, laid.body]) {
    for (const list of ['boxes', 'rings', 'pics', 'boxes2', 'rings2', 'texts']) {
      const keys = part[list].map((it) => it.k)
      assert.equal(new Set(keys).size, keys.length, `${m.kind} repeats a key in ${list}: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`)
    }
  }
})

// The picked member's open box is there for every member from the start, faded in only for the one picked.
const people = (picked) => {
  const s = createSheet(null)
  partyPeople(s, 0, 0, 660, { room, picked, roomPin: null, pinBad: false, everyoneAllowed: true, avatarFor: () => '' })
  return s.out.boxes
}
const closed = people(null)
const opened = people('p2')
assert.deepEqual(closed.map((b) => b.k), people('nobody').map((b) => b.k))
assert.equal(closed.find((b) => b.k === 'open:p2').a, 0)
assert.equal(opened.find((b) => b.k === 'open:p2').a, 1)
assert.ok(opened.findIndex((b) => b.k === 'open:p2') < opened.findIndex((b) => b.k === 'm:p2:bg'), 'the open box sits under its row')

// SyncPlay's stacked faces: a picture gets only its ring, drawn over the pictures, and no color behind it.
const lobby = layoutDialog(models[0], null).body
assert.ok(!lobby.boxes.concat(lobby.boxes2).some((b) => b.k === 'g:g1:avb1'), 'no color behind a picture')
assert.ok(lobby.rings2.some((r) => r.k === 'g:g1:avr1'))
assert.ok(lobby.boxes.some((b) => b.k === 'g:g1:avb0'), 'an initial keeps its color')

// With a theme, everything but the status colors, the red of Leave and errors, the QR code's white and clear boxes
// comes from its tokens.
const tokens = {
  onSurface: '#f0e0ffff', surface: '#140a28ff', accent: '#ff2fa0ff', onAccent: '#101010ff', focus: '#00ffe0ff',
  buttonNormal: '#2a1450ff', buttonFocused: '#ffe000ff', onButtonNormal: '#f0e0ffff', onButtonFocused: '#140a28ff',
  inputBackground: '#201040ff', inputBorder: '#503080ff', inputBorderFocused: '#00ffe0ff',
}
const own = new Set(Object.values(tokens).map((c) => c.slice(0, 7)))
const avatars = ['#8e44ad', '#2e6fb7', '#16794f', '#c0392b', '#9a5b00', '#00796b']
const fixed = new Set([...avatars, '#000000', '#c8c8c8', '#3ecf8e', '#f5b942', '#4fb0ff', '#6f6f6f', '#555555', '#ff8a8a', '#dc3232',
  '#ffd6d6', '#dc4646', '#2a1d1d', '#4a2c2c', '#00c853', '#bdbdbd', '#9e9e9e', '#ffb74d', '#ff9800', '#b0bec5', '#607d8b', '#81c784', '#4caf50'])
const look = partyLook(tokens)
const themed = [
  ...models,
  { kind: 'siloRoom', title: 'Watch Party', room: { ...room, isVoting: true }, status: 'Playing', primary: { id: 'play', label: 'Play' }, secondary: { id: 'stop', label: 'Stop', kind: 'plain' }, subtitleLabel: 'Off', suggestions: [{ id: 's1', title: 'A', subtitle: 2001, voteCount: 1, votedByMe: true }], search: '', results: [], error: 'Oops' },
  { kind: 'rooms', title: 'Watch Party', supported: true, rooms: [{ kind: 'silo', roomId: 'r', art: [], hasPin: true, phase: 'lobby', members: [] }], code: 'K', busy: false, jellyfin: true, ended: 'Ended' },
  { kind: 'pin', title: 'Watch Party', heading: 'PIN', wrong: 'Wrong PIN', pin: '', busy: false },
  { kind: 'lobby', title: 'Watch Party', note: 'Host', room: { ...room, isVoting: true }, item: null, primary: null, code: 'KM8ZNM', qr: 'data:x', suggestions: [], search: '', results: [], picked: 'p2', roomPin: '12', pinBad: true, everyoneAllowed: true, avatarFor: () => '' },
]
themed.forEach((m) => {
  ;['close', 'start', 'code', 'join', 'leave', 'everyone', 'self', 'play', 'stop', 'name'].forEach((focus) => {
    const laid = layoutDialog(m, focus, look)
    for (const part of [laid.head, laid.body]) {
      for (const list of ['boxes', 'rings', 'boxes2', 'rings2', 'texts']) {
        part[list].forEach((it) => {
          const c = it.c.slice(0, 7)
          // The QR code's backing, and the white label on a red Leave or End button.
          const white = c === '#ffffff' && (it.k === 'inv:qrbg' || ((m.kind === 'siloRoom' || m.kind === 'syncGroup') && /^(leave|end):t/.test(it.k)))
          assert.ok(own.has(c) || fixed.has(c) || white, `${m.kind} (focus ${focus}) ${list} ${it.k} keeps the fixed color ${it.c}`)
        })
      }
    }
  })
})

// Subtitles for everyone: each person's choice, off, then the tracks, matched to what the room has.
const choices = subtitleChoices({ MediaStreams: [{ Type: 'Subtitle', Index: 3, Language: 'eng', DisplayTitle: 'English' }, { Type: 'Audio', Index: 1 }] })
assert.deepEqual(choices.map((c) => c.label), ["Each person's choice", 'Off', 'English'])
assert.equal(choices.findIndex((c) => choiceMatches(c, null)), 0)
assert.equal(choices.findIndex((c) => choiceMatches(c, { off: true })), 1)
assert.equal(choices.findIndex((c) => choiceMatches(c, { index: 3 })), 2)
assert.equal(subtitleChoices(null).length, 2)

console.log('views.check ok')
