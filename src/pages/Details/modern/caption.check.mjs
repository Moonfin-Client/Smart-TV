// node src/pages/Details/modern/caption.check.mjs
import assert from 'node:assert/strict'
import { captionHeight } from './caption.js'

// A movie's caption is its one title line, 53px under a Details grid card.
assert.equal(captionHeight({ Type: 'Movie', Name: 'x', ProductionYear: 2002 }), 53)
// A season under its series name, and an episode under its code, take a second line 4px down.
assert.equal(captionHeight({ Type: 'Season', Name: 'Season 1', SeriesName: 'Show' }), 90)
assert.equal(captionHeight({ Type: 'Episode', Name: 'Pilot', ParentIndexNumber: 1, IndexNumber: 1 }), 90)
// An album's artist is a plain second line.
assert.equal(captionHeight({ Type: 'MusicAlbum', Name: 'A', AlbumArtist: 'B' }), 86)
console.log('caption ok')
