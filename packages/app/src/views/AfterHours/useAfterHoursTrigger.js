import {useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import {portal} from '../../components/CoreDialog';
import {loadSounds, playSound, sleepAudio} from './sound';

import css from './AfterHoursTrigger.module.less';

const PRESSES = 7;
const TOAST_FROM = 3;
const RESET_MS = 3000;

let arcadeOpen = false;
// The settings screens leave Back to the arcade while it's up, the way they do for a confirm.
export const isAfterHoursOpen = () => arcadeOpen;

const PressToast = ({count}) => {
	const left = PRESSES - count;
	if (!left) return portal(<div className={`${css.toast} ${css.done}`}>{$L('After Hours unlocked')}</div>);
	const dots = [];
	for (let i = 0; i < PRESSES; i++) dots.push(<i key={i} className={i < count ? css.on : null} />);
	return portal(
		<div className={css.toast}>
			<span>{left === 1 ? $L('1 more press') : $L('{count} more presses').replace('{count}', left)}</span>
			<span className={css.dots}>{dots}</span>
		</div>
	);
};

const useAfterHoursTrigger = () => {
	const [count, setCount] = useState(0);
	const [open, setOpen] = useState(false);
	const countRef = useRef(0);
	const timerRef = useRef(null);

	useEffect(() => {
		arcadeOpen = open;
		return () => {
			arcadeOpen = false;
		};
	}, [open]);
	// A press wakes the TV's audio, so it's let go again once the count runs out or the screen closes.
	useEffect(() => () => {
		clearTimeout(timerRef.current);
		sleepAudio();
	}, []);

	const press = useCallback(() => {
		if (arcadeOpen) return;
		const sounds = loadSounds();
		const n = countRef.current + 1;
		clearTimeout(timerRef.current);
		countRef.current = n < PRESSES ? n : 0;
		setCount(n);
		if (n < PRESSES) {
			// The first press starts the decode, so its tick lands once the kit is ready.
			sounds.then(() => playSound('tick'));
			timerRef.current = setTimeout(() => {
				countRef.current = 0;
				setCount(0);
				sleepAudio();
			}, RESET_MS);
			return;
		}
		sounds.then(() => playSound('fanfare'));
		setOpen(true);
		timerRef.current = setTimeout(() => setCount(0), 1500);
	}, []);

	const close = useCallback(() => setOpen(false), []);

	return {press, open, close, toast: count >= TOAST_FROM ? <PressToast count={count} /> : null};
};

export default useAfterHoursTrigger;
