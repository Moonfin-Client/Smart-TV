import {useEffect, useRef, useState} from 'react';
import {watchParty} from '../services/siloWatchParty';

const whole = (state) => state;

// The Watch Party's state, kept current. With `select`, only that part, so a chat line or a toast doesn't re-render
// something that never shows it.
const useWatchParty = (select = whole) => {
	const selectRef = useRef(select);
	selectRef.current = select;
	const [value, setValue] = useState(() => select(watchParty.state()));
	useEffect(() => {
		const update = (next) => setValue(selectRef.current(next));
		update(watchParty.state());
		return watchParty.subscribe(update);
	}, []);
	return value;
};

export default useWatchParty;
