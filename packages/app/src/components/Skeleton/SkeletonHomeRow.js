import {rem} from '../../utils/rootScale';
import {SkeletonBox, SkeletonShimmer} from './SkeletonShimmer';

import css from './Skeleton.module.less';

// A row of placeholder cards while a home row's items are on their way. The row hands in its
// own item class so the cards keep the spacing real ones would have.
const SkeletonHomeRow = ({className, cardWidth, imageHeight, isModern, count = 8}) => (
	<SkeletonShimmer className={className}>
		{Array.from({length: count}, (_, i) => (
			<div key={i} className={css.homeCard} style={{width: rem(cardWidth)}}>
				<SkeletonBox width={rem(cardWidth)} height={rem(imageHeight)} radius={isModern ? 12 : 8} />
				<SkeletonBox className={isModern ? css.modernTitleBar : css.classicTitleBar} width={rem(cardWidth * 0.75)} radius={4} />
				{isModern && <SkeletonBox className={css.modernSubtitleBar} width={rem(cardWidth * 0.5)} radius={4} />}
			</div>
		))}
	</SkeletonShimmer>
);

// Title bars as long as the other clients draw them for a screen of loading rows, grown to fit
// this app's larger row titles.
export const skeletonTitleWidths = (count, step) =>
	Array.from({length: count}, (_, i) => ((140 + (step * i)) * 1.75) / 24 + 'rem');

// Stands in for a row's title while the rows themselves aren't known yet.
export const SkeletonRowTitle = ({className, width}) => (
	<div className={className}>
		<SkeletonBox className={css.rowTitleBar} width={width} radius={4} />
	</div>
);

export default SkeletonHomeRow;
