import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {getImageUrl} from '../../utils/helpers';
import {MUSIC_FOCUS_IDS, HERO} from './musicFocus';

import css from './MusicHero.module.less';

const SpottableDiv = Spottable('div');

const IconPlay = () => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="32" height="32">
		<path d="M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z" />
	</svg>
);

const IconNote = () => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="64" height="64">
		<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v382q0 66-47 113t-113 47Z" />
	</svg>
);

const artFor = (item, serverUrl) => {
	const base = item?._serverUrl || serverUrl;
	if (item?.ImageTags?.Primary) return getImageUrl(base, item.Id, 'Primary', {maxHeight: 400, quality: 90});
	if (item?.AlbumId && item?.AlbumPrimaryImageTag) {
		return getImageUrl(base, item.AlbumId, 'Primary', {maxHeight: 400, quality: 90, tag: item.AlbumPrimaryImageTag});
	}
	return null;
};

// The banner over the rows offering whatever was played last. The whole card is
// the target, so the play circle is decoration rather than a second stop.
const MusicHero = ({item, subtitle, serverUrl, onSelect, onKeyDown, registerNode}) => {
	const artUrl = artFor(item, serverUrl);

	const handleClick = useCallback(() => onSelect?.(item), [onSelect, item]);
	const handleRef = useCallback((el) => registerNode(HERO, el), [registerNode]);

	return (
		<SpottableDiv
			className={css.hero}
			ref={handleRef}
			spotlightId={MUSIC_FOCUS_IDS[HERO]}
			onClick={handleClick}
			onKeyDown={onKeyDown}
		>
			<div className={css.art}>
				{artUrl
					? <img className={css.artImg} src={artUrl} alt={item?.Name} />
					: <div className={css.artPlaceholder}><IconNote /></div>}
			</div>
			<div className={css.info}>
				<div className={css.kicker}>{$L('JUMP BACK IN')}</div>
				<div className={css.name}>{item?.Name}</div>
				{subtitle && <div className={css.subtitle}>{subtitle}</div>}
			</div>
			<div className={css.play}><IconPlay /></div>
		</SpottableDiv>
	);
};

export default MusicHero;
