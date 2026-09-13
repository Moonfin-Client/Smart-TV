import {Fragment, useState, useCallback, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {arrange, seerrOnlyRow, countSplit, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY} from '../../utils/buttonLayout';
import {KEYS} from '../../utils/keys';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {ActionButton, detailActionCatalogue} from './detailActions';
import {RowContainer} from './detailsSpottables';
import {handleScrollerFocus} from './detailsFocus';

import css from './ModernDetailContent.module.less';

const MenuContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// The action row shared by the Modern and Spotlight detail screens. Play and Resume always
// lead it, and everything after them is in whatever order the viewer arranged in settings,
// with anything they hid left out.
//
// `maxVisibleButtons` caps the row and folds the rest behind an ellipsis. Modern leaves it
// off and shows every button inline, which is what it has always done.
const ModernActionButtons = (props) => {
	// Only what the row itself needs. Everything the buttons are built from is read straight off
	// props by the catalogue.
	const {
		settings, seerrOnly, isBook, isReadableBook,
		hasPlaybackPosition, resumeTimeText, hasTech,
		handlePlay, handleResume,
		onFocusRow, downTarget, maxVisibleButtons, overflowAsMenu, menuBackRef
	} = props;

	const [menuOpen, setMenuOpen] = useState(false);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
		setTimeout(() => Spotlight.focus('details-action-buttons'), 50);
	}, []);

	const handleOpenMenu = useCallback(() => {
		setMenuOpen(true);
		setTimeout(() => Spotlight.focus('details-overflow-menu'), 50);
	}, []);

	// App closes the screen on BACK unless something says it took the press, so the open menu
	// answers through the ref the host owns.
	useEffect(() => {
		if (!menuBackRef) return undefined;
		menuBackRef.current = () => {
			if (!menuOpen) return false;
			closeMenu();
			return true;
		};
		return () => {
			menuBackRef.current = null;
		};
	});

	const handleKeyDown = useCallback((ev) => {
		if (ev.keyCode === KEYS.DOWN) {
			// Down moves to whatever sits under the row, which 5-way does not reach on its own.
			if (downTarget && Spotlight.focus(downTarget)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		if (ev.keyCode !== KEYS.LEFT && ev.keyCode !== KEYS.RIGHT) return;
		const buttons = Array.from(ev.currentTarget.querySelectorAll(`.${css.actionBtn}`));
		const idx = buttons.indexOf(document.activeElement);
		if (idx === -1) return;
		const atLeftEdge = ev.keyCode === KEYS.LEFT && idx === 0;
		const atRightEdge = ev.keyCode === KEYS.RIGHT && idx === buttons.length - 1;
		if (atLeftEdge && settings.navbarPosition === 'left') {
			if (Spotlight.focus('navbar')) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		// The next up card sits beside the row with nothing else near it, so the end of the
		// row is the way across. An edge that leads nowhere stays put rather than letting
		// focus leak out of the row.
		if (atRightEdge && Spotlight.focus('details-up-next')) {
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}
		// Move sequentially between action buttons so off-screen buttons in horizontal scroll mode
		// can be reached and scrolled into view.
		const nextIdx = ev.keyCode === KEYS.LEFT ? idx - 1 : idx + 1;
		if (nextIdx >= 0 && nextIdx < buttons.length) {
			ev.preventDefault();
			ev.stopPropagation();
			Spotlight.focus(buttons[nextIdx]);
			return;
		}
		if (atLeftEdge || atRightEdge) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, [settings.navbarPosition, downTarget]);

	const offered = detailActionCatalogue(props);
	const rowButtons = seerrOnly ? seerrOnlyRow(offered) : offered;
	const customizable = arrange(
		rowButtons.filter((btn) => btn.when),
		{order: settings[DETAIL_ORDER_KEY], hidden: settings[DETAIL_HIDDEN_KEY]}
	);

	// Resume and Restart both lead the row when there is somewhere to resume from, so the
	// leading slots are counted rather than assumed to be one.
	const showsResume = !seerrOnly && hasPlaybackPosition && !isBook;
	const showsPlay = !seerrOnly && (isBook ? isReadableBook : true);
	const leading = (showsResume ? 1 : 0) + (showsPlay ? 1 : 0);

	const prefLimit = settings?.detailButtonsMaxVisible ?? 0;
	let effectiveMaxVisible = maxVisibleButtons || 0;
	let effectiveOverflowAsMenu = overflowAsMenu;
	let effectiveCountCapped = Boolean(maxVisibleButtons);

	if (prefLimit === -1) {
		effectiveCountCapped = false;
	} else if (prefLimit === 1) {
		effectiveMaxVisible = 2;
		effectiveOverflowAsMenu = true;
		effectiveCountCapped = true;
	} else if (prefLimit > 1) {
		effectiveMaxVisible = prefLimit + 1;
		effectiveOverflowAsMenu = true;
		effectiveCountCapped = true;
	}

	const {visibleCount, needsOverflow} = countSplit({
		totalButtons: leading + customizable.length,
		maxVisible: effectiveMaxVisible,
		overflowAsMenu: effectiveOverflowAsMenu,
		countCapped: effectiveCountCapped
	});
	const inline = needsOverflow ? customizable.slice(0, Math.max(0, visibleCount - leading)) : customizable;
	const behindMenu = needsOverflow ? customizable.slice(Math.max(0, visibleCount - leading)) : [];

	const handleRowFocus = useCallback((ev) => {
		handleScrollerFocus(ev);
		onFocusRow?.(ev);
	}, [onFocusRow]);

	return (
		<>
			<RowContainer className={`${css.actions} ${hasTech ? css.actionsTight : ''}`} spotlightId="details-action-buttons" onFocus={handleRowFocus} onKeyDown={handleKeyDown}>
				{showsResume && (
					<ActionButton primary path={DETAIL_ICON_PATHS.play} label={$L('Resume')} detail={resumeTimeText} onClick={handleResume} spotlightId="details-primary-btn" />
				)}
				{showsPlay && (
					<ActionButton
						primary={!hasPlaybackPosition}
						path={isBook ? DETAIL_ICON_PATHS.book : hasPlaybackPosition ? DETAIL_ICON_PATHS.restart : DETAIL_ICON_PATHS.play}
						label={isBook ? $L('Read') : hasPlaybackPosition ? $L('Restart') : $L('Play')}
						onClick={handlePlay}
						spotlightId={hasPlaybackPosition ? undefined : 'details-primary-btn'}
					/>
				)}
				{inline.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
				{behindMenu.length > 0 && (
					<ActionButton path={DETAIL_ICON_PATHS.moreHoriz} label={$L('More Actions')} onClick={handleOpenMenu} />
				)}
			</RowContainer>
			{menuOpen && (
				<div className={css.overflowMenu}>
					<MenuContainer className={css.overflowPanel} spotlightId="details-overflow-menu">
						<div className={css.overflowTitle}>{$L('More Actions')}</div>
						<div className={css.overflowList}>
							{behindMenu.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
						</div>
					</MenuContainer>
				</div>
			)}
		</>
	);
};

export default ModernActionButtons;
