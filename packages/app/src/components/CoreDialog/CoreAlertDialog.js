import Spottable from '@enact/spotlight/Spottable';
import {ModalContainer} from '../../utils/spotlightContainers';
import {portal, useDialogLayer} from './CoreDialog';

import css from './CoreDialog.module.less';

const SpottableButton = Spottable('button');

// A confirm with a title, a line or two, then text buttons along the bottom right. Each action is
// {label, onClick, spotlightId, destructive}.
const CoreAlertDialog = ({
	open,
	onClose,
	title,
	actions = [],
	spotlightId = 'core-alert',
	className,
	children
}) => {
	const handleScrimClick = useDialogLayer({open, onClose, spotlightId});

	if (!open) return null;

	return portal(
		<div className={css.scrim} onClick={handleScrimClick}>
			<ModalContainer spotlightId={spotlightId} className={`${css.alert} ${className || ''}`}>
				{title && <h2 className={css.alertTitle}>{title}</h2>}
				<div className={css.alertContent}>{children}</div>
				<div className={css.alertActions}>
					{actions.map((action) => (
						<SpottableButton
							key={action.spotlightId || action.label}
							data-spotlight-id={action.spotlightId}
							className={`${css.alertAction} ${action.destructive ? css.alertActionDestructive : ''}`}
							onClick={action.onClick}
						>
							{action.label}
						</SpottableButton>
					))}
				</div>
			</ModalContainer>
		</div>
	);
};

export default CoreAlertDialog;
