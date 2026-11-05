import {useCallback, useLayoutEffect, useRef, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {pointerHover} from '../../utils/focusScroll';

import css from './DetailsTabBar.module.less';

const Pill = Spottable('div');
const TabContainer = SpotlightContainerDecorator({restrict: 'self-first'}, 'div');
// The large bar picks a tab as focus lands on it, so it's entered on the one already picked.
const PickedTabContainer = SpotlightContainerDecorator({enterTo: 'default-element', defaultElement: '[data-active-tab]', restrict: 'self-first'}, 'div');

// Moves only the bar, by the least amount that shows the whole tab, since letting the browser
// do it on focus would slide the page the bar sits in as well.
const revealTab = (bar, tab) => {
	if (!bar || !tab) return;
	const left = tab.offsetLeft;
	const right = left + tab.offsetWidth;
	if (left < bar.scrollLeft) bar.scrollLeft = left;
	else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = right - bar.clientWidth;
};

// A d-pad focusable pill tab bar. The pill highlight and focus states are all in
// CSS, so navigating left and right only moves focus and reports the active id.
//
// `large` is Core's season strip at Stage's size, where focus rings the whole bar and the picked
// pill swells to fill it, rather than outlining one tab.
const DetailsTabBar = ({tabs, activeId, activeSpotlightId, onSelect, onActivate, expanded = true, spotlightId, className, large = false}) => {
	const barRef = useRef(null);
	const [barFocused, setBarFocused] = useState(false);
	const handleBarFocus = useCallback(() => setBarFocused(true), []);
	const handleBarBlur = useCallback(() => setBarFocused(false), []);

	// The picked tab stays in view when the bar opens or the pick changes without focus.
	useLayoutEffect(() => {
		const bar = barRef.current;
		const active = bar && Array.from(bar.querySelectorAll('[data-id]')).find((tab) => tab.dataset.id === String(activeId));
		revealTab(bar, active);
	}, [activeId, tabs]);

	const handleClick = useCallback((ev) => {
		const id = ev.currentTarget.dataset.id;
		if (id) onActivate?.(id);
	}, [onActivate]);

	const handleFocus = useCallback((ev) => {
		revealTab(barRef.current, ev.currentTarget);
		// With Expanded Tabs on, focus follows selection. Otherwise a tab only
		// opens when it's clicked. A pointer sweeping across the bar would flip
		// the content on every tab it crossed, so it has to click as well.
		if (!expanded || pointerHover()) return;
		const id = ev.currentTarget.dataset.id;
		if (id) onSelect?.(id);
	}, [expanded, onSelect]);

	if (!tabs || tabs.length === 0) return null;

	const Track = large ? PickedTabContainer : TabContainer;

	return (
		<div
			ref={barRef}
			className={`${css.tabBar} ${large ? css.large : ''} ${large && barFocused ? css.barFocused : ''} ${className || ''}`}
			onFocus={large ? handleBarFocus : undefined}
			onBlur={large ? handleBarBlur : undefined}
		>
			<Track className={css.track} spotlightId={spotlightId}>
				{tabs.map((tab) => (
					<Pill
						key={tab.id}
						spotlightId={tab.id === activeId ? activeSpotlightId : undefined}
						data-id={tab.id}
						data-active-tab={tab.id === activeId ? 'true' : undefined}
						className={`${css.tab} ${tab.id === activeId ? css.tabActive : ''}`}
						onClick={handleClick}
						onFocus={handleFocus}
					>
						{tab.label}
					</Pill>
				))}
			</Track>
		</div>
	);
};

export default DetailsTabBar;
