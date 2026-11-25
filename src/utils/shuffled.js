export const shuffled = (list) => {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}
