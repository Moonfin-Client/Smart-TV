// node src/state/genreSamples.check.mjs
import assert from 'node:assert/strict'
import { itemGenreNames, pickRepresentative, stableIndex } from './genreSamples.js'

assert.equal(stableIndex('Action', 0), 0)
assert.equal(stableIndex('Action', 5), stableIndex('Action', 5))
assert.ok(stableIndex('Action', 7) >= 0 && stableIndex('Action', 7) < 7)
assert.deepEqual(itemGenreNames({ Genres: [' Action '], GenreItems: [{ Name: 'Drama' }, {}] }), ['action', 'drama'])
assert.deepEqual(itemGenreNames(null), [])

const wide = { Id: 'w', Genres: ['Action'], BackdropImageTags: ['b'] }
const thumb = { Id: 't', GenreItems: [{ Name: 'action' }], ImageTags: { Thumb: 'x' } }
const plain = { Id: 'p', Genres: ['Action'] }
const other = { Id: 'o', Genres: ['Drama'], BackdropImageTags: ['b'] }
// Titles with wide art win, picked by the genre's name.
const pick = pickRepresentative({ Name: 'Action' }, [plain, wide, thumb, other])
assert.ok(pick === [wide, thumb][stableIndex('Action', 2)])
// Without wide art any matching title will do, and no match gives null.
assert.equal(pickRepresentative({ Name: 'Action' }, [plain, other]), plain)
assert.equal(pickRepresentative({ Name: 'Western' }, [plain, wide]), null)
console.log('genreSamples ok')
