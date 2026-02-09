import { useState, useEffect, useCallback } from 'react';
import { Spotlight } from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import css from './Player.module.less';

const SpottableButton = Spottable('button');

const SubtitleOffsetOverlay = ({ visible, currentOffset, onClose, onOffsetChange }) => {
    const [offset, setOffset] = useState(currentOffset || 0);

    // Update local state when prop changes, but don't trigger focus reset
    useEffect(() => {
        setOffset(currentOffset || 0);
    }, [currentOffset]);

    useEffect(() => {
        if (visible) {
            // Restore focus to the close button or a reasonable default when opening
            // Use a short timeout to ensure the DOM is ready
            setTimeout(() => {
                Spotlight.focus('subtitle-offset-reset');
            }, 100);
        }
    }, [visible]);

    const handleIncrease = useCallback(() => {
        const newOffset = offset + 0.1;
        setOffset(Number(newOffset.toFixed(1)));
        onOffsetChange(Number(newOffset.toFixed(1)));
    }, [offset, onOffsetChange]);

    const handleDecrease = useCallback(() => {
        const newOffset = offset - 0.1;
        setOffset(Number(newOffset.toFixed(1)));
        onOffsetChange(Number(newOffset.toFixed(1)));
    }, [offset, onOffsetChange]);

    const handleReset = useCallback(() => {
        setOffset(0);
        onOffsetChange(0);
    }, [onOffsetChange]);

    const handleStopPropagation = useCallback((e) => e.stopPropagation(), []);

    if (!visible) return null;

    return (
        <div className={css.trackModal} onClick={onClose}>
            <div
                className={`${css.modalContent} ${css.offsetModal}`}
                onClick={handleStopPropagation}
                data-modal="subtitle-offset"
                data-spotlight-id="subtitle-offset-container"
            >
                <h2 className={css.modalTitle}>Subtitle Offset</h2>

                <div className={css.offsetControls}>
                    <SpottableButton
                        spotlightId="subtitle-offset-decrease"
                        className={css.offsetBtn}
                        onClick={handleDecrease}
                        aria-label="Decrease Offset"
                    >
                        -
                    </SpottableButton>

                    <div className={css.offsetDisplay}>
                        {(offset > 0 ? '+' : '') + offset.toFixed(1)}s
                    </div>

                    <SpottableButton
                        spotlightId="subtitle-offset-increase"
                        className={css.offsetBtn}
                        onClick={handleIncrease}
                        aria-label="Increase Offset"
                    >
                        +
                    </SpottableButton>
                </div>

                <div className={css.offsetActions}>
                    <SpottableButton
                        spotlightId="subtitle-offset-reset"
                        className={css.actionBtn}
                        onClick={handleReset}
                    >
                        Reset
                    </SpottableButton>
                </div>

                <p className={css.modalFooter}>
                    <SpottableButton
                        spotlightId="subtitle-offset-close"
                        className={css.closeBtn}
                        onClick={onClose}
                    >
                        Close
                    </SpottableButton>
                </p>
            </div>
        </div>
    );
};

export default SubtitleOffsetOverlay;
