// Focus moves the detail screen has to make itself, because the rows here are plain
// scrolling divs rather than components that answer a 5-way press on their own. None of
// these read component state, so they are shared rather than rebuilt on every render.

import Spotlight from '@enact/spotlight';

import {KEYS} from '../../utils/keys';

import css from './Details.module.less';

export const handleSectionKeyDown = (ev) => {
	const currentSpottable = ev.target.closest('.spottable');
	if (!currentSpottable) return;

	if (ev.keyCode === KEYS.LEFT || ev.keyCode === KEYS.RIGHT) {
		const scroller = currentSpottable.closest(`.${css.sectionScroll}`) || currentSpottable.closest(`.${css.castScroller}`);
		if (!scroller) return; // Let MediaRow handle its own left/right

		const allCards = Array.from(scroller.querySelectorAll('.spottable'));
		const currentIdx = allCards.indexOf(currentSpottable);
		if (currentIdx === -1) return;

		const targetIdx = ev.keyCode === KEYS.LEFT ? currentIdx - 1 : currentIdx + 1;
		if (targetIdx < 0 || targetIdx >= allCards.length) return;

		ev.preventDefault();
		ev.stopPropagation();
		Spotlight.focus(allCards[targetIdx]);
	} else if (ev.keyCode === KEYS.UP) {
		const container = currentSpottable.closest(`.${css.sectionsContainer}`);
		if (!container) return;

		const currentRow = currentSpottable.closest(`.${css.section}`) || currentSpottable.closest('[data-row-index]') || currentSpottable.closest(`.${css.inlineRow}`);
		if (!currentRow) return;

		const allRows = Array.from(container.children);
		const currentIndex = allRows.indexOf(currentRow);

		if (currentIndex <= 0) {
			ev.preventDefault();
			ev.stopPropagation();
			Spotlight.focus('details-action-buttons');
		} else {
			const prevRow = allRows[currentIndex - 1];
			const prevSpottable = prevRow.querySelector('.spottable');
			if (prevSpottable) {
				ev.preventDefault();
				ev.stopPropagation();
				Spotlight.focus(prevSpottable);
			}
		}
	} else if (ev.keyCode === KEYS.DOWN) {
		const container = currentSpottable.closest(`.${css.sectionsContainer}`);
		if (!container) return;

		const currentRow = currentSpottable.closest(`.${css.section}`) || currentSpottable.closest('[data-row-index]');
		if (!currentRow) return;

		const allRows = Array.from(container.children);
		const currentIndex = allRows.indexOf(currentRow);

		if (currentIndex >= 0 && currentIndex < allRows.length - 1) {
			const nextRow = allRows[currentIndex + 1];
			const nextSpottable = nextRow.querySelector('.spottable');
			if (nextSpottable) {
				ev.preventDefault();
				ev.stopPropagation();
				Spotlight.focus(nextSpottable);
			}
		}
	}
};

export const handleButtonRowKeyDown = (ev) => {
	if (ev.keyCode === KEYS.LEFT || ev.keyCode === KEYS.RIGHT) {
		const container = ev.currentTarget;
		if (container && container.classList.contains(css.actionButtonsScroll)) {
			// Horizontal scroll mode steps one button at a time so the ones off screen can be
			// reached and scrolled into view. Either end of the row is left alone so the press
			// carries on out of it the way it always has, which is how a navbar docked to the
			// left stays reachable.
			const buttons = Array.from(container.querySelectorAll('.spottable'));
			const currentSpottable = ev.target.closest('.spottable');
			const currentIdx = buttons.indexOf(currentSpottable);
			if (currentIdx !== -1) {
				const targetIdx = ev.keyCode === KEYS.LEFT ? currentIdx - 1 : currentIdx + 1;
				if (targetIdx >= 0 && targetIdx < buttons.length) {
					ev.preventDefault();
					ev.stopPropagation();
					Spotlight.focus(buttons[targetIdx]);
				}
			}
		}
		return;
	}
	if (ev.keyCode !== KEYS.DOWN) return;
	ev.preventDefault();
	ev.stopPropagation();
	const sectionsContainer = document.querySelector(`.${css.sectionsContainer}`);
	if (sectionsContainer) {
		const firstSpottable = sectionsContainer.querySelector('.spottable');
		if (firstSpottable) {
			Spotlight.focus(firstSpottable);
		}
	}
};

export const handleSeasonButtonKeyDown = (ev) => {
	if (ev.keyCode !== KEYS.DOWN) return;
	ev.preventDefault();
	ev.stopPropagation();
	// Try episode list first (seasons), then track list (albums)
	const list = document.querySelector(`.${css.seasonEpisodesList}`) || document.querySelector(`.${css.trackList}`);
	if (list) {
		const firstSpottable = list.querySelector('.spottable');
		if (firstSpottable) {
			Spotlight.focus(firstSpottable);
		}
	}
};

// Keeps a focused card inside a plain horizontal scroller, which doesn't scroll itself.
export const handleScrollerFocus = (e) => {
	const card = e.target.closest('.spottable');
	const scroller = e.currentTarget;
	if (!card || !scroller) return;
	window.requestAnimationFrame(() => {
		const cardRect = card.getBoundingClientRect();
		const scrollerRect = scroller.getBoundingClientRect();
		if (cardRect.left < scrollerRect.left) {
			scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
		} else if (cardRect.right > scrollerRect.right) {
			scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
		}
	});
};
