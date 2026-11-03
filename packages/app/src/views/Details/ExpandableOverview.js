import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';

import {KEYS} from '../../utils/keys';
import {cleanOverview} from '../../utils/overviewText';

import css from './ExpandableOverview.module.less';

const SpottableDiv = Spottable('div');

const SCROLL_STEP = 58;

// Each screen sets the copy to suit the room it has. Anything not named here reads at the size
// the box was built at.
const TEXT_VARIANTS = {classic: css.textClassic, nouveau: css.textNouveau, stage: css.textStage};

// The overview with a Read More toggle, shared by both detail styles. Text short
// enough for its four line clamp renders as plain copy. Longer text gets a
// focusable box that expands in place, capped at a fixed height the d-pad
// scrolls through.
const ExpandableOverview = ({text, itemId, className, variant, backRef, spotlightId}) => {
	const [canToggle, setCanToggle] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const textRef = useRef(null);

	// Keyed on the id so an in-place update to the same item doesn't collapse
	// the text.
	useEffect(() => {
		setIsExpanded(false);
		setCanToggle(false);
	}, [itemId]);

	const prose = useMemo(() => cleanOverview(text), [text]);

	useEffect(() => {
		const el = textRef.current;
		if (el && !isExpanded) {
			setCanToggle(el.scrollHeight > el.clientHeight);
		}
	}, [prose, isExpanded]);

	// Back closes the box in place rather than leaving the screen. The global
	// back handling runs in a capture listener, so this answers through the
	// screen's back chain instead of a key handler of its own.
	useEffect(() => {
		if (!backRef || !isExpanded) return undefined;
		const collapse = () => {
			setIsExpanded(false);
			return true;
		};
		backRef.current = collapse;
		return () => {
			if (backRef.current === collapse) backRef.current = null;
		};
	}, [backRef, isExpanded]);

	const handleToggle = useCallback(() => setIsExpanded((prev) => !prev), []);

	// While open, up and down page through the text instead of moving focus. Once
	// the text has run out in that direction the press belongs to whatever sits
	// above or below, otherwise the box holds focus and nothing can be reached.
	const handleKeyDown = useCallback((ev) => {
		if (!isExpanded) return;
		if (ev.keyCode !== KEYS.UP && ev.keyCode !== KEYS.DOWN) return;
		const el = ev.currentTarget;
		const down = ev.keyCode === KEYS.DOWN;
		const room = down
			? el.scrollHeight - el.clientHeight - el.scrollTop > 1
			: el.scrollTop > 1;
		if (!room) return;
		el.scrollTop += down ? SCROLL_STEP : -SCROLL_STEP;
		ev.preventDefault();
		ev.stopPropagation();
	}, [isExpanded]);

	if (!prose) return null;

	return (
		<SpottableDiv
			className={`${css.container} ${canToggle ? css.spottable : ''} ${canToggle && isExpanded ? css.expanded : ''} ${className || ''}`}
			onClick={canToggle ? handleToggle : null}
			onKeyDown={handleKeyDown}
			spotlightId={spotlightId}
			spotlightDisabled={!canToggle}
		>
			<p ref={textRef} className={`${css.text} ${TEXT_VARIANTS[variant] || ''} ${!isExpanded ? css.collapsed : ''}`}>
				{prose}
			</p>
			{canToggle && <div className={css.readMoreBtn}>{isExpanded ? $L('Read Less') : $L('Read More')}</div>}
		</SpottableDiv>
	);
};

export default ExpandableOverview;
