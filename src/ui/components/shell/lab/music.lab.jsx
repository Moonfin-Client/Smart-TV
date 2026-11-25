import { onMount } from 'solid-js'
import { audio } from '../../../../state/audioPlayer.js'
import { router } from '../../../../app/router.js'

// Puts the music player's state up as if a track were playing, without playing anything, so the
// nav's music card and mini player can be shot. Data: title, artist, playing. It goes straight
// back to the page it was opened over.
export default function MusicLab(props) {
  audio.title = props.title || 'Track'
  audio.artist = props.artist || ''
  audio.playing = props.playing !== false
  audio.active = true
  onMount(() => setTimeout(() => router.back(), 0))
  return <view />
}
