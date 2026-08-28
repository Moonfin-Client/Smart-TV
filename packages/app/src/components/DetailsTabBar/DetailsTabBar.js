import {useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {pointerHover} from '../../utils/focusScroll';

import css from './DetailsTabBar.module.less';

const Pill = Spottable('div');
const TabContainer = SpotlightContainerDecorator({restrict: 'self-first'}, 'div');

// A d-pad focusable pill tab bar. The pill highlight and focus states are all in
// CSS, so navigating left and right only moves focus and reports the active id.
const DetailsTabBar = ({tabs, activeId, activeSpotlightId, onSelect, onActivate, expanded = true, spotlightId, className}) => {
	const handleClick = useCallback((ev) => {
		const id = ev.currentTarget.dataset.id;
		if (id) onActivate?.(id);
	}, [onActivate]);

	const handleFocus = useCallback((ev) => {
		// With Expanded Tabs on, focus follows selection. Otherwise a tab only
		// opens when it's clicked. A pointer sweeping across the bar would flip
		// the content on every tab it crossed, so it has to click as well.
		if (!expanded || pointerHover()) return;
		const id = ev.currentTarget.dataset.id;
		if (id) onSelect?.(id);
	}, [expanded, onSelect]);

	if (!tabs || tabs.length === 0) return null;

	return (
		<TabContainer className={`${css.tabBar} ${className || ''}`} spotlightId={spotlightId}>
			{tabs.map((tab) => (
				<Pill
					key={tab.id}
					spotlightId={tab.id === activeId ? activeSpotlightId : undefined}
					data-id={tab.id}
					className={`${css.tab} ${tab.id === activeId ? css.tabActive : ''}`}
					onClick={handleClick}
					onFocus={handleFocus}
				>
					{tab.label}
				</Pill>
			))}
		</TabContainer>
	);
};

export default DetailsTabBar;
