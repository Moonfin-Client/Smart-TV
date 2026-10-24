import {useCallback, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {ModalContainer} from '../../utils/spotlightContainers';
import TrackOptionRow, {TrackDivider} from '../TrackOptionRow';
import {isBackKey} from '../../utils/keys';

import css from './PersonDisplayOptionsModal.module.less';

const SORT_OPTIONS = [
	{key: 'alphabetical', label: () => $L('Alphabetical')},
	{key: 'releaseDateAsc', label: () => $L('Release Date (Ascending)')},
	{key: 'releaseDateDesc', label: () => $L('Release Date (Descending)')}
];

const PersonDisplayOptionsModal = ({
	open,
	onClose,
	sortOption = 'releaseDateDesc',
	onSelectSortOption,
	groupItems = false,
	onToggleGroupItems
}) => {
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);

	const handleKeyDown = useCallback((e) => {
		if (isBackKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			onClose?.();
		}
	}, [onClose]);

	const handleSelectSort = useCallback((key) => {
		onSelectSortOption?.(key);
	}, [onSelectSortOption]);

	useEffect(() => {
		if (open) {
			window.requestAnimationFrame(() => {
				const focusResult = Spotlight.focus('person-display-modal');
				if (!focusResult) {
					const selectedItem = document.querySelector('[data-modal="personDisplay"] [data-selected="true"]');
					const firstItem = document.querySelector('[data-modal="personDisplay"] button');
					if (selectedItem) {
						Spotlight.focus(selectedItem);
					} else if (firstItem) {
						Spotlight.focus(firstItem);
					}
				}
			});
		}
	}, [open]);

	if (!open) return null;

	return (
		<div className={css.modalOverlay} onClick={onClose} onKeyDown={handleKeyDown}>
			<ModalContainer
				className={css.modalPanel}
				onClick={stopPropagation}
				data-modal="personDisplay"
				spotlightId="person-display-modal"
			>
				<h2 className={css.modalTitle}>{$L('Display Options')}</h2>
				<div className={css.optionsList}>
					<div className={css.groupHeader}>{$L('Sort By')}</div>
					{SORT_OPTIONS.map((opt) => (
						<TrackOptionRow
							key={opt.key}
							label={opt.label()}
							selected={sortOption === opt.key}
							// eslint-disable-next-line react/jsx-no-bind
							onClick={() => handleSelectSort(opt.key)}
							spotlightId={`person-sort-${opt.key}`}
						/>
					))}

					<TrackDivider />

					<div className={css.groupHeader}>{$L('Group Contributions')}</div>
					<TrackOptionRow
						label={$L('Group multiple roles')}
						selected={Boolean(groupItems)}
						onClick={onToggleGroupItems}
						spotlightId="person-group-roles"
					/>

					<TrackDivider />

					<TrackOptionRow
						label={$L('Close')}
						dimmed
						onClick={onClose}
						spotlightId="person-display-close"
					/>
				</div>
			</ModalContainer>
		</div>
	);
};

export default PersonDisplayOptionsModal;
