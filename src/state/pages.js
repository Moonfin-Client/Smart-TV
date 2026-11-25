// The page that gets focus back when the nav or an overlay lets go of it. app/PageStack.jsx sets it
// to the page on top of the stack, so pages don't call setActivePage themselves.
let active = null
export const setActivePage = (page) => {
  active = page
}
export const focusActivePage = () => {
  if (active) active.focus()
}
export const getActivePage = () => active
