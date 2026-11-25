// Whether an element is attached and drawn, for a repeating update to skip its turn otherwise.
// Takes an ElementNode, or an object holding one as `node` (a bar's context from barContext.js).
export const onScreen = (target) => {
  const el = target && target.lng ? target : target && target.node
  const lng = el && el.lng
  return !!(lng && el.parent && lng.worldAlpha > 0)
}
