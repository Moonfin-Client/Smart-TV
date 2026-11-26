import assert from 'node:assert/strict'
import {
  DEFAULT_PERSONAL_RATING_INTERVALS,
  effectivePersonalRatingIntervals,
  formatPersonalRatingBadge,
  formatPersonalRatingNumber,
  personalRatingMaxDecimals,
  personalRatingServerStep,
  snapPersonalRatingToGrid,
  starRatingLabel,
  stepPersonalRatingDown,
  stepPersonalRatingUp,
} from './personalRating.js'

assert.equal(DEFAULT_PERSONAL_RATING_INTERVALS, 11)

// Normalization per style
assert.equal(effectivePersonalRatingIntervals('stars', 6), 6)
assert.equal(effectivePersonalRatingIntervals('stars', 11), 11)
assert.equal(effectivePersonalRatingIntervals('stars', 21), 21)
assert.equal(effectivePersonalRatingIntervals('stars', 41), 21)
assert.equal(effectivePersonalRatingIntervals('numeric', 6), 11)
assert.equal(effectivePersonalRatingIntervals('numeric', 11), 11)
assert.equal(effectivePersonalRatingIntervals('numeric', 21), 21)
assert.equal(effectivePersonalRatingIntervals('numeric', 41), 41)

// Server step & decimals
assert.equal(personalRatingServerStep('stars', 6), 2)
assert.equal(personalRatingServerStep('stars', 11), 1)
assert.equal(personalRatingServerStep('stars', 21), 0.5)
assert.equal(personalRatingServerStep('numeric', 11), 1)
assert.equal(personalRatingServerStep('numeric', 21), 0.5)
assert.equal(personalRatingServerStep('numeric', 41), 0.25)

assert.equal(personalRatingMaxDecimals('stars', 6), 0)
assert.equal(personalRatingMaxDecimals('stars', 11), 1)
assert.equal(personalRatingMaxDecimals('stars', 21), 2)
assert.equal(personalRatingMaxDecimals('numeric', 11), 0)
assert.equal(personalRatingMaxDecimals('numeric', 21), 1)
assert.equal(personalRatingMaxDecimals('numeric', 41), 2)

// Trailing zero trimming & badge formatting
assert.equal(formatPersonalRatingNumber(8.0, 2), '8')
assert.equal(formatPersonalRatingNumber(8.5, 2), '8.5')
assert.equal(formatPersonalRatingNumber(8.25, 2), '8.25')
assert.equal(formatPersonalRatingBadge(8, 'stars', 11), '4/5')
assert.equal(formatPersonalRatingBadge(7, 'stars', 11), '3.5/5')
assert.equal(formatPersonalRatingBadge(7.5, 'stars', 21), '3.75/5')
assert.equal(formatPersonalRatingBadge(8, 'numeric', 11), '8')
assert.equal(formatPersonalRatingBadge(8.5, 'numeric', 21), '8.5')
assert.equal(formatPersonalRatingBadge(8.25, 'numeric', 41), '8.25')
// Read-only badge formatting preserves off-grid stored scores without snapping or losing precision
assert.equal(formatPersonalRatingBadge(7.3, 'stars', 21), '3.65/5')
assert.equal(formatPersonalRatingBadge(7.3, 'numeric', 21), '7.3')
assert.equal(formatPersonalRatingBadge(8.5, 'numeric', 11), '8.5')
assert.equal(formatPersonalRatingBadge(9, 'stars', 6), '4.5/5')
assert.equal(formatPersonalRatingBadge(2.01, 'stars', 21), '1.01/5')

// Grid snapping & stepping
assert.equal(snapPersonalRatingToGrid(7.3, 'stars', 21), 7.5)
assert.equal(stepPersonalRatingUp(7, 'stars', 21), 7.5)
assert.equal(stepPersonalRatingDown(7, 'stars', 21), 6.5)
assert.equal(stepPersonalRatingUp(7, 'numeric', 41), 7.25)
assert.equal(stepPersonalRatingDown(7, 'numeric', 41), 6.75)

// Star rating label fractions
assert.equal(starRatingLabel(7, 6), '★★★★')
assert.equal(starRatingLabel(7, 11), '★★★½')
assert.equal(starRatingLabel(6.5, 21), '★★★¼')
assert.equal(starRatingLabel(7.5, 21), '★★★¾')
