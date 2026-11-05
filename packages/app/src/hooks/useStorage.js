import {useState, useEffect, useCallback, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';

// loaded is only true for the current key, so a screen that stays mounted while the key changes
// doesn't take the last key's value for this one's.
export function useStorage(key, defaultValue) {
	const defaultRef = useRef(defaultValue);
	defaultRef.current = defaultValue;
	const [state, setState] = useState({key: null, value: defaultValue});

	useEffect(() => {
		let current = true;
		getFromStorage(key).then((stored) => {
			if (!current) return;
			// A save made before the read came back is newer than what was stored.
			setState((prev) => (prev.key === key ? prev : {key, value: stored !== null ? stored : defaultRef.current}));
		});
		return () => {
			current = false;
		};
	}, [key]);

	const save = useCallback((newValue) => {
		setState({key, value: newValue});
		saveToStorage(key, newValue);
	}, [key]);

	return [state.value, save, state.key === key];
}

export default useStorage;
