// Answers another client that starts music here: playlist "Play on..." from a phone, or a remote
// command from the server. remoteControl.js had the command plumbing but nothing ever registered
// the app and player it reads through, so playItems and the transport commands had nowhere to go.
//
// Scope: audio only. Video playback still needs the video engine wired the same way.
import { api } from './jellyfinApi.js'
import { router } from '../app/router.js'
import * as player from '../state/audioPlayer.js'
import { setAppControls, setPlayerControls } from './remoteControl.js'

const TICKS = 10000000
const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

const active = () => !!player.audio && player.audio.active

export const playItems = async (itemIds, options = {}) => {
	const ids = (itemIds || []).filter(Boolean).map(String)
	if (!ids.length) return
	const res = await api
		.getItems({Ids: ids.join(','), Fields: 'MediaSources,MediaStreams'})
		.catch(() => null)
	const items = itemsOf(res)
	if (!items.length) return
	const start = Math.min(Math.max(0, options.startIndex || 0), items.length - 1)
	player.play(items, start)
	router.to('/nowplaying')
}

// The transport commands remoteControl.js forwards while something is playing.
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
}

export const installRemotePlayback = () => {
	setAppControls({current: {playItems}})
	setPlayerControls({current: controls})
}
