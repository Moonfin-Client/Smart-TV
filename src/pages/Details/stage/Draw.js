// The display lists the details styles work out in script. A list is {rects, imgs, texts}, each
// entry keyed by `k`:
//   rect  {x, y, w, h, r, color, bw, bc}
//   img   {x, y, w, h, src, color, r, fit}
//   text  {x, y, text, font, size, color, lh, ls, maxw, maxlines, rich, shadow}
// A text with `maxw` is cut to `maxlines` with an ellipsis, a `rich` one is wrapped in [i] tags (italic),
// and `shadow` is a text shadow. Draw.jsx draws one.
const NO_BORDER = '#00000000'

export const finishList = (out) => ({
  rects: out.rects.map((r) => ({ r: 0, bw: 0, bc: NO_BORDER, ...r })),
  imgs: out.imgs.map((im) => ({ r: 0, fit: 'cover', color: '#ffffffff', ...im })),
  texts: out.texts.map((tx) => ({ lh: 0, ls: 0, maxw: 0, maxlines: 1, rich: false, shadow: null, ...tx })),
})

export const emptyList = () => ({ rects: [], imgs: [], texts: [] })
