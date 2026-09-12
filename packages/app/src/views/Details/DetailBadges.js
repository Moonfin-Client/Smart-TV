// The favourite and watched marks drawn over a poster or an episode thumbnail.

import css from './Details.module.less';

const WATCHED_CHECK_PATH = 'M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z';
const WATCHED_CHECK_COMPACT_PATH = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';

export const FavoriteHeartIcon = () => (
	<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
);

export const WatchedCheckIcon = ({compact = false, width, height}) => (
	<svg viewBox="0 0 24 24" fill="currentColor" width={width} height={height}>
		<path d={compact ? WATCHED_CHECK_COMPACT_PATH : WATCHED_CHECK_PATH} />
	</svg>
);

export const PosterBadges = ({userData}) => (
	<>
		{userData?.IsFavorite && (
			<div className={css.posterBadgeFavorite}>
				<FavoriteHeartIcon />
			</div>
		)}
		{userData?.Played && (
			<div className={css.posterBadgeWatched}>
				<WatchedCheckIcon compact />
			</div>
		)}
	</>
);
