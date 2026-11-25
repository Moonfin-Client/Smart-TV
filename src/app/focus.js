// Focus hand-offs between the shell's parts. The nav registers itself here, and a page hands focus
// to it from its edge (Left with a sidebar, Up with a top bar, see navOnLeft() in ui/theme.js).
import { focusActivePage } from '../state/pages.js'

let nav = null
export const setNavHandle = (handle) => {
  nav = handle
}

// False when no nav is drawn (a page without chrome), so the caller can keep focus.
export const focusNav = () => {
  if (!nav || !nav.available()) return false
  nav.focus()
  return true
}

export { focusActivePage }
