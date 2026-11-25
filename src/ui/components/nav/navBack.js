import { requestExit } from '../../../state/shell/exit.js'

// Back from the nav does what it does from the page under it: Home asks to leave the app and any
// other page goes back.
export const navBack = (nav) => {
  const route = nav.$router.currentRoute
  if (!route || route.path === '/home' || !nav.$router.history.length) requestExit()
  else nav.$router.back()
}
