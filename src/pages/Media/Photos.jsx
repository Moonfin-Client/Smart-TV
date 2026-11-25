import { createEffect, createSignal, on, onCleanup } from 'solid-js'
import Library from '../Library/Library.jsx'
import PhotoViewer from '../../ui/components/media/PhotoViewer.jsx'
import { isSlideshowVideo, moreCount, stepIndex, viewerItems } from '../../ui/components/media/photoSlideshow.js'
import { pageTimers } from '../../ui/components/library/pageKit.js'
import { get as setting } from '../../state/settings.js'
import { state as partyState } from '../../state/watchParty.js'
import { router } from '../../app/router.js'

// A photos or home videos library: the Library page with the photo viewer over it. This opens the
// viewer for a photo, pages the folder in for it through the library's hooks (onViewPhoto,
// onLibraryItems and the { loadMore, focusItem } handle), hands slideshow videos to the player and
// takes the slideshow back after them.

export default function Photos(props) {
  const later = pageTimers()
  const [viewing, setViewing] = createSignal(false)
  const my = { siblings: [], item: null, paging: { loaded: 0, total: 0 }, count: 0, asking: false }
  let lib = null
  let libRoot
  let viewer

  const inGroup = () => {
    const s = partyState()
    return !!(s.inGroup || (s.party && s.party.room))
  }
  // In a SyncPlay group or a Watch Party the player waits on the group, so a slideshow passes over videos.
  const videos = () => setting('photoSlideshowVideos') !== false && !inGroup()
  const more = () => moreCount(my.paging, my.count, viewerItems(my.siblings, my.item).length)

  // The Library page calls this for a photo, with what it has loaded of the folder.
  const onViewPhoto = (item, siblings, source) => {
    const src = source || {}
    my.item = item
    my.siblings = (siblings || []).slice()
    my.paging = { loaded: src.loaded || 0, total: src.total || 0 }
    my.count = 0
    my.asking = false
    my.slideshowVideo = false
    my.returnTo = null
    setViewing(true)
    viewer.open(item, my.siblings, { more: more(), videos: videos(), playable: !inGroup() })
    viewer.setFocus()
  }
  // The library loads the next page as scrolling would, and reports back through onLibraryItems.
  const askMore = () => {
    const { loaded, total } = my.paging
    if (loaded >= total) return
    my.asking = true
    clearTimeout(my.askTimer)
    my.askTimer = later(() => {
      my.asking = false
    }, 10000)
    if (lib) lib.loadMore()
  }
  const onViewerMore = () => {
    if (!my.asking) askMore()
  }
  const libraryItems = ({ items, loaded, total }) => {
    if (!viewing()) return
    const before = my.paging.loaded
    my.paging = { loaded: Math.max(before, loaded || 0), total: total || 0 }
    const known = {}
    my.siblings.forEach((e) => {
      known[e.Id] = true
    })
    const added = (items || []).filter((e) => !known[e.Id])
    if (added.length) my.siblings = my.siblings.concat(added)
    viewer.setItems(my.siblings, more())
    if (!my.asking) return
    if (loaded > before || loaded >= total) {
      my.asking = false
      clearTimeout(my.askTimer)
    } else askMore()
  }
  // The folder's exact count, which the library asks for when the viewer opens on a folder it
  // hasn't loaded in full.
  const libraryPhotoCount = (count) => {
    if (!viewing()) return
    my.count = count
    viewer.setItems(my.siblings, more())
  }
  const onViewerClose = (last) => {
    setViewing(false)
    my.asking = false
    my.paging = { loaded: 0, total: 0 }
    my.count = 0
    if (libRoot) libRoot.setFocus()
    // Back lands on the tile of the photo the viewer closed on.
    if (last && last.Id) later(() => lib && lib.focusItem(last.Id), 50)
  }
  const onViewerPlayVideo = (video, index, byHand) => {
    my.slideIndex = index
    my.byHand = !!byHand
    play(video)
  }
  // A slideshow's own video hands its end, its arrows and Back to the slideshow. One picked by hand ends as usual.
  const play = (video) => {
    my.slideshowVideo = true
    const slideshow = my.byHand
      ? undefined
      : {
          muted: viewer.running() && setting('photoSlideshowVideoSound') === false,
          onStep: (dir) => moveSlideshow(dir, false),
          onEnded: () => moveSlideshow(1, true),
          onExit: () => slideshowExit(),
        }
    // Out of the history, so the next video takes its place and Back from either comes here.
    router.to(`/player/${video.Id}`, { slideshow }, { inHistory: false })
  }
  // Moves a slideshow video on, to the next video in the player where it is, or to a photo, which leaves
  // the player and shows the viewer on it again. Once the slideshow has stopped, it goes back to the viewer.
  const moveSlideshow = (dir, auto) => {
    const list = viewer.items()
    const vids = videos()
    const index = auto && !viewer.running() ? my.slideIndex : stepIndex(list, my.slideIndex, dir, auto && !vids)
    const target = list[index]
    my.slideIndex = index
    if (viewer.running() && isSlideshowVideo(target, vids)) {
      play(target)
      return
    }
    my.slideshowVideo = false
    if (target) my.returnTo = target
    router.back()
  }
  const slideshowExit = () => {
    my.slideshowVideo = false
    leaveOn()
    router.back()
  }
  // The viewer closes on the slideshow's last video, so the library lands on its tile.
  const leaveOn = () => {
    viewer.setRunning(false)
    viewer.showItem(viewer.items()[my.slideIndex])
    my.exit = true
  }
  // Back on top after the player.
  const onReturn = () => {
    if (!viewing()) return
    // A video picked by hand comes back to the viewer on it. A slideshow's own video left any way but its
    // own callbacks (which clear the flag) closes the viewer on that video's tile, as Back from it does.
    if (my.slideshowVideo && my.byHand) my.returnTo = viewer.items()[my.slideIndex]
    else if (my.slideshowVideo) leaveOn()
    my.slideshowVideo = false
    if (my.exit) {
      my.exit = false
      viewer.close()
      return
    }
    if (my.returnTo) viewer.showItem(my.returnTo)
    my.returnTo = null
    viewer.setFocus()
  }

  if (props.page) createEffect(on(props.page.active, (active) => active && onReturn(), { defer: true }))
  onCleanup(() => clearTimeout(my.askTimer))

  return (
    <view
      width={1920}
      height={1080}
      forwardFocus={() => {
        if (viewing() && viewer) viewer.setFocus()
        else if (libRoot) libRoot.setFocus()
        return true
      }}
    >
      <view ref={libRoot} width={1920} height={1080} forwardFocus={0}>
        <Library
          id={props.id}
          page={props.page}
          viewing={viewing()}
          onViewPhoto={onViewPhoto}
          onLibraryItems={libraryItems}
          onLibraryPhotoCount={libraryPhotoCount}
          ref={(h) => (lib = h)}
        />
      </view>
      <PhotoViewer
        ref={(n) => (viewer = n)}
        onViewerMore={onViewerMore}
        onViewerClose={onViewerClose}
        onViewerPlayVideo={onViewerPlayVideo}
      />
    </view>
  )
}
