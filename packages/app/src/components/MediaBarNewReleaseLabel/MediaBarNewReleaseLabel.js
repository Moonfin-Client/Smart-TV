import $L from '@enact/i18n/$L';

import {NEW_EPISODES, NEW_SEASON, NEW_SERIES} from '../../utils/mediaBarNewRelease';

import css from './MediaBarNewReleaseLabel.module.less';

const LABELS = {
	[NEW_SERIES]: () => $L('New Series'),
	[NEW_SEASON]: () => $L('New Season'),
	[NEW_EPISODES]: () => $L('New Episodes')
};

const detailOf = ({kind, season, episode}) => {
	if (kind !== NEW_EPISODES) return $L('Season {number}').replace('{number}', season);
	return episode == null ? null : `S${season}:E${episode}`;
};

// White rather than the accent, which means focus on the media bar.
const MediaBarNewReleaseLabel = ({release, small}) => {
	if (!release || !LABELS[release.kind]) return null;
	const detail = detailOf(release);
	return (
		<div className={`${css.release} ${detail ? css.withDetail : ''} ${small ? css.small : ''}`}>
			<span className={css.label}>{LABELS[release.kind]()}</span>
			{detail && <span className={css.detail}>{detail}</span>}
		</div>
	);
};

export default MediaBarNewReleaseLabel;
