import { createMemo, onCleanup } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import DetailModals from './DetailModals.jsx'
import { router } from '../../../app/router.js'
import { focusActivePage } from '../../../state/pages.js'
import { getStore } from '../../../state/store.js'
import { detailsData, playRoute } from '../../../state/libraryRoutes.js'
import { detailTokens } from '../../../pages/Details/modern/tokens.js'

// The long press menu for every card outside Details, with the dialogs its entries open, drawn by
// App over the nav. A held card calls openItemMenu(item, options) with the menu options
// (isContinueWatchingOrNextUp, playImmediately), and focus goes back to the card when it closes.
// Details opens its own, which can also take a title out of the collection or playlist on screen.
let host = null

// Whether the menu opened: false when the item offers nothing, so the hold can act as a press.
export const openItemMenu = (item, options) => (host && item ? host(item, options || {}) : false)

export default function ItemMenuHost() {
  let modals = null
  let back = null
  const tokens = createMemo(() => detailTokens())
  const open = (it) => {
    const kind = { Person: 'person', MusicAlbum: 'album', MusicArtist: 'artist' }[it.Type] || 'details'
    router.to(`/${kind}/${it.Id}`, kind === 'details' ? detailsData(it) : {})
  }
  const page = {
    open,
    // The title's page opens and starts it, so Back from the player lands there.
    playCard: (it) => {
      const [path, data] = playRoute(it)
      router.to(path, data)
    },
    removeCard: () => Promise.resolve(),
    moveCard: () => Promise.resolve(),
    onModalClosed: () => {
      const el = back
      back = null
      if (el && el.parent && el.setFocus) el.setFocus()
      else focusActivePage()
    },
  }
  host = (item, options) => {
    if (!modals) return false
    const user = getStore().user
    back = activeElement()
    const opened = modals.openItemMenu(item, { ...options, isAdmin: !!(user && user.Policy && user.Policy.IsAdministrator) })
    if (!opened) back = null
    return opened
  }
  onCleanup(() => (host = null))
  return <DetailModals ref={(h) => (modals = h)} page={page} tokens={tokens()} />
}
