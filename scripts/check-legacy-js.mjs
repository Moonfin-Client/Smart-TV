// Parses every script of a legacy build as ES5, the way Chrome 38 (webOS 3) has to read it. A
// syntax error there stops the whole app on the oldest TVs, and nothing else catches it before a
// TV does. acorn comes with terser.
//
//   node scripts/check-legacy-js.mjs dist/webos-legacy [dist/tizen-legacy ...]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'acorn'

const dirs = process.argv.slice(2)
if (!dirs.length) {
  console.error('usage: node scripts/check-legacy-js.mjs <legacy build dir>...')
  process.exit(2)
}
let files = 0
let bad = 0
for (const dir of dirs) {
  for (const name of readdirSync(join(dir, 'assets')).filter((n) => n.endsWith('.js'))) {
    const file = join(dir, 'assets', name)
    const src = readFileSync(file, 'utf8')
    files++
    try {
      parse(src, { ecmaVersion: 5, sourceType: 'script' })
    } catch (e) {
      bad++
      console.log(`::error file=${file}::${e.message} near ${JSON.stringify(src.slice(Math.max(0, e.pos - 60), e.pos + 40))}`)
    }
  }
}
console.log(`${files} files, ${bad} not ES5`)
process.exit(bad || !files ? 1 : 0)
