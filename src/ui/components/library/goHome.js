import { batch } from 'solid-js'
import { router } from '../../../app/router.js'
import { getStore } from '../../../state/store.js'

// The Home button drops every screen opened since Home, so this goes back to it when it's in the
// history and opens it otherwise.
export const goHome = () => {
  getStore().navSection = 'home'
  const history = router.history
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].path === '/home') {
      // One stack change, so the screens in between never show on the way.
      return batch(() => {
        for (let n = history.length - i; n > 0; n--) router.back()
      })
    }
  }
  router.to('/home')
}
