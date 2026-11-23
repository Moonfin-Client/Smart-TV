import {Scroller} from '@enact/sandstone/Scroller';

import {sideOffsetClass} from './sideNavRoom';

import css from './Details.module.less';

// The frame every detail screen sits in. The scroller ref and cbScrollTo come from the view
// so the action row can send the page back to the top when it takes focus.
const DetailScrollPage = ({backdrop, scrollerRef, onScrollTo, footer, sideRoom, children}) => (
	<div className={css.page}>
		{backdrop}
		<Scroller ref={scrollerRef} cbScrollTo={onScrollTo} className={css.scroller} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden">
			<div className={`${css.content} ${sideOffsetClass(sideRoom, css)}`}>
				{children}
			</div>
		</Scroller>
		{footer}
	</div>
);

export default DetailScrollPage;
