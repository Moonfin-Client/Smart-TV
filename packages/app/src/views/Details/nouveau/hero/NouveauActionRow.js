import {Fragment, useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {arrange, seerrOnlyRow, DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY} from '../../../../utils/buttonLayout';
import {KEYS} from '../../../../utils/keys';
import {DETAIL_ICON_PATHS} from '../../detailIcons';
import {ActionButton, detailActionCatalogue} from '../../detailActions';
import {RowContainer} from '../../detailsSpottables';
import {splitNouveauActions} from '../nouveauActionSplit';
import {handleScrollerFocus} from '../../detailsFocus';

import modernCss from '../../ModernDetailContent.module.less';
import css from './NouveauHero.module.less';

const MenuContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// Nouveau's action row. One button leads it carrying a word, everything after it is a circle, and
// once there are more than three circles only two stay out with the rest behind More.
//
// The row is shorter than the one the other screens keep because a page of rails sits under it,
// and a long row of buttons would push the first of those off the screen.
const NouveauActionRow = (props) => {
	const {
		settings, seerrOnly, isBook, isReadableBook,
		hasPlaybackPosition, resumeTimeText,
		handlePlay, handleResume,
		menuBackRef, onNavigateUp, onNavigateDown, onFocusRow
	} = props;

	const [menuOpen, setMenuOpen] = useState(false);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
		setTimeout(() => Spotlight.focus('details-action-buttons'), 50);
	}, []);

	const handleOpenMenu = useCallback(() => {
		setMenuOpen(true);
		setTimeout(() => Spotlight.focus('nouveau-overflow-menu'), 50);
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
		if (ev.keyCode === KEYS.UP || ev.keyCode === KEYS.DOWN) {
			// Swallowed either way, so the page walks its own chain. Letting the press through
			// hands it to Spotlight, which picks by geometry and lands somewhere unchosen.
			ev.preventDefault();
			ev.stopPropagation();
			if (ev.keyCode === KEYS.UP) onNavigateUp?.('details-action-buttons');
			else onNavigateDown?.('details-action-buttons');
			return;
		}
		if (ev.keyCode !== KEYS.LEFT && ev.keyCode !== KEYS.RIGHT) return;
		const buttons = Array.from(ev.currentTarget.querySelectorAll(`.${modernCss.actionBtn}`));
		const idx = buttons.indexOf(document.activeElement);
		if (ev.keyCode === KEYS.LEFT && idx === 0) {
			// Docked left, the start of the row is the way across to the navbar. Anywhere else there
			// is nothing out that side, so the press stays put rather than letting focus leave the row.
			if (settings.navbarPosition === 'left') Spotlight.focus('navbar');
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
		if (ev.keyCode === KEYS.RIGHT && idx === buttons.length - 1) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	}, [settings.navbarPosition, onNavigateUp, onNavigateDown]);

	const offered = detailActionCatalogue(props);
	const rowButtons = seerrOnly ? seerrOnlyRow(offered) : offered;
	const customizable = arrange(
		rowButtons.filter((btn) => btn.when),
		{order: settings[DETAIL_ORDER_KEY], hidden: settings[DETAIL_HIDDEN_KEY]}
	);

	const showsResume = !seerrOnly && hasPlaybackPosition && !isBook;
	const showsPlay = !seerrOnly && (isBook ? isReadableBook : true);

	// Only one button leads the row here. Where there is somewhere to resume from that is what it
	// does, and starting over joins the circles rather than taking a second word for itself.
	const leadingAction = () => {
		if (showsResume) {
			return {
				path: DETAIL_ICON_PATHS.play, label: $L('Resume'),
				detail: resumeTimeText, onClick: handleResume
			};
		}
		if (showsPlay) {
			return {
				path: isBook ? DETAIL_ICON_PATHS.book : DETAIL_ICON_PATHS.play,
				label: isBook ? $L('Read') : $L('Play'),
				onClick: handlePlay
			};
		}
		return null;
	};

	const leading = leadingAction();
	const restart = showsResume && showsPlay
		? [{id: 'restart', render: () => (
			<ActionButton path={DETAIL_ICON_PATHS.restart} label={$L('Restart')} onClick={handlePlay} />
		)}]
		: [];

	const prefLimit = settings?.detailButtonsMaxVisible ?? 0;
	const {inline, overflow} = splitNouveauActions([...restart, ...customizable], prefLimit);

	const handleRowFocus = useCallback((ev) => {
		handleScrollerFocus(ev);
		onFocusRow?.(ev);
	}, [onFocusRow]);

	return (
		<>
			<RowContainer
				className={`${css.actions} ${leading ? css.actionsWithPrimary : ''}`}
				spotlightId="details-action-buttons"
				onFocus={handleRowFocus}
				onKeyDown={handleKeyDown}
			>
				{leading && (
					<ActionButton
						primary
						path={leading.path}
						label={leading.label}
						detail={leading.detail}
						onClick={leading.onClick}
						spotlightId="details-primary-btn"
					/>
				)}
				{inline.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
				{overflow.length > 0 && (
					<ActionButton path={DETAIL_ICON_PATHS.moreHoriz} label={$L('More Actions')} onClick={handleOpenMenu} />
				)}
			</RowContainer>
			{menuOpen && (
				<div className={modernCss.overflowMenu}>
					<MenuContainer className={modernCss.overflowPanel} spotlightId="nouveau-overflow-menu">
						<div className={modernCss.overflowTitle}>{$L('More Actions')}</div>
						<div className={modernCss.overflowList}>
							{overflow.map((btn) => <Fragment key={btn.id}>{btn.render()}</Fragment>)}
						</div>
					</MenuContainer>
				</div>
			)}
		</>
	);
};

export default NouveauActionRow;
