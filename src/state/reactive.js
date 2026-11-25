// A plain object whose keys are Solid signals, so plain modules read and write it directly
// (`store.authenticated = true`), and JSX or a memo that reads a key tracks it.
// It uses getters and setters, not a Proxy, so it works on Chrome 38. Only the keys it starts with
// are reactive, and an object value is replaced, never merged (assign a new object to change it).
import { createSignal } from 'solid-js'

export const reactive = (initial) => {
  const obj = {}
  Object.keys(initial).forEach((key) => {
    const [get, set] = createSignal(initial[key])
    // The updater form stops a function value from being called as one.
    Object.defineProperty(obj, key, { enumerable: true, get, set: (v) => set(() => v) })
  })
  return obj
}

// The same thing under the appState.plugin() name the audio player and the shell state call.
export const appState = { plugin: reactive }
