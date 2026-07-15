import {useEffect, useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {SpottableDiv} from '../PlayerConstants';

import css from './LyricsPanel.module.less';

// Follows playback on its own, but once focus is inside, every line becomes
// selectable so the remote can seek straight to a lyric.
const LyricsPanel = ({lines, activeIndex, isLoading, error, isSynced, isFocusable, onSeekToLine}) => {
	const scrollerRef = useRef(null);

	// Park the active line a third of the way down rather than dead centre.
	useEffect(() => {
		if (isFocusable || activeIndex < 0 || !scrollerRef.current) return;
		const container = scrollerRef.current;
		const el = container.querySelector(`[data-lyric-index="${activeIndex}"]`);
		if (!el) return;
		// scrollIntoView options are unsupported on webOS 2 and old WebKit
		container.scrollTop = el.offsetTop - (container.clientHeight * 0.3) + (el.offsetHeight / 2);
	}, [activeIndex, isFocusable]);

	const handleFocusLine = useCallback((e) => {
		const container = scrollerRef.current;
		const el = e.currentTarget;
		if (!container || !el) return;
		container.scrollTop = el.offsetTop - (container.clientHeight / 2) + (el.offsetHeight / 2);
	}, []);

	const handleSelectLine = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.lyricIndex, 10);
		const line = lines[index];
		if (line && typeof line.startSeconds === 'number') onSeekToLine?.(line.startSeconds);
	}, [lines, onSeekToLine]);

	if (isLoading) return <div className={css.message}>{$L('Loading lyrics...')}</div>;
	if (error) return <div className={css.message}>{error}</div>;
	if (!lines.length) return <div className={css.message}>{$L('No lyrics available')}</div>;

	return (
		<div className={`${css.panel} ${isFocusable ? css.panelCursor : ''}`} ref={scrollerRef}>
			{lines.map((line, index) => {
				const isActive = index === activeIndex;
				if (isFocusable) {
					return (
						<SpottableDiv
							key={index}
							className={css.cursorLine}
							data-lyric-index={index}
							onClick={handleSelectLine}
							onFocus={handleFocusLine}
						>
							{line.text}
						</SpottableDiv>
					);
				}
				return (
					<p
						key={index}
						className={`${css.line} ${isActive ? css.lineActive : ''} ${isSynced ? '' : css.lineUnsynced}`}
						data-lyric-index={index}
					>
						{line.text}
					</p>
				);
			})}
		</div>
	);
};

export default LyricsPanel;
