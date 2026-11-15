import {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import * as playback from '../../services/playback';
import {getHostAudioOutput, getHostDisplay} from '../../services/video';
import {animateScrollTop} from '../../utils/focusScroll';
import {getPerfTier} from '../../utils/perfTier';
import {buildPlaybackInfo} from '../../utils/playbackInfo';
import {rootScale} from '../../utils/rootScale';
import {ModalContainer} from '../../utils/spotlightContainers';
import {KEYS} from '../../utils/keys';
import {SpottableDiv} from './PlayerConstants';

import css from './PlaybackInfoModal.module.less';

const SCROLL_STEP = 200;
const SCROLL_MS = 120;
const THUMB_MIN = 40;

const stopPropagation = (e) => e.stopPropagation();

// The list holds focus instead of its rows, so Up and Down scroll it, OK closes it and Back is left to the player.
const PlaybackInfoModal = ({
	playMethod, selectedAudioIndex, selectedSubtitleIndex, maxBitrate, transcodeForced,
	isLiveTV, item, liveProgram, isTizen, videoRef, onClose
}) => {
	const [hostAudioOutput, setHostAudioOutput] = useState(null);
	const [transcodingInfo, setTranscodingInfo] = useState(null);
	const [thumbHeight, setThumbHeight] = useState(0);
	const listRef = useRef(null);
	const thumbRef = useRef(null);

	// Asked each time the dialog opens, since a track change can change both, and the rows go without
	// them until they answer.
	useEffect(() => {
		let current = true;
		getHostAudioOutput().then((output) => {
			if (current) setHostAudioOutput(output);
		});
		playback.getTranscodingInfo().then((info) => {
			if (current) setTranscodingInfo(info);
		});
		return () => {
			current = false;
		};
	}, []);

	const sections = useMemo(() => {
		const session = playback.getCurrentSession();
		const video = videoRef?.current;
		// Only where the platform says the web player's count is worth reading
		const quality = session?.capabilities?.watchesDroppedFrames && typeof video?.getVideoPlaybackQuality === 'function'
			? video.getVideoPlaybackQuality()
			: null;
		return buildPlaybackInfo({
			session, playMethod, selectedAudioIndex, selectedSubtitleIndex, maxBitrate, transcodeForced,
			isLiveTV, item, liveProgram, isTizen, hostAudioOutput, transcodingInfo,
			hostDisplay: getHostDisplay(),
			droppedFrames: quality ? quality.droppedVideoFrames : null
		});
	}, [playMethod, selectedAudioIndex, selectedSubtitleIndex, maxBitrate, transcodeForced, isLiveTV, item, liveProgram, isTizen, hostAudioOutput, transcodingInfo, videoRef]);

	const placeThumb = useCallback(() => {
		const list = listRef.current;
		const thumb = thumbRef.current;
		if (!list || !thumb) return;
		const travel = list.scrollHeight - list.clientHeight;
		thumb.style.top = `${travel > 0 ? (list.scrollTop / travel) * (list.clientHeight - thumb.offsetHeight) : 0}px`;
	}, []);

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list || list.scrollHeight <= list.clientHeight) {
			setThumbHeight(0);
			return;
		}
		setThumbHeight(Math.max(THUMB_MIN * rootScale(), (list.clientHeight * list.clientHeight) / list.scrollHeight));
	}, [sections]);

	useLayoutEffect(placeThumb, [thumbHeight, placeThumb]);

	const handleKeyDown = useCallback((e) => {
		const list = listRef.current;
		if (!list || (e.keyCode !== KEYS.UP && e.keyCode !== KEYS.DOWN)) return;
		e.preventDefault();
		const step = (e.keyCode === KEYS.DOWN ? SCROLL_STEP : -SCROLL_STEP) * rootScale();
		const target = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + step));
		// Slower tiers jump instead of spending frames redrawing the list
		if (getPerfTier() === 'high') animateScrollTop(list, target, SCROLL_MS);
		else list.scrollTop = target;
	}, []);

	return (
		<div className={css.scrim} onClick={onClose}>
			<ModalContainer className={css.panel} onClick={stopPropagation} data-modal="info" spotlightId="info-modal">
				<h2 className={css.title}>{$L('Playback Information')}</h2>
				<div className={css.body}>
					<div ref={listRef} className={css.list} onScroll={placeThumb}>
						<SpottableDiv className={css.content} onKeyDown={handleKeyDown} onClick={onClose}>
							{sections.map((section) => (
								<div key={section.id}>
									<h3 className={css.header}>{section.title}</h3>
									{section.rows.map((row) => (row.note ? (
										<p key="note" className={css.note}>{row.note}</p>
									) : (
										<div key={row.label} className={css.row}>
											<span className={css.label}>{row.label}</span>
											<span className={`${css.value} ${row.bold ? css.bold : ''}`}>{row.value}</span>
										</div>
									)))}
								</div>
							))}
						</SpottableDiv>
					</div>
					{thumbHeight > 0 && <div ref={thumbRef} className={css.thumb} style={{height: `${thumbHeight}px`}} />}
				</div>
			</ModalContainer>
		</div>
	);
};

export default memo(PlaybackInfoModal);
