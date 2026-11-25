// The app's $L. Strings come from resources/<locale>/strings.json, which Weblate fills, keyed by
// the English text. loadStrings runs once before the app launches, so $L stays synchronous.
let table = {}
let current = 'en-US'

const candidates = (locale) => {
  const [lang, region] = locale.split('-')
  const list = []
  if (region) list.push(`${lang}-${region}`)
  list.push(lang)
  return list
}

const fetchJson = (url) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText))
      } catch (e) {
        resolve(null)
      }
    }
    xhr.onerror = () => resolve(null)
    xhr.send(null)
  })

// A release the update loader booted from storage carries its own copy of the strings for the
// language it was downloaded under, newer than the package's. Any other language comes from the package.
const fetchStored = (name) => {
  const ota = typeof window !== 'undefined' && window.__moonfinOta
  if (!ota || !ota.read) return Promise.resolve(null)
  return ota.read(`resources/${name}/strings.json`).then(
    (text) => {
      try {
        return JSON.parse(text)
      } catch (e) {
        return null
      }
    },
    () => null
  )
}

// A uiLanguage of "system", or none at all, follows the TV.
const resolveLocale = (locale) =>
  !locale || /^(system|auto|default)$/i.test(locale) ? (navigator.language || 'en-US') : locale

export const loadStrings = async (locale) => {
  current = resolveLocale(locale)
  table = {}
  if (/^en(-US)?$/i.test(current)) return current
  for (const name of candidates(current)) {
    const data = (await fetchStored(name)) || (await fetchJson(`resources/${name}/strings.json`))
    if (data) {
      table = data
      break
    }
  }
  return current
}

export const currentLocale = () => current

// The strings files loadStrings reads for the current language, which an update keeps for it.
export const stringFiles = () => candidates(current).map((name) => `resources/${name}/strings.json`)

const $L = (str) => {
  if (str && typeof str === 'object') {
    const key = str.key || str.value
    return table[key] || str.value || key
  }
  return table[str] || str
}

export default $L
