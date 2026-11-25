// The previews' fixed scores for every source the plugin sends, so the ratings draw without asking
// the server. Rotten Tomatoes wears the app's own fallback icon and the others their colored tile
// (public/icons/ratings/tile-<source>.webp), which RatingsRow picks up by name from iconUrl. Hand
// SAMPLE_RATINGS to RatingsRow as sampleRatings, with ratedSample(item) as its item.
import { buildDisplayRatings } from '../../../services/mdblistApi.js'

const SAMPLE_SCORES = [
  { source: 'imdb', value: 7.8, score: 78 },
  { source: 'tmdb', score: 76 },
  { source: 'trakt', score: 81 },
  { source: 'tomatoes', score: 91 },
  { source: 'tomatoes_audience', score: 88 },
  { source: 'metacritic', score: 74 },
  { source: 'metacriticuser', score: 71 },
  { source: 'letterboxd', value: 3.9 },
  { source: 'rogerebert', value: 3.5 },
  { source: 'myanimelist', value: 8.1 },
]

export const SAMPLE_RATINGS = buildDisplayRatings(SAMPLE_SCORES, '').map((rating) => ({
  ...rating,
  iconUrl: rating.source === 'tomatoes' ? (rating.score >= 60 ? 'rt-fallback-fresh.svg' : 'rt-fallback-rotten.svg') : `tile-${rating.source}.svg`,
}))

// The viewer's own score on the sample, which a liked thumb also reads from.
export const SAMPLE_USER_DATA = { Rating: 8 }

export const ratedSample = (item) => ({ Id: 'preview', Type: 'Movie', CommunityRating: item.communityRating, UserData: SAMPLE_USER_DATA })
