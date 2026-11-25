// Answers another client that starts music here: "Play on..." from a phone, or a remote command from
// the server. remoteControl.js had the command plumbing, but nothing ever registered a player for it
// to drive and App's playItems was a no-op, so remote playback could not work.
//
// Scope: audio only. Video playback is wired by the Player page itself.
import { api } from './jellyfinApi.js'
import { router } from '../app/router.js'
import * as player from '../state/audioPlayer.js'
import { setPlayerControls } from './remoteControl.js'

const TICKS = 10000000
const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

const active = () => !!player.audio && player.audio.active

export const playItems = async (itemIds, options = {}) => {
	const ids = (itemIds || []).filter(Boolean).map(String)
	if (!ids.length) return
	const res = await api
		.getItems({Ids: ids.join(','), Fields: 'MediaSources,MediaStreams'})
		.catch(() => null)
	// The sender may have moved on while the lookup ran.
	if (options.isCurrent && !options.isCurrent()) return
	const items = itemsOf(res)
	if (!items.length) return
	// getItems does not promise the order asked for, so put the queue back in the sender's order and
	// keep repeated ids as repeated tracks.
	const byId = new Map(items.map((item) => [String(item.Id), item]))
	const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
	if (!ordered.length) return
	const start = Math.min(Math.max(0, options.startIndex || 0), ordered.length - 1)
	player.play(ordered, start)
	if (options.startPositionTicks > 0) player.seek(options.startPositionTicks / TICKS)
	router.to('/nowplaying')
}

// The transport commands remoteControl.js forwards. Registered at boot; a video player pushes its own
// controls on top while it plays and hands back to these when it closes.
const controls = {
	pause: () => {
		if (active() && player.audio.playing) player.toggle()
	},
	resume: () => {
		if (active() && !player.audio.playing) player.toggle()
	},
	playPause: () => {
		if (active()) player.toggle()
	},
	stop: () => {
		if (active()) player.stop()
	},
	seek: (ticks) => {
		const seconds = (Number(ticks) || 0) / TICKS
		if (active()) player.seek(Math.max(0, seconds))
	},
	next: () => {
		if (active()) player.next()
	},
	previous: () => {
		if (active()) player.previous()
	},
	rewind: () => {
		if (active()) player.seek(Math.max(0, player.currentTime() - 10))
	},
	fastForward: () => {
		if (active()) player.seek(player.currentTime() + 10)
	},
	setRepeatMode: (mode) => player.setRepeat(mode),
	setShuffle: (on) => player.setShuffle(on),
}

export const installRemotePlayback = () => setPlayerControls({current: controls})
