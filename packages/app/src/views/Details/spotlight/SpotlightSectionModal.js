import {useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {Scroller} from '@enact/sandstone/Scroller';

import {iconViewBox} from '../../../components/icons/iconViewBox';
import SpotlightSection from './SpotlightGrids';

import css from './SpotlightSectionModal.module.less';

// Focus stays inside while the modal is open, so a press at the edge of a grid has nowhere to
// leak out to and the detail screen underneath is never reachable by accident.
const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const FIRST_CELL_ID = 'spotlight-modal-first';

// How near the bottom the viewer has to be before the next page is asked for, counted in
// screenfuls so a long grid asks early enough to have the rows ready.
const NEAR_END_SCREENFULS = 1;

// Room left above a heading once it has been scrolled to, so it does not sit flush against
// the panel's divider.
const HEADING_CLEARANCE = 12;

// A focused card grows by a twentieth of its height, and the scroller only ever brings the
// unfocused box into view, so the grown edge needs room or it is clipped.
const CARD_CLEARANCE = 20;

const SpotlightSectionModal = ({card, serverUrl, actions, seerr, onNearEnd}) => {
	const nearEndRef = useRef(onNearEnd);
	nearEndRef.current = onNearEnd;

	// The remote lands on the first cell rather than the panel, so a press moves through the
	// content straight away. A section that draws no focusable cell of its own leaves the id
	// unclaimed, and the container's own entry rule picks something up instead.
	useEffect(() => {
		if (!card) return undefined;
		const timer = setTimeout(() => {
			if (!Spotlight.focus(FIRST_CELL_ID)) Spotlight.focus('spotlight-modal');
		}, 100);
		return () => clearTimeout(timer);
	}, [card]);

	const contentRef = useRef(null);
	const scrollToRef = useRef(null);
	const handleScrollTo = useCallback((fn) => {
		scrollToRef.current = fn;
	}, []);

	// Asks for the next page once the viewer is within a screenful of the bottom. The scroll
	// event carries the offset but not the size of what is being scrolled, so the content and
	// the window onto it are measured here.
	const handleScroll = useCallback((ev) => {
		const ask = nearEndRef.current;
		const content = contentRef.current;
		if (!ask || !content) return;
		const visible = content.parentElement?.clientHeight || 0;
		if (ev.scrollTop >= content.scrollHeight - visible * (1 + NEAR_END_SCREENFULS)) ask();
	}, []);

	// Enact brings a newly focused card into view by its unfocused box and stops flush against
	// the edge, which both hides the heading above the top row and clips the growth a focused
	// card gains. The scroll is corrected here once Enact has settled its own.
	const handleSectionFocus = useCallback((ev) => {
		const section = ev.currentTarget;
		const cell = ev.target.closest('.spottable');
		const content = contentRef.current;
		const scrollTo = scrollToRef.current;
		if (!cell || !content || !scrollTo) return;

		// Enact scrolls and clips at the wrapper it puts around the content, which is a little
		// inside the panel's own padding box.
		const viewport = content.parentElement;
		if (!viewport) return;
		const heading = section.firstElementChild;
		const grid = section.lastElementChild;

		window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			const contentTop = content.getBoundingClientRect().top;
			const view = viewport.getBoundingClientRect();
			const cellBox = cell.getBoundingClientRect();
			const scrolled = viewport.scrollTop;

			// The top row carries its heading with it, whichever way focus arrived.
			if (heading !== grid && cellBox.top - grid.getBoundingClientRect().top <= 8) {
				const offset = heading.getBoundingClientRect().top - contentTop;
				scrollTo({position: {y: Math.max(0, offset - HEADING_CLEARANCE)}, animate: false});
				return;
			}
			if (cellBox.top < view.top + CARD_CLEARANCE) {
				scrollTo({position: {y: Math.max(0, scrolled - (view.top + CARD_CLEARANCE - cellBox.top))}, animate: false});
			} else if (cellBox.bottom > view.bottom - CARD_CLEARANCE) {
				scrollTo({position: {y: scrolled + (cellBox.bottom - view.bottom + CARD_CLEARANCE)}, animate: false});
			}
		}));
	}, []);

	if (!card) return null;

	return (
		<div className={css.overlay}>
			<ModalContainer className={css.panel} spotlightId="spotlight-modal">
				<div className={css.header}>
					{card.icon && (
						<svg className={css.headerIcon} viewBox={iconViewBox(card.icon)} fill="currentColor" aria-hidden="true">
							<path d={card.icon} />
						</svg>
					)}
					<span className={css.headerTitle}>{card.title}</span>
				</div>
				<Scroller className={css.body} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden" onScroll={handleScroll} cbScrollTo={handleScrollTo}>
					<div className={css.scrollContent} ref={contentRef}>
						{card.sections.map((section, index) => (
							<div key={`${section.kind}-${section.title || index}`} className={css.section} onFocus={handleSectionFocus}>
								{section.title && (
									<div className={css.sectionHeader}>
										<span className={css.sectionTitle}>{section.title}</span>
										{section.count != null && <span className={css.sectionCount}>{section.count}</span>}
									</div>
								)}
								<SpotlightSection
									section={section}
									serverUrl={serverUrl}
									actions={actions}
									seerr={seerr}
									firstSpotlightId={index === 0 ? FIRST_CELL_ID : undefined}
								/>
							</div>
						))}
					</div>
				</Scroller>
			</ModalContainer>
		</div>
	);
};

export default SpotlightSectionModal;
