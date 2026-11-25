import assert from 'node:assert'
import { readFileSync } from 'node:fs'

// appBackground is plain arithmetic, lifted out of the module so its imports don't load.
const src = readFileSync(new URL('./gameModels.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('export const appBackground'), src.indexOf('// The game screens go Home'))
const appBackground = new Function(`${body.replace('export const appBackground', 'const appBackground')}\nreturn appBackground`)()

// Glass's #07090fcc laid three times over white comes out rgb(9, 11, 17).
assert.strictEqual(appBackground('#07090fcc'), '#090b11')
// An opaque theme shows its own color.
assert.strictEqual(appBackground('#101010ff'), '#101010')
console.log('gameModels ok')
