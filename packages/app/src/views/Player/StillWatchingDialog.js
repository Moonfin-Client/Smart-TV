import $L from '@enact/i18n/$L';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {SpottableButton} from './PlayerConstants';
import {useOverlayFocus} from './overlayParts';
import {registerThemeSheet} from '../../theme/themeOverrides';

import css from './StillWatchingDialog.module.less';

registerThemeSheet('stillWatching', css);

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

/**
 * Interrupts a run of episodes that started themselves, so an unattended TV stops
 * rather than working its way through a series.
 */
const StillWatchingDialog = ({onContinue, onStop}) => {
	useOverlayFocus('still-watching-continue');

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.card} spotlightId="still-watching-dialog">
				<div className={css.icon}>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path fill="none" stroke="currentColor" strokeWidth="1.8" d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7z" />
						<circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
					</svg>
				</div>
				<div className={css.title}>{$L('Still Watching?')}</div>
				<div className={css.body}>{$L('Playback has been paused. Are you still watching?')}</div>
				<SpottableButton className={css.continueBtn} onClick={onContinue} data-spot-default="true" spotlightId="still-watching-continue">
					{$L('Continue')}
				</SpottableButton>
				<SpottableButton className={css.stopBtn} onClick={onStop} spotlightId="still-watching-stop">
					{$L('Stop')}
				</SpottableButton>
			</DialogContainer>
		</div>
	);
};

export default StillWatchingDialog;
