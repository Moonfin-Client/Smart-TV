import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {createPortal} from 'react-dom';

import {OverlayContainer} from '../../utils/spotlightContainers';
import {SpottableButton} from './detailsSpottables';

import css from './Details.module.less';

// Sits on document.body rather than inside the page, so the detail screen's own stacking
// and scrolling can't end up on top of a playing trailer.
const TrailerOverlay = ({videoId, streamUrl, videoRef, muted, onClose, onKeyDown}) => {
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);

	if (!videoId) return null;

	const content = (
		<OverlayContainer className={css.trailerOverlay} onClick={onClose} onKeyDown={onKeyDown}>
			<SpottableButton className={css.trailerCloseBtn} onClick={onClose} spotlightId="trailer-close-btn">
				<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
				</svg>
			</SpottableButton>
			<div className={css.trailerIframeWrap} onClick={stopPropagation}>
				{streamUrl ? (
					// No src here, since Tizen plays YouTube's manifest through hls.js and
					// useDetailsTrailer attaches the stream either way
					<video
						ref={videoRef}
						className={css.trailerIframe}
						autoPlay
						controls
						playsInline
						muted={muted}
					/>
				) : (
					<div className={css.trailerLoading}>
						{$L('Loading trailer...')}
					</div>
				)}
			</div>
		</OverlayContainer>
	);

	if (typeof document !== 'undefined' && document.body) {
		return createPortal(content, document.body);
	}
	return content;
};

export default TrailerOverlay;
