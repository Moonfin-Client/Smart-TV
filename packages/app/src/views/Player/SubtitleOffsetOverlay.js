import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useCallback, useEffect, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';
import {buildSubtitleTimeline} from './subtitleTimeline';

import css from './Player.module.less';

const SpottableButton = Spottable('button');

const OffsetContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

const stopPropagation = (e) => e.stopPropagation();

const SubtitleOffsetOverlay = ({visible, currentOffset, currentTime, subtitleTrackEvents, onClose, onOffsetChange}) => {
	const timeline = useMemo(
		() => (visible ? buildSubtitleTimeline(subtitleTrackEvents, currentTime, currentOffset) : null),
		[visible, subtitleTrackEvents, currentTime, currentOffset]
	);

	const handleIncrease = useCallback(() => {
		onOffsetChange(Math.round((currentOffset + 0.1) * 10) / 10);
	}, [currentOffset, onOffsetChange]);

	const handleDecrease = useCallback(() => {
		onOffsetChange(Math.round((currentOffset - 0.1) * 10) / 10);
	}, [currentOffset, onOffsetChange]);

	const handleReset = useCallback(() => {
		onOffsetChange(0);
	}, [onOffsetChange]);

	useEffect(() => {
		if (visible) {
			setTimeout(() => {
				Spotlight.focus('offset-reset');
			}, 100);
		}
	}, [visible]);

	useEffect(() => {
		if (!visible) return;

		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [visible, onClose]);

	if (!visible) return null;

	return (
		<div className={css.trackModal} onClick={onClose}>
			<OffsetContainer
				className={`${css.modalContent} ${css.offsetModal}${timeline ? ` ${css.offsetModalWide}` : ''}`}
				onClick={stopPropagation}
				spotlightId="offset-modal"
			>
				<h2 className={css.modalTitle}>{$L('Subtitle Offset')}</h2>
				<div className={css.offsetControls}>
					<SpottableButton
						className={css.offsetBtn}
						onClick={handleDecrease}
						spotlightId="offset-decrease"
					>
						−
					</SpottableButton>
					<div className={css.offsetDisplay}>
						{currentOffset > 0 ? '+' : ''}{currentOffset.toFixed(1)}s
					</div>
					<SpottableButton
						className={css.offsetBtn}
						onClick={handleIncrease}
						spotlightId="offset-increase"
					>
						+
					</SpottableButton>
				</div>
				{timeline ? (
					<div className={css.timeline}>
						<div className={css.timelineRuler}>
							{timeline.markers.map((marker) => (
								<span
									key={marker.time}
									className={css.timelineMarker}
									style={{left: `${marker.left}%`}}
								>
									{marker.label}
								</span>
							))}
						</div>
						<div className={css.timelineTrack}>
							{timeline.bars.map((bar) => (
								<div
									key={bar.key}
									className={bar.isActive ? `${css.timelineEvent} ${css.timelineEventActive}` : css.timelineEvent}
									style={{left: `${bar.left}%`, width: `${bar.width}%`}}
								>
									<span className={css.timelineEventText}>{bar.text}</span>
								</div>
							))}
							<div className={css.timelinePlayhead} style={{left: `${timeline.playheadLeft}%`}} />
						</div>
					</div>
				) : null}
				<div className={css.offsetActions}>
					<SpottableButton
						className={css.actionBtn}
						onClick={handleReset}
						spotlightId="offset-reset"
						data-spot-default="true"
					>
						{$L('Reset')}
					</SpottableButton>
				</div>
				<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="offset-close">
					{$L('Press BACK to close')}
				</SpottableButton>
			</OffsetContainer>
		</div>
	);
};

export default SubtitleOffsetOverlay;
