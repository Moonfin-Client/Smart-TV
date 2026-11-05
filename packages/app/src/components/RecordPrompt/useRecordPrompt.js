import {useCallback, useEffect, useRef, useState} from 'react';

import RecordPrompt, {RecordPromptLoading} from './RecordPrompt';

// Hosts the Record prompt for one screen. prompt opens it and resolves with the viewer's choice,
// or null on Back. A screen that closes with the prompt still open counts as Back.
const useRecordPrompt = (clockDisplay) => {
	const [state, setState] = useState(null);
	const resolveRef = useRef(null);
	const loadingRef = useRef(false);

	const settle = useCallback((choice) => {
		const resolve = resolveRef.current;
		resolveRef.current = null;
		setState(null);
		resolve?.(choice);
	}, []);

	const mountedRef = useRef(true);

	// A prompt asked for after the screen closed answers as Back straight away.
	const prompt = useCallback((props) => new Promise((resolve) => {
		if (!mountedRef.current) {
			resolve(null);
			return;
		}
		resolveRef.current = resolve;
		setState({props});
	}), []);

	const setLoading = useCallback((loading) => {
		loadingRef.current = loading;
		if (mountedRef.current) setState(loading ? {loading: true} : null);
	}, []);

	// Back closes an open prompt as a cancel and is swallowed while the plugin is being asked.
	const handleBack = useCallback(() => {
		if (resolveRef.current) {
			settle(null);
			return true;
		}
		return loadingRef.current;
	}, [settle]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			resolveRef.current?.(null);
		};
	}, []);

	let element = null;
	if (state?.loading) element = <RecordPromptLoading />;
	else if (state?.props) element = <RecordPrompt {...state.props} clockDisplay={clockDisplay} onChoose={settle} />;

	return {prompt, setLoading, handleBack, element};
};

export default useRecordPrompt;
