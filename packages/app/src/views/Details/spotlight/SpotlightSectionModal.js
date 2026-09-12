import {useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {Scroller} from '@enact/sandstone/Scroller';

import {isBackKey} from '../../../utils/keys';
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

const SpotlightSectionModal = ({card, serverUrl, actions, seerr, onClose, onNearEnd}) => {
	const nearEndRef = useRef(onNearEnd);
	nearEndRef.current = onNearEnd;

	useEffect(() => {
		if (!card) return undefined;
		const handleKey = (ev) => {
			if (!isBackKey(ev)) return;
			ev.preventDefault();
			ev.stopPropagation();
			onClose?.();
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [card, onClose]);

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

	// The scroll event carries the offset but not the size of what is being scrolled, so the
	// content and the window onto it are measured here.
	const contentRef = useRef(null);
	const handleScroll = useCallback((ev) => {
		const ask = nearEndRef.current;
		const content = contentRef.current;
		if (!ask || !content) return;
		const visible = content.parentElement?.clientHeight || 0;
		if (ev.scrollTop >= content.scrollHeight - visible * (1 + NEAR_END_SCREENFULS)) ask();
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
				<Scroller className={css.body} direction="vertical" horizontalScrollbar="hidden" verticalScrollbar="hidden" onScroll={handleScroll}>
					<div ref={contentRef}>
						{card.sections.map((section, index) => (
							<div key={`${section.kind}-${section.title || index}`} className={css.section}>
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
