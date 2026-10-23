import {useEffect, useCallback, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {Scroller} from '@enact/sandstone/Scroller';

import {iconViewBox} from '../../../components/icons/iconViewBox';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {SpottableDiv} from '../detailsSpottables';
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

// What a foldable section is keyed on, so the viewer's choice survives the card being rebuilt
// underneath them as the Seerr lookups land.
const sectionKey = (section, index) => section.id || section.title || String(index);

const SpotlightSectionModal = ({card, serverUrl, actions, seerr, onNearEnd}) => {
	const nearEndRef = useRef(onNearEnd);
	nearEndRef.current = onNearEnd;

	// Only what the viewer has folded or unfolded themselves, so a section they have not
	// touched keeps whatever the card asked for.
	const [expandedByKey, setExpandedByKey] = useState({});

	const handleToggleSection = useCallback((ev) => {
		const {sectionKey: key, expanded} = ev.currentTarget.dataset;
		setExpandedByKey((held) => ({...held, [key]: expanded !== 'true'}));
	}, []);

	// The remote lands on the first cell rather than the panel, so a press moves through the
	// content straight away. A section that draws no focusable cell of its own leaves the id
	// unclaimed, and the container's own entry rule picks something up instead. Keyed on the id, as
	// the card is rebuilt whenever the screen renders.
	const cardId = card?.id;
	useEffect(() => {
		if (!cardId) return undefined;
		const timer = setTimeout(() => {
			if (!Spotlight.focus(FIRST_CELL_ID)) Spotlight.focus('spotlight-modal');
		}, 100);
		return () => clearTimeout(timer);
	}, [cardId]);

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

	// A held arrow, told apart the way dropStaleArrowRepeats does, since the oldest sets don't report repeat.
	const heldKeyRef = useRef(null);
	const repeatingRef = useRef(false);
	const handleKeyDown = useCallback((ev) => {
		repeatingRef.current = ev.repeat || heldKeyRef.current === ev.keyCode;
		heldKeyRef.current = ev.keyCode;
	}, []);
	const handleKeyUp = useCallback(() => {
		heldKeyRef.current = null;
		repeatingRef.current = false;
	}, []);

	// Enact brings a newly focused card into view by its unfocused box and stops flush against
	// the edge, which both hides the heading above the top row and clips the growth a focused
	// card gains. The scroll is corrected here while Enact's own is usually still running, so the
	// correction animates too rather than cutting it off. A held arrow jumps instead, since each
	// move restarts the smooth scroll and it would fall further behind the focus with every step.
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
		// Read now, as the key can be released before the frames below run.
		const animate = !repeatingRef.current;

		window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			const contentTop = content.getBoundingClientRect().top;
			const view = viewport.getBoundingClientRect();
			const cellBox = cell.getBoundingClientRect();
			const scrolled = viewport.scrollTop;

			// The top row carries its heading with it, whichever way focus arrived.
			if (heading !== grid && cellBox.top - grid.getBoundingClientRect().top <= 8) {
				const offset = heading.getBoundingClientRect().top - contentTop;
				scrollTo({position: {y: Math.max(0, offset - HEADING_CLEARANCE)}, animate});
				return;
			}
			if (cellBox.top < view.top + CARD_CLEARANCE) {
				scrollTo({position: {y: Math.max(0, scrolled - (view.top + CARD_CLEARANCE - cellBox.top))}, animate});
			} else if (cellBox.bottom > view.bottom - CARD_CLEARANCE) {
				scrollTo({position: {y: scrolled + (cellBox.bottom - view.bottom + CARD_CLEARANCE)}, animate});
			}
		}));
	}, []);

	if (!card) return null;

	const isExpanded = (section, index) => {
		if (!section.collapsible) return true;
		const held = expandedByKey[sectionKey(section, index)];
		return held == null ? section.expanded !== false : held;
	};
	// The remote lands on the first cell it can reach, which is not in the first section when
	// that one is folded shut.
	const expandedFlags = card.sections.map(isExpanded);
	const firstOpenIndex = expandedFlags.indexOf(true);

	return (
		<div className={css.overlay}>
			<ModalContainer className={css.panel} spotlightId="spotlight-modal" onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
				<div className={css.header}>
					<div className={css.headerLeft}>
						{card.icon && (
							<svg className={css.headerIcon} viewBox={iconViewBox(card.icon)} fill="currentColor" aria-hidden="true">
								<path d={card.icon} />
							</svg>
						)}
						<span className={css.headerTitle}>{card.modalTitle || card.title}</span>
					</div>
					{(card.onOpenSort || actions?.openCollectionSort) && (card.id === 'playlist_order' || card.id === 'playlist') && (
						<div className={css.headerRight}>
							{(actions?.collectionSort === 'custom' || card.sections?.some((s) => s.manage)) && (
								<span className={css.headerHint}>{$L('◀ ▶ to re-order')}</span>
							)}
							<SpottableDiv
								className={css.headerSortButton}
								onClick={card.onOpenSort || actions.openCollectionSort}
							>
								{card.sortLabel || actions?.collectionSortLabel}
							</SpottableDiv>
						</div>
					)}
				</div>
				<Scroller className={css.body} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden" onScroll={handleScroll} cbScrollTo={handleScrollTo}>
					<div className={css.scrollContent} ref={contentRef}>
						{card.sections.map((section, index) => {
							const key = sectionKey(section, index);
							const expanded = expandedFlags[index];
							const heading = section.title && (
								<>
									<span className={css.sectionTitle}>{section.title}</span>
									{section.count != null && <span className={css.sectionCount}>{section.count}</span>}
								</>
							);
							return (
								<div
									key={`${section.kind}-${key}`}
									className={`${css.section} ${section.collapsible && !expanded ? css.sectionFolded : ''}`}
									onFocus={handleSectionFocus}
								>
									{section.collapsible
										? (
											<SpottableDiv
												className={`${css.sectionHeader} ${css.sectionToggle}`}
												data-section-key={key}
												data-expanded={expanded ? 'true' : 'false'}
												onClick={handleToggleSection}
											>
												<svg
													className={css.sectionChevron}
													viewBox={iconViewBox(expanded ? DETAIL_ICON_PATHS.expandMore : DETAIL_ICON_PATHS.chevronRight)}
													fill="currentColor"
													aria-hidden="true"
												>
													<path d={expanded ? DETAIL_ICON_PATHS.expandMore : DETAIL_ICON_PATHS.chevronRight} />
												</svg>
												{heading}
											</SpottableDiv>
										)
										: section.title && <div className={css.sectionHeader}>{heading}</div>}
									{expanded && (
										<SpotlightSection
											section={section}
											serverUrl={serverUrl}
											actions={actions}
											seerr={seerr}
											firstSpotlightId={index === firstOpenIndex ? FIRST_CELL_ID : undefined}
										/>
									)}
								</div>
							);
						})}
					</div>
				</Scroller>
			</ModalContainer>
		</div>
	);
};

export default SpotlightSectionModal;
