import $L from '@enact/i18n/$L';

import {NEW_EPISODES, NEW_MOVIE, NEW_SEASON, NEW_SERIES} from '../../utils/mediaBarNewRelease';

import css from './MediaBarNewReleaseLabel.module.less';

const LABELS = {
	[NEW_SERIES]: () => $L('New Series'),
	[NEW_SEASON]: () => $L('New Season'),
	[NEW_EPISODES]: () => $L('New Episodes'),
	[NEW_MOVIE]: () => $L('New Movie')
};

const detailOf = ({kind, season, episode}) => {
	if (kind === NEW_MOVIE) return null;
	if (kind !== NEW_EPISODES) return $L('Season {number}').replace('{number}', season);
	return episode == null ? null : `S${season}:E${episode}`;
};

// White rather than the accent, which means focus on the media bar. A new movie's tagline reads as a quote from
// its poster.
const MediaBarNewReleaseLabel = ({release, small}) => {
	if (!release || !LABELS[release.kind]) return null;
	const quote = release.kind === NEW_MOVIE ? release.tagline : null;
	const detail = detailOf(release);
	return (
		<div className={`${css.release} ${small ? css.small : ''}`}>
			<span className={css.label}>{LABELS[release.kind]()}</span>
			{quote && <span className={css.quote}>{quote}</span>}
			{detail && <span className={css.detail}>{detail}</span>}
		</div>
	);
};

export default MediaBarNewReleaseLabel;
