import {useEffect, useState} from 'react';
import {watchParty} from '../services/siloWatchParty';

// The Silo Watch Party's state, kept current.
const useWatchParty = () => {
	const [state, setState] = useState(watchParty.state);
	useEffect(() => {
		setState(watchParty.state());
		return watchParty.subscribe(setState);
	}, []);
	return state;
};

export default useWatchParty;
