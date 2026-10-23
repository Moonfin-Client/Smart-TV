import {useCallback} from 'react';
import $L from '@enact/i18n/$L';

import {ModalContainer} from '../../utils/spotlightContainers';
import TrackOptionRow from '../../components/TrackOptionRow';

import css from './CollectionSortDialog.module.less';

const CollectionSortDialog = ({options = [], active, onSelect, onClose}) => {
	const stopPropagation = useCallback((ev) => ev.stopPropagation(), []);

	const handleClick = useCallback((ev) => {
		const id = ev.currentTarget.dataset.sortId;
		if (id) onSelect?.(id);
	}, [onSelect]);

	return (
		<div className={css.sortOverlay} onClick={onClose}>
			<ModalContainer
				className={css.sortPanel}
				onClick={stopPropagation}
				spotlightId="collection-sort-modal"
			>
				<h2 className={css.sortTitle}>{$L('Playlist Sort Options')}</h2>
				<div className={css.sortList}>
					{options.map((option) => (
						<TrackOptionRow
							key={option.id}
							label={option.label}
							selected={option.id === active}
							data-sort-id={option.id}
							onClick={handleClick}
						/>
					))}
				</div>
			</ModalContainer>
		</div>
	);
};

export default CollectionSortDialog;
