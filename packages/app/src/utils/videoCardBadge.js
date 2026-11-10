import {formatPlaybackDuration} from './playbackTimeLabels';

// Home video and photo libraries mix clips in with photos, and a clip's art is a still frame, so
// its card says it's a video. Movies and episodes don't need telling.
export const showsVideoBadge = (item) => item?.Type === 'Video';

// The clip's length as `m:ss`, or an empty string when the server doesn't know it.
export const videoBadgeDuration = (item) => (item?.RunTimeTicks > 0 ? formatPlaybackDuration(item.RunTimeTicks / 10000000) : '');
