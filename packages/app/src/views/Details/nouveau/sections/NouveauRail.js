import {useCallback, useEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';

import {RowContainer} from '../../detailsSpottables';
import {KEYS} from '../../../../utils/keys';
import {expandedCardCount, initialCardCount} from '../../../../utils/rowWindow';
import useItemMenuHold from '../../../../hooks/useItemMenuHold';

import css from './NouveauSections.module.less';

// Room for the growth a focused card gains. Absorbing it in the track costs nothing per keypress,
// where correcting the scroll afterwards would cost a measurement every time.
const FOCUS_CLEARANCE = 20;

// How much of a card is kept clear of the edge once focus reaches it.
const SCROLL_CLEARANCE = 50;

// How near the end of a paged rail focus gets before the next page is asked for, far enough out
// that the cards have landed by the time they are reached.
const NEAR_END_CARDS = 8;

// One rail: a heading and a row of whatever the caller draws. The heading sits inside the rail so
// that bringing the rail's top into view necessarily brings its heading with it.
//
// Up and down belong to the page, so they are swallowed here and handed back through the callbacks.
// Left and right belong to the rail, and only its two edges need deciding. The gap comes from the
// caller because it isn't the same on every rail. A rail given `itemMenu`, true or the menu's
// options, opens a card's long press menu when OK is held on it.
const NouveauRail = ({
	title, items = [], spotlightId, renderItem, gap = 32,
	navbarPosition, onNavigateUp, onNavigateDown, onNearEnd, itemMenu
}) => {
	const trackRef = useRef(null);
	const rectRef = useRef(null);

	const itemAtCell = useCallback((target) => {
		const cell = target.closest('[data-card-index]');
		return cell ? items[parseInt(cell.getAttribute('data-card-index'), 10)] : null;
	}, [items]);
	const menuHold = useItemMenuHold(itemAtCell, itemMenu);

	// Held in a ref so asking for the next page doesn't rebuild the focus handler, which would throw
	// away the measurement it keeps.
	const nearEndRef = useRef(onNearEnd);
	nearEndRef.current = onNearEnd;

	// The rail opens with about a screen of cards and grows as focus nears the end of what is
	// mounted, so a long one is only built in full for somebody who walks through it. The usual ways
	// of deferring offscreen work landed long after the browsers these sets ship with, so without
	// this every card on the page fetches and decodes its artwork at once.
	const [visibleCount, setVisibleCount] = useState(() => initialCardCount(items.length));

	useEffect(() => {
		setVisibleCount(initialCardCount(items.length));
	}, [items.length]);

	// Measured once and kept, since reading it per focus would force a layout on every card.
	useEffect(() => {
		const invalidate = () => {
			rectRef.current = null;
		};
		window.addEventListener('resize', invalidate);
		return () => window.removeEventListener('resize', invalidate);
	}, []);

	useEffect(() => {
		rectRef.current = null;
	}, [navbarPosition]);

	const handleFocus = useCallback((ev) => {
		// A hovered card would otherwise make the rail chase the cursor.
		if (Spotlight.getPointerMode()) return;
		const track = trackRef.current;
		const cell = ev.target.closest('.spottable');
		if (!track || !cell) return;

		const indexed = ev.target.closest('[data-card-index]');
		if (indexed) {
			const index = Number(indexed.dataset.cardIndex);
			setVisibleCount((current) => expandedCardCount(current, index, items.length));
			if (items.length - index <= NEAR_END_CARDS) nearEndRef.current?.();
		}

		window.requestAnimationFrame(() => {
			if (!rectRef.current) rectRef.current = track.getBoundingClientRect();
			const view = rectRef.current;
			const box = cell.getBoundingClientRect();
			if (box.left < view.left + SCROLL_CLEARANCE) {
				track.scrollLeft -= view.left + SCROLL_CLEARANCE - box.left;
			} else if (box.right > view.right - SCROLL_CLEARANCE) {
				track.scrollLeft += box.right - view.right + SCROLL_CLEARANCE;
			}
		});
	}, [items.length]);

	const handleKeyDown = useCallback((ev) => {
		const {keyCode} = ev;

		if (keyCode === KEYS.UP || keyCode === KEYS.DOWN) {
			// Swallowed either way. Letting it through would hand the page to Spotlight, which
			// picks by geometry and lands somewhere the chain did not choose.
			ev.preventDefault();
			ev.stopPropagation();
			// The rail names itself, so the page can answer from one stable pair of handlers rather
			// than a fresh closure per rail. The chain grows as sections fill in behind the first
			// paint, and a handler bound to a rail would be holding an older one.
			if (keyCode === KEYS.UP) onNavigateUp?.(spotlightId);
			else onNavigateDown?.(spotlightId);
			return;
		}

		if (keyCode !== KEYS.LEFT && keyCode !== KEYS.RIGHT) return;

		const cells = Array.from(ev.currentTarget.querySelectorAll('.spottable'));
		const index = cells.indexOf(document.activeElement);
		if (index === -1) return;

		const atLeft = keyCode === KEYS.LEFT && index === 0;
		const atRight = keyCode === KEYS.RIGHT && index === cells.length - 1;
		if (!atLeft && !atRight) return;

		ev.preventDefault();
		ev.stopPropagation();

		// A docked sidebar is reached sideways rather than upwards, so the left edge is the way out
		// to it. With the bar along the top there is nothing out here, so the rail keeps the press
		// and wraps rather than letting focus fall off the end.
		if (atLeft && navbarPosition === 'left') {
			if (!Spotlight.focus('navbar')) Spotlight.move('left');
			return;
		}

		const target = atLeft ? cells[cells.length - 1] : cells[0];
		if (target) Spotlight.focus(target);
	}, [navbarPosition, onNavigateUp, onNavigateDown, spotlightId]);

	if (!items.length) return null;

	return (
		<RowContainer className={css.rail} spotlightId={spotlightId} onKeyDown={handleKeyDown}>
			{title && <h2 className={css.railTitle}>{title}</h2>}
			<div className={css.track} ref={trackRef} onFocus={handleFocus} {...(itemMenu ? menuHold : null)}>
				<div
					className={css.trackInner}
					style={{paddingTop: FOCUS_CLEARANCE, paddingBottom: FOCUS_CLEARANCE}}
				>
					{items.slice(0, visibleCount).map((item, index) => (
						<div
							key={item?.Id || `item-${index}`}
							className={css.cell}
							data-card-index={index}
							style={index ? {marginLeft: `${gap}px`} : undefined}
						>
							{renderItem(item, index)}
						</div>
					))}
				</div>
			</div>
		</RowContainer>
	);
};

export default NouveauRail;
