import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {getImageUrl} from '../../../utils/helpers';
import {SpottableDiv} from '../PlayerConstants';

import css from './QueuePanel.module.less';

const IconEqualizer = () => (
	<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
		<path d="M4 20h3V10H4v10zm6 0h3V4h-3v16zm6 0h3v-7h-3v7z" />
	</svg>
);

const artistOf = (track) => track?.AlbumArtist || track?.Artists?.[0] || track?.Album || '';

const QueueRow = ({track, isCurrent, serverUrl, focusDisabled, onSelect, onFocusRow}) => {
	const artId = track.AlbumId || track.Id;
	const artUrl = artId ? getImageUrl(track._serverUrl || serverUrl, artId, 'Primary', {maxHeight: 96}) : null;

	const handleClick = useCallback(() => onSelect(track), [onSelect, track]);
	const handleFocus = useCallback((e) => onFocusRow(e.currentTarget), [onFocusRow]);

	return (
		<SpottableDiv
			className={`${css.row} ${isCurrent ? css.rowCurrent : ''}`}
			spotlightDisabled={focusDisabled}
			onClick={handleClick}
			onFocus={handleFocus}
		>
			<div className={css.thumb}>
				{artUrl
					? <img className={css.thumbImg} src={artUrl} alt="" loading="lazy" />
					: <div className={css.thumbPlaceholder} />}
			</div>
			<div className={css.rowText}>
				<div className={css.rowTitle}>{track.Name}</div>
				<div className={css.rowArtist}>{artistOf(track)}</div>
			</div>
			{isCurrent && <div className={css.rowIcon}><IconEqualizer /></div>}
		</SpottableDiv>
	);
};

// The Up Next list. Rows are focusable so the remote's 5-way walks them, and the
// container traps focus until left or back takes it back to the tabs.
const QueuePanel = ({items, currentId, serverUrl, focusDisabled, onSelectTrack, scrollerRef}) => {
	const handleFocusRow = useCallback((el) => {
		const container = scrollerRef?.current;
		if (!container || !el) return;
		// scrollIntoView options are unsupported on webOS 2 and old WebKit
		container.scrollTop = el.offsetTop - (container.clientHeight / 2) + (el.offsetHeight / 2);
	}, [scrollerRef]);

	if (!items || items.length === 0) {
		return <div className={css.empty}>{$L('The queue is empty')}</div>;
	}

	return (
		<div className={css.list} ref={scrollerRef}>
			{items.map((track) => (
				<QueueRow
					key={track.Id}
					track={track}
					isCurrent={track.Id === currentId}
					serverUrl={serverUrl}
					focusDisabled={focusDisabled}
					onSelect={onSelectTrack}
					onFocusRow={handleFocusRow}
				/>
			))}
		</div>
	);
};

export default QueuePanel;
