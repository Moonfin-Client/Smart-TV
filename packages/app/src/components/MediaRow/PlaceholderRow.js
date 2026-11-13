import {SkeletonHomeRow, SkeletonRowTitle} from '../Skeleton';

// A section still loading draws its title over placeholder cards, and a bar in place of the title
// while the rows themselves aren't known yet. Each row style hands in its own classes, so the
// placeholder keeps the spacing its real row will have, and anything the row draws under its cards.
const PlaceholderRow = ({classes, className, style, title, titleWidth, subtitle, cardWidth, imageHeight, isModern, children}) => (
	<div className={className} style={style}>
		{title ? <h2 className={classes.title}>{title}</h2> : <SkeletonRowTitle className={classes.title} width={titleWidth} />}
		{subtitle && <div className={classes.subtitle}>{subtitle}</div>}
		<div className={classes.scroller}>
			<SkeletonHomeRow className={classes.items} cardWidth={cardWidth} imageHeight={imageHeight} isModern={isModern} />
		</div>
		{children}
	</div>
);

export default PlaceholderRow;
