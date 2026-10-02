import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {createPortal} from 'react-dom';

import {OverlayContainer} from '../../utils/spotlightContainers';

import css from './Details.module.less';

// Sits on document.body rather than inside the page, so the detail screen's own stacking
// and scrolling can't end up on top of a playing trailer.
const TrailerOverlay = ({videoId, streamUrl, videoRef, muted, onClose, onKeyDown}) => {
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);

	if (!videoId) return null;

	const content = (
		<OverlayContainer className={css.trailerOverlay} onClick={onClose} onKeyDown={onKeyDown}>
			<div className={css.trailerCloseHint}>{$L('Press BACK to close')}</div>
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
