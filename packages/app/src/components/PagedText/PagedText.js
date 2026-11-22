import {useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';

import {KEYS} from '../../utils/keys';
import {animateScrollTop} from '../../utils/focusScroll';

const SpottableDiv = Spottable('div');

// One press moves this share of what's visible, so a few lines stay on screen to read on from.
const PAGE_SHARE = 0.8;

// Long text with nothing in it to focus takes focus itself, so Up and Down page through it. At
// either end the press carries on as usual.
const PagedText = ({children, ...rest}) => {
	const handleKeyDown = useCallback((ev) => {
		const down = ev.keyCode === KEYS.DOWN;
		if (!down && ev.keyCode !== KEYS.UP) return;
		const box = ev.currentTarget;
		const step = box.clientHeight * PAGE_SHARE;
		const target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + (down ? step : -step)));
		if (Math.abs(target - box.scrollTop) < 1) return;
		ev.preventDefault();
		ev.stopPropagation();
		animateScrollTop(box, target, 180);
	}, []);

	return <SpottableDiv {...rest} onKeyDown={handleKeyDown}>{children}</SpottableDiv>;
};

export default PagedText;
