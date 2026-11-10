import {forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect, useLayoutEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {Pause} from '@enact/spotlight/Pause';

import {useSettings} from '../../context/SettingsContext';
import {openTvKeyboard, closeTvKeyboard, publishTvKeyboardVisibility} from '../TVKeyboard/keyboardBus';
import css from './SpottableInput.module.less';

const SpottableDiv = Spottable('div');

const SpottableInput = forwardRef(({
	className,
	spotlightId,
	'data-spotlight-id': dataSpotlightId,
	onKeyDown,
	disabled,
	purpose,
	recents,
	suggestionsBuilder,
	onExitTop,
	...inputProps
}, ref) => {
	const inputRef = useRef(null);
	const pauseRef = useRef(new Pause('SpottableInput'));
	const [inputFocused, setInputFocused] = useState(false);
	const [kbActive, setKbActive] = useState(false);
	const kbActiveRef = useRef(false);
	const [revealed, setRevealed] = useState(false);
	const [cursorPos, setCursorPos] = useState(0);
	const {settings} = useSettings();
	const nativeKeyboard = settings.keyboardStyle === 'native';

	const valueRef = useRef(inputProps.value);
	valueRef.current = inputProps.value;
	const onChangeRef = useRef(inputProps.onChange);
	onChangeRef.current = inputProps.onChange;
	const onKeyDownRef = useRef(onKeyDown);
	onKeyDownRef.current = onKeyDown;

	useEffect(() => {
		const p = pauseRef.current;
		return () => {
			p.resume();
			if (kbActiveRef.current) closeTvKeyboard();
		};
	}, []);

	const activateInput = useCallback(() => {
		if (!disabled && inputRef.current) {
			pauseRef.current.pause();
			inputRef.current.focus();
			// The TV's own keyboard pops over the screen the same way ours does,
			// so screens watching for a keyboard hear about this path too
			publishTvKeyboardVisibility(true, inputRef.current.parentElement);
		}
	}, [disabled]);

	const deactivateInput = useCallback(() => {
		pauseRef.current.resume();
		inputRef.current?.blur();
	}, []);

	// The TV's own keyboard is where its voice input lives, so a screen can
	// hand the field to it whatever keyboard the user prefers.
	useImperativeHandle(ref, () => ({activateSystemInput: activateInput}), [activateInput]);

	const onExitTopRef = useRef(onExitTop);
	onExitTopRef.current = onExitTop;

	const openKeyboard = useCallback(() => {
		if (disabled || kbActiveRef.current) return;
		const id = spotlightId || dataSpotlightId;
		kbActiveRef.current = true;
		setKbActive(true);
		const opened = openTvKeyboard({
			value: valueRef.current == null ? '' : String(valueRef.current),
			purpose,
			password: inputProps.type === 'password',
			maxLength: inputProps.maxLength,
			anchor: inputRef.current?.parentElement || null,
			recents,
			suggestionsBuilder,
			onChange: (text, cursor) => {
				onChangeRef.current?.({target: {value: text}});
				setCursorPos(cursor || 0);
				window.requestAnimationFrame(() => {
					try {
						inputRef.current?.setSelectionRange(cursor, cursor);
					} catch {
						// Password fields on some engines refuse selection changes
					}
				});
			},
			onSystemKeyboard: activateInput,
			onExitTop: onExitTopRef.current ? () => onExitTopRef.current() : undefined,
			onReveal: setRevealed,
			onClose: ({submitted, reason}) => {
				kbActiveRef.current = false;
				setKbActive(false);
				setRevealed(false);
				inputRef.current?.blur();
				// Leaving through the top has already put focus where the screen
				// wanted it, so taking it back here would undo that.
				if (id && reason !== 'exitTop') Spotlight.focus(`[data-spotlight-id="${id}"]`);
				if (submitted && onKeyDownRef.current) {
					onKeyDownRef.current({
						keyCode: 13,
						which: 13,
						key: 'Enter',
						target: inputRef.current,
						preventDefault: () => {},
						stopPropagation: () => {}
					});
				}
			}
		});
		// With no keyboard host mounted the device keyboard is all there is
		if (!opened) {
			kbActiveRef.current = false;
			setKbActive(false);
			activateInput();
			return;
		}
		// Focusing the field while it cant be edited shows the caret without
		// waking the TV's own keyboard
		window.requestAnimationFrame(() => {
			const node = inputRef.current;
			if (!node || !kbActiveRef.current) return;
			node.focus();
			try {
				const end = node.value.length;
				node.setSelectionRange(end, end);
				setCursorPos(end);
			} catch {
				// Same engines as above
			}
		});
	}, [disabled, spotlightId, dataSpotlightId, purpose, recents, suggestionsBuilder, inputProps.maxLength, inputProps.type, activateInput]);

	const handleActivate = useCallback(() => {
		if (nativeKeyboard) activateInput();
		else openKeyboard();
	}, [nativeKeyboard, activateInput, openKeyboard]);

	const handleFocus = useCallback(() => setInputFocused(true), []);

	const handleBlur = useCallback(() => {
		setInputFocused(false);
		pauseRef.current.resume();
		if (!kbActiveRef.current) publishTvKeyboardVisibility(false, null);
	}, []);

	const handleKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		const isInputActive = document.activeElement === inputRef.current;

		if (kbActiveRef.current) return;

		if (!isInputActive && code === 13) {
			e.preventDefault();
			handleActivate();
			return;
		}

		if (isInputActive && (code === 461 || code === 10009 || code === 27)) {
			e.preventDefault();
			e.stopPropagation();
			deactivateInput();
			return;
		}

		if (isInputActive && (code === 38 || code === 40)) {
			e.preventDefault();
			e.stopPropagation();
			const direction = code === 40 ? 'down' : 'up';
			const id = spotlightId || dataSpotlightId;
			deactivateInput();
			if (id) {
				Spotlight.focus(`[data-spotlight-id="${id}"]`);
			}
			setTimeout(() => Spotlight.move(direction), 0);
			return;
		}

		if (onKeyDown) {
			onKeyDown(e);
		}
	}, [onKeyDown, handleActivate, deactivateInput, spotlightId, dataSpotlightId]);

	const showCaret = (inputFocused || kbActive) && !disabled;
	const value = inputProps.value == null ? '' : String(inputProps.value);
	const caretVisible = showCaret && value.length > 0;
	const measureRef = useRef(null);
	const [caretLeft, setCaretLeft] = useState(0);

	useLayoutEffect(() => {
		if (!caretVisible || !measureRef.current) return;
		setCaretLeft(measureRef.current.offsetWidth);
	}, [caretVisible, value, cursorPos]);

	return (
		<SpottableDiv
			spotlightId={spotlightId || dataSpotlightId}
			className={className}
			onClick={handleActivate}
			onKeyDown={handleKeyDown}
			spotlightDisabled={disabled}
			data-focused={inputFocused || undefined}
		>
			<div style={{position: 'relative'}}>
				<input
					ref={inputRef}
					disabled={disabled}
					{...inputProps}
					type={revealed ? 'text' : inputProps.type}
					readOnly={kbActive || inputProps.readOnly}
					className={css.innerInput}
					onFocus={handleFocus}
					onBlur={handleBlur}
				/>
				{caretVisible && (
					<>
						<span
							ref={measureRef}
							aria-hidden="true"
							style={{
								position: 'absolute',
								visibility: 'hidden',
								whiteSpace: 'pre',
								pointerEvents: 'none',
								overflow: 'hidden'
							}}
						>
							{value.slice(0, cursorPos)}
						</span>
						<span
							className={css.caret}
							style={{
								left: caretLeft,
								top: '50%',
								transform: 'translateY(-50%)',
								height: '1.2em'
							}}
						/>
					</>
				)}
			</div>
		</SpottableDiv>
	);
});

SpottableInput.displayName = 'SpottableInput';

export default SpottableInput;
