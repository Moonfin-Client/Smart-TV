import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import DetailsTabBar from '../../components/DetailsTabBar';
import {MUSIC_FOCUS_IDS} from './musicFocus';
import {MUSIC_CATEGORIES} from './musicLibrary';
import {OVERVIEW_TAB} from './musicScreens';

import css from './MusicLibrary.module.less';

const TAB_LIST = [{id: OVERVIEW_TAB, label: $L('Overview')}, ...MUSIC_CATEGORIES.map(({id, label}) => ({id, label}))];

// The pill tabs. The arrows move the highlight along them without leaving the screen, Select
// or a click opens the one highlighted, and the highlight goes back to `current`, the screen
// they sit on, once focus leaves them. `activeSpotlightId` names whichever pill is highlighted,
// and `pills` swaps in another set of them, as the book library's strip does.
const MusicTabs = ({onOpenGrid, current = OVERVIEW_TAB, spotlightId = MUSIC_FOCUS_IDS.tabs, activeSpotlightId, pills = TAB_LIST}) => {
	const [highlight, setHighlight] = useState(current);

	useEffect(() => setHighlight(current), [current]);

	const handleActivate = useCallback((id) => {
		if (id !== current) onOpenGrid(id);
	}, [current, onOpenGrid]);

	// The new focus isn't known until the blur is over, so the check waits a tick.
	const handleBlur = useCallback((e) => {
		const tabs = e.currentTarget;
		window.setTimeout(() => {
			if (!tabs.contains(document.activeElement)) setHighlight(current);
		}, 0);
	}, [current]);

	return (
		<div className={css.tabs} onBlur={handleBlur}>
			<DetailsTabBar
				tabs={pills}
				activeId={highlight}
				onSelect={setHighlight}
				onActivate={handleActivate}
				spotlightId={spotlightId}
				activeSpotlightId={activeSpotlightId}
			/>
		</div>
	);
};

export default MusicTabs;
