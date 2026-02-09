import {useState, useEffect, useCallback} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';

export function useStorage(key, defaultValue) {
	const [value, setValue] = useState(defaultValue);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		getFromStorage(key).then((stored) => {
			if (stored !== null) {
				setValue(stored);
			}
			setLoaded(true);
		});
	}, [key]);

	const save = useCallback((newValue) => {
		setValue(newValue);
		saveToStorage(key, newValue);
	}, [key]);

	return [value, save, loaded];
}

export default useStorage;
