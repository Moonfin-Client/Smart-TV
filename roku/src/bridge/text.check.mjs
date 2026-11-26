// node src/bridge/text.check.mjs
import assert from 'node:assert/strict'
import { drawableText, visibleText } from './text.js'

assert.equal(visibleText('\u200eHe transforms\u00ad'), 'He transforms')
assert.equal(drawableText('ECU: DIRECTV ECUADOR ᴸᶦᵍᵃ Eᶜᵘᵃᵈᵒʳ ᴴᴰ'), 'ECU: DIRECTV ECUADOR Liga Ecuador HD')
assert.equal(drawableText('\u200e|LAM| ESPN Deportes ᵁᴴᴰ'), '|LAM| ESPN Deportes UHD')
// Characters Roboto has stay as they are.
assert.equal(drawableText('Ranma ½ x² café'), 'Ranma ½ x² café')
console.log('text ok')
