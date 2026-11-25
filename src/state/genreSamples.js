// How Home's Genres row picks each genre's sample title. No imports, so its check runs in node.

// The same sample title for a genre every load, so the server serves art it already sized.
export const stableIndex = (seed, length) => {
  if (length <= 0) return 0
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0
  return Math.abs(hash) % length
}

export const itemGenreNames = (item) => {
  if (!item || typeof item !== 'object') return []
  const direct = Array.isArray(item.Genres) ? item.Genres : []
  const linked = Array.isArray(item.GenreItems) ? item.GenreItems.map((g) => g && g.Name).filter(Boolean) : []
  return direct
    .concat(linked)
    .map((name) => String(name).trim().toLowerCase())
    .filter(Boolean)
}

// The genre's sample title from one pool, preferring titles with wide art.
export const pickRepresentative = (genre, samples) => {
  const lower = String(genre.Name || '').toLowerCase()
  const matching = samples.filter((it) => itemGenreNames(it).indexOf(lower) >= 0)
  const withArt = matching.filter((it) => (it.BackdropImageTags && it.BackdropImageTags.length > 0) || (it.ImageTags && it.ImageTags.Thumb))
  const pool = withArt.length ? withArt : matching
  return pool.length ? pool[stableIndex(genre.Name, pool.length)] : null
}
