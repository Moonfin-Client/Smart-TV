import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaCard from '../../components/MediaCard';
import {keepFocusInView} from '../../utils/focusScroll';

import css from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
// Coming back to a shelf lands on the card it was left on.
const ShelfRow = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const SHELF_CARD = {width: 168, height: 168};

// A titled block of stops, with a See All at the right of the title when there's somewhere for
// it to go. The arrows in the block go through `onKeyDown` and the See All's through
// `onSeeAllKeyDown`.
export const MusicSection = ({title, sectionRef, bodyClassName, seeAllId, onSeeAll, onSeeAllKeyDown, onKeyDown, shelf, children}) => (
	<div className={shelf ? css.shelf : css.section} ref={sectionRef}>
		<div className={css.sectionHeader}>
			<h2 className={css.sectionTitle}>{title}</h2>
			{onSeeAll && (
				<SpottableDiv className={css.seeAll} spotlightId={seeAllId} onClick={onSeeAll} onKeyDown={onSeeAllKeyDown}>
					{$L('See All')}
				</SpottableDiv>
			)}
		</div>
		<div className={bodyClassName} onKeyDown={onKeyDown}>{children}</div>
	</div>
);

export const shelfSeeAllId = (rowId) => `music-see-all-${rowId}`;

// A row of square cards under its title, with artists drawn round. `seeAllTarget` names the screen
// its See All opens, if it has one.
export const MusicShelf = ({row, rowIndex, serverUrl, onSelectItem, registerRowRef, seeAllTarget, onOpenGrid, ...keys}) => {
	const sectionRef = useCallback((el) => registerRowRef(rowIndex, el), [registerRowRef, rowIndex]);
	const handleSeeAll = useCallback(() => onOpenGrid(seeAllTarget), [onOpenGrid, seeAllTarget]);
	return (
		<MusicSection
			title={row.title}
			shelf
			sectionRef={sectionRef}
			seeAllId={shelfSeeAllId(row.id)}
			onSeeAll={seeAllTarget ? handleSeeAll : null}
			{...keys}
		>
			<ShelfRow className={css.shelfRow} spotlightId={`row-${rowIndex}`} onFocus={keepFocusInView}>
				{row.items.map((item) => (
					<MediaCard
						key={item.Id}
						item={item}
						serverUrl={serverUrl}
						cardType={row.cardType}
						onSelect={onSelectItem}
						spotlightId={`media-${row.id}-${item.Id}`}
						size={SHELF_CARD}
					/>
				))}
			</ShelfRow>
		</MusicSection>
	);
};
