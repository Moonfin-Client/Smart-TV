// Settings and sessions live in the app's registry section, through the localStorage the bridge keeps
// in step with it.
const read = (key) => {
  const raw = localStorage.getItem(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const initStorage = async () => true
export const getFromStorage = async (key) => read(key)
export const saveToStorage = async (key, value) => {
  localStorage.setItem(key, JSON.stringify(value))
  return true
}
export const removeFromStorage = async (key) => {
  localStorage.removeItem(key)
  return true
}
export const clearAllStorage = async () => {
  localStorage.clear()
  return true
}
