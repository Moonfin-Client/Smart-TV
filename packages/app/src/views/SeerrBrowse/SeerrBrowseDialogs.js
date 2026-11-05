import Spottable from '@enact/spotlight/Spottable';

import {portal, useDialogLayer} from '../../components/CoreDialog';
import {MaterialIcon} from '../../components/icons/materialIcons';
import {ModalContainer} from '../../utils/spotlightContainers';

import css from './SeerrBrowseDialogs.module.less';

// The pieces of the browse screen's sort and settings dialogs. Unlike the shared dialog panel,
// the title here scrolls away with the list, and focus lands on the first row.

const SpottableDiv = Spottable('div');

export const BrowseDialog = ({open, onClose, spotlightId, children}) => {
	const handleScrimClick = useDialogLayer({open, onClose, spotlightId});

	if (!open) return null;

	return portal(
		<div className={css.scrim} onClick={handleScrimClick}>
			<ModalContainer spotlightId={spotlightId} className={css.panel}>
				{children}
			</ModalContainer>
		</div>
	);
};

export const DialogTitle = ({children}) => <div className={css.title}>{children}</div>;

export const DialogSubtitle = ({children}) => <div className={css.subtitle}>{children}</div>;

export const DialogDivider = () => <div className={css.divider} />;

export const SectionHeader = ({children}) => <div className={css.sectionHeader}>{children}</div>;

export const RadioTile = ({label, selected, trailing, ...rest}) => (
	<SpottableDiv {...rest} className={css.tile}>
		<span className={`${css.radio} ${selected ? css.markOn : ''}`}>
			{selected && <span className={css.radioDot} />}
		</span>
		<span className={`${css.tileLabel} ${selected ? css.tileLabelOn : ''}`}>{label}</span>
		{trailing}
	</SpottableDiv>
);

export const CheckTile = ({label, checked, ...rest}) => (
	<SpottableDiv {...rest} className={css.tile}>
		<span className={`${css.check} ${checked ? css.markOn : ''}`}>
			{checked && <MaterialIcon name="check" className={css.checkGlyph} />}
		</span>
		<span className={`${css.tileLabel} ${css.checkLabel} ${checked ? css.tileLabelOn : ''}`}>{label}</span>
	</SpottableDiv>
);

export const ExpanderTile = ({label, count, expanded, ...rest}) => (
	<SpottableDiv {...rest} className={`${css.tile} ${css.expander}`}>
		<span className={css.expanderLabel}>{label}</span>
		{count > 0 && <span className={css.expanderCount}>{count}</span>}
		<MaterialIcon name={expanded ? 'expandLess' : 'expandMore'} className={css.expanderIcon} />
	</SpottableDiv>
);

export const ClearFiltersTile = ({label, ...rest}) => (
	<SpottableDiv {...rest} className={`${css.tile} ${css.clear}`}>
		<MaterialIcon name="filterAltOff" className={css.clearIcon} />
		<span>{label}</span>
	</SpottableDiv>
);

export const SortArrow = ({ascending}) => (
	<MaterialIcon name={ascending ? 'arrowUpward' : 'arrowDownward'} className={css.sortArrow} />
);
