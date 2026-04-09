import {useCallback, useRef, useState, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {Pause} from '@enact/spotlight/Pause';

import css from './SpottableInput.module.less';

const SpottableDiv = Spottable('div');

const SpottableInput = ({
	className,
	spotlightId,
	'data-spotlight-id': dataSpotlightId,
	onKeyDown,
	disabled,
	...inputProps
}) => {
	const inputRef = useRef(null);
	const pauseRef = useRef(new Pause('SpottableInput'));
	const [inputFocused, setInputFocused] = useState(false);

	useEffect(() => {
		const p = pauseRef.current;
		return () => p.resume();
	}, []);

	const activateInput = useCallback(() => {
		if (!disabled && inputRef.current) {
			pauseRef.current.pause();
			inputRef.current.focus();
		}
	}, [disabled]);

	const deactivateInput = useCallback(() => {
		pauseRef.current.resume();
		inputRef.current?.blur();
	}, []);

	const handleFocus = useCallback(() => setInputFocused(true), []);

	const handleBlur = useCallback(() => {
		setInputFocused(false);
		pauseRef.current.resume();
	}, []);

	const handleKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		const isInputActive = document.activeElement === inputRef.current;

		if (!isInputActive && code === 13) {
			e.preventDefault();
			activateInput();
			return;
		}

		if (isInputActive && (code === 461 || code === 10009 || code === 27)) {
			e.preventDefault();
			e.stopPropagation();
			deactivateInput();
			return;
		}

		if (onKeyDown) {
			onKeyDown(e);
		}
	}, [onKeyDown, activateInput, deactivateInput]);

	return (
		<SpottableDiv
			spotlightId={spotlightId || dataSpotlightId}
			className={className}
			onClick={activateInput}
			onKeyDown={handleKeyDown}
			spotlightDisabled={disabled}
			data-focused={inputFocused || undefined}
		>
			<input
				ref={inputRef}
				disabled={disabled}
				{...inputProps}
				className={css.innerInput}
				onFocus={handleFocus}
				onBlur={handleBlur}
			/>
		</SpottableDiv>
	);
};

export default SpottableInput;
