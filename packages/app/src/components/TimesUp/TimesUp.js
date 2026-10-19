import {memo, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {formatClockTime, formatDayLabel} from '../../utils/clock';
import {KEYS} from '../../utils/keys';

import css from './TimesUp.module.less';

const FOCUS_ID = 'times-up-switch';

const Container = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const sameDay = (a, b) =>
	a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * When the user can use the server again, in words, or null when no entry opens soon.
 *
 * @param {Date|null} nextAccess
 * @param {Date} now
 * @param {string} clockDisplay '12-hour' or '24-hour'
 */
export const describeNextAccess = (nextAccess, now, clockDisplay) => {
	if (!nextAccess) return null;
	const time = formatClockTime(nextAccess, clockDisplay);
	if (sameDay(nextAccess, now)) return $L('You can use it again today at {time}.').replace('{time}', time);
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	if (sameDay(nextAccess, tomorrow)) return $L('You can use it again tomorrow at {time}.').replace('{time}', time);
	return $L('You can use it again on {day} at {time}.')
		.replace('{day}', formatDayLabel(nextAccess))
		.replace('{time}', time);
};

// While the screen is up nothing behind it may be reached, so the keys that would move focus
// or go back are taken before anything else sees them. Enter is left for the button.
const DIRECTIONS = [KEYS.UP, KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT];

const TimesUp = ({nextAccess, now, clockDisplay, onSwitchUser}) => {
	useEffect(() => {
		const focus = () => Spotlight.focus(FOCUS_ID);
		const timer = setTimeout(focus, 100);
		// A set waking from standby gives focus to whatever it likes.
		document.addEventListener('visibilitychange', focus);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', focus);
		};
	}, []);

	useEffect(() => {
		const swallow = (e) => {
			const code = e.keyCode || e.which;
			if (code === KEYS.BACK || code === 27 || code === 8 || DIRECTIONS.includes(code)) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		};
		window.addEventListener('keydown', swallow, true);
		return () => window.removeEventListener('keydown', swallow, true);
	}, []);

	const next = describeNextAccess(nextAccess, now, clockDisplay);

	return (
		<div className={css.overlay}>
			<Container className={css.card}>
				<h1 className={css.title}>{$L('Time\'s up')}</h1>
				<p className={css.message}>{$L('This account isn\'t available right now.')}</p>
				{next ? <p className={css.next}>{next}</p> : null}
				<SpottableButton
					className={css.button}
					data-spotlight-id={FOCUS_ID}
					spotlightDefault
					onClick={onSwitchUser}
				>
					{$L('Switch User')}
				</SpottableButton>
			</Container>
		</div>
	);
};

export default memo(TimesUp);
