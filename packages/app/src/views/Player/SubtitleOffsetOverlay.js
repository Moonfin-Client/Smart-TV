import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useCallback, useEffect} from 'react';

import css from './Player.module.less';

const SpottableButton = Spottable('button');

const OffsetContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

const stopPropagation = (e) => e.stopPropagation();

const SubtitleOffsetOverlay = ({visible, currentOffset, onClose, onOffsetChange}) => {
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
			if (e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Backspace') {
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
				className={`${css.modalContent} ${css.offsetModal}`}
				onClick={stopPropagation}
				spotlightId="offset-modal"
			>
				<h2 className={css.modalTitle}>Subtitle Offset</h2>
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
				<div className={css.offsetActions}>
					<SpottableButton
						className={css.actionBtn}
						onClick={handleReset}
						spotlightId="offset-reset"
						data-spot-default="true"
					>
						Reset
					</SpottableButton>
				</div>
				<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="offset-close">
					Press BACK to close
				</SpottableButton>
			</OffsetContainer>
		</div>
	);
};

export default SubtitleOffsetOverlay;
